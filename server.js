/**
 * server.js — Lesson generation backend
 *
 * Pipeline:
 *   Upload → lessons-input/pending/
 *     → LiteLLM generates TypeScript lesson
 *       → src/lessons/<id>.ts  (Vite HMR picks up instantly)
 *       → lessons-input/done/
 *     → on error → lessons-input/failed/
 *
 * API:
 *   POST /api/lesson/upload   multipart: file (text/md) + lessonId (string)
 *   GET  /api/lesson/status   returns array of all tracked jobs
 */

require("dotenv").config();   // loads .env into process.env (never commit .env)

const http      = require("http");
const express   = require("express");
const multer    = require("multer");
const cors      = require("cors");
const fs        = require("fs");
const path      = require("path");
const { Pool }  = require("pg");
const { Chess } = require("chess.js");
const bcrypt    = require("bcryptjs");
const jwt       = require("jsonwebtoken");
const { WebSocketServer } = require("ws");

const JWT_SECRET = process.env.JWT_SECRET || "chess-dev-secret-change-in-prod";

const app  = express();
const PORT = 3010;

// ── LiteLLM config — read from environment, never hardcode secrets ────────────
const rawUrl  = process.env.LITELLM_URL || "http://litellm_litellm_1:4000/v1/chat/completions";
const LITELLM_URL = rawUrl.startsWith("http") ? rawUrl : `http://${rawUrl}`;
const LITELLM_KEY = process.env.LITELLM_KEY || "";
const MODEL       = process.env.LITELLM_MODEL || "gpt-4o";

if (!LITELLM_KEY) {
  console.warn("[server] WARNING: LITELLM_KEY is not set. Set it in .env or as an env variable.");
}

// ── Postgres ──────────────────────────────────────────────────────────────────
let _pool = null;
function getPool() {
  if (!_pool && process.env.DB_URL) {
    _pool = new Pool({ connectionString: process.env.DB_URL });
  }
  return _pool;
}

async function initDb() {
  const p = getPool();
  if (!p) { console.warn("[db] DB_URL not set — generated lessons won't persist in Postgres"); return; }
  await p.query(`
    CREATE TABLE IF NOT EXISTS chess_lessons (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      sort_order INTEGER DEFAULT 9999,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await p.query(`ALTER TABLE chess_lessons ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 9999`);

  await p.query(`
    CREATE TABLE IF NOT EXISTS chess_users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS chess_game_results (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES chess_users(id) ON DELETE CASCADE,
      result TEXT NOT NULL CHECK (result IN ('win','loss','draw')),
      difficulty TEXT NOT NULL,
      color TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  console.log("[db] tables ready");
}

async function saveLessons(lessons) {
  const p = getPool();
  if (!p) return;
  // AI lessons go after static ones
  const { rows } = await p.query("SELECT COALESCE(MAX(sort_order), 999) AS max FROM chess_lessons WHERE sort_order < 9999");
  let nextOrder = (rows[0]?.max ?? 999) + 1;
  for (const lesson of lessons) {
    await p.query(
      `INSERT INTO chess_lessons (id, data, sort_order) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
      [lesson.id, lesson, nextOrder++]
    );
  }
}

// ── FEN computation ───────────────────────────────────────────────────────────
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function computeFen(moves, startFen) {
  const chess = new Chess(startFen || START_FEN);
  for (const move of (moves || [])) {
    try {
      chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] || undefined });
    } catch { /* invalid move — skip */ }
  }
  return chess.fen();
}

function applyFensToSteps(lesson) {
  return {
    ...lesson,
    steps: lesson.steps.map(step => ({
      ...step,
      fen: step.moves ? computeFen(step.moves, step.startFen) : (step.fen || computeFen([], step.startFen)),
      moves: undefined,
      startFen: undefined,
    })),
  };
}

// ── Paths ─────────────────────────────────────────────────────────────────────
const ROOT         = __dirname;
const PENDING_DIR  = path.join(ROOT, "lessons-input", "pending");
const PROC_DIR     = path.join(ROOT, "lessons-input", "processing");
const DONE_DIR     = path.join(ROOT, "lessons-input", "done");
const FAILED_DIR   = path.join(ROOT, "lessons-input", "failed");
const LESSONS_OUT  = path.join(ROOT, "src", "lessons");
const INDEX_FILE   = path.join(LESSONS_OUT, "index.ts");

// Ensure all dirs exist
[PENDING_DIR, PROC_DIR, DONE_DIR, FAILED_DIR, LESSONS_OUT].forEach(d =>
  fs.mkdirSync(d, { recursive: true })
);

// ── In-memory job tracker ─────────────────────────────────────────────────────
// Shape: { id, filename, status, createdAt, updatedAt, error?, outputFile? }
const jobs = new Map();

// Reload from disk on startup (done/failed folders)
function reloadJobs() {
  for (const stage of ["pending", "processing", "done", "failed"]) {
    const dir = path.join(ROOT, "lessons-input", stage);
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".txt") && !f.endsWith(".md")) continue;
      const id = path.basename(f, path.extname(f));
      if (!jobs.has(id)) {
        jobs.set(id, {
          id,
          filename: f,
          status: stage === "processing" ? "pending" : stage, // processing = crash recovery
          createdAt: fs.statSync(path.join(dir, f)).mtime.toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }
}
reloadJobs();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

const upload = multer({
  dest: PENDING_DIR,
  limits: { fileSize: 2 * 1024 * 1024, files: 20 }, // 2 MB per file, max 20 files
  fileFilter(_req, file, cb) {
    const ok = /\.(txt|md|markdown)$/i.test(file.originalname);
    cb(ok ? null : new Error("Only .txt / .md files accepted"), ok);
  },
});

// ── Auth middleware ───────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ── Auth routes ───────────────────────────────────────────────────────────────

app.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });
  if (username.length < 3)    return res.status(400).json({ error: "Username must be at least 3 characters" });
  if (password.length < 6)    return res.status(400).json({ error: "Password must be at least 6 characters" });

  const p = getPool();
  if (!p) return res.status(503).json({ error: "Database unavailable" });

  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await p.query(
      "INSERT INTO chess_users (username, password_hash) VALUES ($1, $2) RETURNING id, username, created_at",
      [username.trim(), hash]
    );
    const user  = rows[0];
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Username already taken" });
    console.error("[auth] register error", err.message);
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });

  const p = getPool();
  if (!p) return res.status(503).json({ error: "Database unavailable" });

  try {
    const { rows } = await p.query("SELECT * FROM chess_users WHERE username = $1", [username.trim()]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Invalid username or password" });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error("[auth] login error", err.message);
    res.status(500).json({ error: "Login failed" });
  }
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: { id: req.user.id, username: req.user.username } });
});

// ── Game result routes ────────────────────────────────────────────────────────

app.post("/api/game/result", requireAuth, async (req, res) => {
  const { result, difficulty, color } = req.body || {};
  if (!["win","loss","draw"].includes(result))        return res.status(400).json({ error: "Invalid result" });
  if (!["easy","medium","hard"].includes(difficulty)) return res.status(400).json({ error: "Invalid difficulty" });
  if (!["white","black"].includes(color))             return res.status(400).json({ error: "Invalid color" });

  const p = getPool();
  if (!p) return res.status(503).json({ error: "Database unavailable" });

  await p.query(
    "INSERT INTO chess_game_results (user_id, result, difficulty, color) VALUES ($1, $2, $3, $4)",
    [req.user.id, result, difficulty, color]
  );
  res.json({ ok: true });
});

app.get("/api/game/stats", requireAuth, async (req, res) => {
  const p = getPool();
  if (!p) return res.json({ wins: 0, losses: 0, draws: 0, total: 0 });

  const { rows } = await p.query(
    `SELECT result, COUNT(*)::int AS count FROM chess_game_results
     WHERE user_id = $1 GROUP BY result`,
    [req.user.id]
  );
  const stats = { wins: 0, losses: 0, draws: 0, total: 0 };
  for (const r of rows) {
    if (r.result === "win")  stats.wins   = r.count;
    if (r.result === "loss") stats.losses = r.count;
    if (r.result === "draw") stats.draws  = r.count;
    stats.total += r.count;
  }
  res.json(stats);
});

// ── Routes ────────────────────────────────────────────────────────────────────

/** Upload one or more lesson documents */
app.post("/api/lesson/upload", upload.array("files", 20), (req, res) => {
  const files = req.files;  // array from upload.array()
  if (!files || files.length === 0) return res.status(400).json({ error: "No files uploaded" });

  // lessonId override is only honoured for single-file uploads
  const idOverride = files.length === 1
    ? (req.body.lessonId || "").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 40)
    : "";

  const queued = [];

  for (const file of files) {
    const raw = idOverride ||
      path.basename(file.originalname, path.extname(file.originalname))
        .toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 40);
    // Append timestamp suffix when the same id would collide
    const lessonId = (jobs.has(raw) ? raw + "-" + Date.now() : raw) || "lesson-" + Date.now();

    const dest = path.join(PENDING_DIR, lessonId + ".txt");
    fs.renameSync(file.path, dest);

    jobs.set(lessonId, {
      id: lessonId,
      filename: lessonId + ".txt",
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    processLesson(lessonId, dest).catch(err =>
      console.error("[generate]", lessonId, err.message)
    );

    queued.push({ lessonId, status: "pending" });
  }

  // Legacy single-file callers still get a flat object; multi-file callers get array
  res.json(queued.length === 1 ? queued[0] : { queued });
});

/** Status of all jobs */
app.get("/api/lesson/status", (_req, res) => {
  const list = [...jobs.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  res.json(list);
});

/** Status of single job */
app.get("/api/lesson/status/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json(job);
});

/** All AI-generated lessons from Postgres */
app.get("/api/lesson/generated", async (_req, res) => {
  const p = getPool();
  if (!p) return res.json([]);
  try {
    const { rows } = await p.query("SELECT data FROM chess_lessons ORDER BY sort_order ASC, created_at ASC");
    console.log(`[db] serving ${rows.length} lessons from Postgres`);
    res.json(rows.map(r => r.data));
  } catch (err) {
    console.error("[db] list error", err.message);
    res.json([]);
  }
});

/** Delete a done/failed job and its files */
app.delete("/api/lesson/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Not found" });
  for (const dir of [PENDING_DIR, PROC_DIR, DONE_DIR, FAILED_DIR]) {
    const f = path.join(dir, job.filename);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  jobs.delete(req.params.id);
  res.json({ ok: true });
});

// ── Lesson generation pipeline ────────────────────────────────────────────────

async function processLesson(lessonId, srcFile) {
  setStatus(lessonId, "processing");

  // Move to processing folder (use copy+delete for cross-volume Docker mounts)
  const procFile = path.join(PROC_DIR, lessonId + ".txt");
  moveTo(srcFile, procFile);

  const content = fs.readFileSync(procFile, "utf8");

  let rawLessons;
  try {
    rawLessons = await callLiteLLM(lessonId, content);
  } catch (err) {
    setStatus(lessonId, "failed", { error: err.message });
    moveTo(procFile, path.join(FAILED_DIR, lessonId + ".txt"));
    return;
  }

  // Compute FENs from move sequences
  const lessons = rawLessons.map(applyFensToSteps);

  // Store in Postgres
  try {
    await saveLessons(lessons);
  } catch (err) {
    console.error("[db] save error", err.message);
    // non-fatal — continue
  }

  const ids = lessons.map(l => l.id).join(", ");
  setStatus(lessonId, "done", { outputFile: ids });
  moveTo(procFile, path.join(DONE_DIR, lessonId + ".txt"));

  console.log(`[generate] ✓ ${ids} — saved to Postgres`);
}

// ── LiteLLM call ──────────────────────────────────────────────────────────────

async function callLiteLLM(lessonId, lessonContent) {
  const systemPrompt = `You are GM Lev Aronian — a world-class chess grandmaster, pedagogue, and curriculum designer with 30+ years of teaching experience from beginner to master level. You have co-authored chess curricula used by national federations and you understand exactly how learners build intuition step-by-step.
r
Your task: convert a chess lesson document into a structured JSON lesson for an interactive 3D chess tutorial app. Learners see a real 3D board, read your explanations, watch animated moves, and complete challenges by clicking the correct piece and destination square.

Output ONLY valid JSON — no markdown fences, no prose, no comments outside the JSON.

=== PEDAGOGICAL GUIDELINES ===
- Explanations should be wam, encouraging, and conversational — as if talking to a 12-year-old who loves games
- Use \\n\\n to separate paragraphs within explanations
- Build concepts progressively: show before asking, explain the WHY not just the WHAT
- Demo steps: teach the concept with arrows and highlights showing exactly what to look at
- Challenge steps: test ONE clear thing per challenge, with a helpful hint if they get it wrong
- Use arrows liberally on demo steps — gold for key moves, green for good moves, red for threats
- Aim for 4–8 steps per lesson: enough depth without overwhelming
- The final "🏁 Lesson Complete!" step should summarize the key takeaway in 1–2 sentences

=== TutorialLesson schema ===
{
  "id": string,          // e.g. "italian-game" — lowercase, hyphens only
  "title": string,       // short, punchy — e.g. "The Italian Game"
  "subtitle": string,    // one-line hook — e.g. "Control the center from move 1"
  "category": "opening" | "pieces" | "special" | "tactics" | "endgame",
  "icon": string,        // single chess emoji: ♟ ♞ ♝ ♜ ♛ ♚ or thematic emoji
  "steps": TutorialStep[]
}

=== TutorialStep schema ===
{
  "type": "demo" | "challenge",
  "moves": string[],          // CUMULATIVE UCI moves from startFen to reach this position, e.g. ["e2e4","e7e5","g1f3"]
  "startFen": string,         // optional — omit to start from standard opening position
  "title": string,            // short step title shown in the UI
  "explanation": string,      // rich explanation with \\n\\n paragraph breaks
  "arrows": [{"from":string,"to":string,"color":"gold"|"green"|"red"}],  // optional — use generously
  "highlightSquares": string[],   // optional — squares to glow (e.g. ["e4","d4","e5","d5"])
  "autoMove": {"from":string,"to":string},  // optional — animate this move on the demo
  "challengePiece": string,   // challenge only — the square of the piece the user must click FIRST
  "expectedSquare": string,   // challenge only — correct destination (or "__any__" for any legal move)
  "hint": string              // challenge only — shown after a wrong answer, be encouraging not scolding
}

=== STRICT RULES ===
1. NEVER include a "fen" field — the server computes FENs from "moves" using chess.js
2. "moves" is CUMULATIVE from startFen — each step's moves array is the full sequence up to that position
3. Use standard UCI notation: "e2e4", "g1f3", "e1g1" (kingside castle), "e1c1" (queenside castle), "e7e8q" (promotion)
4. "challengePiece" is the square the piece occupies AFTER all moves in that step are applied
5. End every lesson with a demo step titled "🏁 Lesson Complete!" summarizing the key insight
6. Use arrows on every demo step that shows a move — gold for the main idea, red for opponent threats
7. Output a top-level JSON array even for a single lesson: [{...lesson}]`;

  const userPrompt = `Convert this chess lesson document into a JSON lesson array using the schema above.
Channel your expertise as GM Lev Aronian — make the explanations vivid, pedagogically sound, and engaging.
Lesson ID to use: ${lessonId}

=== LESSON DOCUMENT ===
${lessonContent}`;

  const response = await fetch(LITELLM_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LITELLM_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LiteLLM error ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  let text = data.choices[0]?.message?.content || "";

  // Strip any accidental markdown fences
  text = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let lessons;
  try {
    lessons = JSON.parse(text);
    if (!Array.isArray(lessons)) lessons = [lessons];
  } catch (err) {
    throw new Error(`AI returned invalid JSON: ${err.message} — raw: ${text.slice(0, 300)}`);
  }

  return lessons;
}

// ── Index barrel rebuild ──────────────────────────────────────────────────────
// Keeps src/lessons/index.ts in sync so tutorialData.ts auto-picks up new files

function rebuildIndex() {
  const files = fs.readdirSync(LESSONS_OUT)
    .filter(f => f.endsWith(".ts") && f !== "index.ts" && f !== "openingPrinciples.ts");

  const imports = files.map(f => {
    const name = path.basename(f, ".ts");
    const varName = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) + "Lessons";
    return { name, varName, line: `import { GENERATED_LESSONS as ${varName} } from "./${name}";` };
  });

  const header = `// AUTO-GENERATED by server.js — do not edit manually\n// Add new lessons by uploading to /admin\n`;
  const importLines = imports.map(i => i.line).join("\n");
  const spread = imports.map(i => `  ...${i.varName}`).join(",\n");
  const body = imports.length > 0
    ? `\nexport const ALL_GENERATED: import("../tutorialData").TutorialLesson[] = [\n${spread},\n];\n`
    : `\nexport const ALL_GENERATED: import("../tutorialData").TutorialLesson[] = [];\n`;

  fs.writeFileSync(INDEX_FILE, header + importLines + body, "utf8");
}

// Ensure index.ts exists on start
if (!fs.existsSync(INDEX_FILE)) rebuildIndex();

// ── Helpers ───────────────────────────────────────────────────────────────────

function setStatus(id, status, extra = {}) {
  const job = jobs.get(id) || { id, filename: id + ".txt", createdAt: new Date().toISOString() };
  jobs.set(id, { ...job, status, updatedAt: new Date().toISOString(), ...extra });
}

function moveTo(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    if (err.code === 'EXDEV') {
      // Cross-device (different Docker volumes) — copy then delete
      fs.copyFileSync(src, dest);
      fs.unlinkSync(src);
    }
    // ignore other errors (file already gone etc.)
  }
}

// ── WebSocket multiplayer ─────────────────────────────────────────────────────

const queue = []; // [{ ws, userId, username }]
const games = new Map(); // gameId → { id, chess, white, black, status }

function wsSend(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function tryMatch() {
  if (queue.length < 2) return;
  const [a, b] = queue.splice(0, 2);
  // Random color assignment
  const [white, black] = Math.random() < 0.5 ? [a, b] : [b, a];

  const gameId = `game_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const chess  = new Chess();
  const game   = { id: gameId, chess, white, black, status: "playing" };
  games.set(gameId, game);

  white.gameId = gameId;
  black.gameId = gameId;

  wsSend(white.ws, { type: "match_found", gameId, color: "white", opponent: black.username, fen: chess.fen() });
  wsSend(black.ws, { type: "match_found", gameId, color: "black", opponent: white.username, fen: chess.fen() });
  console.log(`[ws] match: ${white.username}(w) vs ${black.username}(b) — ${gameId}`);
}

function endGame(game, winnerColor, reason) {
  if (game.status !== "playing") return;
  game.status = "over";
  const { white, black } = game;
  wsSend(white.ws, { type: "game_over", result: winnerColor === "white" ? "win" : winnerColor === null ? "draw" : "loss", reason });
  wsSend(black.ws, { type: "game_over", result: winnerColor === "black" ? "win" : winnerColor === null ? "draw" : "loss", reason });

  // Persist results
  const pool = getPool();
  if (pool && white.userId && black.userId) {
    const wRes = winnerColor === "white" ? "win" : winnerColor === null ? "draw" : "loss";
    const bRes = winnerColor === "black" ? "win" : winnerColor === null ? "draw" : "loss";
    pool.query("INSERT INTO chess_game_results (user_id, result, difficulty, color) VALUES ($1,$2,'online','white'),($3,$4,'online','black')",
      [white.userId, wRes, black.userId, bRes]).catch(e => console.error("[db] save result", e.message));
  }
  white.gameId = null;
  black.gameId = null;
  games.delete(game.id);
}

function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    ws.player = null; // set after auth

    ws.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      // ── Auth ──────────────────────────────────────────────────────────────
      if (msg.type === "auth") {
        try {
          const payload = jwt.verify(msg.token, JWT_SECRET);
          ws.player = { ws, userId: payload.id, username: payload.username, gameId: null };
          wsSend(ws, { type: "auth_ok", username: payload.username });
        } catch {
          wsSend(ws, { type: "auth_error", message: "Invalid token" });
          ws.close();
        }
        return;
      }

      if (!ws.player) { wsSend(ws, { type: "error", message: "Not authenticated" }); return; }
      const player = ws.player;

      // ── Join queue ────────────────────────────────────────────────────────
      if (msg.type === "join_queue") {
        if (player.gameId) return; // already in a game
        if (queue.some(q => q.userId === player.userId)) return; // already queued
        queue.push(player);
        wsSend(ws, { type: "queued", position: queue.length });
        console.log(`[ws] queued: ${player.username} (queue=${queue.length})`);
        tryMatch();
        return;
      }

      // ── Leave queue ───────────────────────────────────────────────────────
      if (msg.type === "leave_queue") {
        const idx = queue.findIndex(q => q.userId === player.userId);
        if (idx !== -1) queue.splice(idx, 1);
        wsSend(ws, { type: "dequeued" });
        return;
      }

      // ── Move ──────────────────────────────────────────────────────────────
      if (msg.type === "move") {
        const game = games.get(msg.gameId);
        if (!game || game.status !== "playing") return;

        const isWhite = game.white.userId === player.userId;
        const isBlack = game.black.userId === player.userId;
        if (!isWhite && !isBlack) return;

        const expectedTurn = game.chess.turn() === "w" ? "white" : "black";
        if ((isWhite && expectedTurn !== "white") || (isBlack && expectedTurn !== "black")) {
          wsSend(ws, { type: "error", message: "Not your turn" });
          return;
        }

        let result;
        try {
          result = game.chess.move({ from: msg.from, to: msg.to, promotion: msg.promotion ?? "q" });
        } catch {
          wsSend(ws, { type: "error", message: "Illegal move" });
          return;
        }

        const fen      = game.chess.fen();
        const opponent = isWhite ? game.black : game.white;
        wsSend(opponent.ws, { type: "opponent_move", from: result.from, to: result.to, fen, san: result.san });
        wsSend(ws,          { type: "move_ok", from: result.from, to: result.to, fen, san: result.san });

        // Check game over
        if (game.chess.isCheckmate()) {
          endGame(game, isWhite ? "white" : "black", "checkmate");
        } else if (game.chess.isStalemate() || game.chess.isDraw()) {
          endGame(game, null, game.chess.isStalemate() ? "stalemate" : "draw");
        }
        return;
      }

      // ── Resign ────────────────────────────────────────────────────────────
      if (msg.type === "resign") {
        const game = games.get(msg.gameId);
        if (!game || game.status !== "playing") return;
        const isWhite = game.white.userId === player.userId;
        endGame(game, isWhite ? "black" : "white", "resign");
        return;
      }
    });

    ws.on("close", () => {
      if (!ws.player) return;
      const player = ws.player;
      // Remove from queue if waiting
      const idx = queue.findIndex(q => q.userId === player.userId);
      if (idx !== -1) queue.splice(idx, 1);
      // End active game as forfeit
      if (player.gameId) {
        const game = games.get(player.gameId);
        if (game && game.status === "playing") {
          const isWhite = game.white.userId === player.userId;
          endGame(game, isWhite ? "black" : "white", "disconnect");
        }
      }
    });
  });

  console.log("[ws] WebSocket server ready at /ws");
}

// ── Start ─────────────────────────────────────────────────────────────────────
const server = http.createServer(app);

initDb().then(() => {
  setupWebSocket(server);
  server.listen(PORT, () => {
    console.log(`[server] Running on http://localhost:${PORT}`);
  });
});

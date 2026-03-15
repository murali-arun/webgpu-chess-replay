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

const express  = require("express");
const multer   = require("multer");
const cors     = require("cors");
const fs       = require("fs");
const path     = require("path");
const { Pool } = require("pg");
const { Chess } = require("chess.js");

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
  // Add sort_order column if upgrading from old schema
  await p.query(`ALTER TABLE chess_lessons ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 9999`);
  console.log("[db] chess_lessons table ready");
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

// ── Start ─────────────────────────────────────────────────────────────────────
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`[server] Lesson generator running on http://localhost:${PORT}`);
  });
});

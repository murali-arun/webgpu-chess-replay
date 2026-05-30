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
const { spawn } = require("child_process");

const STOCKFISH_CLI = path.join(__dirname, "stockfish-cli.js");

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
      registered_ip TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Backfill column for existing installs
  await p.query(`ALTER TABLE chess_users ADD COLUMN IF NOT EXISTS registered_ip TEXT`);

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

  await seedPiecesLessons(p);
  console.log("[db] tables ready");
}

// ── Seed: pieces lessons (insert once, never overwrite) ───────────────────────
async function seedPiecesLessons(p) {
  const HIDE = ["h8", "h1"];
  const pieces = [
    {
      id: "pawn", sort_order: 1,
      data: {
        id: "pawn", title: "The Pawn", subtitle: "Small but mighty — and it can promote!",
        category: "pieces", level: "beginner", icon: "♟",
        steps: [
          {
            type: "demo", fen: "7k/8/8/8/8/8/3P4/7K w - - 0 1",
            title: "Meet the Pawn",
            explanation: "Pawns are the soul of chess! They only move forward — never backward. From their starting square, a pawn can move either ONE or TWO squares forward. After the first move, it can only move one square at a time. Pawns are worth 1 point each.",
            highlightSquares: ["d2"], hiddenSquares: HIDE,
            arrows: [{ from: "d2", to: "d3", color: "green" }, { from: "d2", to: "d4", color: "gold" }],
          },
          {
            type: "demo", fen: "7k/8/8/8/8/8/3P4/7K w - - 0 1",
            title: "Pawns Capture Diagonally",
            explanation: "Here's the tricky part: pawns move straight forward but capture DIAGONALLY. A pawn on d2 can capture a piece on c3 or e3 — but it can't capture directly in front of it. This diagonal capture creates powerful pawn chains.",
            highlightSquares: ["d2"], hiddenSquares: HIDE,
            arrows: [{ from: "d2", to: "c3", color: "red" }, { from: "d2", to: "e3", color: "red" }, { from: "d2", to: "d4", color: "gold" }],
          },
          {
            type: "challenge", fen: "7k/8/8/8/8/8/3P4/7K w - - 0 1",
            title: "Push the Pawn! 🎯",
            explanation: "The pawn is on d2. Push it two squares forward to d4 — the classic central pawn push!",
            highlightSquares: ["d2"], hiddenSquares: HIDE,
            challengePiece: "d2", expectedSquare: "d4",
            hint: "Pawns move straight forward. Push it two squares to d4.",
          },
          {
            type: "demo", fen: "7k/8/8/8/8/8/3P4/7K w - - 0 1",
            title: "Pawns Can Become Queens!",
            explanation: "The secret superpower of the pawn: if a pawn reaches the other end of the board (rank 8 for White), it PROMOTES — it turns into any piece you choose, almost always a Queen! This is called queening and it can completely change the game.",
            highlightSquares: ["d2"], hiddenSquares: HIDE,
            arrows: [{ from: "d2", to: "d8", color: "gold" }],
          },
          {
            type: "demo", fen: "7k/8/8/8/8/8/3P4/7K w - - 0 1",
            title: "🏁 Lesson Complete!",
            explanation: "Pawns define the structure of every game. Key takeaways: push central pawns first (e and d), pawns move forward but capture diagonally, and a passed pawn heading for promotion is one of the most dangerous things in chess!",
            highlightSquares: ["d2"], hiddenSquares: HIDE,
          },
        ],
      },
    },
    {
      id: "rook", sort_order: 2,
      data: {
        id: "rook", title: "The Rook", subtitle: "The powerhouse of ranks and files",
        category: "pieces", level: "beginner", icon: "♜",
        steps: [
          {
            type: "demo", fen: "7k/8/8/8/3R4/8/8/7K w - - 0 1",
            title: "Meet the Rook",
            explanation: "The Rook looks like a castle tower — and it moves like one too. It slides any number of squares in a straight line: left, right, up, or down. It can't jump over pieces, but it can go as far as it wants in any straight direction.",
            highlightSquares: ["d4"], hiddenSquares: HIDE,
          },
          {
            type: "demo", fen: "7k/8/8/8/3R4/8/8/7K w - - 0 1",
            title: "Ranks and Files",
            explanation: "From d4, the Rook controls the entire d-file (up and down) and the entire 4th rank (left and right). That's 14 squares it can reach! In the endgame, a Rook on an open file is devastating.",
            highlightSquares: ["d1","d2","d3","d5","d6","d7","d8","a4","b4","c4","e4","f4","g4","h4"],
            hiddenSquares: HIDE,
            arrows: [{ from: "d4", to: "d8", color: "gold" }, { from: "d4", to: "d1", color: "gold" }, { from: "d4", to: "a4", color: "gold" }, { from: "d4", to: "h4", color: "gold" }],
          },
          {
            type: "demo", fen: "7k/8/8/8/3R4/8/8/7K w - - 0 1",
            title: "Rooks Can't Jump",
            explanation: "Unlike the Knight, the Rook CANNOT jump over pieces. If a piece is in its path, it stops there (or captures it). This means Rooks love open files — columns with no pawns blocking the way.",
            highlightSquares: ["d4"], hiddenSquares: HIDE,
            autoMove: { from: "d4", to: "d8" },
          },
          {
            type: "challenge", fen: "7k/8/8/8/3R4/8/8/7K w - - 0 1",
            title: "Move the Rook! 🎯",
            explanation: "The Rook is on d4. Move it to h4 — slide it all the way to the right along the 4th rank.",
            highlightSquares: ["d4"], hiddenSquares: HIDE,
            challengePiece: "d4", expectedSquare: "h4",
            hint: "Rooks move in straight lines. Slide right along rank 4 until you reach h4.",
          },
          {
            type: "demo", fen: "7k/8/8/8/3R4/8/8/7K w - - 0 1",
            title: "🏁 Lesson Complete!",
            explanation: "The Rook is one of the most powerful pieces — worth about 5 pawns! Key takeaway: Rooks love open files and ranks. In the endgame, double your Rooks on an open file and they become unstoppable.",
            highlightSquares: ["d4"], hiddenSquares: HIDE,
          },
        ],
      },
    },
    {
      id: "bishop", sort_order: 3,
      data: {
        id: "bishop", title: "The Bishop", subtitle: "Master of the diagonals",
        category: "pieces", level: "beginner", icon: "♝",
        steps: [
          {
            type: "demo", fen: "7k/8/8/8/3B4/8/8/7K w - - 0 1",
            title: "Meet the Bishop",
            explanation: "The Bishop slides diagonally — any number of squares, but ONLY on the diagonal. Because of this, it always stays on the same color square it started on. You start with two Bishops: one on light squares, one on dark squares.",
            highlightSquares: ["d4"], hiddenSquares: HIDE,
          },
          {
            type: "demo", fen: "7k/8/8/8/3B4/8/8/7K w - - 0 1",
            title: "Diagonal Control",
            explanation: "From d4, this Bishop controls two long diagonals. It can reach 13 squares from here! Notice how all the squares are the same color (light). A Bishop on an open diagonal is as powerful as a Rook.",
            highlightSquares: ["a1","b2","c3","e5","f6","g7","a7","b6","c5","e3","f2","g1"],
            hiddenSquares: HIDE,
            arrows: [{ from: "d4", to: "a1", color: "gold" }, { from: "d4", to: "g7", color: "gold" }, { from: "d4", to: "a7", color: "gold" }, { from: "d4", to: "g1", color: "gold" }],
          },
          {
            type: "challenge", fen: "7k/8/8/8/3B4/8/8/7K w - - 0 1",
            title: "Move the Bishop! 🎯",
            explanation: "The Bishop is on d4. Move it to g7 — up and to the right along the diagonal.",
            highlightSquares: ["d4"], hiddenSquares: HIDE,
            challengePiece: "d4", expectedSquare: "g7",
            hint: "Count diagonally: d4 → e5 → f6 → g7. Three squares up and to the right.",
          },
          {
            type: "demo", fen: "7k/8/8/8/3B4/8/8/7K w - - 0 1",
            title: "🏁 Lesson Complete!",
            explanation: "Bishops are worth about 3 pawns. Key takeaway: Bishops need open diagonals to shine. If your pawns block your own Bishops, they become 'bad bishops' trapped behind their own army.",
            highlightSquares: ["d4"], hiddenSquares: HIDE,
          },
        ],
      },
    },
    {
      id: "queen", sort_order: 4,
      data: {
        id: "queen", title: "The Queen", subtitle: "The most powerful piece on the board",
        category: "pieces", level: "beginner", icon: "♛",
        steps: [
          {
            type: "demo", fen: "7k/8/8/8/3Q4/8/8/7K w - - 0 1",
            title: "Meet the Queen",
            explanation: "The Queen is the most powerful piece in chess — she combines the moves of the Rook AND the Bishop. She can slide any number of squares in any direction: left, right, up, down, or diagonal. From the center of the board she controls 27 squares!",
            highlightSquares: ["d4"], hiddenSquares: HIDE,
          },
          {
            type: "demo", fen: "7k/8/8/8/3Q4/8/8/7K w - - 0 1",
            title: "Total Board Control",
            explanation: "The Queen covers ALL directions at once — like having a Rook and Bishop combined on the same square. This is why she's worth about 9 pawns. Protect your Queen at all costs early in the game!",
            highlightSquares: ["d1","d2","d3","d5","d6","d7","d8","a4","b4","c4","e4","f4","g4","h4","a1","b2","c3","e5","f6","g7","a7","b6","c5","e3","f2","g1"],
            hiddenSquares: HIDE,
            arrows: [{ from: "d4", to: "d8", color: "gold" }, { from: "d4", to: "h4", color: "gold" }, { from: "d4", to: "g7", color: "gold" }, { from: "d4", to: "a1", color: "gold" }],
          },
          {
            type: "challenge", fen: "7k/8/8/8/3Q4/8/8/7K w - - 0 1",
            title: "Move the Queen! 🎯",
            explanation: "The Queen is on d4. Move her to a7 — up and to the left along the diagonal.",
            highlightSquares: ["d4"], hiddenSquares: HIDE,
            challengePiece: "d4", expectedSquare: "a7",
            hint: "Go diagonally up-left: d4 → c5 → b6 → a7.",
          },
          {
            type: "demo", fen: "7k/8/8/8/3Q4/8/8/7K w - - 0 1",
            title: "🏁 Lesson Complete!",
            explanation: "The Queen is your most powerful weapon — but don't bring her out too early! In the opening, beginners often lose their Queen by activating it before developing other pieces. Develop Knights and Bishops first, castle to safety, THEN unleash the Queen.",
            highlightSquares: ["d4"], hiddenSquares: HIDE,
          },
        ],
      },
    },
    {
      id: "king", sort_order: 5,
      data: {
        id: "king", title: "The King", subtitle: "Protect it with your life — it's the whole game",
        category: "pieces", level: "beginner", icon: "♚",
        steps: [
          {
            type: "demo", fen: "8/8/8/8/3K4/8/8/8 w - - 0 1",
            title: "Meet the King",
            explanation: "The King is the most important piece in chess — the whole game is about protecting it! The King moves ONE square in any direction: forward, backward, sideways, or diagonal. It's slow but can be a powerful fighter in the endgame.",
            highlightSquares: ["d4"],
          },
          {
            type: "demo", fen: "8/8/8/8/3K4/8/8/8 w - - 0 1",
            title: "One Square Any Direction",
            explanation: "From d4, the King can move to any of 8 surrounding squares. The most important rule: you can NEVER move your King to a square where it would be captured — that square is called 'in check.'",
            highlightSquares: ["c3","c4","c5","d3","d5","e3","e4","e5"],
            arrows: [
              { from: "d4", to: "c5", color: "gold" }, { from: "d4", to: "d5", color: "gold" },
              { from: "d4", to: "e5", color: "gold" }, { from: "d4", to: "e4", color: "gold" },
              { from: "d4", to: "e3", color: "gold" }, { from: "d4", to: "d3", color: "gold" },
              { from: "d4", to: "c3", color: "gold" }, { from: "d4", to: "c4", color: "gold" },
            ],
          },
          {
            type: "challenge", fen: "8/8/8/8/3K4/8/8/8 w - - 0 1",
            title: "Move the King! 🎯",
            explanation: "The King is on d4. Move it one square to e5.",
            highlightSquares: ["d4"],
            challengePiece: "d4", expectedSquare: "e5",
            hint: "The King moves one square. Go diagonally up-right from d4 to e5.",
          },
          {
            type: "demo", fen: "8/8/8/8/3K4/8/8/8 w - - 0 1",
            title: "🏁 Lesson Complete!",
            explanation: "The King is the piece you must protect — if it gets checkmated (attacked with no escape), you lose. In the opening, keep your King safe by castling early. In the endgame, the King becomes a powerful piece and should march to the center!",
            highlightSquares: ["d4"],
          },
        ],
      },
    },
  ];

  for (const { id, sort_order, data } of pieces) {
    await p.query(
      `INSERT INTO chess_lessons (id, data, sort_order) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [id, data, sort_order]
    );
  }
  console.log("[db] pieces lessons seeded (skipped if already present)");
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

  // CF-Connecting-IP is the real client IP when behind Cloudflare
  const ip = req.headers["cf-connecting-ip"] || req.headers["x-real-ip"] || req.socket.remoteAddress || "unknown";

  // Hard limit: 2 accounts per IP, permanent
  const { rows: ipRows } = await p.query(
    "SELECT COUNT(*) FROM chess_users WHERE registered_ip = $1", [ip]
  );
  if (parseInt(ipRows[0].count) >= 2) {
    console.warn(`[auth] register blocked: IP ${ip} already has 2 accounts`);
    return res.status(429).json({ error: "Maximum 2 accounts per IP address" });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await p.query(
      "INSERT INTO chess_users (username, password_hash, registered_ip) VALUES ($1, $2, $3) RETURNING id, username, created_at",
      [username.trim(), hash, ip]
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

// ── Stockfish engine API ──────────────────────────────────────────────────────
function getStockfishMove(fen, skill, movetime) {
  return new Promise((resolve) => {
    let resolved = false;
    const done = (move) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        try { proc.kill(); } catch {}
        resolve(move);
      }
    };
    const timer = setTimeout(() => done(""), movetime + 6000);

    const proc = spawn("node", [STOCKFISH_CLI]);
    let buf = "";

    proc.stdout.on("data", (chunk) => {
      buf += chunk.toString();
      let idx;
      while ((idx = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (line.startsWith("bestmove")) {
          const move = line.split(" ")[1];
          done(move && move !== "(none)" ? move : "");
        }
      }
    });

    proc.on("error", () => done(""));

    proc.stdin.write(`setoption name Skill Level value ${skill}\n`);
    proc.stdin.write(`position fen ${fen}\n`);
    proc.stdin.write(`go movetime ${movetime}\n`);
  });
}

app.post("/api/stockfish", async (req, res) => {
  const { fen, skill = 10, movetime = 250 } = req.body;
  if (!fen || typeof fen !== "string") return res.status(400).json({ error: "fen required" });
  try {
    const move = await getStockfishMove(
      fen,
      Math.max(0, Math.min(20, parseInt(skill, 10) || 10)),
      Math.max(50, Math.min(5000, parseInt(movetime, 10) || 250))
    );
    console.log(`[sf] skill=${skill} movetime=${movetime} move=${move}`);
    res.json({ move: move || null });
  } catch (err) {
    console.error("[sf] error", err.message);
    res.status(500).json({ error: "engine error" });
  }
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
  "level": "beginner" | "intermediate" | "advanced",  // difficulty tier for progressive unlock
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

const state = require("./state");

function wsSend(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function tryMatch() {
  const pair = state.shiftPair();
  if (!pair) return;
  const [a, b] = pair;
  const [white, black] = Math.random() < 0.5 ? [a, b] : [b, a];

  const gameId = `game_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const chess  = new Chess();
  const game   = { id: gameId, chess, white, black, status: "playing" };
  state.setGame(gameId, game);

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
  state.deleteGame(game.id);
}

function setupWebSocket(server) {
  const MAX_CONNECTIONS = 2000;
  const wss = new WebSocketServer({ server, path: "/ws" });

  // Periodic health log — warns before things get bad
  setInterval(() => {
    const conns = wss.clients.size;
    const queue = state.queueLength();
    if (conns > 100 || queue > 50) {
      console.log(`[ws] connections=${conns} queue=${queue}`);
    }
    if (conns > MAX_CONNECTIONS * 0.8) {
      console.warn(`[ws] WARNING: approaching connection limit (${conns}/${MAX_CONNECTIONS})`);
    }
  }, 30_000);

  wss.on("connection", (ws) => {
    // Reject when overloaded
    if (wss.clients.size > MAX_CONNECTIONS) {
      ws.close(1013, "Server overloaded — try again later");
      console.warn(`[ws] rejected connection: at capacity (${wss.clients.size})`);
      return;
    }

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
        if (state.isQueued(player.userId)) return; // already queued
        state.enqueue(player);
        wsSend(ws, { type: "queued", position: state.queueLength() });
        console.log(`[ws] queued: ${player.username} (queue=${state.queueLength()})`);
        tryMatch();
        return;
      }

      // ── Leave queue ───────────────────────────────────────────────────────
      if (msg.type === "leave_queue") {
        state.dequeue(player.userId);
        wsSend(ws, { type: "dequeued" });
        return;
      }

      // ── Move ──────────────────────────────────────────────────────────────
      if (msg.type === "move") {
        const game = state.getGame(msg.gameId);
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
        const game = state.getGame(msg.gameId);
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
      state.dequeue(player.userId);
      // End active game as forfeit
      if (player.gameId) {
        const game = state.getGame(player.gameId);
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

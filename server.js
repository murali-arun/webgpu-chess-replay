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

const express = require("express");
const multer  = require("multer");
const cors    = require("cors");
const fs      = require("fs");
const path    = require("path");

const app  = express();
const PORT = 3010;

// ── LiteLLM config — read from environment, never hardcode secrets ────────────
const rawUrl  = process.env.LITELLM_URL || "http://89.116.157.50:4000/v1/chat/completions";
const LITELLM_URL = rawUrl.startsWith("http") ? rawUrl : `http://${rawUrl}`;
const LITELLM_KEY = process.env.LITELLM_KEY || "";
const MODEL       = process.env.LITELLM_MODEL || "gpt-4o";

if (!LITELLM_KEY) {
  console.warn("[server] WARNING: LITELLM_KEY is not set. Set it in .env or as an env variable.");
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

  let tsCode;
  try {
    tsCode = await callLiteLLM(lessonId, content);
  } catch (err) {
    setStatus(lessonId, "failed", { error: err.message });
    moveTo(procFile, path.join(FAILED_DIR, lessonId + ".txt"));
    return;
  }

  // Validate the code compiles (basic sanity — no Node/tsc needed)
  if (!tsCode.includes("export") || !tsCode.includes("TutorialLesson")) {
    setStatus(lessonId, "failed", { error: "AI returned invalid lesson code" });
    moveTo(procFile, path.join(FAILED_DIR, lessonId + ".txt"));
    return;
  }

  // Write TypeScript lesson file
  const outFile = path.join(LESSONS_OUT, lessonId + ".ts");
  fs.writeFileSync(outFile, tsCode, "utf8");

  // Update the index barrel so tutorialData picks it up automatically
  rebuildIndex();

  setStatus(lessonId, "done", { outputFile: `src/lessons/${lessonId}.ts` });
  moveTo(procFile, path.join(DONE_DIR, lessonId + ".txt"));

  console.log(`[generate] ✓ ${lessonId} → ${outFile}`);
}

// ── LiteLLM call ──────────────────────────────────────────────────────────────

async function callLiteLLM(lessonId, lessonContent) {
  const systemPrompt = `You are an expert chess educator and TypeScript developer.
Your job is to convert a chess lesson document into a valid TypeScript module
using the exact builder API shown below. Output ONLY valid TypeScript code with
NO markdown fences, NO explanation, NO comments outside the code.

=== BUILDER API (import from "../tutorialBuilder") ===

import { Chess } from "chess.js";
import { lesson, demo, moveDemo, challenge, openingLesson, fenSequenceWith, START_FEN } from "../tutorialBuilder";
import type { TutorialLesson } from "../tutorialData";

// demo(fen, title, explanation, opts?)
// moveDemo(fenBefore, fenAfter, from, to, title, explanation, opts?)
// challenge(fen, piece, expectedSquare, title, explanation, hint, opts?)
//   expectedSquare = "__any__" to accept any legal move
// openingLesson({ id, title, subtitle, icon, intro?, moves[], finalChallenge? })
// fenSequenceWith(Chess, ["e2e4","e7e5",...], startFen?)
//   → returns array of FENs, index 0 = start, 1 = after move 1, etc.

// opts shape: { arrows?: [{from,to,color?:"gold"|"green"|"red"}], highlightSquares?: string[], hiddenSquares?: string[] }

=== RULES ===
1. The exported variable must be named exactly: export const GENERATED_LESSONS: TutorialLesson[]
2. Use fenSequenceWith(Chess, [...]) to compute FENs — NEVER make up or hardcode a FEN unless it is explicitly given in the lesson document
3. If the document provides FENs, use them exactly as given
4. Each demo step explanation should use \\n\\n to separate paragraphs (JS string)
5. Use arrows to show piece movement on demo steps
6. End every lesson with a completion demo step titled "🏁 Lesson Complete!"
7. The file must start with: import { Chess } from "chess.js";
8. Use the lesson id from the document title (lowercase, hyphens, e.g. "italian-game")

=== OUTPUT FORMAT ===
A single TypeScript file, starting directly with import statements, no markdown, no prose.`;

  const userPrompt = `Convert this chess lesson document into TypeScript using the builder API.
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
  let code = data.choices[0]?.message?.content || "";

  // Strip any accidental markdown fences
  code = code
    .replace(/^```typescript\s*/i, "")
    .replace(/^```ts\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return code;
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
app.listen(PORT, () => {
  console.log(`[server] Lesson generator running on http://localhost:${PORT}`);
});

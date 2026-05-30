import React, { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import ChessBoard from "./ChessBoard";
import type { Arrow, FlashState } from "./ChessBoard";
import type { TutorialLesson, TutorialStep } from "./tutorialData";

type Phase    = "list" | "lesson";
type Feedback = "none" | "correct" | "wrong";
type Level    = "beginner" | "intermediate" | "advanced";

// ── Level assignment ──────────────────────────────────────────────────────────
const LEVEL_BY_ID: Record<string, Level> = {
  "opening-principles":        "beginner",
  "opening-good-vs-bad":       "beginner",
  "opening-best-move":         "beginner",
  "opening-quiz":              "beginner",
  "knight":                    "beginner",
  "chess-lesson-4-opening-structure": "beginner",
  "opening-queen-trap":        "intermediate",
  "opening-tempo":             "intermediate",
  "chess-lesson-2-opening-traps-1773553893591": "intermediate",
  "chess-lesson-3-tactics-opening":  "intermediate",
  "chess-lesson-5-f7-f2":            "intermediate",
  "chess-lesson-6-development-vs-material": "intermediate",
  "chess-lesson-7-tempo-initiative": "advanced",
  "chess-lesson-8-pawn-structures":  "advanced",
};
const LEVEL_BY_CATEGORY: Record<string, Level> = {
  pieces: "beginner", opening: "beginner",
  special: "intermediate", tactics: "intermediate",
  endgame: "advanced",
};
function lessonLevel(l: TutorialLesson): Level {
  return LEVEL_BY_ID[l.id] ?? l.level ?? LEVEL_BY_CATEGORY[l.category] ?? "beginner";
}

// ── Progress persistence ──────────────────────────────────────────────────────
function progressKey(): string {
  try {
    const auth = JSON.parse(localStorage.getItem("chess_auth") ?? "null");
    return `chess_tutorial_${auth?.user?.username ?? "guest"}`;
  } catch { return "chess_tutorial_guest"; }
}
function loadCompleted(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(progressKey()) ?? "[]")); }
  catch { return new Set(); }
}
function saveCompleted(s: Set<string>) {
  localStorage.setItem(progressKey(), JSON.stringify([...s]));
}

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }

export default function TutorialView() {
  const [phase,       setPhase]       = useState<Phase>("list");
  const [lesson,      setLesson]      = useState<TutorialLesson | null>(null);
  const [stepIdx,     setStepIdx]     = useState(0);
  const [feedback,    setFeedback]    = useState<Feedback>("none");
  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [selectedPiece, setSelectedPiece] = useState<string | null>(null);
  const [completed,   setCompleted]   = useState<Set<string>>(loadCompleted);
  const [allLessons,  setAllLessons]  = useState<TutorialLesson[]>([]);
  const [archiveOpen, setArchiveOpen] = useState(false);

  // Board display state
  const [boardFen,     setBoardFen]     = useState("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  const [highlights,   setHighlights]   = useState<string[]>([]);
  const [moveDots,     setMoveDots]     = useState<string[]>([]);
  const [arrows,       setArrows]       = useState<Arrow[]>([]);
  const [hiddenSquares, setHiddenSquares] = useState<string[]>([]);
  const [boardFlash,   setBoardFlash]   = useState<FlashState | null>(null);
  const flashIdRef = useRef(0);

  // Busy ref — use ref so async funcs see the latest value without closure staleness
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  function lock()   { busyRef.current = true;  setBusy(true);  }
  function unlock() { busyRef.current = false; setBusy(false); }

  useEffect(() => {
    fetch("/api/lesson/generated")
      .then(r => r.json())
      .then((data: TutorialLesson[]) => { if (Array.isArray(data)) setAllLessons(data); })
      .catch(() => {});
  }, []);

  // Persist completed whenever it changes
  useEffect(() => { saveCompleted(completed); }, [completed]);

  const currentStep = lesson ? lesson.steps[stepIdx] : null;

  // ── Apply a step to the board ────────────────────────────────────────────────
  function applyStep(step: TutorialStep) {
    setBoardFen(step.fen);
    setHighlights(step.highlightSquares ?? []);
    setArrows(step.arrows?.map(a => ({ ...a, color: a.color ?? "gold" })) ?? []);
    setMoveDots([]);
    setHiddenSquares(step.hiddenSquares ?? []);
    setBoardFlash(null);
  }

  // ── Play the autoMove animation for a step ───────────────────────────────────
  async function runAutoMove(step: TutorialStep) {
    if (!step.autoMove) return;
    await sleep(600);
    setHighlights([step.autoMove.from, step.autoMove.to]);
    // Move the piece on the board
    try {
      const chess = new Chess();
      chess.load(step.fen, { skipValidation: true });
      chess.move({ from: step.autoMove.from, to: step.autoMove.to, promotion: "q" });
      setBoardFen(chess.fen());
    } catch {}
    await sleep(350);
    // Settle to the designated landing position
    setBoardFen(step.landingFen ?? step.fen);
    if (step.hiddenSquares?.length) setHiddenSquares(step.hiddenSquares);
    setHighlights([]);
  }

  // ── Start a lesson ───────────────────────────────────────────────────────────
  async function startLesson(l: TutorialLesson) {
    setLesson(l);
    setStepIdx(0);
    setFeedback("none");
    setFeedbackMsg("");
    setSelectedPiece(null);
    setPhase("lesson");
    await sleep(60);
    applyStep(l.steps[0]);
    if (l.steps[0].autoMove) await runAutoMove(l.steps[0]);
  }

  // ── Advance to the next step ─────────────────────────────────────────────────
  async function advance() {
    if (!lesson) return;
    const nextIdx = stepIdx + 1;
    if (nextIdx >= lesson.steps.length) {
      setCompleted(prev => new Set([...prev, lesson.id]));
      setArrows([]);
      setMoveDots([]);
      setHighlights([]);
      setPhase("list");
      setLesson(null);
      setStepIdx(0);
      unlock();
      return;
    }
    setFeedback("none");
    setFeedbackMsg("");
    setSelectedPiece(null);
    setStepIdx(nextIdx);
    const next = lesson.steps[nextIdx];
    applyStep(next);
    if (next.autoMove) await runAutoMove(next);
    unlock();
  }

  // ── Challenge click handler ──────────────────────────────────────────────────
  function handleSquareClick(sq: string) {
    if (!currentStep || currentStep.type !== "challenge") return;
    if (busyRef.current) return;
    handleChallengeAsync(sq);
  }

  async function handleChallengeAsync(sq: string) {
    const step = currentStep!;

    // Phase 1: select the required piece
    if (!selectedPiece) {
      if (sq !== step.challengePiece) return;
      setSelectedPiece(sq);
      const chess = new Chess();
      chess.load(step.fen, { skipValidation: true });
      const moves = chess.moves({ square: sq as any, verbose: true });
      setMoveDots(moves.map((m: any) => m.to));
      setHighlights([sq]);
      return;
    }

    // Phase 2: pick destination
    const chess = new Chess();
    chess.load(step.fen, { skipValidation: true });
    const legalMoves = chess.moves({ square: selectedPiece as any, verbose: true });
    const isLegal = legalMoves.some((m: any) => m.to === sq);

    if (!isLegal) {
      setSelectedPiece(null);
      setMoveDots([]);
      applyStep(step);
      return;
    }

    const correct =
      step.expectedSquare === "__any__" ||
      step.expectedSquare === "__any_knight_move__" ||
      sq === step.expectedSquare;

    lock();
    setMoveDots([]);
    setArrows([]);

    if (correct) {
      // Apply the move
      try {
        chess.move({ from: selectedPiece, to: sq, promotion: "q" });
        setBoardFen(chess.fen());
      } catch {}
      setHighlights([selectedPiece, sq]);
      flashIdRef.current += 1;
      setBoardFlash({ square: sq, type: "correct", id: flashIdRef.current });
      setFeedback("correct");
      setFeedbackMsg("Correct! 🎉 Well done!");
      setSelectedPiece(null);
      await sleep(900);
      await advance(); // advance calls unlock()
    } else {
      flashIdRef.current += 1;
      setBoardFlash({ square: sq, type: "wrong", id: flashIdRef.current });
      setFeedback("wrong");
      setFeedbackMsg(step.hint ?? "Not quite — try again!");
      setSelectedPiece(null);
      await sleep(650);
      applyStep(step);
      unlock();
    }
  }

  function backToList() {
    setArrows([]);
    setMoveDots([]);
    setHighlights([]);
    setBoardFlash(null);
    setPhase("list");
    setLesson(null);
    setStepIdx(0);
    setFeedback("none");
    unlock();
  }

  const isLastStep = lesson ? stepIdx === lesson.steps.length - 1 : false;

  return (
    <div className="gbc-shell">
      {/* Sidebar */}
      <div className="gbc-left">
        <div className="gbc-title">★ Tutorial</div>

        {phase === "list" && (
          <>
            <div className="gbc-section">Your Path</div>
            {allLessons.length === 0 && (
              <div className="gbc-loading">Loading lessons…</div>
            )}

            {(["beginner", "intermediate", "advanced"] as Level[]).map(lvl => {
              const lvlLessons   = allLessons.filter(l => lessonLevel(l) === lvl);
              if (lvlLessons.length === 0) return null;
              const incomplete   = lvlLessons.filter(l => !completed.has(l.id));
              const doneCount    = lvlLessons.length - incomplete.length;
              const prevLvl      = lvl === "intermediate" ? "beginner" : lvl === "advanced" ? "intermediate" : null;
              const prevLessons  = prevLvl ? allLessons.filter(l => lessonLevel(l) === prevLvl) : [];
              const locked       = prevLvl !== null && prevLessons.some(l => !completed.has(l.id));
              const ICONS        = { beginner: "★", intermediate: "✦", advanced: "⬡" };
              const LABELS       = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };
              const unlockNeeds  = prevLvl ? `Complete all ${LABELS[prevLvl]} lessons to unlock` : "";

              return (
                <div key={lvl} style={{ opacity: locked ? 0.45 : 1 }}>
                  <div className="gbc-group-header">
                    {locked ? "🔒 " : `${ICONS[lvl]} `}{LABELS[lvl]}
                    {!locked && lvlLessons.length > 0 && (
                      <span style={{ float: "right", fontSize: 10, color: "var(--dim)" }}>
                        {doneCount}/{lvlLessons.length}
                      </span>
                    )}
                  </div>
                  {locked ? (
                    <div className="gbc-hint">{unlockNeeds}</div>
                  ) : incomplete.length === 0 ? (
                    <div className="gbc-hint" style={{ color: "var(--accent)" }}>
                      ✓ All done — see Archive below
                    </div>
                  ) : (
                    incomplete.map(l => (
                      <button
                        key={l.id}
                        className="gbc-lesson-card"
                        onClick={() => startLesson(l)}
                      >
                        <span className="gbc-lesson-icon">{l.icon}</span>
                        <div className="gbc-lesson-text">
                          <div className="gbc-lesson-title">{l.title}</div>
                          <div className="gbc-lesson-sub">{l.subtitle}</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              );
            })}

            {completed.size > 0 && (
              <div style={{ marginTop: 8 }}>
                <button
                  className="gbc-group-header"
                  style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", color: "inherit" }}
                  onClick={() => setArchiveOpen(o => !o)}
                >
                  {archiveOpen ? "▾" : "▸"} Archive ({completed.size} completed)
                </button>
                {archiveOpen && allLessons.filter(l => completed.has(l.id)).map(l => (
                  <button
                    key={l.id}
                    className="gbc-lesson-card done"
                    onClick={() => startLesson(l)}
                  >
                    <span className="gbc-lesson-icon">{l.icon}</span>
                    <div className="gbc-lesson-text">
                      <div className="gbc-lesson-title">{l.title}</div>
                      <div className="gbc-lesson-sub">{l.subtitle}</div>
                    </div>
                    <span className="gbc-checkmark">✓</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {phase === "lesson" && lesson && currentStep && (
          <>
            <button className="gbc-back-btn" onClick={backToList}>
              ← Back
            </button>

            <div className="gbc-progress-row">
              {lesson.steps.map((_, i) => (
                <div
                  key={i}
                  className={`gbc-step-dot${
                    i < stepIdx ? " done" : i === stepIdx ? " current" : ""
                  }`}
                />
              ))}
            </div>

            <div className="gbc-lesson-header">
              <span className="gbc-lesson-icon">{lesson.icon}</span>
              <div>
                <div className="gbc-lesson-title">{lesson.title}</div>
                <div className="gbc-step-counter">
                  Step {stepIdx + 1} / {lesson.steps.length}
                </div>
              </div>
            </div>

            <div className="gbc-step-title">{currentStep.title}</div>
            <div className="gbc-explanation">{currentStep.explanation}</div>

            {currentStep.type === "challenge" && (
              <div className="gbc-challenge-box">
                {!selectedPiece
                  ? `Click the ${currentStep.challengePiece?.toUpperCase() ?? "piece"} square`
                  : "Now click the destination"}
              </div>
            )}

            {feedback !== "none" && (
              <div className={`gbc-feedback ${feedback}`}>{feedbackMsg}</div>
            )}

            {currentStep.type === "demo" && (
              <button
                className="gbc-btn primary"
                onClick={() => { lock(); advance(); }}
                disabled={busy}
              >
                {isLastStep ? "★ Finish" : "Next →"}
              </button>
            )}
          </>
        )}
      </div>

      {/* Board */}
      <div className="gbc-center">
        {phase === "list" ? (
          <div className="gbc-empty-board">← Select a lesson to begin</div>
        ) : (
          <ChessBoard
            fen={boardFen}
            highlights={highlights}
            moveDots={moveDots}
            arrows={arrows}
            hiddenSquares={hiddenSquares}
            flash={boardFlash}
            onSquareClick={handleSquareClick}
          />
        )}
      </div>
    </div>
  );
}

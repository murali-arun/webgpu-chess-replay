import React, { useEffect, useRef, useState, useCallback } from "react";
import { Chess } from "chess.js";
import { BabylonChessView } from "./babylonChess";
import type { TutorialLesson, TutorialStep, LessonGroup } from "./tutorialData";

type Phase = "list" | "lesson";
type Feedback = "none" | "correct" | "wrong";

export default function TutorialView() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef   = useRef<BabylonChessView | null>(null);
  const [engineLabel, setEngineLabel] = useState("(starting...)");

  const [phase, setPhase]       = useState<Phase>("list");
  const [lesson, setLesson]     = useState<TutorialLesson | null>(null);
  const [stepIdx, setStepIdx]   = useState(0);
  const [feedback, setFeedback] = useState<Feedback>("none");
  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [busy, setBusy]         = useState(false);
  const [selectedPiece, setSelectedPiece] = useState<string | null>(null);
  const [initReady, setInitReady] = useState(false);
  // track completed lessons
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [allGroups, setAllGroups] = useState<LessonGroup[]>([]);

  // Fetch all lessons from Postgres at runtime
  useEffect(() => {
    fetch("/api/lesson/generated")
      .then(r => r.json())
      .then((data: TutorialLesson[]) => {
        if (!Array.isArray(data)) return;
        const CATEGORY_ORDER = ["opening", "pieces", "special", "tactics", "endgame"] as const;
        const CATEGORY_LABELS: Record<string, string> = {
          opening: "Openings", pieces: "Pieces", special: "Special Moves",
          tactics: "Tactics", endgame: "Endgames",
        };
        const map = new Map<string, TutorialLesson[]>();
        for (const lesson of data) {
          if (!map.has(lesson.category)) map.set(lesson.category, []);
          map.get(lesson.category)!.push(lesson);
        }
        const groups: LessonGroup[] = [...map.entries()]
          .sort((a, b) => CATEGORY_ORDER.indexOf(a[0] as any) - CATEGORY_ORDER.indexOf(b[0] as any))
          .map(([cat, lessons]) => ({ category: cat as any, label: CATEGORY_LABELS[cat] ?? cat, lessons }));
        setAllGroups(groups);
      })
      .catch(() => {});
  }, []);

  // ── init Babylon ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const view = new BabylonChessView(canvas);
    viewRef.current = view;
    (async () => {
      await view.init();
      setEngineLabel(view.getEngineKindLabel());
      setInitReady(true);
    })();
    return () => { view.dispose(); viewRef.current = null; };
  }, []);

  // ── helpers ─────────────────────────────────────────────────────────────────
  const currentStep = lesson ? lesson.steps[stepIdx] : null;

  function applyStep(step: TutorialStep) {
    const v = viewRef.current;
    if (!v) return;
    v.clearArrows();
    v.clearMoveDots();
    v.clearSquareHighlights();
    v.forceSetPositionFromFen(step.fen);  // always rebuild so same-FEN steps still show pieces

    if (step.hiddenSquares?.length) v.hidePiecesOnSquares(step.hiddenSquares);

    if (step.highlightSquares?.length) v.highlightSquares(step.highlightSquares, false);
    if (step.arrows?.length) {
      for (const a of step.arrows) v.drawArrow(a.from, a.to, a.color ?? "gold");
    }

    if (step.type === "challenge" && step.challengePiece) {
      // enable click; first click selects the piece, second clicks destination
      setSelectedPiece(null);
      v.enableClickToMove(null); // reset
    }
  }

  // ── start a lesson ──────────────────────────────────────────────────────────
  async function startLesson(l: TutorialLesson) {
    setLesson(l);
    setStepIdx(0);
    setFeedback("none");
    setFeedbackMsg("");
    setSelectedPiece(null);
    setPhase("lesson");
    await new Promise(r => setTimeout(r, 60));
    applyStep(l.steps[0]);

    // auto-play demo move if first step has one
    if (l.steps[0].autoMove) {
      await runAutoMove(l.steps[0]);
    }
  }

  async function runAutoMove(step: TutorialStep) {
    if (!step.autoMove) return;
    const v = viewRef.current;
    if (!v) return;
    await sleep(600);
    await v.animateMove(step.autoMove.from, step.autoMove.to);
    // If landingFen is set, hold that position; otherwise reset to step.fen
    if (step.landingFen) {
      v.forceSetPositionFromFen(step.landingFen);
    } else {
      v.forceSetPositionFromFen(step.fen);
    }
    if (step.hiddenSquares?.length) v.hidePiecesOnSquares(step.hiddenSquares);
    await sleep(400);
  }

  // ── advance to next step ───────────────────────────────────────────────────
  const advance = useCallback(async () => {
    if (!lesson || busy) return;
    setBusy(true);
    const nextIdx = stepIdx + 1;
    if (nextIdx >= lesson.steps.length) {
      // lesson done
      setCompleted(prev => new Set([...prev, lesson.id]));
      viewRef.current?.clearArrows();
      viewRef.current?.clearMoveDots();
      viewRef.current?.clearSquareHighlights();
      viewRef.current?.enableClickToMove(null);
      setPhase("list");
      setLesson(null);
      setStepIdx(0);
      setBusy(false);
      return;
    }
    setFeedback("none");
    setFeedbackMsg("");
    setSelectedPiece(null);
    setStepIdx(nextIdx);
    const next = lesson.steps[nextIdx];
    applyStep(next);
    if (next.autoMove) await runAutoMove(next);
    setBusy(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson, stepIdx, busy]);

  // ── challenge click handler ─────────────────────────────────────────────────
  useEffect(() => {
    const v = viewRef.current;
    if (!v || !currentStep || currentStep.type !== "challenge") {
      v?.enableClickToMove(null);
      return;
    }

    const step = currentStep;

    v.enableClickToMove(async (sq: string) => {
      if (busy) return;

      // Phase 1: select piece
      if (!selectedPiece) {
        if (sq === step.challengePiece) {
          setSelectedPiece(sq);
          // show legal move dots
          const chess = new Chess();
          chess.load(step.fen, { skipValidation: true });
          const moves = chess.moves({ square: sq as any, verbose: true });
          v.showMoveDots(moves.map((m: any) => m.to));
          v.highlightSquares([sq], false);
        }
        return;
      }

      // Phase 2: pick destination
      const chess = new Chess();
      chess.load(step.fen, { skipValidation: true });
      const legalMoves = chess.moves({ square: selectedPiece as any, verbose: true });
      const isLegal = legalMoves.some((m: any) => m.to === sq);

      if (!isLegal) {
        // clicked non-legal square — deselect
        setSelectedPiece(null);
        v.clearMoveDots();
        applyStep(step);
        return;
      }

      // Check correctness
      let correct = false;
      if (step.expectedSquare === "__any_knight_move__" || step.expectedSquare === "__any__") {
        correct = true;
      } else {
        correct = sq === step.expectedSquare;
      }

      setBusy(true);
      v.clearMoveDots();
      v.clearArrows();

      if (correct) {
        await v.animateMove(selectedPiece, sq);
        await v.flashSquare(sq, "correct");
        setFeedback("correct");
        setFeedbackMsg("Correct! 🎉 Well done!");
        setSelectedPiece(null);
        await sleep(900);
        setBusy(false);
        advance();
      } else {
        await v.flashSquare(sq, "wrong");
        setFeedback("wrong");
        setFeedbackMsg(step.hint ?? "Not quite — try again!");
        setSelectedPiece(null);
        applyStep(step);
        setBusy(false);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, selectedPiece, busy]);

  // ── render ───────────────────────────────────────────────────────────────────
  const isLastStep = lesson ? stepIdx === lesson.steps.length - 1 : false;

  return (
    <div style={S.shell}>
      {/* ── Left panel ── */}
      <div style={S.left}>
        <div style={S.brandRow}>
          <div style={S.brand}>♟ Chess Tutorial</div>
          <div style={S.badge}>{engineLabel}</div>
        </div>

        {phase === "list" && (
          <>
            <div style={S.sectionTitle}>Choose a Lesson</div>
            {!initReady && (
              <div style={S.loadingBox}>⏳ Loading 3D models…</div>
            )}
            {allGroups.map(group => (
              <div key={group.category}>
                <div style={S.groupHeader}>{group.label}</div>
                {group.lessons.map(l => (
                  <button
                    key={l.id}
                    style={{ ...S.lessonCard, ...(completed.has(l.id) ? S.lessonCardDone : {}), ...(!initReady ? { opacity: 0.45, cursor: "not-allowed" } : {}) }}
                    onClick={() => initReady && startLesson(l)}
                    disabled={!initReady}
                  >
                    <span style={S.lessonIcon}>{l.icon}</span>
                    <div style={S.lessonText}>
                      <div style={S.lessonTitle}>{l.title}</div>
                      <div style={S.lessonSub}>{l.subtitle}</div>
                    </div>
                    {completed.has(l.id) && <span style={S.checkmark}>✓</span>}
                  </button>
                ))}
              </div>
            ))}
            <div style={S.hint}>
              More lessons coming soon! Each one covers a key concept from
              Levy Rozman's "How to Win at Chess".
            </div>
          </>
        )}

        {phase === "lesson" && lesson && currentStep && (
          <>
            <button style={S.backBtn} onClick={() => {
              viewRef.current?.clearArrows();
              viewRef.current?.clearMoveDots();
              viewRef.current?.clearSquareHighlights();
              viewRef.current?.enableClickToMove(null);
              setPhase("list");
              setLesson(null);
              setStepIdx(0);
              setFeedback("none");
            }}>
              ← Back to lessons
            </button>

            {/* Progress dots */}
            <div style={S.progressRow}>
              {lesson.steps.map((_, i) => (
                <div
                  key={i}
                  style={{
                    ...S.dot,
                    background: i < stepIdx
                      ? "#4caf50"
                      : i === stepIdx
                      ? "#ffc832"
                      : "rgba(255,255,255,0.15)"
                  }}
                />
              ))}
            </div>

            <div style={S.lessonHeader}>
              <span style={{ fontSize: 28 }}>{lesson.icon}</span>
              <div>
                <div style={S.lessonTitle}>{lesson.title}</div>
                <div style={S.stepCounter}>Step {stepIdx + 1} of {lesson.steps.length}</div>
              </div>
            </div>

            <div style={S.stepTitle}>{currentStep.title}</div>
            <div style={S.explanation}>{currentStep.explanation}</div>

            {currentStep.type === "challenge" && (
              <div style={S.challengeBox}>
                {!selectedPiece
                  ? `👆 Click the ${currentStep.challengePiece ? currentStep.challengePiece.toUpperCase() : "piece"} square to select it`
                  : `✅ Piece selected! Now click where it should move.`}
              </div>
            )}

            {feedback !== "none" && (
              <div style={{
                ...S.feedbackBox,
                background: feedback === "correct"
                  ? "rgba(30, 160, 60, 0.25)"
                  : "rgba(200, 40, 40, 0.25)",
                borderColor: feedback === "correct"
                  ? "rgba(80, 220, 100, 0.5)"
                  : "rgba(220, 80, 80, 0.5)"
              }}>
                {feedbackMsg}
              </div>
            )}

            {currentStep.type === "demo" && (
              <button
                style={S.btnPrimary}
                onClick={advance}
                disabled={busy}
              >
                {isLastStep ? "🏁 Finish Lesson" : "Next →"}
              </button>
            )}
          </>
        )}
      </div>

      {/* ── 3D canvas ── */}
      <div style={S.center}>
        <canvas ref={canvasRef} style={S.canvas} />
        {phase === "list" && (
          <div style={S.emptyBoard}>
            <div style={S.emptyBoardText}>← Select a lesson to begin</div>
          </div>
        )}
      </div>
    </div>
  );
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Styles ────────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  shell: {
    height: "100%", display: "grid",
    gridTemplateColumns: "420px 1fr",
    background: "#0b0f14",
    color: "rgba(255,255,255,0.92)",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
  },
  left: {
    borderRight: "1px solid rgba(255,255,255,0.08)",
    padding: 16, display: "flex", flexDirection: "column", gap: 12,
    overflowY: "auto"
  },
  center: { position: "relative" },
  canvas: { width: "100%", height: "100%" },
  emptyBoard: {
    position: "absolute", inset: 0, display: "flex",
    alignItems: "center", justifyContent: "center",
    pointerEvents: "none"
  },
  emptyBoardText: {
    fontSize: 18, color: "rgba(255,255,255,0.3)",
    fontStyle: "italic"
  },
  brandRow: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  brand: { fontWeight: 800, fontSize: 16, letterSpacing: 0.2 },
  badge: {
    fontSize: 12, padding: "4px 10px",
    border: "1px solid rgba(255,255,255,0.12)", borderRadius: 999,
    background: "rgba(255,255,255,0.04)"
  },
  sectionTitle: {
    fontSize: 11, fontWeight: 700, letterSpacing: 1.2,
    textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginTop: 4
  },
  loadingBox: {
    fontSize: 13, padding: "10px 14px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10, color: "rgba(255,255,255,0.5)",
    textAlign: "center" as const
  },
  groupHeader: {
    fontSize: 10, fontWeight: 700, letterSpacing: 1.4,
    textTransform: "uppercase" as const,
    color: "rgba(255,200,50,0.6)",
    paddingTop: 8, paddingBottom: 4,
    borderBottom: "1px solid rgba(255,200,50,0.12)",
    marginBottom: 4
  },
  lessonCard: {
    display: "flex", alignItems: "center", gap: 12,
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 12, padding: "12px 14px", cursor: "pointer",
    transition: "background 0.15s", textAlign: "left",
    color: "rgba(255,255,255,0.9)"
  },
  lessonCardDone: {
    borderColor: "rgba(80,200,100,0.35)",
    background: "rgba(40,120,60,0.08)"
  },
  lessonIcon: { fontSize: 30, flexShrink: 0 },
  lessonText: { flex: 1 },
  lessonTitle: { fontWeight: 700, fontSize: 15 },
  lessonSub: { fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 },
  checkmark: { fontSize: 18, color: "#4caf50", fontWeight: 700 },
  hint: {
    fontSize: 12, color: "rgba(255,255,255,0.35)",
    lineHeight: 1.6, marginTop: 4
  },
  backBtn: {
    background: "none", border: "1px solid rgba(255,255,255,0.12)",
    color: "rgba(255,255,255,0.6)", padding: "6px 12px",
    borderRadius: 8, cursor: "pointer", fontSize: 13, alignSelf: "flex-start"
  },
  progressRow: { display: "flex", gap: 6, alignItems: "center" },
  dot: { width: 10, height: 10, borderRadius: "50%", transition: "background 0.3s" },
  lessonHeader: { display: "flex", gap: 12, alignItems: "center" },
  stepCounter: { fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 },
  stepTitle: { fontWeight: 800, fontSize: 18, lineHeight: 1.3 },
  explanation: {
    fontSize: 14, lineHeight: 1.7, color: "rgba(255,255,255,0.82)",
    background: "rgba(255,255,255,0.03)", borderRadius: 10,
    padding: "12px 14px", border: "1px solid rgba(255,255,255,0.07)",
    whiteSpace: "pre-line" as const
  },
  challengeBox: {
    fontSize: 13, padding: "10px 14px",
    background: "rgba(255,200,50,0.08)",
    border: "1px solid rgba(255,200,50,0.25)",
    borderRadius: 10, color: "rgba(255,220,100,0.9)", lineHeight: 1.5
  },
  feedbackBox: {
    fontSize: 14, padding: "10px 14px",
    borderRadius: 10, border: "1px solid",
    lineHeight: 1.5, fontWeight: 600
  },
  btnPrimary: {
    padding: "12px 20px", borderRadius: 10,
    background: "linear-gradient(135deg, #ffc832, #e6a800)",
    color: "#111", fontWeight: 800, fontSize: 15,
    border: "none", cursor: "pointer",
    boxShadow: "0 4px 16px rgba(255,200,50,0.3)"
  }
};

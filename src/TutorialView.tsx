import React, { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import ChessBoard from "./ChessBoard";
import type { Arrow, FlashState } from "./ChessBoard";
import { ALL_LESSONS } from "./tutorialData";
import type { TutorialLesson, TutorialStep } from "./tutorialData";
import { explainMove, getBookChoices, openingNameFor } from "./openingCoach";

type Phase    = "list" | "lesson" | "coach";
type Feedback = "none" | "correct" | "wrong";
type Level    = "beginner" | "intermediate" | "advanced";

type CoachAnalysis = {
  score: number;
  label: string;
  playedSan: string;
  bestMove: string | null;
  bestSan: string | null;
  centipawnLoss: number;
  explanation: string;
};

type CoachHistory = {
  moveNumber: number;
  side: "White" | "Black";
  playedSan: string;
  score?: number;
  label: string;
};

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
  const [allLessons,  setAllLessons]  = useState<TutorialLesson[]>(ALL_LESSONS);
  const [archiveOpen, setArchiveOpen] = useState(false);

  // Opening coach state
  const coachChessRef = useRef(new Chess());
  const [coachFen, setCoachFen] = useState(() => new Chess().fen());
  const [coachSelected, setCoachSelected] = useState<string | null>(null);
  const [coachDots, setCoachDots] = useState<string[]>([]);
  const [coachHighlights, setCoachHighlights] = useState<string[]>([]);
  const [coachArrows, setCoachArrows] = useState<Arrow[]>([]);
  const [coachAnalysis, setCoachAnalysis] = useState<CoachAnalysis | null>(null);
  const [coachHistory, setCoachHistory] = useState<CoachHistory[]>([]);
  const [coachThinking, setCoachThinking] = useState(false);
  const [coachThinkingLabel, setCoachThinkingLabel] = useState("Studying your move…");
  const [coachError, setCoachError] = useState("");

  // Board display state
  const [boardFen,     setBoardFen]     = useState("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  const [highlights,   setHighlights]   = useState<string[]>([]);
  const [moveDots,     setMoveDots]     = useState<string[]>([]);
  const [arrows,       setArrows]       = useState<Arrow[]>([]);
  const [hiddenSquares, setHiddenSquares] = useState<string[]>([]);
  const [boardFlash,   setBoardFlash]   = useState<FlashState | null>(null);
  const flashIdRef = useRef(0);

  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  function lock()   { busyRef.current = true;  setBusy(true);  }
  function unlock() { busyRef.current = false; setBusy(false); }

  useEffect(() => {
    fetch("/api/lesson/generated")
      .then(r => r.json())
      .then((data: TutorialLesson[]) => {
        if (!Array.isArray(data) || data.length === 0) return;
        const merged = new Map(ALL_LESSONS.map(item => [item.id, item]));
        data.forEach(item => merged.set(item.id, item));
        setAllLessons([...merged.values()]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { saveCompleted(completed); }, [completed]);

  const currentStep = lesson ? lesson.steps[stepIdx] : null;

  function applyStep(step: TutorialStep) {
    setBoardFen(step.fen);
    setHighlights(step.highlightSquares ?? []);
    setArrows(step.arrows?.map(a => ({ ...a, color: a.color ?? "gold" })) ?? []);
    setMoveDots([]);
    setHiddenSquares(step.hiddenSquares ?? []);
    setBoardFlash(null);
  }

  async function runAutoMove(step: TutorialStep) {
    if (!step.autoMove) return;
    await sleep(600);
    setHighlights([step.autoMove.from, step.autoMove.to]);
    try {
      const chess = new Chess();
      chess.load(step.fen, { skipValidation: true });
      chess.move({ from: step.autoMove.from, to: step.autoMove.to, promotion: "q" });
      setBoardFen(chess.fen());
    } catch {}
    await sleep(350);
    setBoardFen(step.landingFen ?? step.fen);
    if (step.hiddenSquares?.length) setHiddenSquares(step.hiddenSquares);
    setHighlights([]);
  }

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

  function handleSquareClick(sq: string) {
    if (!currentStep || currentStep.type !== "challenge") return;
    if (busyRef.current) return;
    handleChallengeAsync(sq);
  }

  async function handleChallengeAsync(sq: string) {
    const step = currentStep!;

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
      await advance();
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

  function resetCoach() {
    const chess = new Chess();
    coachChessRef.current = chess;
    setCoachFen(chess.fen());
    setCoachSelected(null);
    setCoachDots([]);
    setCoachHighlights([]);
    setCoachArrows([]);
    setCoachAnalysis(null);
    setCoachHistory([]);
    setCoachThinking(false);
    setCoachThinkingLabel("Studying your move…");
    setCoachError("");
  }

  function startCoach() {
    resetCoach();
    setPhase("coach");
  }

  async function handleCoachSquare(sq: string) {
    if (coachThinking || coachAnalysis || coachChessRef.current.isGameOver()) return;
    const chess = coachChessRef.current;
    if (chess.turn() !== "w") return;

    if (!coachSelected) {
      const piece = chess.get(sq as any);
      const side = chess.turn() === "w" ? "w" : "b";
      if (!piece || piece.color !== side) return;
      const legal = chess.moves({ square: sq as any, verbose: true });
      setCoachSelected(sq);
      setCoachDots(legal.map((candidate: any) => candidate.to));
      setCoachHighlights([sq]);
      setCoachArrows([]);
      return;
    }

    const legal = chess.moves({ square: coachSelected as any, verbose: true });
    const target = legal.find((candidate: any) => candidate.to === sq);
    if (!target) {
      const piece = chess.get(sq as any);
      if (piece?.color === chess.turn()) {
        const nextLegal = chess.moves({ square: sq as any, verbose: true });
        setCoachSelected(sq);
        setCoachDots(nextLegal.map((candidate: any) => candidate.to));
        setCoachHighlights([sq]);
      } else {
        setCoachSelected(null);
        setCoachDots([]);
        setCoachHighlights([]);
      }
      return;
    }

    const beforeFen = chess.fen();
    const movingSide = chess.turn() === "w" ? "White" : "Black";
    const moveNumber = Number(beforeFen.split(" ")[5] || 1);
    const uci = `${coachSelected}${sq}${target.promotion ?? ""}`;
    const played = chess.move({ from: coachSelected, to: sq, promotion: target.promotion ?? "q" });
    setCoachFen(chess.fen());
    setCoachHighlights([coachSelected, sq]);
    setCoachSelected(null);
    setCoachDots([]);
    setCoachArrows([]);
    setCoachThinking(true);
    setCoachThinkingLabel("Studying your move…");
    setCoachError("");

    try {
      const response = await fetch("/api/coach/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: beforeFen, move: uci }),
      });
      if (!response.ok) throw new Error("Coach could not evaluate this move");
      const result = await response.json();
      const analysis: CoachAnalysis = {
        ...result,
        playedSan: result.playedSan ?? played.san,
        explanation: explainMove(beforeFen, uci, played.san, result.score),
      };
      setCoachAnalysis(analysis);
      setCoachHistory(previous => [...previous, { moveNumber, side: movingSide, playedSan: analysis.playedSan, score: analysis.score, label: analysis.label }]);
    } catch {
      const bookChoice = getBookChoices(beforeFen).find(choice => choice.uci === uci);
      const fallbackScore = bookChoice ? 9 : 6;
      const analysis: CoachAnalysis = {
        score: fallbackScore,
        label: bookChoice ? "Opening theory" : "Needs engine review",
        playedSan: played.san,
        bestMove: getBookChoices(beforeFen)[0]?.uci ?? null,
        bestSan: null,
        centipawnLoss: 0,
        explanation: bookChoice?.explanation ?? "The engine is temporarily unavailable. This provisional score uses opening principles only.",
      };
      setCoachAnalysis(analysis);
      setCoachHistory(previous => [...previous, { moveNumber, side: movingSide, playedSan: analysis.playedSan, score: analysis.score, label: analysis.label }]);
      setCoachError("Provisional score—the Stockfish coach is temporarily unavailable.");
    } finally {
      setCoachThinking(false);
    }
  }

  function retryCoachMove() {
    const analysis = coachAnalysis;
    const chess = coachChessRef.current;
    chess.undo();
    setCoachFen(chess.fen());
    setCoachHistory(previous => previous.slice(0, -1));
    setCoachAnalysis(null);
    setCoachSelected(null);
    setCoachDots([]);
    setCoachHighlights([]);
    setCoachError("");
    if (analysis?.bestMove) {
      setCoachArrows([{ from: analysis.bestMove.slice(0, 2), to: analysis.bestMove.slice(2, 4), color: "green" }]);
    }
  }

  async function playStockfishBlack() {
    const chess = coachChessRef.current;
    if (chess.isGameOver() || chess.turn() !== "b") return;
    setCoachThinking(true);
    setCoachThinkingLabel("Stockfish is choosing Black's reply…");
    setCoachError("");

    try {
      const beforeFen = chess.fen();
      const moveNumber = Number(beforeFen.split(" ")[5] || 1);
      const response = await fetch("/api/stockfish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: beforeFen, skill: 18, movetime: 650 }),
      });
      if (!response.ok) throw new Error("Stockfish reply unavailable");
      const result = await response.json();
      const uci = result.move as string;
      if (!uci || uci.length < 4) throw new Error("Stockfish returned no move");
      const played = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci[4] || "q",
      });
      if (!played) throw new Error("Stockfish returned an illegal move");
      setCoachFen(chess.fen());
      setCoachHighlights([uci.slice(0, 2), uci.slice(2, 4)]);
      setCoachHistory(previous => [...previous, {
        moveNumber,
        side: "Black",
        playedSan: played.san,
        label: "Stockfish",
      }]);
    } catch {
      setCoachError("Stockfish could not move. Check the connection, then retry.");
    } finally {
      setCoachThinking(false);
    }
  }

  function continueCoach() {
    setCoachAnalysis(null);
    setCoachHighlights([]);
    setCoachArrows([]);
    setCoachError("");
    void playStockfishBlack();
  }

  const isLastStep = lesson ? stepIdx === lesson.steps.length - 1 : false;

  const LEVEL_ICONS  = { beginner: "★", intermediate: "✦", advanced: "⬡" } as const;
  const LEVEL_LABELS = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" } as const;

  return (
    <div className={`gbc-shell ${phase === "lesson" ? "gbc-tut-lesson" : phase === "coach" ? "gbc-coach" : "gbc-tut-list"}`}>

      {/* ── LIST PHASE ── */}
      {phase === "list" && (
        <div className="gbc-list-body">
          <div className="gbc-list-title">★ Tutorial — Your Path</div>

          <button className="gbc-coach-launch" onClick={startCoach}>
            <span className="gbc-coach-launch-icon">♟</span>
            <span>
              <strong>Opening Coach</strong>
              <small>You play White · Stockfish plays Black · Score each move you make</small>
            </span>
            <span aria-hidden="true">Start →</span>
          </button>

          {(["beginner", "intermediate", "advanced"] as Level[]).map(lvl => {
            const lvlLessons  = allLessons.filter(l => lessonLevel(l) === lvl);
            if (lvlLessons.length === 0) return null;
            const incomplete  = lvlLessons.filter(l => !completed.has(l.id));
            const doneCount   = lvlLessons.length - incomplete.length;
            const prevLvl     = lvl === "intermediate" ? "beginner" : lvl === "advanced" ? "intermediate" : null;
            const prevLessons = prevLvl ? allLessons.filter(l => lessonLevel(l) === prevLvl) : [];
            const locked      = prevLvl !== null && prevLessons.some(l => !completed.has(l.id));
            const unlockNeeds = prevLvl ? `Complete all ${LEVEL_LABELS[prevLvl]} lessons to unlock` : "";

            return (
              <div key={lvl} className="gbc-level-section" style={{ opacity: locked ? 0.45 : 1 }}>
                <div className="gbc-group-header">
                  {locked ? "🔒 " : `${LEVEL_ICONS[lvl]} `}{LEVEL_LABELS[lvl]}
                  {!locked && (
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
                  <div className="gbc-card-grid">
                    {incomplete.map(l => (
                      <button key={l.id} className="gbc-lesson-card" onClick={() => startLesson(l)}>
                        <span className="gbc-lesson-icon">{l.icon}</span>
                        <div className="gbc-lesson-text">
                          <div className="gbc-lesson-title">{l.title}</div>
                          <div className="gbc-lesson-sub">{l.subtitle}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {completed.size > 0 && (
            <div className="gbc-level-section">
              <button
                className="gbc-group-header"
                style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", color: "inherit" }}
                onClick={() => setArchiveOpen(o => !o)}
              >
                {archiveOpen ? "▾" : "▸"} Archive ({completed.size} completed)
              </button>
              {archiveOpen && (
                <div className="gbc-card-grid">
                  {allLessons.filter(l => completed.has(l.id)).map(l => (
                    <button key={l.id} className="gbc-lesson-card done" onClick={() => startLesson(l)}>
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
            </div>
          )}
        </div>
      )}

      {/* ── OPENING COACH ── */}
      {phase === "coach" && (
        <>
          <div className="gbc-coach-board">
            <ChessBoard
              fen={coachFen}
              highlights={coachHighlights}
              moveDots={coachDots}
              arrows={coachArrows}
              onSquareClick={handleCoachSquare}
            />
          </div>

          <aside className="gbc-coach-panel" aria-label="Move coach">
            <div className="gbc-coach-toolbar">
              <button className="gbc-back-btn" onClick={backToList}>← Lessons</button>
              <button className="gbc-back-btn" onClick={resetCoach}>New game</button>
            </div>

            <div className="gbc-coach-heading">
              <div className="gbc-kicker">Opening Coach</div>
              <h2>{openingNameFor(coachFen)}</h2>
              <p>You play White against Stockfish. Your moves are checked against engine analysis and established opening ideas.</p>
            </div>

            {coachThinking && (
              <div className="gbc-coach-thinking" role="status" aria-live="polite">
                <span className="gbc-coach-spinner" /> {coachThinkingLabel}
              </div>
            )}

            {!coachThinking && coachAnalysis && (
              <div className="gbc-score-card" aria-live="polite">
                <div className="gbc-score-topline">
                  <div className={`gbc-score-ring score-${coachAnalysis.score}`}>
                    <strong>{coachAnalysis.score}</strong><span>/10</span>
                  </div>
                  <div>
                    <div className="gbc-score-label">{coachAnalysis.label}</div>
                    <div className="gbc-score-move">Your move: {coachAnalysis.playedSan}</div>
                  </div>
                </div>
                <p className="gbc-score-why"><strong>Why:</strong> {coachAnalysis.explanation}</p>
                {coachAnalysis.bestMove && (
                  <div className="gbc-better-move">
                    <span>Coach recommends</span>
                    <strong>{coachAnalysis.bestSan ?? coachAnalysis.bestMove}</strong>
                    {coachAnalysis.centipawnLoss > 12 && <small>Preserves roughly {Math.round(coachAnalysis.centipawnLoss / 100 * 10) / 10} more pawn value.</small>}
                  </div>
                )}
                {coachError && <div className="gbc-notice">{coachError}</div>}
                <div className="gbc-coach-actions">
                  <button className="gbc-btn" onClick={retryCoachMove}>↶ Undo & try better</button>
                  <button className="gbc-btn primary" onClick={continueCoach}>Keep · Stockfish replies →</button>
                </div>
              </div>
            )}

            {!coachThinking && !coachAnalysis && (
              <div className="gbc-coach-prompt">
                <strong>{coachChessRef.current.isGameOver() ? "Game complete" : coachChessRef.current.turn() === "w" ? "Your turn · White" : "Stockfish · Black"}</strong>
                <span>{coachArrows.length ? "The green arrow shows the recommended move. Try it—or find another strong idea." : coachChessRef.current.turn() === "w" ? "Choose a piece, then choose its destination." : "Black's reply is generated by Stockfish at skill level 18."}</span>
                {coachError && coachChessRef.current.turn() === "b" && (
                  <button className="gbc-btn" onClick={() => void playStockfishBlack()}>Retry Stockfish move</button>
                )}
              </div>
            )}

            <div className="gbc-coach-history">
              <div className="gbc-group-header">Move scores</div>
              {coachHistory.length === 0 ? (
                <p>No moves yet. Strong openings develop pieces, control the center, and protect the king.</p>
              ) : (
                <ol>
                  {[...coachHistory].reverse().map((item, index) => (
                    <li key={`${item.moveNumber}-${item.side}-${index}`}>
                      <span>{item.moveNumber}{item.side === "Black" ? "…" : "."} {item.playedSan}</span>
                      <strong>{item.score === undefined ? item.label : `${item.score}/10`}</strong>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </aside>
        </>
      )}

      {/* ── LESSON PHASE ── */}
      {phase === "lesson" && lesson && currentStep && (
        <>
          <div className="gbc-lesson-board">
            <ChessBoard
              fen={boardFen}
              highlights={highlights}
              moveDots={moveDots}
              arrows={arrows}
              hiddenSquares={hiddenSquares}
              flash={boardFlash}
              onSquareClick={handleSquareClick}
            />
          </div>

          <div className="gbc-lesson-panel">
            <div className="gbc-panel-top">
              <button className="gbc-back-btn" onClick={backToList}>← Back</button>
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
              <div className="gbc-panel-lesson-info">
                <span className="gbc-panel-icon">{lesson.icon}</span>
                <div>
                  <div className="gbc-panel-lesson-name">{lesson.title}</div>
                  <div className="gbc-step-counter">Step {stepIdx + 1} / {lesson.steps.length}</div>
                </div>
              </div>
            </div>

            <div className="gbc-panel-body">
              <div className="gbc-step-title">{currentStep.title}</div>
              <div className="gbc-panel-explanation">{currentStep.explanation}</div>
              {currentStep.type === "challenge" && (
                <div className="gbc-challenge-box">
                  {!selectedPiece
                    ? `Click the ${currentStep.challengePiece?.toUpperCase() ?? "piece"} square`
                    : "Now click the destination"}
                </div>
              )}
              {feedback !== "none" && (
                <div className={`gbc-feedback ${feedback}`} role="status" aria-live="polite">{feedbackMsg}</div>
              )}
            </div>

            {currentStep.type === "demo" && (
              <div className="gbc-panel-footer">
                <button
                  className="gbc-btn primary"
                  onClick={() => { lock(); advance(); }}
                  disabled={busy}
                >
                  {isLastStep ? "★ Finish" : "Next →"}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

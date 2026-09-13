import React, { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import ChessBoard from "./ChessBoard";
import type { Arrow } from "./ChessBoard";
import { PUZZLE_FALLBACKS } from "./puzzleFallbacks";
import type { TrainingPuzzle } from "./puzzleFallbacks";

export default function DailyPuzzle() {
  const [puzzles, setPuzzles] = useState<TrainingPuzzle[]>(PUZZLE_FALLBACKS);
  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const chessRef = useRef(new Chess(PUZZLE_FALLBACKS[0].fen));
  const replyTimer = useRef<number | null>(null);
  const [fen, setFen] = useState(PUZZLE_FALLBACKS[0].fen);
  const [selected, setSelected] = useState<string | null>(null);
  const [dots, setDots] = useState<string[]>([]);
  const [highlights, setHighlights] = useState<string[]>([]);
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [solutionIndex, setSolutionIndex] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [feedback, setFeedback] = useState("Find the strongest move. Calculate before touching a piece.");
  const [busy, setBusy] = useState(false);
  const [solved, setSolved] = useState(false);

  const puzzle = puzzles[puzzleIndex] ?? PUZZLE_FALLBACKS[0];

  useEffect(() => {
    fetch("/api/training/puzzles")
      .then(response => response.ok ? response.json() : Promise.reject())
      .then((remote: TrainingPuzzle[]) => {
        if (!Array.isArray(remote)) return;
        const merged = new Map<string, TrainingPuzzle>();
        // Keep the bundled items first so an in-progress puzzle never changes
        // underneath the player when the network response arrives.
        [...PUZZLE_FALLBACKS, ...remote].forEach(item => {
          if (!merged.has(item.id)) merged.set(item.id, item);
        });
        setPuzzles([...merged.values()]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => () => { if (replyTimer.current) window.clearTimeout(replyTimer.current); }, []);

  function loadPuzzle(index: number) {
    if (replyTimer.current) window.clearTimeout(replyTimer.current);
    const next = puzzles[index];
    const chess = new Chess(next.fen);
    chessRef.current = chess;
    setPuzzleIndex(index);
    setFen(chess.fen());
    setSelected(null);
    setDots([]);
    setHighlights([]);
    setArrows([]);
    setSolutionIndex(0);
    setMistakes(0);
    setBusy(false);
    setSolved(false);
    setFeedback("Find the strongest move. Calculate before touching a piece.");
  }

  function switchPuzzle() {
    loadPuzzle((puzzleIndex + 1) % puzzles.length);
  }

  function applyUci(uci: string) {
    const played = chessRef.current.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] || "q",
    });
    if (!played) throw new Error("Invalid puzzle move");
    setFen(chessRef.current.fen());
    setHighlights([uci.slice(0, 2), uci.slice(2, 4)]);
    return played;
  }

  function handleSquare(sq: string) {
    if (busy || solved) return;
    const chess = chessRef.current;
    if (!selected) {
      const piece = chess.get(sq as any);
      if (!piece || piece.color !== chess.turn()) return;
      const legal = chess.moves({ square: sq as any, verbose: true });
      setSelected(sq);
      setDots(legal.map((move: any) => move.to));
      setHighlights([sq]);
      setArrows([]);
      return;
    }

    const legal = chess.moves({ square: selected as any, verbose: true });
    const target = legal.find((move: any) => move.to === sq);
    if (!target) {
      setSelected(null); setDots([]); setHighlights([]);
      return;
    }

    const playedUci = `${selected}${sq}${target.promotion ?? ""}`;
    const expected = puzzle.solution[solutionIndex];
    setSelected(null); setDots([]);
    if (playedUci !== expected) {
      setMistakes(value => value + 1);
      setFeedback("Useful attempt. Reset the calculation: checks, captures, then threats.");
      setHighlights([selected, sq]);
      return;
    }

    applyUci(expected);
    const replyIndex = solutionIndex + 1;
    if (replyIndex >= puzzle.solution.length) {
      setSolved(true);
      setFeedback(mistakes === 0 ? "Clean calculation. You found the full idea." : "Solved—and the earlier attempt made this pattern more memorable.");
      return;
    }

    setBusy(true);
    setFeedback("Correct. Hold the idea while the defense appears…");
    replyTimer.current = window.setTimeout(() => {
      applyUci(puzzle.solution[replyIndex]);
      const next = replyIndex + 1;
      setSolutionIndex(next);
      setBusy(false);
      if (next >= puzzle.solution.length) {
        setSolved(true);
        setFeedback("Line complete. Name the tactical pattern before moving on.");
      } else {
        setFeedback("Your move. Continue the same tactical idea.");
      }
    }, 550);
  }

  function showHint() {
    const move = puzzle.solution[solutionIndex];
    setArrows([{ from: move.slice(0, 2), to: move.slice(2, 4), color: "gold" }]);
    setFeedback("Hint shown. Explain why the move works before playing it.");
  }

  const side = puzzle.fen.split(" ")[1] === "w" ? "White" : "Black";

  return (
    <section className="gbc-puzzle-lab" aria-label="Daily tactical retrieval practice">
      <div className="gbc-puzzle-board"><ChessBoard fen={fen} highlights={highlights} moveDots={dots} arrows={arrows} onSquareClick={handleSquare} /></div>
      <div className="gbc-puzzle-copy">
        <div className="gbc-kicker">Recall block · Puzzle {puzzleIndex + 1} of {puzzles.length}</div>
        <h2>{side} to move</h2>
        <div className="gbc-puzzle-tags"><span>≈ {puzzle.rating}</span>{puzzle.themes.slice(0, 3).map(theme => <span key={theme}>{theme.replace(/([A-Z])/g, " $1")}</span>)}</div>
        <p role="status" aria-live="polite">{feedback}</p>
        <div className="gbc-puzzle-actions">
          {!solved && <button className="gbc-btn" onClick={showHint} disabled={mistakes === 0 || busy}>{mistakes === 0 ? "Try once before hint" : "Show one hint"}</button>}
          <button className="gbc-btn primary" onClick={switchPuzzle}>{solved ? "Next puzzle →" : "Switch puzzle"}</button>
        </div>
        <small>{PUZZLE_FALLBACKS.length} offline backups included · New mixed puzzles from <a href={`https://lichess.org/training/${puzzle.id}`} target="_blank" rel="noreferrer">Lichess</a> when available (CC0).</small>
      </div>
    </section>
  );
}

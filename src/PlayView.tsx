import React, { useCallback, useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import ChessBoard from "./ChessBoard";
import type { FlashState } from "./ChessBoard";
import { useStockfish, DIFFICULTY } from "./useStockfish";
import type { Difficulty } from "./useStockfish";

type PlayerColor = "white" | "black";
type GameStatus  = "setup" | "playing" | "over";

const STATUS_LABELS: Record<Difficulty, string> = {
  easy:   "Easy",
  medium: "Medium",
  hard:   "Hard",
};

interface Props { token?: string; username?: string; }

export default function PlayView({ token, username }: Props) {
  const [status,       setStatus]       = useState<GameStatus>("setup");
  const [playerColor,  setPlayerColor]  = useState<PlayerColor>("white");
  const [difficulty,   setDifficulty]   = useState<Difficulty>("medium");

  // Board state
  const [fen,          setFen]          = useState("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  const [highlights,   setHighlights]   = useState<string[]>([]);
  const [moveDots,     setMoveDots]     = useState<string[]>([]);
  const [selectedSq,   setSelectedSq]   = useState<string | null>(null);
  const [flash,        setFlash]        = useState<FlashState | null>(null);
  const [thinking,     setThinking]     = useState(false);
  const [gameResult,   setGameResult]   = useState("");
  const [engineNotice, setEngineNotice] = useState("");
  const [stats,        setStats]        = useState<{ wins: number; losses: number; draws: number; total: number } | null>(null);
  const flashIdRef   = useRef(0);
  const botBusyRef   = useRef(false);

  const chessRef   = useRef(new Chess());
  const { ready, getMove, reset: resetEngine } = useStockfish();

  const isPlayerTurn = useCallback(() => {
    const chess = chessRef.current;
    const turn  = chess.turn(); // 'w' or 'b'
    return (turn === "w" && playerColor === "white") ||
           (turn === "b" && playerColor === "black");
  }, [playerColor]);

  // Fetch stats on mount
  useEffect(() => {
    if (!token) return;
    fetch("/api/game/stats", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setStats).catch(() => {});
  }, [token]);

  function checkGameOver(chess: Chess): string {
    if (chess.isCheckmate()) {
      const winner = chess.turn() === "w" ? "Black" : "White";
      return `Checkmate — ${winner} wins!`;
    }
    if (chess.isStalemate())       return "Stalemate — Draw!";
    if (chess.isThreefoldRepetition()) return "Draw by repetition";
    if (chess.isInsufficientMaterial()) return "Draw — Insufficient material";
    if (chess.isDraw())            return "Draw!";
    return "";
  }

  function saveResult(result: "win" | "loss" | "draw") {
    if (!token) return;
    fetch("/api/game/result", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ result, difficulty, color: playerColor }),
    })
      .then(r => r.json())
      .then(() => fetch("/api/game/stats", { headers: { Authorization: `Bearer ${token}` } }))
      .then(r => r.json()).then(setStats).catch(() => {});
  }

  // Bot move after player moves or on bot's first move (if bot plays white)
  const doBotMove = useCallback(async (chess: Chess) => {
    if (botBusyRef.current) return;
    botBusyRef.current = true;
    const { skill, movetime } = DIFFICULTY[difficulty];
    setThinking(true);
    try {
      const uci = await getMove(chess.fen(), skill, movetime);
      let from = uci.slice(0, 2);
      let to = uci.slice(2, 4);
      let promo: string | undefined = uci[4];
      if (!uci || uci.length < 4) {
        const legal = chess.moves({ verbose: true });
        const fallback = legal[Math.floor(Math.random() * legal.length)];
        if (!fallback) return;
        from = fallback.from;
        to = fallback.to;
        promo = fallback.promotion;
        setEngineNotice("Quick-play mode: using a local move while the chess engine is unavailable.");
      } else {
        setEngineNotice("");
      }
      chess.move({ from, to, promotion: promo });
      setFen(chess.fen());
      setHighlights([from, to]);
      setSelectedSq(null);
      setMoveDots([]);
      const result = checkGameOver(chess);
      if (result) {
        const outcome = chess.isCheckmate()
          ? (chess.turn() === (playerColor === "white" ? "w" : "b") ? "loss" : "win")
          : "draw";
        saveResult(outcome);
        setGameResult(result); setStatus("over");
      }
    } finally {
      botBusyRef.current = false;
      setThinking(false);
    }
  }, [difficulty, getMove]);

  // Triggers when it's the bot's turn (including bot-plays-white opening move)
  useEffect(() => {
    if (status !== "playing") return;
    if (isPlayerTurn()) return;
    doBotMove(chessRef.current);
  }, [status, isPlayerTurn, doBotMove]);

  function handleSquareClick(sq: string) {
    if (status !== "playing") return;
    if (!isPlayerTurn()) return;
    if (thinking) return;

    const chess = chessRef.current;

    // If a piece is already selected
    if (selectedSq) {
      const legalMoves = chess.moves({ square: selectedSq as any, verbose: true });
      const target     = legalMoves.find((m: any) => m.to === sq);

      if (target) {
        // Execute the move (auto-promote to queen)
        chess.move({ from: selectedSq, to: sq, promotion: "q" });
        flashIdRef.current += 1;
        setFlash({ square: sq, type: "correct", id: flashIdRef.current });
        setFen(chess.fen());
        setHighlights([selectedSq, sq]);
        setSelectedSq(null);
        setMoveDots([]);

        const result = checkGameOver(chess);
        if (result) {
          const outcome = chess.isCheckmate()
            ? (chess.turn() === (playerColor === "white" ? "w" : "b") ? "loss" : "win")
            : "draw";
          saveResult(outcome);
          setGameResult(result);
          setStatus("over");
          return;
        }
        doBotMove(chess);
        return;
      }

      // Clicked a different own piece — reselect
      const ownPiece = chess.get(sq as any);
      if (ownPiece && (ownPiece.color === (playerColor === "white" ? "w" : "b"))) {
        selectPiece(chess, sq);
        return;
      }

      // Clicked empty or enemy without a legal move — deselect
      setSelectedSq(null);
      setMoveDots([]);
      setHighlights([]);
      return;
    }

    // Nothing selected — select if own piece
    const piece = chess.get(sq as any);
    if (!piece) return;
    if (piece.color !== (playerColor === "white" ? "w" : "b")) return;
    selectPiece(chess, sq);
  }

  function selectPiece(chess: Chess, sq: string) {
    const moves = chess.moves({ square: sq as any, verbose: true });
    setSelectedSq(sq);
    setHighlights([sq]);
    setMoveDots(moves.map((m: any) => m.to));
  }

  function startGame() {
    const chess = new Chess();
    chessRef.current = chess;
    botBusyRef.current = false;
    resetEngine();
    setFen(chess.fen());
    setHighlights([]);
    setMoveDots([]);
    setSelectedSq(null);
    setFlash(null);
    setGameResult("");
    setEngineNotice("");
    setStatus("playing");
  }

  const flipped = playerColor === "black";

  return (
    <div className="gbc-shell">
      {/* Sidebar */}
      <div className="gbc-left">
        <div className="gbc-kicker">Quick game</div>
        <div className="gbc-title">Play vs computer</div>

        <div className="gbc-meta">
          <span style={{ color: "var(--light)" }}>{username || "Guest"}</span>
          {stats && (
            <span>{stats.wins}W {stats.losses}L {stats.draws}D</span>
          )}
        </div>

        {status === "setup" && (
          <>
            <div className="gbc-section">Your Color</div>
            <div className="gbc-btn-row">
              <button
                className={`gbc-btn${playerColor === "white" ? " active" : ""}`}
                aria-pressed={playerColor === "white"}
                onClick={() => setPlayerColor("white")}
              >
                ♔ White
              </button>
              <button
                className={`gbc-btn${playerColor === "black" ? " active" : ""}`}
                aria-pressed={playerColor === "black"}
                onClick={() => setPlayerColor("black")}
              >
                ♚ Black
              </button>
            </div>

            <div className="gbc-section">Difficulty</div>
            <div className="gbc-btn-row">
              {(["easy", "medium", "hard"] as Difficulty[]).map(d => (
                <button
                  key={d}
                  className={`gbc-btn${difficulty === d ? " active" : ""}`}
                  aria-pressed={difficulty === d}
                  onClick={() => setDifficulty(d)}
                >
                  {STATUS_LABELS[d]}
                </button>
              ))}
            </div>

            <button
              className="gbc-btn primary gbc-start-btn"
              onClick={startGame}
              disabled={!ready}
            >
              {ready ? "Start game" : "Loading engine…"}
            </button>

            {!ready && (
              <div className="gbc-hint">Stockfish engine loading…</div>
            )}
          </>
        )}

        {(status === "playing" || status === "over") && (
          <>
            <div className="gbc-meta">
              <span>You: {playerColor === "white" ? "♔ White" : "♚ Black"}</span>
              <span>{STATUS_LABELS[difficulty]}</span>
            </div>

            {thinking && (
              <div className="gbc-loading" role="status" aria-live="polite">Computer is thinking…</div>
            )}

            {engineNotice && <div className="gbc-notice" role="status">{engineNotice}</div>}

            {status === "over" && (
              <div className="gbc-challenge-box">{gameResult}</div>
            )}

            {status === "playing" && !thinking && (
              <div className="gbc-turn" role="status" aria-live="polite">
                {isPlayerTurn() ? "Your move" : "Bot's turn"}
              </div>
            )}

            <button className="gbc-btn primary" onClick={() => setStatus("setup")}>
              ← New Game
            </button>
          </>
        )}
      </div>

      {/* Board */}
      <div className="gbc-center">
        <ChessBoard
          fen={fen}
          highlights={highlights}
          moveDots={moveDots}
          flash={flash}
          flipped={flipped}
          onSquareClick={handleSquareClick}
        />
      </div>
    </div>
  );
}

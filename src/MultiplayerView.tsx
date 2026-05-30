import React, { useCallback, useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import ChessBoard from "./ChessBoard";
import type { FlashState } from "./ChessBoard";

type WsStatus = "connecting" | "idle" | "queued" | "playing" | "gameover";

interface Props { token: string; username: string; }

export default function MultiplayerView({ token, username }: Props) {
  const [wsStatus,  setWsStatus]  = useState<WsStatus>("connecting");
  const [opponent,  setOpponent]  = useState("");
  const [myColor,   setMyColor]   = useState<"white" | "black">("white");
  const [gameId,    setGameId]    = useState("");
  const [fen,       setFen]       = useState("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  const [highlights, setHighlights] = useState<string[]>([]);
  const [moveDots,  setMoveDots]  = useState<string[]>([]);
  const [selectedSq, setSelectedSq] = useState<string | null>(null);
  const [flash,     setFlash]     = useState<FlashState | null>(null);
  const [resultMsg, setResultMsg] = useState("");
  const [lastMove,  setLastMove]  = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  const wsRef      = useRef<WebSocket | null>(null);
  const chessRef   = useRef(new Chess());
  const flashIdRef = useRef(0);
  const gameIdRef  = useRef("");
  const myColorRef = useRef<"white" | "black">("white");

  const isMyTurn = useCallback(() => {
    const turn = chessRef.current.turn();
    return (turn === "w" && myColorRef.current === "white") ||
           (turn === "b" && myColorRef.current === "black");
  }, []);

  // ── WebSocket connection ───────────────────────────────────────────────────
  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws    = new WebSocket(`${proto}://${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", token }));
    };

    ws.onmessage = (e) => {
      let msg: any;
      try { msg = JSON.parse(e.data); } catch { return; }

      if (msg.type === "auth_ok") {
        setWsStatus("idle");
        return;
      }

      if (msg.type === "auth_error") {
        setStatusMsg("Auth failed — try logging out and back in");
        return;
      }

      if (msg.type === "queued") {
        setWsStatus("queued");
        setStatusMsg("Searching for opponent…");
        return;
      }

      if (msg.type === "dequeued") {
        setWsStatus("idle");
        setStatusMsg("");
        return;
      }

      if (msg.type === "match_found") {
        const color = msg.color as "white" | "black";
        myColorRef.current = color;
        gameIdRef.current  = msg.gameId;
        chessRef.current   = new Chess();
        setMyColor(color);
        setGameId(msg.gameId);
        setOpponent(msg.opponent);
        setFen(msg.fen);
        setHighlights([]);
        setMoveDots([]);
        setSelectedSq(null);
        setLastMove("");
        setResultMsg("");
        setWsStatus("playing");
        setStatusMsg(color === "white" ? "Your turn" : `${msg.opponent}'s turn`);
        return;
      }

      if (msg.type === "move_ok" || msg.type === "opponent_move") {
        chessRef.current = new Chess(msg.fen);
        setFen(msg.fen);
        setHighlights([msg.from, msg.to]);
        setSelectedSq(null);
        setMoveDots([]);
        setLastMove(msg.san ?? "");

        if (msg.type === "opponent_move") {
          flashIdRef.current += 1;
          setFlash({ square: msg.to, type: "correct", id: flashIdRef.current });
        }

        const chess = chessRef.current;
        if (!chess.isGameOver()) {
          const myTurn = (chess.turn() === "w" && myColorRef.current === "white") ||
                         (chess.turn() === "b" && myColorRef.current === "black");
          setStatusMsg(myTurn ? "Your turn" : `${opponent || "Opponent"}'s turn`);
        }
        return;
      }

      if (msg.type === "game_over") {
        setWsStatus("gameover");
        const reasons: Record<string, string> = {
          checkmate: "by checkmate",
          stalemate: "by stalemate",
          draw:      "by draw",
          resign:    "by resignation",
          disconnect: "— opponent disconnected",
        };
        const suffix = reasons[msg.reason] ?? "";
        const label  = msg.result === "win" ? `You won ${suffix}!`
                     : msg.result === "loss" ? `You lost ${suffix}`
                     : `Draw ${suffix}`;
        setResultMsg(label);
        setStatusMsg("");
        return;
      }

      if (msg.type === "error") {
        setStatusMsg(msg.message ?? "Error");
        return;
      }
    };

    ws.onclose = () => {
      setWsStatus(prev => prev === "playing" ? "gameover" : "connecting");
      if (wsRef.current === ws) setStatusMsg("Disconnected");
    };

    return () => { ws.close(); };
  }, [token]);

  // ── Click handler ──────────────────────────────────────────────────────────
  function handleSquareClick(sq: string) {
    if (wsStatus !== "playing") return;
    if (!isMyTurn()) return;

    const chess = chessRef.current;

    if (selectedSq) {
      const legalMoves = chess.moves({ square: selectedSq as any, verbose: true });
      const target     = legalMoves.find((m: any) => m.to === sq);

      if (target) {
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "move", gameId: gameIdRef.current, from: selectedSq, to: sq, promotion: "q" }));
        }
        setSelectedSq(null);
        setMoveDots([]);
        setHighlights([selectedSq, sq]);
        return;
      }

      // Reselect own piece
      const piece = chess.get(sq as any);
      if (piece && piece.color === (myColorRef.current === "white" ? "w" : "b")) {
        selectPiece(chess, sq);
        return;
      }

      setSelectedSq(null);
      setMoveDots([]);
      setHighlights([]);
      return;
    }

    const piece = chess.get(sq as any);
    if (!piece) return;
    if (piece.color !== (myColorRef.current === "white" ? "w" : "b")) return;
    selectPiece(chess, sq);
  }

  function selectPiece(chess: Chess, sq: string) {
    const moves = chess.moves({ square: sq as any, verbose: true });
    setSelectedSq(sq);
    setHighlights([sq]);
    setMoveDots(moves.map((m: any) => m.to));
  }

  function findMatch() {
    wsRef.current?.send(JSON.stringify({ type: "join_queue" }));
  }

  function cancelSearch() {
    wsRef.current?.send(JSON.stringify({ type: "leave_queue" }));
  }

  function resign() {
    wsRef.current?.send(JSON.stringify({ type: "resign", gameId: gameIdRef.current }));
  }

  function playAgain() {
    chessRef.current = new Chess();
    setFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    setHighlights([]);
    setMoveDots([]);
    setSelectedSq(null);
    setLastMove("");
    setResultMsg("");
    setOpponent("");
    setWsStatus("idle");
    setStatusMsg("");
  }

  const flipped = myColor === "black";

  return (
    <div className="gbc-shell">
      {/* Sidebar */}
      <div className="gbc-left">
        <div className="gbc-title">⚡ Online</div>

        <div className="gbc-meta">
          <span style={{ color: "var(--light)" }}>{username}</span>
          {opponent && <span>vs {opponent}</span>}
        </div>

        {wsStatus === "connecting" && (
          <div className="gbc-loading">Connecting…</div>
        )}

        {wsStatus === "idle" && (
          <>
            <div className="gbc-section">Matchmaking</div>
            <div className="gbc-hint">
              Click Find Match to be paired with another online player.
            </div>
            <button className="gbc-btn primary" onClick={findMatch}>
              ⚡ Find Match
            </button>
          </>
        )}

        {wsStatus === "queued" && (
          <>
            <div className="gbc-loading">Searching for opponent…</div>
            <button className="gbc-btn" onClick={cancelSearch}>Cancel</button>
          </>
        )}

        {wsStatus === "playing" && (
          <>
            <div className="gbc-section">
              {myColor === "white" ? "♔ You — White" : "♚ You — Black"}
            </div>
            {lastMove && (
              <div className="gbc-move-badge">{lastMove}</div>
            )}
            {statusMsg && (
              <div className={`gbc-hint${isMyTurn() ? "" : ""}`}
                   style={{ color: isMyTurn() ? "var(--light)" : "var(--dim)" }}>
                {statusMsg}
              </div>
            )}
            <button className="gbc-btn" onClick={resign}>Resign</button>
          </>
        )}

        {wsStatus === "gameover" && (
          <>
            <div className="gbc-challenge-box">{resultMsg || "Game over"}</div>
            <button className="gbc-btn primary" onClick={playAgain}>
              ← Find New Match
            </button>
          </>
        )}
      </div>

      {/* Board */}
      <div className="gbc-center">
        {wsStatus === "idle" || wsStatus === "connecting" ? (
          <div className="gbc-empty-board">
            {wsStatus === "connecting" ? "Connecting…" : "← Find a match to play"}
          </div>
        ) : (
          <ChessBoard
            fen={fen}
            highlights={highlights}
            moveDots={moveDots}
            flash={flash}
            flipped={flipped}
            onSquareClick={handleSquareClick}
          />
        )}
      </div>
    </div>
  );
}

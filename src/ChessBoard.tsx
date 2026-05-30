import React, { useEffect, useRef } from "react";

const UNICODE: Record<string, string> = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

const FILES = "abcdefgh";

function parseFen(fen: string): (string | null)[][] {
  const board: (string | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null));
  const rows = fen.split(" ")[0].split("/");
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of rows[r] ?? "") {
      if (ch >= "1" && ch <= "8") f += parseInt(ch);
      else { board[r][f] = ch; f++; }
    }
  }
  return board;
}

function sqCenter(sq: string): { x: number; y: number } {
  const col = FILES.indexOf(sq[0]);
  const row = 8 - parseInt(sq[1]);
  return { x: (col + 0.5) * 100, y: (row + 0.5) * 100 };
}

export interface Arrow { from: string; to: string; color?: string }

export interface FlashState { square: string; type: "correct" | "wrong"; id: number }

interface Props {
  fen: string;
  highlights?: string[];
  moveDots?: string[];
  arrows?: Arrow[];
  hiddenSquares?: string[];
  flash?: FlashState | null;
  onSquareClick?: (sq: string) => void;
}

export default function ChessBoard({
  fen,
  highlights = [],
  moveDots = [],
  arrows = [],
  hiddenSquares = [],
  flash,
  onSquareClick,
}: Props) {
  const board   = parseFen(fen);
  const hlSet   = new Set(highlights);
  const dotSet  = new Set(moveDots);
  const hideSet = new Set(hiddenSquares);

  const flashKeyRef = useRef<number | null>(null);

  useEffect(() => {
    flashKeyRef.current = flash?.id ?? null;
  }, [flash?.id]);

  const cells: React.ReactNode[] = [];

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq      = `${FILES[f]}${8 - r}`;
      const isLight = (r + f) % 2 === 0;
      const piece   = board[r][f];
      const isHL    = hlSet.has(sq);
      const hasDot  = dotSet.has(sq);
      const isHidden = hideSet.has(sq);
      const isFlash  = flash?.square === sq;

      const cls = [
        "gbc-sq",
        isLight ? "light" : "dark",
        isHL ? "hl" : "",
        isFlash ? `flash-${flash!.type}` : "",
      ].filter(Boolean).join(" ");

      cells.push(
        <div
          key={`${sq}-${isFlash ? flash!.id : ""}`}
          className={cls}
          onClick={() => onSquareClick?.(sq)}
        >
          {piece && !isHidden && (
            <span className={`gbc-piece ${piece === piece.toUpperCase() ? "white" : "black"}`}>
              {UNICODE[piece]}
            </span>
          )}
          {hasDot && <div className="gbc-dot" />}
        </div>
      );
    }
  }

  return (
    <div className="gbc-board-wrap">
      <div className="gbc-board">{cells}</div>

      {arrows.length > 0 && (
        <svg
          className="gbc-arrow-layer"
          viewBox="0 0 800 800"
          preserveAspectRatio="none"
        >
          <defs>
            {(["gold", "green", "red"] as const).map(c => {
              const fill = c === "green" ? "#00cc55" : c === "red" ? "#ff5555" : "#ffaa00";
              return (
                <marker
                  key={c}
                  id={`ah-${c}`}
                  markerWidth="24"
                  markerHeight="16"
                  refX="22"
                  refY="8"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path d="M0,0 L24,8 L0,16 Z" fill={fill} opacity="0.9" />
                </marker>
              );
            })}
          </defs>

          {arrows.map((a, i) => {
            const { x: x1, y: y1 } = sqCenter(a.from);
            const { x: x2, y: y2 } = sqCenter(a.to);
            const c      = a.color ?? "gold";
            const stroke = c === "green" ? "#00cc55" : c === "red" ? "#ff5555" : "#ffaa00";
            const dx     = x2 - x1;
            const dy     = y2 - y1;
            const len    = Math.sqrt(dx * dx + dy * dy) || 1;
            const lx2    = x2 - (dx / len) * 16;
            const ly2    = y2 - (dy / len) * 16;
            return (
              <line
                key={i}
                x1={x1} y1={y1} x2={lx2} y2={ly2}
                stroke={stroke}
                strokeWidth="10"
                strokeOpacity="0.72"
                markerEnd={`url(#ah-${c})`}
              />
            );
          })}
        </svg>
      )}
    </div>
  );
}

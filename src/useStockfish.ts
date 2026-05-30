import { useCallback, useState } from "react";

export const DIFFICULTY = {
  easy:   { skill: 3,  movetime: 50  },
  medium: { skill: 10, movetime: 250 },
  hard:   { skill: 18, movetime: 800 },
} as const;

export type Difficulty = keyof typeof DIFFICULTY;

export function useStockfish() {
  const [ready] = useState(true);

  const getMove = useCallback(async (fen: string, skill: number, movetime: number): Promise<string> => {
    try {
      const res = await fetch("/api/stockfish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen, skill, movetime }),
      });
      if (!res.ok) return "";
      const data = await res.json();
      return data.move ?? "";
    } catch {
      return "";
    }
  }, []);

  // No-op: backend engine is stateless per request
  const reset = useCallback(() => {}, []);

  return { ready, getMove, reset };
}

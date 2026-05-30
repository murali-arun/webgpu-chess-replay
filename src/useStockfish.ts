import { useEffect, useRef, useState } from "react";

export const DIFFICULTY = {
  easy:   { skill: 3,  movetime: 50  },
  medium: { skill: 10, movetime: 250 },
  hard:   { skill: 18, movetime: 800 },
} as const;

export type Difficulty = keyof typeof DIFFICULTY;

export function useStockfish() {
  const [ready, setReady] = useState(false);
  const workerRef   = useRef<Worker | null>(null);
  const resolveRef  = useRef<((move: string) => void) | null>(null);
  const rejectRef   = useRef<((e: Error) => void) | null>(null);
  const initDoneRef = useRef(false);

  useEffect(() => {
    const w = new Worker("/stockfish-lite.js");
    workerRef.current = w;

    w.onmessage = (e: MessageEvent<string>) => {
      const line = typeof e.data === "string" ? e.data : String(e.data);

      if (!initDoneRef.current) {
        if (line.trim() === "readyok") {
          initDoneRef.current = true;
          setReady(true);
        }
        return;
      }

      if (line.startsWith("bestmove") && resolveRef.current) {
        const parts = line.split(" ");
        const move  = parts[1];
        const res   = resolveRef.current;
        resolveRef.current = null;
        rejectRef.current  = null;
        res(move && move !== "(none)" ? move : "");
      }
    };

    w.onerror = (e) => {
      if (rejectRef.current) rejectRef.current(new Error(String(e)));
    };

    w.postMessage("uci");
    w.postMessage("isready");

    return () => { w.terminate(); };
  }, []);

  function getMove(fen: string, skill: number, movetime: number): Promise<string> {
    return new Promise((resolve) => {
      const w = workerRef.current;
      if (!w || !initDoneRef.current) { resolve(""); return; }
      resolveRef.current = resolve;
      rejectRef.current  = null;
      w.postMessage("stop");
      w.postMessage(`setoption name Skill Level value ${skill}`);
      w.postMessage(`position fen ${fen}`);
      w.postMessage(`go movetime ${movetime}`);

      // Safety: if bestmove never arrives, give up after movetime + 2s
      const timer = setTimeout(() => {
        if (resolveRef.current === resolve) {
          resolveRef.current = null;
          w.postMessage("stop");
          resolve("");
        }
      }, movetime + 2000);

      // Clear the timer if bestmove arrives first (patched below via closure)
      const origResolve = resolve;
      resolveRef.current = (move: string) => { clearTimeout(timer); origResolve(move); };
    });
  }

  function reset() {
    workerRef.current?.postMessage("ucinewgame");
  }

  return { ready, getMove, reset };
}

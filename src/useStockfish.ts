import { useCallback, useEffect, useRef, useState } from "react";

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
  const initDoneRef = useRef(false);
  const busyRef     = useRef(false);

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
        busyRef.current    = false;
        res(move && move !== "(none)" ? move : "");
      }
    };

    w.onerror = () => {
      resolveRef.current = null;
      busyRef.current    = false;
    };

    w.postMessage("uci");
    w.postMessage("isready");

    return () => { w.terminate(); };
  }, []);

  // useCallback with [] so the function reference is stable across renders.
  // This prevents the doBotMove useEffect in PlayView from re-firing on every
  // state update (which caused the bot to be invoked multiple times per turn).
  const getMove = useCallback((fen: string, skill: number, movetime: number): Promise<string> => {
    return new Promise((resolve) => {
      const w = workerRef.current;
      if (!w || !initDoneRef.current || busyRef.current) { resolve(""); return; }

      busyRef.current    = true;
      resolveRef.current = (move: string) => { clearTimeout(timer); resolve(move); };

      w.postMessage("stop");
      w.postMessage(`setoption name Skill Level value ${skill}`);
      w.postMessage(`position fen ${fen}`);
      w.postMessage(`go movetime ${movetime}`);

      // Safety: resolve with empty string if bestmove never arrives
      const timer = setTimeout(() => {
        if (resolveRef.current) {
          resolveRef.current = null;
          busyRef.current    = false;
          w.postMessage("stop");
          resolve("");
        }
      }, movetime + 3000);
    });
  }, []);

  const reset = useCallback(() => {
    workerRef.current?.postMessage("ucinewgame");
    busyRef.current    = false;
    resolveRef.current = null;
  }, []);

  return { ready, getMove, reset };
}

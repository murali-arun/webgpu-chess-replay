import React, { useEffect, useMemo, useRef, useState } from "react";
import { BabylonChessView } from "./babylonChess";
import { buildReplayData } from "./parser";
import type { ReplayData } from "./types";
import TutorialView from "./TutorialView";
import AdminView from "./AdminView";

const DEFAULT_INPUT = `1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Be3 Bg7 5. Qd2 c6 6. f3 b5 7. Nge2 Nbd7 8. Bh6 Bxh6 9. Qxh6 Bb7 10. a3 e5 11. O-O-O Qe7 12. Kb1 a6 13. Nc1 O-O-O 14. Nb3 exd4 15. Rxd4 c5 16. Rd1 Nb6 17. g3 Kb8 18. Na5 Ba8 19. Bh3 d5 20. Qf4+ Ka7 21. Rhe1 d4 22. Nd5 Nbxd5 23. exd5 Qd6 24. Rxd4 cxd4 25. Re7+ Kb6 26. Qxd4+ Kxa5 27. b4+ Ka4 28. Qc3 Qxd5 29. Ra7 Bb7 30. Rxb7 Qc4 31. Qxf6 Kxa3 32. Qxa6+ Kxb4 33. c3+ Kxc3 34. Qa1+ Kd2 35. Qb2+ Kd1 36. Bf1 Rd2 37. Rd7 Rxd7 38. Bxc4 bxc4 39. Qxh8 Rd3 40. Qa8 c3 41. Qa4+ Ke1 42. f4 f5 43. Kc1 Rd2 44. Qa7 1-0`;

export default function App() {
  // Admin is only accessible via direct URL (/admin) — not shown in the nav bar
  const isAdminRoute = window.location.pathname === "/admin" || window.location.pathname === "/admin/";
  const [appMode, setAppMode] = useState<"replay" | "tutorial" | "admin">(
    isAdminRoute ? "admin" : "replay"
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0b0f14" }}>
      <div style={modeBarStyle}>
        <button style={appMode === "replay" ? tabActive : tabInactive} onClick={() => setAppMode("replay")}>♟ Replay</button>
        <button style={appMode === "tutorial" ? tabActive : tabInactive} onClick={() => setAppMode("tutorial")}>🎓 Tutorial</button>
        {/* 🛠 Admin tab intentionally hidden — access via /admin directly */}
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {appMode === "tutorial" ? <TutorialView /> : appMode === "admin" ? <AdminView /> : <ReplayView />}
      </div>
    </div>
  );
}

const modeBarStyle: React.CSSProperties = {
  display: "flex", gap: 4, padding: "6px 12px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  background: "#0b0f14", flexShrink: 0
};
const tabActive: React.CSSProperties = {
  padding: "6px 18px", borderRadius: 8, border: "1px solid rgba(255,200,50,0.4)",
  background: "rgba(255,200,50,0.12)", color: "rgba(255,220,100,0.95)",
  fontWeight: 700, fontSize: 13, cursor: "pointer"
};
const tabInactive: React.CSSProperties = {
  padding: "6px 18px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)",
  background: "transparent", color: "rgba(255,255,255,0.5)",
  fontWeight: 600, fontSize: 13, cursor: "pointer"
};

function ReplayView() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef<BabylonChessView | null>(null);

  const [engineLabel, setEngineLabel] = useState<string>("(starting...)");
  const [chessSet, setChessSet] = useState<'set1' | 'set2'>('set2');

  const [text, setText] = useState(DEFAULT_INPUT);
  const [startFen, setStartFen] = useState("");
  const [error, setError] = useState<string>("");

  const [replay, setReplay] = useState<ReplayData | null>(null);
  const [ply, setPly] = useState<number>(0); // 0..N (0 = start position)
  const [currentMove, setCurrentMove] = useState<string>("");

  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const view = new BabylonChessView(canvas);
    viewRef.current = view;

    (async () => {
      await view.init();
      setEngineLabel(view.getEngineKindLabel());
      // load default after initialization is complete
      await new Promise(resolve => setTimeout(resolve, 0)); // ensure scene is fully ready
      tryLoad();
    })();

    return () => {
      view.dispose();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxPly = replay ? replay.plies.length : 0;

  function tryLoad() {
    setError("");
    try {
      const data = buildReplayData(text, startFen);
      setReplay(data);
      setPly(0);
      setCurrentMove("");
      viewRef.current?.setPositionFromFen(data.fens[0]);
      viewRef.current?.clearSquareHighlights();
    } catch (e: any) {
      setReplay(null);
      setPly(0);
      setError(e?.message ?? String(e));
    }
  }

  async function next() {
    if (!replay) return;
    if (busy) return;
    if (ply >= maxPly) return;

    setBusy(true);
    try {
      const nextPly = ply + 1;
      const meta = replay.metas[nextPly - 1];
      
      // Format move notation for display
      const moveNo = Math.floor((nextPly - 1) / 2) + 1;
      const isWhite = (nextPly - 1) % 2 === 0;
      const moveText = isWhite ? `${moveNo}. ${meta.san}` : `${moveNo}... ${meta.san}`;
      setCurrentMove(moveText);

      // animate move first using meta (from/to), then set position to authoritative FEN
      await viewRef.current?.animateMove(meta.from, meta.to);
      viewRef.current?.setPositionFromFen(replay.fens[nextPly]);

      setPly(nextPly);
    } finally {
      setBusy(false);
    }
  }

  async function back() {
    if (!replay) return;
    if (busy) return;
    if (ply <= 0) return;

    setBusy(true);
    try {
      const prevPly = ply - 1;
      viewRef.current?.clearSquareHighlights();
      viewRef.current?.setPositionFromFen(replay.fens[prevPly]);
      setPly(prevPly);
      
      // Update current move display
      if (prevPly === 0) {
        setCurrentMove("");
      } else {
        const meta = replay.metas[prevPly - 1];
        const moveNo = Math.floor((prevPly - 1) / 2) + 1;
        const isWhite = (prevPly - 1) % 2 === 0;
        const moveText = isWhite ? `${moveNo}. ${meta.san}` : `${moveNo}... ${meta.san}`;
        setCurrentMove(moveText);
      }
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    if (!replay || busy) return;
    stopAutoPlay();
    setPly(0);
    setCurrentMove("");
    viewRef.current?.clearSquareHighlights();
    viewRef.current?.setPositionFromFen(replay.fens[0]);
  }

  function toggleAutoPlay() {
    if (playing) {
      stopAutoPlay();
    } else {
      startAutoPlay();
    }
  }

  async function startAutoPlay() {
    if (!replay || ply >= maxPly) return;
    setPlaying(true);
    
    const playNextMove = async () => {
      if (!replay) {
        stopAutoPlay();
        return;
      }
      
      setPly(currentPly => {
        if (currentPly >= replay.plies.length) {
          stopAutoPlay();
          return currentPly;
        }
        
        const nextPly = currentPly + 1;
        const meta = replay.metas[nextPly - 1];
        
        // Format move notation for display
        const moveNo = Math.floor((nextPly - 1) / 2) + 1;
        const isWhite = (nextPly - 1) % 2 === 0;
        const moveText = isWhite ? `${moveNo}. ${meta.san}` : `${moveNo}... ${meta.san}`;
        setCurrentMove(moveText);
        
        // Just animate - don't rebuild with setPositionFromFen
        viewRef.current?.animateMove(meta.from, meta.to);
        
        return nextPly;
      });
    };
    
    // Play first move immediately
    await playNextMove();
    
    // Then continue with interval
    playIntervalRef.current = setInterval(playNextMove, 1500);
  }

  function stopAutoPlay() {
    setPlaying(false);
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAutoPlay();
    };
  }, []);

  // Stop autoplay when reaching the end
  useEffect(() => {
    if (playing && ply >= maxPly) {
      stopAutoPlay();
    }
  }, [ply, maxPly, playing]);

  const timeline = useMemo(() => {
    if (!replay) return [];
    // group into full moves (white+black)
    const items: { idx: number; label: string; locked: boolean }[] = [];
    for (let i = 0; i < replay.plies.length; i++) {
      const moveNo = Math.floor(i / 2) + 1;
      const isWhite = i % 2 === 0;
      const san = replay.plies[i].san;

      const prefix = isWhite ? `${moveNo}. ` : "";
      items.push({
        idx: i + 1, // ply index (1-based)
        label: `${prefix}${san}`,
        locked: (i + 1) > (ply + 1) // future beyond next step is locked
      });
    }
    return items;
  }, [replay, ply]);

  return (
    <div style={styles.shell}>
      <div style={styles.left}>
        <div style={styles.brandRow}>
          <div style={styles.brand}>WebGPU Chess Replay</div>
          <div style={styles.badge}>{engineLabel}</div>
        </div>

        <div style={styles.sectionTitle}>Input</div>
        <textarea
          style={styles.textarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste PGN or CSV here…"
        />

        <div style={{ display: "flex", gap: 10 }}>
          <input
            style={styles.input}
            value={startFen}
            onChange={(e) => setStartFen(e.target.value)}
            placeholder="Optional start FEN (leave blank for standard)"
          />
          <button style={styles.btn} onClick={tryLoad} disabled={busy}>
            Load
          </button>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.sectionTitle}>Controls (strict step mode)</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={styles.btn} onClick={back} disabled={busy || ply <= 0 || playing}>
            ◀ Back
          </button>
          <button style={styles.btnPrimary} onClick={next} disabled={busy || !replay || ply >= maxPly || playing}>
            Next ▶
          </button>
          <button style={styles.btn} onClick={reset} disabled={busy || ply === 0 || playing}>
            Reset
          </button>
          <button 
            style={{...styles.btn, ...(playing ? styles.btnActive : {})}} 
            onClick={toggleAutoPlay} 
            disabled={busy || !replay || ply >= maxPly}
          >
            {playing ? "⏸ Pause" : "▶ Play"}
          </button>
        </div>

        <div style={styles.sectionTitle}>Chess Set</div>
        <div style={{ display: "flex", gap: 10 }}>
          {/* Temporarily hidden - will add better set1 pieces later */}
          <button 
            style={{...styles.btn, ...(chessSet === 'set1' ? styles.btnActive : {}), display: 'none'}} 
            onClick={async () => {
              setChessSet('set1');
              await viewRef.current?.switchChessSet('set1');
            }}
            disabled={busy}
          >
            Original Set
          </button>
          <button 
            style={{...styles.btn, ...(chessSet === 'set2' ? styles.btnActive : {})}} 
            onClick={async () => {
              setChessSet('set2');
              await viewRef.current?.switchChessSet('set2');
            }}
            disabled={busy}
          >
            Lewis Set
          </button>
        </div>

        <div style={styles.metaRow}>
          <div style={styles.meta}>
            Ply: <b>{ply}</b> / {maxPly}
          </div>
          <div style={styles.meta}>
            Skipping: <b>disabled</b>
          </div>
        </div>

        <div style={styles.sectionTitle}>Timeline (future locked)</div>
        <div style={styles.timeline}>
          {timeline.map((t) => {
            const isCurrent = t.idx === ply;
            const isNext = t.idx === ply + 1;

            return (
              <div
                key={t.idx}
                style={{
                  ...styles.timelineItem,
                  opacity: t.locked ? 0.35 : 1,
                  borderColor: isCurrent ? "rgba(255, 200, 50, 0.8)" : "rgba(255,255,255,0.08)",
                  background: isCurrent ? "rgba(255, 200, 50, 0.08)" : "transparent"
                }}
                title={t.locked ? "Locked (step-by-step mode)" : isNext ? "Next move" : "Already played"}
                onClick={() => {
                  // STRICT MODE: do nothing on click (no skipping)
                }}
              >
                <span style={{ color: isNext ? "rgba(255,200,50,0.9)" : "rgba(255,255,255,0.85)" }}>
                  {t.label}
                </span>
                {t.locked && <span style={{ marginLeft: 8, color: "rgba(255,255,255,0.6)" }}>🔒</span>}
              </div>
            );
          })}
        </div>

        <div style={styles.hint}>
          Tip: paste PGN like <code>1. e4 e5 2. Nf3 Nc6</code> or CSV like{" "}
          <code>1,e4,e5</code>
        </div>
      </div>

      <div style={styles.center}>
        <canvas ref={canvasRef} style={styles.canvas} />
        {currentMove && (
          <div style={styles.moveNotation}>
            {currentMove}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    height: "100%",
    display: "grid",
    gridTemplateColumns: "420px 1fr",
    background: "#0b0f14",
    color: "rgba(255,255,255,0.92)",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
  },
  left: {
    borderRight: "1px solid rgba(255,255,255,0.08)",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12
  },
  center: {
    position: "relative"
  },
  canvas: {
    width: "100%",
    height: "100%"
  },
  moveNotation: {
    position: "absolute",
    top: "20px",
    right: "20px",
    fontSize: "48px",
    fontWeight: "bold",
    color: "rgba(255, 255, 255, 0.95)",
    textShadow: "0 0 20px rgba(0, 0, 0, 0.8), 0 2px 8px rgba(0, 0, 0, 0.6)",
    padding: "16px 32px",
    borderRadius: "16px",
    background: "rgba(10, 15, 20, 0.75)",
    backdropFilter: "blur(8px)",
    border: "2px solid rgba(255, 200, 50, 0.3)",
    letterSpacing: "1px",
    fontFamily: "monospace",
    pointerEvents: "none"
  },
  brandRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between"
  },
  brand: { fontWeight: 800, letterSpacing: 0.2, fontSize: 16 },
  badge: {
    fontSize: 12,
    padding: "4px 10px",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 999,
    background: "rgba(255,255,255,0.04)"
  },
  sectionTitle: {
    fontSize: 12,
    opacity: 0.8,
    marginTop: 4,
    letterSpacing: 0.3,
    textTransform: "uppercase"
  },
  textarea: {
    width: "100%",
    minHeight: 140,
    resize: "vertical",
    padding: 10,
    borderRadius: 12,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "rgba(255,255,255,0.92)",
    outline: "none"
  },
  input: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "rgba(255,255,255,0.92)",
    outline: "none"
  },
  btn: {
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "rgba(255,255,255,0.92)",
    cursor: "pointer"
  },
  btnPrimary: {
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(255, 200, 50, 0.16)",
    border: "1px solid rgba(255, 200, 50, 0.30)",
    color: "rgba(255,255,255,0.95)",
    cursor: "pointer"
  },
  btnActive: {
    background: "rgba(100, 150, 255, 0.20)",
    border: "1px solid rgba(100, 150, 255, 0.40)",
  },
  error: {
    padding: 10,
    borderRadius: 12,
    border: "1px solid rgba(255,80,80,0.35)",
    background: "rgba(255,80,80,0.08)",
    color: "rgba(255,200,200,0.95)",
    whiteSpace: "pre-wrap"
  },
  metaRow: { display: "flex", justifyContent: "space-between", opacity: 0.85, fontSize: 12 },
  meta: { padding: "6px 8px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" },
  timeline: {
    maxHeight: "300px",
    overflow: "auto",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.02)",
    padding: 8
  },
  timelineItem: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.08)",
    marginBottom: 6,
    userSelect: "none"
  },
  hint: {
    opacity: 0.75,
    fontSize: 12,
    lineHeight: 1.4
  }
};

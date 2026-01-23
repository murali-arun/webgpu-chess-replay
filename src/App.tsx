import React, { useEffect, useMemo, useRef, useState } from "react";
import { BabylonChessView } from "./babylonChess";
import { buildReplayData } from "./parser";
import type { ReplayData } from "./types";

const DEFAULT_INPUT = `1. e4 e5 2. Nf3 Nc6 3. Bb5 a6`;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef<BabylonChessView | null>(null);

  const [engineLabel, setEngineLabel] = useState<string>("(starting...)");

  const [text, setText] = useState(DEFAULT_INPUT);
  const [startFen, setStartFen] = useState("");
  const [error, setError] = useState<string>("");

  const [replay, setReplay] = useState<ReplayData | null>(null);
  const [ply, setPly] = useState<number>(0); // 0..N (0 = start position)

  const [busy, setBusy] = useState(false);

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
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    if (!replay || busy) return;
    setPly(0);
    viewRef.current?.clearSquareHighlights();
    viewRef.current?.setPositionFromFen(replay.fens[0]);
  }

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
          <button style={styles.btn} onClick={back} disabled={busy || ply <= 0}>
            ◀ Back
          </button>
          <button style={styles.btnPrimary} onClick={next} disabled={busy || !replay || ply >= maxPly}>
            Next ▶
          </button>
          <button style={styles.btn} onClick={reset} disabled={busy || ply === 0}>
            Reset
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
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    height: "100vh",
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
    flex: 1,
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

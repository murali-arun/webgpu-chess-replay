import React, { useEffect, useMemo, useRef, useState } from "react";
import { buildReplayData } from "./parser";
import type { ReplayData } from "./types";
import ChessBoard from "./ChessBoard";
import TutorialView from "./TutorialView";
import PlayView from "./PlayView";
import MultiplayerView from "./MultiplayerView";
import AuthView from "./AuthView";
import AdminView from "./AdminView";
import "./gbc.css";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const DEFAULT_INPUT = `1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Be3 Bg7 5. Qd2 c6 6. f3 b5 7. Nge2 Nbd7 8. Bh6 Bxh6 9. Qxh6 Bb7 10. a3 e5 11. O-O-O Qe7 12. Kb1 a6 13. Nc1 O-O-O 14. Nb3 exd4 15. Rxd4 c5 16. Rd1 Nb6 17. g3 Kb8 18. Na5 Ba8 19. Bh3 d5 20. Qf4+ Ka7 21. Rhe1 d4 22. Nd5 Nbxd5 23. exd5 Qd6 24. Rxd4 cxd4 25. Re7+ Kb6 26. Qxd4+ Kxa5 27. b4+ Ka4 28. Qc3 Qxd5 29. Ra7 Bb7 30. Rxb7 Qc4 31. Qxf6 Kxa3 32. Qxa6+ Kxb4 33. c3+ Kxc3 34. Qa1+ Kd2 35. Qb2+ Kd1 36. Bf1 Rd2 37. Rd7 Rxd7 38. Bxc4 bxc4 39. Qxh8 Rd3 40. Qa8 c3 41. Qa4+ Ke1 42. f4 f5 43. Kc1 Rd2 44. Qa7 1-0`;

const DEFAULT_REPLAY = (() => {
  try { return buildReplayData(DEFAULT_INPUT, ""); } catch { return null; }
})();

const THEMES = [
  { id: "amber", cls: "t-amber", label: "Amber" },
  { id: "gbc",   cls: "t-gbc",   label: "GBC" },
  { id: "dmg",   cls: "t-dmg",   label: "DMG" },
  { id: "synth", cls: "t-synth", label: "Synth" },
] as const;

function ThemeSwitcher() {
  const [active, setActive] = useState<string>("amber");
  function pick(id: string) {
    document.documentElement.setAttribute("data-theme", id);
    setActive(id);
  }
  return (
    <div className="gbc-theme-switcher">
      <span className="gbc-theme-label">Theme</span>
      {THEMES.map(t => (
        <button
          key={t.id}
          className={`gbc-theme-btn ${t.cls}${active === t.id ? " active" : ""}`}
          title={t.label}
          onClick={() => pick(t.id)}
        />
      ))}
    </div>
  );
}

interface AuthUser { id: number; username: string; }

function loadSavedAuth(): { token: string; user: AuthUser } | null {
  try {
    const raw = localStorage.getItem("chess_auth");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export default function App() {
  const isAdmin = window.location.pathname === "/admin" || window.location.pathname === "/admin/";
  const [appMode, setAppMode] = useState<"replay" | "tutorial" | "play" | "online" | "admin">(
    isAdmin ? "admin" : "replay"
  );
  const [auth, setAuth] = useState<{ token: string; user: AuthUser } | null>(loadSavedAuth);

  function handleAuth(token: string, user: AuthUser) {
    const val = { token, user };
    localStorage.setItem("chess_auth", JSON.stringify(val));
    setAuth(val);
    setAppMode("play");
  }

  function logout() {
    localStorage.removeItem("chess_auth");
    setAuth(null);
    if (appMode === "play") setAppMode("replay");
  }

  return (
    <div className="gbc-app">
      <div className="gbc-topbar">
        <button
          className={`gbc-tab${appMode === "replay" ? " active" : ""}`}
          onClick={() => setAppMode("replay")}
        >
          ♟ Replay
        </button>
        <button
          className={`gbc-tab${appMode === "tutorial" ? " active" : ""}`}
          onClick={() => setAppMode("tutorial")}
        >
          ★ Tutorial
        </button>
        <button
          className={`gbc-tab${appMode === "play" ? " active" : ""}`}
          onClick={() => setAppMode("play")}
        >
          ⚔ Play
        </button>
        <button
          className={`gbc-tab${appMode === "online" ? " active" : ""}`}
          onClick={() => setAppMode("online")}
        >
          ⚡ Online
        </button>

        <ThemeSwitcher />

        {auth ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
            <span className="gbc-theme-label" style={{ color: "var(--light)" }}>
              {auth.user.username}
            </span>
            <button className="gbc-btn" style={{ fontSize: 5, padding: "5px 8px" }} onClick={logout}>
              Logout
            </button>
          </div>
        ) : (
          <button
            className={`gbc-tab${appMode === "play" ? " active" : ""}`}
            style={{ marginLeft: 4 }}
            onClick={() => setAppMode("play")}
          >
            Login
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        {appMode === "tutorial" ? <TutorialView /> :
         appMode === "play"     ? (auth
           ? <PlayView token={auth.token} username={auth.user.username} />
           : <AuthView onAuth={handleAuth} />) :
         appMode === "online"   ? (auth
           ? <MultiplayerView token={auth.token} username={auth.user.username} />
           : <AuthView onAuth={handleAuth} />) :
         appMode === "admin"    ? <AdminView />    :
                                  <ReplayView />}
      </div>
    </div>
  );
}

function ReplayView() {
  const [text,      setText]      = useState(DEFAULT_INPUT);
  const [startFen,  setStartFen]  = useState("");
  const [error,     setError]     = useState("");
  const [replay,    setReplay]    = useState<ReplayData | null>(DEFAULT_REPLAY);
  const [ply,       setPly]       = useState(0);
  const [boardFen,  setBoardFen]  = useState(DEFAULT_REPLAY?.fens[0] ?? START_FEN);
  const [highlights, setHighlights] = useState<string[]>([]);
  const [currentMove, setCurrentMove] = useState("");
  const [playing,   setPlaying]   = useState(false);

  const playRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const replayRef  = useRef(replay);
  const plyRef     = useRef(ply);

  useEffect(() => { replayRef.current = replay; }, [replay]);
  useEffect(() => { plyRef.current    = ply;    }, [ply]);

  const maxPly = replay ? replay.plies.length : 0;

  function tryLoad() {
    setError("");
    try {
      const data = buildReplayData(text, startFen);
      setReplay(data);
      setPly(0);
      setCurrentMove("");
      setBoardFen(data.fens[0]);
      setHighlights([]);
      stopPlay();
    } catch (e: any) {
      setReplay(null);
      setPly(0);
      setError(e?.message ?? String(e));
    }
  }

  function applyPly(nextPly: number, r: ReplayData) {
    const meta   = r.metas[nextPly - 1];
    const moveNo = Math.floor((nextPly - 1) / 2) + 1;
    const isW    = (nextPly - 1) % 2 === 0;
    setCurrentMove(isW ? `${moveNo}. ${meta.san}` : `${moveNo}... ${meta.san}`);
    setBoardFen(r.fens[nextPly]);
    setHighlights([meta.from, meta.to]);
    setPly(nextPly);
  }

  function next() {
    const r = replay;
    const p = ply;
    if (!r || p >= maxPly || playing) return;
    applyPly(p + 1, r);
  }

  function back() {
    const r = replay;
    const p = ply;
    if (!r || p <= 0 || playing) return;
    const prevPly = p - 1;
    setBoardFen(r.fens[prevPly]);
    setHighlights([]);
    setPly(prevPly);
    if (prevPly === 0) {
      setCurrentMove("");
    } else {
      const meta   = r.metas[prevPly - 1];
      const moveNo = Math.floor((prevPly - 1) / 2) + 1;
      const isW    = (prevPly - 1) % 2 === 0;
      setCurrentMove(isW ? `${moveNo}. ${meta.san}` : `${moveNo}... ${meta.san}`);
    }
  }

  function reset() {
    const r = replay;
    if (!r || playing) return;
    setPly(0);
    setCurrentMove("");
    setBoardFen(r.fens[0]);
    setHighlights([]);
  }

  function startPlay() {
    const r = replayRef.current;
    if (!r || plyRef.current >= r.plies.length) return;
    setPlaying(true);
    playRef.current = setInterval(() => {
      const r2 = replayRef.current;
      const p  = plyRef.current;
      if (!r2 || p >= r2.plies.length) { stopPlay(); return; }
      applyPly(p + 1, r2);
    }, 1300);
  }

  function stopPlay() {
    setPlaying(false);
    if (playRef.current) { clearInterval(playRef.current); playRef.current = null; }
  }

  useEffect(() => {
    if (playing && ply >= maxPly) stopPlay();
  }, [ply, maxPly, playing]);

  useEffect(() => () => stopPlay(), []);

  const timeline = useMemo(() => {
    if (!replay) return [];
    return replay.plies.map((p, i) => {
      const moveNo = Math.floor(i / 2) + 1;
      const isW    = i % 2 === 0;
      return {
        idx:    i + 1,
        label:  isW ? `${moveNo}. ${p.san}` : `${moveNo}… ${p.san}`,
        locked: (i + 1) > (ply + 1),
      };
    });
  }, [replay, ply]);

  return (
    <div className="gbc-shell">
      <div className="gbc-left">
        <div className="gbc-title">Chess Replay</div>

        <div className="gbc-section">PGN Input</div>
        <textarea
          className="gbc-textarea"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Paste PGN here…"
        />
        <div className="gbc-fen-row">
          <input
            className="gbc-input"
            value={startFen}
            onChange={e => setStartFen(e.target.value)}
            placeholder="Start FEN (optional)"
          />
          <button className="gbc-btn primary" onClick={tryLoad}>Load</button>
        </div>
        {error && <div className="gbc-error">{error}</div>}

        <div className="gbc-section">Controls</div>
        <div className="gbc-btn-row">
          <button className="gbc-btn" onClick={back}  disabled={!replay || ply <= 0 || playing}>◀ Back</button>
          <button className="gbc-btn primary" onClick={next} disabled={!replay || ply >= maxPly || playing}>Next ▶</button>
          <button className="gbc-btn" onClick={reset} disabled={!replay || ply === 0 || playing}>Reset</button>
          <button
            className={`gbc-btn${playing ? " active" : ""}`}
            onClick={playing ? stopPlay : startPlay}
            disabled={!replay || (!playing && ply >= maxPly)}
          >
            {playing ? "⏸ Pause" : "▶ Play"}
          </button>
        </div>

        <div className="gbc-meta">
          <span>Ply: {ply} / {maxPly}</span>
        </div>

        {currentMove && (
          <div className="gbc-move-badge">{currentMove}</div>
        )}

        <div className="gbc-section">Timeline</div>
        <div className="gbc-timeline">
          {timeline.map(t => (
            <div
              key={t.idx}
              className={`gbc-tl-item${t.idx === ply ? " current" : ""}${t.locked ? " locked" : ""}`}
            >
              <span>{t.label}</span>
              {t.locked && <span>🔒</span>}
            </div>
          ))}
        </div>

        <div className="gbc-hint">
          Paste PGN like <code>1. e4 e5 2. Nf3</code> then click Load.
        </div>
      </div>

      <div className="gbc-center">
        <ChessBoard
          fen={boardFen}
          highlights={highlights}
        />
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from "react";

type TrainingLog = {
  totalSeconds: number;
  dailySeconds: Record<string, number>;
  dailyInterruptions: Record<string, number>;
  dailyReflection: Record<string, string>;
};

const TARGET_HOURS = 3000;
const DAILY_GOAL_SECONDS = 60 * 60;
const EMPTY_LOG: TrainingLog = { totalSeconds: 0, dailySeconds: {}, dailyInterruptions: {}, dailyReflection: {} };

const FOCUS_BLOCKS = [
  { minutes: 5, title: "Arrive", task: "Take three calm breaths. Choose one thing you want to understand today." },
  { minutes: 15, title: "Recall", task: "Solve challenges from memory before reading hints. Accuracy matters more than speed." },
  { minutes: 20, title: "Calculate", task: "Use Opening Coach. Name two candidate moves before touching a piece." },
  { minutes: 15, title: "Apply", task: "Play a focused position or game. After every opponent move, ask what changed." },
  { minutes: 5, title: "Reflect", task: "Review one mistake and state the better idea in your own words." },
] as const;

const ROADMAP = [
  { hours: 0, title: "Foundation", outcome: "Rules, safe pieces, checks, captures, threats" },
  { hours: 150, title: "Pattern Builder", outcome: "Core tactics and reliable opening habits" },
  { hours: 500, title: "Club Competitor", outcome: "Calculation, endgames, and annotated game review" },
  { hours: 1200, title: "Advanced Player", outcome: "Deeper plans, repertoire, and tournament consistency" },
  { hours: 2200, title: "Master Preparation", outcome: "Weakness repair and serious rated competition" },
  { hours: 3000, title: "Chessmaster Target", outcome: "Test approximately 2200 playing strength in rated play" },
] as const;

function ownerKey() {
  try {
    const auth = JSON.parse(localStorage.getItem("chess_auth") ?? "null");
    return `chess_mastery_${auth?.user?.username ?? "guest"}`;
  } catch { return "chess_mastery_guest"; }
}

function todayKey() {
  return new Date().toLocaleDateString("en-CA");
}

function loadLog(): TrainingLog {
  try {
    const saved = JSON.parse(localStorage.getItem(ownerKey()) ?? "null");
    if (!saved || typeof saved.totalSeconds !== "number") return EMPTY_LOG;
    return {
      totalSeconds: saved.totalSeconds,
      dailySeconds: saved.dailySeconds ?? {},
      dailyInterruptions: saved.dailyInterruptions ?? {},
      dailyReflection: saved.dailyReflection ?? {},
    };
  } catch { return EMPTY_LOG; }
}

function duration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export default function MasteryTracker() {
  const [log, setLog] = useState<TrainingLog>(loadLog);
  const [running, setRunning] = useState(false);
  const [welcomeBack, setWelcomeBack] = useState(false);
  const lastTick = useRef(Date.now());

  useEffect(() => { localStorage.setItem(ownerKey(), JSON.stringify(log)); }, [log]);

  useEffect(() => {
    if (!running) return;
    lastTick.current = Date.now();
    const timer = window.setInterval(() => {
      const now = Date.now();
      const delta = Math.max(1, Math.floor((now - lastTick.current) / 1000));
      lastTick.current = now;
      const day = todayKey();
      setLog(previous => ({
        ...previous,
        totalSeconds: previous.totalSeconds + delta,
        dailySeconds: { ...previous.dailySeconds, [day]: (previous.dailySeconds[day] ?? 0) + delta },
      }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    document.documentElement.classList.toggle("gbc-focus-active", running);
    return () => document.documentElement.classList.remove("gbc-focus-active");
  }, [running]);

  useEffect(() => {
    function protectFocus() {
      if (!document.hidden || !running) return;
      const day = todayKey();
      setRunning(false);
      setWelcomeBack(true);
      setLog(previous => ({
        ...previous,
        dailyInterruptions: {
          ...previous.dailyInterruptions,
          [day]: (previous.dailyInterruptions[day] ?? 0) + 1,
        },
      }));
    }
    document.addEventListener("visibilitychange", protectFocus);
    return () => document.removeEventListener("visibilitychange", protectFocus);
  }, [running]);

  const todaySeconds = log.dailySeconds[todayKey()] ?? 0;
  const todayInterruptions = log.dailyInterruptions[todayKey()] ?? 0;
  const todayPercent = Math.min(100, Math.round(todaySeconds / DAILY_GOAL_SECONDS * 100));
  const remainingSeconds = Math.max(0, TARGET_HOURS * 3600 - log.totalSeconds);
  const completedHours = log.totalSeconds / 3600;
  const remainingDays = Math.ceil(remainingSeconds / DAILY_GOAL_SECONDS);
  const projectedDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + remainingDays);
    return date;
  }, [remainingDays]);

  let elapsedPlanSeconds = 0;
  const focusPlan = FOCUS_BLOCKS.map(block => {
    const start = elapsedPlanSeconds;
    const end = start + block.minutes * 60;
    elapsedPlanSeconds = end;
    return { ...block, start, end, done: todaySeconds >= end, active: todaySeconds >= start && todaySeconds < end };
  });
  const activeBlock = focusPlan.find(block => block.active) ?? focusPlan.at(-1)!;
  const activeBlockProgress = activeBlock.done ? 100 : Math.min(100, Math.round((todaySeconds - activeBlock.start) / (activeBlock.end - activeBlock.start) * 100));

  const streak = (() => {
    let count = 0;
    const cursor = new Date();
    if ((log.dailySeconds[todayKey()] ?? 0) < 45 * 60) cursor.setDate(cursor.getDate() - 1);
    while (count < 365) {
      const key = cursor.toLocaleDateString("en-CA");
      if ((log.dailySeconds[key] ?? 0) < 45 * 60) break;
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  })();

  const encouragement = todayPercent >= 100
    ? "Hour complete. Stop with energy left—recovery helps tomorrow's learning."
    : todayPercent >= 65
      ? "Strong focus. Finish by explaining one lesson in your own words."
      : todayPercent >= 30
        ? "Momentum is building. Stay with the current position, not the clock."
        : "Starting is the first win. One thoughtful move is enough to begin.";
  const roadmapIndex = ROADMAP.reduce((found, milestone, index) => completedHours >= milestone.hours ? index : found, 0);
  const roadmapNow = ROADMAP[roadmapIndex];
  const roadmapNext = ROADMAP[roadmapIndex + 1] ?? null;
  const roadmapProgress = roadmapNext
    ? Math.round((completedHours - roadmapNow.hours) / (roadmapNext.hours - roadmapNow.hours) * 100)
    : 100;

  const recentDays = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - offset));
    const key = date.toLocaleDateString("en-CA");
    return { key, label: date.toLocaleDateString(undefined, { weekday: "narrow" }), seconds: log.dailySeconds[key] ?? 0 };
  });

  return (
    <section className="gbc-mastery-tracker" aria-label="Chessmaster goal tracker">
      <div className="gbc-mastery-copy">
        <div className="gbc-kicker">Long-term goal · Chessmaster strength</div>
        <h2>{projectedDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
        <p>Dynamic projection based on {TARGET_HOURS.toLocaleString()} focused hours at one hour per day. Missed days move it later; extra practice pulls it closer.</p>
      </div>
      <div className="gbc-daily-session">
        <div><strong>Today · {activeBlock.title}</strong><span>{duration(todaySeconds)} / 1:00:00</span></div>
        <div className="gbc-training-track"><span style={{ width: `${todayPercent}%` }} /></div>
        <p className="gbc-focus-task">{activeBlock.task}</p>
        <button className={`gbc-btn ${running ? "" : "primary"}`} onClick={() => { setWelcomeBack(false); setRunning(value => !value); }}>
          {running ? "Pause training" : todaySeconds ? "Resume training" : "Start today's hour"}
        </button>
        <small>{running ? "Focus timer active · leaving this tab pauses it" : welcomeBack ? "Welcome back. Nothing was lost—resume when ready." : encouragement}</small>
      </div>
      <div className="gbc-focus-blocks" aria-label="Today's structured practice plan">
        {focusPlan.map((block, index) => (
          <div key={block.title} className={`${block.done ? "done" : ""} ${block.active ? "active" : ""}`}>
            <span>{block.done ? "✓" : index + 1}</span>
            <strong>{block.title}</strong>
            <small>{block.minutes}m</small>
            {block.active && <i style={{ width: `${Math.max(4, activeBlockProgress)}%` }} />}
          </div>
        ))}
      </div>
      <div className="gbc-roadmap-now">
        <div><span>Current phase</span><strong>{roadmapNow.title}</strong></div>
        <p>{roadmapNow.outcome}</p>
        <div className="gbc-training-track"><span style={{ width: `${Math.max(1, roadmapProgress)}%` }} /></div>
        <small>{roadmapNext ? `${Math.max(0, Math.ceil(roadmapNext.hours - completedHours))} focused hours to ${roadmapNext.title}` : "Target phase reached—validate strength through official rated competition."}</small>
      </div>
      <label className="gbc-daily-reflection">
        <span>One lesson to carry into tomorrow</span>
        <textarea
          value={log.dailyReflection[todayKey()] ?? ""}
          onChange={event => {
            const day = todayKey();
            const value = event.target.value.slice(0, 240);
            setLog(previous => ({ ...previous, dailyReflection: { ...previous.dailyReflection, [day]: value } }));
          }}
          placeholder="Example: Before every move, check what my opponent is threatening."
          rows={2}
        />
      </label>
      <div className="gbc-week-strip" aria-label="Last seven training days">
        {recentDays.map(day => (
          <div key={day.key} title={`${day.key}: ${duration(day.seconds)}`}>
            <span style={{ height: `${Math.max(5, Math.min(100, day.seconds / DAILY_GOAL_SECONDS * 100))}%` }} />
            <small>{day.label}</small>
          </div>
        ))}
      </div>
      <div className="gbc-mastery-total"><strong>{(log.totalSeconds / 3600).toFixed(1)} hours logged · {streak} focused-day streak</strong><span>{todayInterruptions} interruption{todayInterruptions === 1 ? "" : "s"} today · {Math.ceil(remainingSeconds / 3600).toLocaleString()} estimated hours remaining</span></div>
      <small className="gbc-rank-note">This is a planning estimate, not a promised date or an official rating. Performance assessments will refine it.</small>
    </section>
  );
}

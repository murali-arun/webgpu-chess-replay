// ── Tutorial data ─────────────────────────────────────────────────────────────
// Each lesson has steps. Steps alternate between "demo" (watch & read) and
// "challenge" (user must click the correct move to continue).

export type TutorialArrow = {
  from: string;
  to: string;
  color?: "gold" | "green" | "red";
};

export type TutorialStep = {
  type: "demo" | "challenge";
  fen: string;
  title: string;
  explanation: string;
  arrows?: TutorialArrow[];
  highlightSquares?: string[];
  hiddenSquares?: string[];
  autoMove?: { from: string; to: string };
  landingFen?: string;        // if set, hold this FEN after autoMove instead of resetting to fen
  challengePiece?: string;
  expectedSquare?: string;
  hint?: string;
};

export type TutorialLesson = {
  id: string;
  title: string;
  subtitle: string;
  category: "pieces" | "special" | "tactics" | "endgame" | "opening";
  icon: string;
  steps: TutorialStep[];
};

export type LessonGroup = {
  category: TutorialLesson["category"];
  label: string;
  lessons: TutorialLesson[];
};

// Knight on d4, kings tucked away in corners so they don't interfere
const KNIGHT_D4 = "7k/8/8/8/3N4/8/8/7K w - - 0 1";
const KNIGHT_F5 = "7k/8/8/5N2/8/8/8/7K w - - 0 1";
const HIDE_KINGS = ["h8", "h1"];  // hide the validator kings from view

// ── Lesson 1: The Knight ──────────────────────────────────────────────────────
const knightLesson: TutorialLesson = {
  id: "knight",
  title: "The Knight",
  subtitle: "The sneakiest piece on the board",
  category: "pieces",
  icon: "♞",
  steps: [
    {
      type: "demo",
      fen: KNIGHT_D4,
      title: "Meet the Knight",
      explanation:
        "The Knight is shaped like a horse 🐴 — and it moves like one too. It's the only piece that can JUMP over other pieces. Its move is always an L-shape: two squares in one direction, then one square sideways.",
      highlightSquares: ["d4"],
      hiddenSquares: HIDE_KINGS,
    },
    {
      type: "demo",
      fen: KNIGHT_D4,
      title: "The L-Shape",
      explanation:
        "From d4, the Knight can reach exactly 8 squares — all marked in gold. Count them: up-2-right-1, up-2-left-1, down-2-right-1, down-2-left-1, and the same in sideways pairs. No piece can block it!",
      highlightSquares: ["c6", "e6", "f5", "f3", "e2", "c2", "b3", "b5"],
      hiddenSquares: HIDE_KINGS,
      arrows: [
        { from: "d4", to: "c6", color: "gold" },
        { from: "d4", to: "e6", color: "gold" },
        { from: "d4", to: "f5", color: "gold" },
        { from: "d4", to: "f3", color: "gold" },
        { from: "d4", to: "e2", color: "gold" },
        { from: "d4", to: "c2", color: "gold" },
        { from: "d4", to: "b3", color: "gold" },
        { from: "d4", to: "b5", color: "gold" },
      ],
    },
    {
      type: "demo",
      fen: KNIGHT_D4,
      title: "Knights Jump Over Pieces",
      explanation:
        "Watch the Knight jump from d4 to f5. Notice how it flies over any pieces in its path — nothing can block it. This makes it incredibly powerful in crowded positions!",
      hiddenSquares: HIDE_KINGS,
      arrows: [{ from: "d4", to: "f5", color: "green" }],
      autoMove: { from: "d4", to: "f5" },
    },
    {
      type: "challenge",
      fen: KNIGHT_D4,
      title: "Your Turn! 🎯",
      explanation:
        "The Knight is on d4. Click the square where it should land to make an L-shape move UP and to the LEFT. (Two squares up, one square left.)",
      highlightSquares: ["d4"],
      hiddenSquares: HIDE_KINGS,
      challengePiece: "d4",
      expectedSquare: "c6",
      hint: "Think: from d4, go UP two squares to d6, then LEFT one square to c6.",
    },
    {
      type: "challenge",
      fen: KNIGHT_F5,
      title: "Try Again! ⭐",
      explanation:
        "The Knight is now on f5. Click any ONE valid knight move destination — any of the 8 L-shaped squares will work!",
      highlightSquares: ["f5"],
      hiddenSquares: HIDE_KINGS,
      challengePiece: "f5",
      expectedSquare: "__any_knight_move__",
      hint: "Remember: two squares in any direction, then one square sideways (or vice versa).",
    },
    {
      type: "demo",
      fen: KNIGHT_D4,
      title: "🏁 Lesson Complete!",
      explanation:
        "Amazing! You've learned the Knight's secret L-shape move. Key takeaway: Knights are the ONLY pieces that jump over others, making them deadly in cramped positions. Next up: try using Knights to fork two pieces at once!",
      highlightSquares: ["d4"],
      hiddenSquares: HIDE_KINGS,
    },
  ],
};

// ── All lessons — add new ones here ──────────────────────────────────────────
import { OPENING_LESSONS } from "./lessons/openingPrinciples";
import { ALL_GENERATED } from "./lessons/index";

export const ALL_LESSONS: TutorialLesson[] = [
  ...OPENING_LESSONS,
  ...ALL_GENERATED,
  knightLesson,
];

// Group lessons by category for the UI
const CATEGORY_META: Record<TutorialLesson["category"], { label: string; order: number }> = {
  opening:  { label: "Openings",    order: 0 },
  pieces:   { label: "Pieces",      order: 1 },
  special:  { label: "Special Moves", order: 2 },
  tactics:  { label: "Tactics",     order: 3 },
  endgame:  { label: "Endgames",    order: 4 },
};

export function getLessonGroups(): LessonGroup[] {
  const map = new Map<TutorialLesson["category"], TutorialLesson[]>();
  for (const l of ALL_LESSONS) {
    if (!map.has(l.category)) map.set(l.category, []);
    map.get(l.category)!.push(l);
  }
  return [...map.entries()]
    .sort((a, b) => CATEGORY_META[a[0]].order - CATEGORY_META[b[0]].order)
    .map(([cat, lessons]) => ({ category: cat, label: CATEGORY_META[cat].label, lessons }));
}

/**
 * tutorialBuilder.ts
 * ──────────────────
 * Reusable builder helpers so adding new lessons is fast.
 *
 * QUICK REFERENCE
 * ───────────────
 * demo(fen, title, explanation, opts?)
 *   → a "watch & read" step, optional arrows / highlights
 *
 * moveDemo(fenBefore, fenAfter, from, to, title, explanation, opts?)
 *   → animates a move, then holds the resulting position
 *
 * challenge(fen, piece, expected, title, explanation, hint, opts?)
 *   → user must click the correct destination square
 *     expected = "__any__" accepts any legal move for that piece
 *
 * openingLesson(config)
 *   → builds a full lesson from a sequence of moves:
 *     each move gets a demo step (animate move → stay on new FEN),
 *     with an optional final challenge
 *
 * lesson(meta, steps)
 *   → assembles a TutorialLesson object
 */

import type { TutorialStep, TutorialLesson, TutorialArrow } from "./tutorialData";

// ── Shared opt type ───────────────────────────────────────────────────────────
export type StepOpts = {
  arrows?: TutorialArrow[];
  highlightSquares?: string[];
  hiddenSquares?: string[];
};

// ── Step builders ─────────────────────────────────────────────────────────────

/** Plain informational step — no move, just text + optional visuals */
export function demo(
  fen: string,
  title: string,
  explanation: string,
  opts: StepOpts = {}
): TutorialStep {
  return { type: "demo", fen, title, explanation, ...opts };
}

/**
 * Animate a move from `fenBefore` (from→to), then show `fenAfter` as the
 * standing position.  Use this for every move in an opening sequence.
 */
export function moveDemo(
  fenBefore: string,
  fenAfter: string,
  from: string,
  to: string,
  title: string,
  explanation: string,
  opts: StepOpts = {}
): TutorialStep {
  return {
    type: "demo",
    fen: fenBefore,
    title,
    explanation,
    autoMove: { from, to },
    // After the animation we want to *stay* on fenAfter, not reset to fenBefore.
    // TutorialView reads step.landingFen when present (see below).
    landingFen: fenAfter,
    ...opts,
  } as TutorialStep;
}

/**
 * Challenge step — user selects `piece` square then clicks destination.
 * `expected` = exact square, or "__any__" to accept any legal move.
 */
export function challenge(
  fen: string,
  piece: string,
  expected: string,
  title: string,
  explanation: string,
  hint: string,
  opts: StepOpts = {}
): TutorialStep {
  return {
    type: "challenge",
    fen,
    title,
    explanation,
    challengePiece: piece,
    expectedSquare: expected,
    hint,
    ...opts,
  };
}

// ── Lesson builder ────────────────────────────────────────────────────────────

export type LessonMeta = {
  id: string;
  title: string;
  subtitle: string;
  category: TutorialLesson["category"];
  icon: string;
};

export function lesson(meta: LessonMeta, steps: TutorialStep[]): TutorialLesson {
  return { ...meta, steps };
}

// ── Opening lesson builder ────────────────────────────────────────────────────
/**
 * The most useful builder for openings.
 *
 * Provide an array of moves; each entry produces one animated demo step.
 * Optionally end with a challenge step.
 *
 * Example:
 * ```ts
 * openingLesson({
 *   id: "italian",
 *   title: "Italian Game",
 *   subtitle: "One of the oldest openings",
 *   icon: "🇮🇹",
 *   intro: "The Italian Game starts with 1.e4 e5 2.Nf3 Nc6 3.Bc4 ...",
 *   moves: [
 *     { fenBefore: START, fenAfter: AFTER_E4,  from:"e2", to:"e4",  explanation:"Control the center with the e-pawn." },
 *     { fenBefore: AFTER_E4, fenAfter: AFTER_E5, from:"e7", to:"e5", explanation:"Black mirrors — fighting for the center." },
 *     ...
 *   ],
 *   finalChallenge: { fen: AFTER_NC6, piece:"f1", expected:"c4", hint:"Bishop to c4 — the Italian move!" },
 * })
 * ```
 */
export type OpeningMove = {
  fenBefore: string;
  fenAfter: string;
  from: string;
  to: string;
  title?: string;           // defaults to move notation e.g. "1. e4"
  explanation: string;
  arrows?: TutorialArrow[];
  highlightSquares?: string[];
};

export type OpeningChallenge = {
  fen: string;
  piece: string;
  expected: string;
  title?: string;
  explanation: string;
  hint: string;
};

export type OpeningLessonConfig = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  intro?: string;           // optional intro demo step shown before any moves
  introFen?: string;        // FEN for the intro step (defaults to fenBefore of first move)
  moves: OpeningMove[];
  finalChallenge?: OpeningChallenge;
  outroExplanation?: string; // text for the completion step
};

export function openingLesson(cfg: OpeningLessonConfig): TutorialLesson {
  const steps: TutorialStep[] = [];

  // Optional intro step
  if (cfg.intro) {
    const fen = cfg.introFen ?? cfg.moves[0]?.fenBefore ?? START_FEN;
    steps.push(demo(fen, cfg.title, cfg.intro));
  }

  // One animated step per move
  cfg.moves.forEach((m, i) => {
    const moveNum = Math.floor(i / 2) + 1;
    const side = i % 2 === 0 ? "White" : "Black";
    const defaultTitle = `Move ${moveNum} — ${side}: ${m.from}-${m.to}`;
    steps.push(
      moveDemo(
        m.fenBefore,
        m.fenAfter,
        m.from,
        m.to,
        m.title ?? defaultTitle,
        m.explanation,
        { arrows: m.arrows, highlightSquares: m.highlightSquares }
      )
    );
  });

  // Optional challenge
  if (cfg.finalChallenge) {
    const fc = cfg.finalChallenge;
    steps.push(
      challenge(
        fc.fen,
        fc.piece,
        fc.expected,
        fc.title ?? "Your Turn! 🎯",
        fc.explanation,
        fc.hint
      )
    );
  }

  // Completion step
  const lastFen = cfg.moves.at(-1)?.fenAfter
    ?? cfg.finalChallenge?.fen
    ?? START_FEN;
  steps.push(
    demo(
      lastFen,
      "🏁 Lesson Complete!",
      cfg.outroExplanation ??
        `Great work! You've learned the key ideas of the ${cfg.title}. Keep practising and it'll become second nature.`
    )
  );

  return {
    id: cfg.id,
    title: cfg.title,
    subtitle: cfg.subtitle,
    category: "opening",
    icon: cfg.icon,
    steps,
  };
}

// ── Common FEN constants ──────────────────────────────────────────────────────

/** Standard starting position */
export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/**
 * Quick FEN builder: play a sequence of UCI moves from the start and return
 * every intermediate FEN, so you don't have to paste FENs by hand.
 *
 * Usage:
 *   const fens = fenSequence(["e2e4","e7e5","g1f3","b8c6","f1c4"]);
 *   // fens[0] = start, fens[1] = after e4, fens[2] = after e5, ...
 */
export function fenSequence(uciMoves: string[], startFen = START_FEN): string[] {
  // We can't import Chess here at build time without a bundler cycle, so we
  // export a lazy version — call it at module init time inside lesson files.
  // Import Chess yourself and use fenSequenceWith() instead.
  throw new Error(
    "fenSequence() requires Chess.js — use fenSequenceWith(Chess, moves) instead."
  );
}

/**
 * Pass in the Chess constructor so there is no circular dep.
 *
 * Example (in an openings file):
 *   import { Chess } from "chess.js";
 *   import { fenSequenceWith } from "./tutorialBuilder";
 *   const fens = fenSequenceWith(Chess, ["e2e4","e7e5","g1f3"]);
 */
export function fenSequenceWith(
  ChessCtor: new (fen?: string) => any,
  uciMoves: string[],
  startFen = START_FEN
): string[] {
  const game = new ChessCtor(startFen);
  const result: string[] = [game.fen()];
  for (const uci of uciMoves) {
    const from = uci.slice(0, 2);
    const to   = uci.slice(2, 4);
    const promo = uci[4] as any;
    game.move({ from, to, ...(promo ? { promotion: promo } : {}) });
    result.push(game.fen());
  }
  return result;
}

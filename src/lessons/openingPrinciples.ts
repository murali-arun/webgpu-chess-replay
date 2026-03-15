/**
 * Opening Principles — Lessons 1-6
 * Based on Levy Rozman's "How to Win at Chess"
 *
 * ADD A NEW LESSON:
 *   1. Compute FENs with fenSequenceWith(Chess, ["e2e4","e7e5",...])
 *   2. Use demo() / moveDemo() / challenge() to build steps
 *   3. Wrap in lesson() and add to OPENING_LESSONS at the bottom
 */

import { Chess } from "chess.js";
import { lesson, demo, moveDemo, challenge, fenSequenceWith, START_FEN } from "../tutorialBuilder";
import type { TutorialLesson } from "../tutorialData";

// ── Pre-computed FEN sequences ────────────────────────────────────────────────

// Italian Game: 1.e4 e5 2.Nf3 Nc6 3.Bc4
const it = fenSequenceWith(Chess, ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"]);
// it[0]=start  [1]=after e4  [2]=after e5  [3]=after Nf3  [4]=after Nc6  [5]=after Bc4

// ── Known FEN constants from the curriculum ──────────────────────────────────

/** Good development position — both sides have knights + bishops out */
const GOOD_DEV      = "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";

/** White queen on h5 — too early (Section 1 bad example) */
const BAD_Q_H5      = "rnbqkbnr/pppp1ppp/8/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 2";

/** White queen on d4 — too early (Section 3 mistake) */
const BAD_Q_D4      = "rnbqkbnr/pppp1ppp/8/4p3/3QP3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 2";

/** Best move exercise — pick Nf3 (Section 2) */
const BEST_MOVE_POS = "rnbqkb1r/pppp1ppp/5n2/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 2 3";

/** Tactical trap — queen on h5, knight on f6 can take it (Section 7) */
const TRAP_POS      = "rnbqkb1r/pppp1ppp/5n2/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 2 3";

/** Tempo position — queen on h5, Nf6 attacks it (Section 8) */
const TEMPO_POS     = "rnbqkbnr/pppp1ppp/8/4p2Q/8/8/PPPP1PPP/RNB1KBNR b KQkq - 0 2";

/** Quiz starting position — Black's best reply to 1.e4 (Section 9) */
const QUIZ_POS      = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

// ── Post-move FENs (derived) ──────────────────────────────────────────────────
const NXH5_FEN  = fenSequenceWith(Chess, ["f6h5"], TRAP_POS)[1];      // after Nxh5
const NF3_FEN   = fenSequenceWith(Chess, ["g1f3"], BEST_MOVE_POS)[1]; // after Nf3
const NF6_FEN   = fenSequenceWith(Chess, ["g8f6"], TEMPO_POS)[1];     // after Nf6
const NC6_FEN   = fenSequenceWith(Chess, ["b8c6"], QUIZ_POS)[1];      // after Nc6

// ═══════════════════════════════════════════════════════════════════════════════
// Lesson 1 — The 5 Opening Rules
// ═══════════════════════════════════════════════════════════════════════════════

const lesson_principles: TutorialLesson = lesson(
  {
    id: "opening-principles",
    title: "The 5 Opening Rules",
    subtitle: "The golden rules every player needs",
    category: "opening",
    icon: "📖",
  },
  [
    demo(START_FEN, "Why Openings Matter",
      "Every chess game starts with an opening. Your goal in the first 10 moves is simple — follow 5 golden rules:\n\n1. Control the center\n2. Develop your pieces\n3. Castle early\n4. Don't move the same piece twice\n5. Don't bring the queen out early\n\nMemory rule: \"Knights and bishops out, fight for the center, castle the king.\"",
      { highlightSquares: ["d4", "d5", "e4", "e5"] }),

    moveDemo(START_FEN, it[1], "e2", "e4",
      "Rule 1: Control the Center",
      "1.e4! The e-pawn advances to grab the center. The four key squares are d4, d5, e4, e5. Whoever controls these squares controls the game. Always start by fighting for the center.",
      { highlightSquares: ["d4", "d5", "e4", "e5"] }),

    moveDemo(it[1], it[2], "e7", "e5",
      "Rule 1: Black Fights Back",
      "1...e5! Black mirrors White and fights for the center too. Neither side surrendered the middle. Good play from both sides.",
      { highlightSquares: ["e4", "e5"] }),

    moveDemo(it[2], it[3], "g1", "f3",
      "Rule 2: Develop Your Pieces",
      "2.Nf3! A piece comes out on every move. The knight on f3 now controls d4 and e5. Every move should activate a new piece — don't waste moves pushing extra pawns.",
      { arrows: [{ from: "f3", to: "d4", color: "gold" }, { from: "f3", to: "e5", color: "gold" }] }),

    moveDemo(it[3], it[4], "b8", "c6",
      "Rule 2: Black Develops Too",
      "2...Nc6! Black develops the knight, fighting for the center from c6. Both sides are racing to get all pieces off the back rank.",
      { highlightSquares: ["c6"] }),

    moveDemo(it[4], it[5], "f1", "c4",
      "Rules 3 & 4: Castle Soon, Never Repeat",
      "3.Bc4! A third piece comes out. With knight and bishop developed, White can now castle and get the king to safety. Rule 4: neither player moved the same piece twice — every move was a new piece.",
      { arrows: [{ from: "c4", to: "f7", color: "red" }] }),

    demo(GOOD_DEV, "Rule 5: Never Rush the Queen",
      "This position shows everything done right: knights and bishops developed, ready to castle. Bringing the queen out early (Rule 5) leads to it getting attacked and running away — wasting multiple moves. Follow all 5 rules and you'll outplay most beginners automatically.",
      { highlightSquares: ["f3", "c4", "c6", "c5"] }),
  ]
);

// ═══════════════════════════════════════════════════════════════════════════════
// Lesson 2 — Good vs Bad Development (Visual Pattern Recognition)
// ═══════════════════════════════════════════════════════════════════════════════

const lesson_goodVsBad: TutorialLesson = lesson(
  {
    id: "opening-good-vs-bad",
    title: "Good vs Bad Opening",
    subtitle: "Spot the difference at a glance",
    category: "opening",
    icon: "🔍",
  },
  [
    demo(GOOD_DEV, "A Model Opening Position",
      "After 4 moves: White has knight on f3 and bishop on c4. Black has knight on c6 and bishop on c5. Both sides developed knights AND bishops. Both fight for the center. Neither wasted a move.\n\nQuestions to ask:\n• Which pieces are developed?\n• Who controls the center (e4, d4, e5, d5)?\n• Who is closer to castling?",
      { highlightSquares: ["f3", "c4", "c6", "c5", "e4", "e5"] }),

    demo(BAD_Q_H5, "A Bad Opening: Early Queen",
      "White played 2.Qh5 — the queen came out on move 2! This violates Rule 5. The queen is now exposed and Black can attack it by developing pieces. Every time Black kicks the queen around, Black develops for free while White retreats.\n\nBlack to move — notice how easy it is to attack the queen.",
      { highlightSquares: ["h5"],
        arrows: [{ from: "b8", to: "c6", color: "green" }, { from: "g8", to: "f6", color: "green" }] }),

    challenge(BAD_Q_H5, "b8", "c6",
      "Attack the Queen! 🎯",
      "White's queen on h5 came out too early. Click the knight on b8 and move it to c6. This develops a piece AND puts pressure on the center — White must waste a move retreating the queen.",
      "Nc6 develops the knight while indirectly threatening the queen. Every time White moves the queen again, Black gets another free development move!"),

    demo(BAD_Q_D4, "Another Early Queen Mistake",
      "White played 2.Qd4 — queen out again on move 2. Black can play Nc6 or Nf6, developing pieces while attacking the queen. White is forced to move the queen a second time, losing two tempos. This is the direct cost of breaking Rule 5.",
      { highlightSquares: ["d4"],
        arrows: [{ from: "g8", to: "f6", color: "green" }, { from: "b8", to: "c6", color: "green" }] }),
  ]
);

// ═══════════════════════════════════════════════════════════════════════════════
// Lesson 3 — Find the Best Move (Section 2 exercise)
// ═══════════════════════════════════════════════════════════════════════════════

const lesson_bestMove: TutorialLesson = lesson(
  {
    id: "opening-best-move",
    title: "Find the Best Move",
    subtitle: "Nf3 — the ideal developing move",
    category: "opening",
    icon: "❓",
  },
  [
    demo(BEST_MOVE_POS, "Which Move Follows the Rules?",
      "White to move. Position: pawns on e4/e5, bishop on c4, Black knight on f6.\n\nFour options:\nA) Qh5 — attacks f7 but breaks Rule 5 (queen too early)\nB) Nc3 — develops but ignores the center\nC) d3 — pawn move, not developing\nD) Nf3 — develops a piece, attacks the center, prepares castling\n\nOnly ONE follows all opening principles. Which one?",
      { highlightSquares: ["e4", "e5", "c4", "f6"] }),

    challenge(BEST_MOVE_POS, "g1", "f3",
      "Play the Best Move! 🎯",
      "Nf3 is the answer — it develops a piece, controls d4 and e5, AND clears the back rank so White can castle. Click the knight on g1 and move it to f3.",
      "Knight from g1 to f3 is 2 squares left, 1 square up. From f3 the knight controls e5 and d4. Every move should do more than one thing!"),

    demo(NF3_FEN, "Why Nf3 is Perfect",
      "With Nf3, White achieves everything in one move:\n\n✓ New piece developed\n✓ Controls e5 and d4 (center!)\n✓ Back rank cleared — kingside castling available\n\nThis is the kind of multi-purpose move that strong players look for. Compare to Qh5 (breaks Rule 5), Nc3 (misses the center), or d3 (wastes a move).",
      { highlightSquares: ["f3"],
        arrows: [{ from: "f3", to: "e5", color: "gold" }, { from: "f3", to: "d4", color: "gold" }] }),
  ]
);

// ═══════════════════════════════════════════════════════════════════════════════
// Lesson 4 — The Early Queen Trap (Tactical Puzzle)
// ═══════════════════════════════════════════════════════════════════════════════

const lesson_queenTrap: TutorialLesson = lesson(
  {
    id: "opening-queen-trap",
    title: "The Early Queen Trap",
    subtitle: "Win material by punishing rule-breakers",
    category: "opening",
    icon: "🪤",
  },
  [
    demo(TRAP_POS, "The Queen Walked into a Trap",
      "White played 3.Qh5 — a very aggressive early queen move. Look at Black's knight sitting on f6. The knight moves in an L-shape: from f6 it can jump directly to h5 — WHERE THE QUEEN IS.\n\nWhite just blundered the queen in the opening. This is what happens when you break Rule 5.",
      { highlightSquares: ["h5", "f6"],
        arrows: [{ from: "f6", to: "h5", color: "green" }] }),

    challenge(TRAP_POS, "f6", "h5",
      "Take the Queen! 🎯",
      "Black to move — the white queen on h5 is completely undefended! Click the knight on f6 and capture the queen on h5. This wins a queen for a knight — a massive material gain.",
      "Knight from f6 to h5: that's 2 squares right, 1 square down. Valid L-shape! The queen has nowhere to run."),

    demo(NXH5_FEN, "Queen Gone — Lesson Learned",
      "Black wins the queen for a knight — the biggest one-move material gain possible. This is the direct cost of breaking Rule 5 (don't bring the queen out early).\n\nEarly queen moves don't just waste tempo — they can lose the game on the spot. Never trust an early queen move!",
      {}),
  ]
);

// ═══════════════════════════════════════════════════════════════════════════════
// Lesson 5 — Gaining Tempo (Section 8)
// ═══════════════════════════════════════════════════════════════════════════════

const lesson_tempo: TutorialLesson = lesson(
  {
    id: "opening-tempo",
    title: "Gaining Tempo",
    subtitle: "Attack the queen and develop for free",
    category: "opening",
    icon: "⏱️",
  },
  [
    demo(TEMPO_POS, "What is a Tempo?",
      "A 'tempo' is one move. When you force your opponent to waste a move — like retreating a queen that got attacked — you gain a FREE development turn. That's called gaining tempo.\n\nWhite's queen came to h5 on move 2. This is your opportunity. Attack it while developing!",
      { highlightSquares: ["h5"] }),

    challenge(TEMPO_POS, "g8", "f6",
      "Gain Tempo — Attack the Queen! 🎯",
      "Black to move. White's queen on h5 is exposed. Play Nf6: the knight develops AND attacks the queen in one move. White must waste a third move retreating the queen while Black freely continues developing.\n\nClick the knight on g8 and move it to f6.",
      "Knight from g8 to f6: 2 squares left, 1 square down. From f6 the knight directly attacks the queen on h5!"),

    demo(NF6_FEN, "Tempo Gained!",
      "Black played Nf6 — developing the knight while attacking the queen on h5. White MUST move the queen again (their 3rd move!) while Black continues development freely.\n\nThree principles in action:\n• Attack the misplaced queen\n• Develop your piece\n• Gain a free tempo",
      { highlightSquares: ["f6"],
        arrows: [{ from: "f6", to: "h5", color: "red" }] }),
  ]
);

// ═══════════════════════════════════════════════════════════════════════════════
// Lesson 6 — Opening Checklist & Quiz (Sections 4 + 9)
// ═══════════════════════════════════════════════════════════════════════════════

const lesson_quiz: TutorialLesson = lesson(
  {
    id: "opening-quiz",
    title: "Checklist & Quiz",
    subtitle: "Test what you've learned",
    category: "opening",
    icon: "✅",
  },
  [
    demo(GOOD_DEV, "The Opening Checklist",
      "After every 5–6 moves, quickly ask:\n\n1. Who has more pieces developed?\n2. Who controls the center (d4, d5, e4, e5)?\n3. Are the kings safe (castled)?\n4. Did anyone move the same piece twice?\n\nLook at this position: White has knight on f3 and bishop on c4. Black has knight on c6 and bishop on c5. Both score well on every checklist item.",
      { highlightSquares: ["d4", "e4", "d5", "e5", "f3", "c4", "c6", "c5"] }),

    demo(QUIZ_POS, "Quiz: Best Reply to 1.e4?",
      "White played 1.e4. What is Black's best reply?\n\nA) Qh4 — queen out early (breaks Rule 5!)\nB) Nc6 — develops a knight, fights for the center\nC) a6 — does nothing for development\n\nThink before clicking!",
      { highlightSquares: ["e4"] }),

    challenge(QUIZ_POS, "b8", "c6",
      "Play the Best Reply! 🎯",
      "Answer: 1...Nc6! It develops a piece and puts pressure on the center. Click the knight on b8 and move it to c6.",
      "1...Nc6 develops a knight. Never play a6 (does nothing) and never play Qh4 (breaks Rule 5). Development first!"),

    demo(NC6_FEN, "🏁 Opening Principles Mastered!",
      "You've completed all 6 opening lessons!\n\nRemember the three core ideas:\n\n🔷 Control the center\n🔷 Develop your pieces\n🔷 Castle early\n\nFollow these consistently and you'll already play stronger openings than most beginners. Now go put them into practice!",
      { highlightSquares: ["c6", "e4"] }),
  ]
);

// ═══════════════════════════════════════════════════════════════════════════════
// Export
// ═══════════════════════════════════════════════════════════════════════════════

export const OPENING_LESSONS: TutorialLesson[] = [
  lesson_principles,
  lesson_goodVsBad,
  lesson_bestMove,
  lesson_queenTrap,
  lesson_tempo,
  lesson_quiz,
];

import { Chess } from "chess.js";

export type BookChoice = {
  uci: string;
  opening: string;
  explanation: string;
};

type BookLine = {
  name: string;
  moves: Array<[string, string]>;
};

const LINES: BookLine[] = [
  {
    name: "Italian Game",
    moves: [
      ["e2e4", "Claims the center and opens lines for the queen and bishop."],
      ["e7e5", "Meets White in the center and frees Black's pieces."],
      ["g1f3", "Develops with tempo by attacking the e5 pawn."],
      ["b8c6", "Defends e5 while developing toward the center."],
      ["f1c4", "Places the bishop on an active diagonal toward f7."],
      ["f8c5", "Develops actively and puts pressure on White's center."],
      ["c2c3", "Prepares the central break d4 without blocking a piece."],
      ["g8f6", "Develops, attacks e4, and gets closer to castling."],
      ["d2d4", "Challenges the center now that White is developed."],
    ],
  },
  {
    name: "Ruy Lopez",
    moves: [
      ["e2e4", "Claims the center and unlocks rapid piece development."],
      ["e7e5", "Fights for central space with a classical reply."],
      ["g1f3", "Develops while attacking the e5 pawn."],
      ["b8c6", "Develops and keeps the e5 strongpoint protected."],
      ["f1b5", "Questions the knight that supports Black's center."],
      ["a7a6", "Asks the bishop to decide and gains useful queenside space."],
      ["b5a4", "Keeps the pin and preserves the active bishop."],
      ["g8f6", "Develops with pressure on e4."],
      ["e1g1", "Secures the king before opening the center."],
    ],
  },
  {
    name: "Sicilian Defense",
    moves: [
      ["e2e4", "Takes central space and opens two pieces."],
      ["c7c5", "Fights for d4 asymmetrically and creates winning chances."],
      ["g1f3", "Develops and prepares the d4 break."],
      ["d7d6", "Controls e5 and prepares safe kingside development."],
      ["d2d4", "Opens the center before Black completes development."],
      ["c5d4", "Trades the flank pawn for White's central pawn."],
      ["f3d4", "Recaptures with development and centralizes the knight."],
      ["g8f6", "Develops with immediate pressure on e4."],
      ["b1c3", "Defends e4 and increases central control."],
    ],
  },
  {
    name: "Queen's Gambit",
    moves: [
      ["d2d4", "Controls e5 and opens the c1 bishop."],
      ["d7d5", "Builds an equal central foothold."],
      ["c2c4", "Challenges Black's central pawn and offers a temporary gambit."],
      ["e7e6", "Supports d5 while opening the dark-squared bishop."],
      ["b1c3", "Develops and adds more pressure to d5."],
      ["g8f6", "Develops naturally and reinforces the center."],
      ["c1g5", "Pins the knight and increases pressure on d5."],
      ["f8e7", "Breaks the pin and prepares castling."],
    ],
  },
  {
    name: "London System",
    moves: [
      ["d2d4", "Establishes a stable central pawn."],
      ["d7d5", "Takes equal central space."],
      ["g1f3", "Develops safely and controls e5."],
      ["g8f6", "Develops and contests the key central squares."],
      ["c1f4", "Develops the bishop outside the pawn chain."],
      ["e7e6", "Supports d5 and prepares bishop development."],
      ["e2e3", "Strengthens d4 and opens the light-squared bishop."],
      ["c7c5", "Challenges White's center before it becomes too stable."],
    ],
  },
  {
    name: "King's Indian Defense",
    moves: [
      ["d2d4", "Takes central space and opens the c1 bishop."],
      ["g8f6", "Develops while preventing an immediate e4 without support."],
      ["c2c4", "Builds a broad center and controls d5."],
      ["g7g6", "Prepares a kingside fianchetto and safe castling."],
      ["b1c3", "Supports e4 and develops toward the center."],
      ["f8g7", "Activates the bishop on the long diagonal."],
      ["e2e4", "Builds the ideal pawn center while space is available."],
      ["d7d6", "Restrains e5 and prepares to challenge the center."],
    ],
  },
  {
    name: "English Opening",
    moves: [
      ["c2c4", "Controls d5 from the flank and keeps the center flexible."],
      ["e7e5", "Builds a strong central presence."],
      ["b1c3", "Develops and reinforces control of d5."],
      ["g8f6", "Develops and pressures the center."],
      ["g1f3", "Adds central control without committing another pawn."],
      ["b8c6", "Develops and supports the e5 pawn."],
      ["g2g3", "Prepares a powerful bishop on the long diagonal."],
    ],
  },
];

function fenKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

const BOOK = new Map<string, BookChoice[]>();

for (const line of LINES) {
  const chess = new Chess();
  for (const [uci, explanation] of line.moves) {
    const key = fenKey(chess.fen());
    const choices = BOOK.get(key) ?? [];
    if (!choices.some(choice => choice.uci === uci)) {
      choices.push({ uci, opening: line.name, explanation });
      BOOK.set(key, choices);
    }
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || "q" });
  }
}

export function getBookChoices(fen: string): BookChoice[] {
  return BOOK.get(fenKey(fen)) ?? [];
}

export function explainMove(fen: string, uci: string, san: string, score: number): string {
  const book = getBookChoices(fen).find(choice => choice.uci === uci);
  if (book) return `${book.explanation} This is established ${book.opening} theory.`;

  const chess = new Chess(fen);
  const piece = chess.get(uci.slice(0, 2) as any);
  const destination = uci.slice(2, 4);
  const moveNumber = chess.moveNumber();

  if (san === "O-O" || san === "O-O-O") return "Castling improves king safety and connects the rooks—a valuable opening goal.";
  if (san.includes("+")) return "The check gains initiative, but forcing moves are valuable only when the position stays sound.";
  if (san.includes("x")) return score >= 7
    ? "This capture improves the position without conceding too much activity."
    : "The capture is legal, but it gives up more positional value than it gains.";
  if (piece?.type === "q" && moveNumber <= 5) return "Early queen moves often lose time because a developing piece can attack the queen.";
  if ((piece?.type === "n" || piece?.type === "b") && /^[bcfg][1-8]$/.test(uci.slice(0, 2))) {
    return "Developing a minor piece toward useful central squares follows a sound opening principle.";
  }
  if (["d4", "e4", "d5", "e5"].includes(destination)) return "This move contests the center, where pieces gain the most mobility.";
  return score >= 7
    ? "The move keeps the position healthy. Look for center control, development, and king safety next."
    : "The move spends a tempo without solving the position's most urgent need. Improve development, center control, or king safety.";
}

export function openingNameFor(fen: string): string {
  const choices = getBookChoices(fen);
  const openings = new Set(choices.map(choice => choice.opening));
  if (openings.size > 1) return "Opening crossroads";
  return choices[0]?.opening ?? "Open position";
}

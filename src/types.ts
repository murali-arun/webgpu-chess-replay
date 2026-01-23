export type Ply = {
  index: number;     // 1-based ply index
  san: string;       // SAN like "e4", "Nf3"
};

export type MoveMeta = {
  from: string;      // "e2"
  to: string;        // "e4"
  san: string;
  uci: string;       // "e2e4" + promotion letter if any
  color: "w" | "b";
  piece: string;     // "p","n","b","r","q","k"
  captured?: string;
  promotion?: string;
  flags: string;     // chess.js flags
};

export type ReplayData = {
  plies: Ply[];
  fens: string[];        // length = plies.length + 1, fens[0] is start
  metas: MoveMeta[];     // length = plies.length, metas[i] is move i+1
  startFen: string;      // initial position
};

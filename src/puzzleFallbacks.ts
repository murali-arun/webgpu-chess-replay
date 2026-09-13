export type TrainingPuzzle = {
  id: string;
  rating: number;
  fen: string;
  solution: string[];
  themes: string[];
};

// CC0 Lichess puzzles, bundled so a focus session never depends on the network.
export const PUZZLE_FALLBACKS: TrainingPuzzle[] = [
  { id:"w8s0G", rating:1487, fen:"5rk1/6b1/6B1/1p1pN3/p2P1P1R/r7/2K5/8 w - - 0 53", solution:["g6h7","g8h8","e5g6"], themes:["endgame","mateIn2"] },
  { id:"WyWjY", rating:1409, fen:"5r2/1b1q2k1/p2pR1p1/1p1n4/3P4/1BP4P/PP2QPP1/6K1 w - - 3 24", solution:["b3d5","b7d5","e6e7","f8f7","e7d7"], themes:["fork","middlegame"] },
  { id:"aQTUm", rating:1530, fen:"r5k1/4b1p1/p4p2/1p1p1PP1/2ppPqP1/P2P4/BPP3KR/7R w - - 0 28", solution:["h2h8","g8f7","g5g6"], themes:["kingsideAttack","mateIn2"] },
  { id:"LD4pV", rating:1334, fen:"6k1/pp6/7p/1Q1pR2r/3P2q1/5pP1/PP3P2/6K1 b - - 5 36", solution:["h5h1","g1h1","g4h3","h1g1","h3g2"], themes:["attraction","mateIn3","sacrifice"] },
  { id:"DszYf", rating:1307, fen:"1q3r2/4bk2/1Q4R1/1N1Pp2p/1p2Pp2/5P2/6PP/6K1 b - - 2 34", solution:["b8b6","g6b6","e7c5","g1f1","c5b6"], themes:["attraction","fork","endgame"] },
  { id:"ujKA1", rating:1548, fen:"8/p5k1/2p1b2p/1p1p1Br1/6P1/1PP2n2/P5K1/4R1R1 b - - 5 40", solution:["f3e1","g1e1","e6f5"], themes:["pin","endgame"] },
  { id:"P43YH", rating:1523, fen:"b3r1k1/Q4p2/8/7q/8/1P1PpRP1/P3P1K1/7R b - - 2 26", solution:["a8f3","e2f3","h5h1","g2h1","e3e2","a7a5","e2e1q","a5e1","e8e1"], themes:["advancedPawn","promotion","sacrifice"] },
  { id:"sfdM5", rating:1368, fen:"1kn3rr/ppq3b1/2p5/P1Nppb2/1Q6/8/1PP1BPPP/1K1R3R w - - 2 24", solution:["c5a6","b8a8","a6c7"], themes:["queensideAttack","pin","middlegame"] },
  { id:"e1PLl", rating:1505, fen:"rnbq1b1r/pppk2p1/4p2p/6Bn/8/3B4/PPP2PPP/RN1R2K1 w - - 0 11", solution:["d3b5"], themes:["doubleCheck","mateIn1","opening"] },
  { id:"g6TCy", rating:1363, fen:"1R2rk2/Q4ppp/4p3/p2p4/5P2/4P2q/4K3/8 w - - 0 39", solution:["a7c5","f8g8","b8e8"], themes:["deflection","backRankMate","mateIn2"] },
];

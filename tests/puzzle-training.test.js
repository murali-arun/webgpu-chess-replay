const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Chess } = require("chess.js");
require("tsx/cjs");
const { PUZZLE_FALLBACKS } = require("../src/puzzleFallbacks.ts");

const fallbackSource = fs.readFileSync(path.join(__dirname, "../src/puzzleFallbacks.ts"), "utf8");
const puzzleUi = fs.readFileSync(path.join(__dirname, "../src/DailyPuzzle.tsx"), "utf8");
const server = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");

test("training has at least ten offline puzzle backups", () => {
  const positions = [...fallbackSource.matchAll(/fen:"([^"]+)"/g)].map(match => match[1]);
  assert.ok(positions.length >= 10);
  for (const fen of positions) assert.doesNotThrow(() => new Chess(fen));
});

test("every bundled puzzle has a completely legal solution", () => {
  for (const puzzle of PUZZLE_FALLBACKS) {
    const game = new Chess(puzzle.fen);
    for (const uci of puzzle.solution) {
      const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || "q" });
      assert.ok(move, `${puzzle.id} contains illegal move ${uci}`);
    }
  }
});

test("puzzles require an attempt before revealing a hint", () => {
  assert.match(puzzleUi, /disabled=\{mistakes === 0 \|\| busy\}/);
  assert.match(puzzleUi, /Try once before hint/);
  assert.match(puzzleUi, /Switch puzzle/);
});

test("live puzzle proxy caches, reconstructs, and validates positions", () => {
  assert.match(server, /\/api\/training\/puzzles/);
  assert.match(server, /TRAINING_PUZZLE_TTL_MS/);
  assert.match(server, /initialPly \+ 1/);
  assert.match(server, /for \(const uci of moves\)/);
});

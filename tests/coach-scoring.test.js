const test = require("node:test");
const assert = require("node:assert/strict");
const { scoreFromCentipawnLoss, labelForScore } = require("../coach-scoring");

test("coach awards a 10 for an engine-equivalent move", () => {
  assert.equal(scoreFromCentipawnLoss(0), 10);
  assert.equal(scoreFromCentipawnLoss(12), 10);
  assert.equal(labelForScore(10), "Best move");
});

test("coach score falls as positional value is lost", () => {
  assert.equal(scoreFromCentipawnLoss(65), 8);
  assert.equal(scoreFromCentipawnLoss(175), 6);
  assert.equal(scoreFromCentipawnLoss(540), 3);
  assert.equal(scoreFromCentipawnLoss(900), 1);
  assert.equal(labelForScore(3), "Blunder");
});

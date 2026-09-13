const test = require("node:test");
const assert = require("node:assert/strict");
const state = require("../state");

test("matchmaking keeps FIFO order and removes a pair", () => {
  const first = { userId: 91001, username: "first" };
  const second = { userId: 91002, username: "second" };
  state.dequeue(first.userId);
  state.dequeue(second.userId);

  state.enqueue(first);
  state.enqueue(second);

  assert.equal(state.isQueued(first.userId), true);
  assert.deepEqual(state.shiftPair(), [first, second]);
  assert.equal(state.isQueued(first.userId), false);
});

test("game state can be stored and removed", () => {
  const id = "test-game-91003";
  const game = { id, status: "playing" };
  state.setGame(id, game);
  assert.equal(state.getGame(id), game);
  state.deleteGame(id);
  assert.equal(state.getGame(id), undefined);
});

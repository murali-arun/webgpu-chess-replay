// State layer — all matchmaking state lives here.
// Current implementation: in-memory (single instance).
// To scale horizontally: replace this module with a Redis-backed version.
// The interface stays the same; server.js never changes.

const queue = []; // [{ ws, userId, username, gameId }]
const games = new Map(); // gameId → { id, chess, white, black, status }

module.exports = {
  // ── Queue ──────────────────────────────────────────────────────────────────

  enqueue(player) {
    queue.push(player);
  },

  dequeue(userId) {
    const idx = queue.findIndex(q => q.userId === userId);
    if (idx !== -1) queue.splice(idx, 1);
  },

  isQueued(userId) {
    return queue.some(q => q.userId === userId);
  },

  // Returns two players removed from the front, or null if fewer than 2.
  shiftPair() {
    if (queue.length < 2) return null;
    return queue.splice(0, 2);
  },

  queueLength() {
    return queue.length;
  },

  // ── Games ──────────────────────────────────────────────────────────────────

  setGame(id, game) {
    games.set(id, game);
  },

  getGame(id) {
    return games.get(id);
  },

  deleteGame(id) {
    games.delete(id);
  },
};

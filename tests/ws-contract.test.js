const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const mobile = fs.readFileSync(path.join(root, "chess-mobile/app/(tabs)/online.tsx"), "utf8");

test("native client recognizes the server matchmaking protocol", () => {
  for (const event of ["queued", "match_found", "move_ok", "opponent_move", "game_over"]) {
    assert.match(server, new RegExp(`[\"']${event}[\"']`), `server must emit ${event}`);
    assert.match(mobile, new RegExp(`[\"']${event}[\"']`), `mobile must handle ${event}`);
  }
});

test("native queue cancellation uses the server command", () => {
  assert.match(server, /msg\.type === ["']leave_queue["']/);
  assert.match(mobile, /type: ["']leave_queue["']/);
});

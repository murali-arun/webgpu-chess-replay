'use strict';
// stdin → stockfish engine → stdout bridge.
// Spawned per-request by the /api/stockfish endpoint.
// All UCI output (including go/bestmove) flows naturally to stdout via this process.

const initStockfish = require('stockfish');

initStockfish('lite-single').then(engine => {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf('\n')) !== -1) {
      const cmd = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (cmd) engine.sendCommand(cmd);
    }
  });
}).catch(e => {
  process.stderr.write('stockfish-cli: ' + e.message + '\n');
  process.exit(1);
});

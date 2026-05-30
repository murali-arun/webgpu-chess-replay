# Chess Replay

Retro terminal-style chess app — PGN replay, Stockfish bot, accounts, and real-time multiplayer.

Live: **https://chess.anmious.cloud**

## Features

- **Replay** — paste any PGN, step through moves with timeline
- **Tutorial** — interactive lessons
- **Play vs Bot** — Stockfish 18 lite (Easy / Medium / Hard), runs in-browser via WASM
- **Online** — real-time 1v1 matchmaking over WebSockets
- **Accounts** — register/login, JWT auth, win/loss/draw stats tracked per user
- **4 themes** — Amber, GBC, DMG, Synth

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React + TypeScript + Vite |
| Chess logic | chess.js |
| Bot | Stockfish 18 lite (Web Worker + WASM) |
| Backend | Node.js + Express |
| Multiplayer | WebSocket (`ws` package), server-side move validation |
| Database | PostgreSQL |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| Deploy | Docker + Nginx + Cloudflare + Hostinger VPS |

## Development

```bash
npm install
npm run dev        # frontend at http://localhost:5173
node server.js     # backend at http://localhost:3010
```

Backend needs a `.env`:
```
DB_URL=postgres://...
JWT_SECRET=any-secret-string
LITELLM_KEY=...
LITELLM_URL=...
LITELLM_MODEL=gpt-4o
```

## Architecture

```
Browser
  └── Vite/React SPA
        ├── /api/*   → Express (auth, game results, lessons)
        └── /ws      → WebSocket server (matchmaking, live games)

chess_static (nginx)  ← serves dist/ + proxies /api/ and /ws
chess_backend (node)  ← Express + WebSocket on :3010
PostgreSQL            ← users, game results, lessons
```

### Multiplayer state

Queue and active games live in `state.js`. Current implementation is in-memory (single instance). To scale horizontally, replace `state.js` with a Redis-backed version — `server.js` never changes.

## Deployment

CI/CD via GitHub Actions on push to `main`:
1. Build frontend (`npm run build`)
2. SCP `dist/` to VPS at `/public_html/chess/`
3. `docker cp nginx.conf chess_static` + nginx reload
4. `docker compose up -d --build chess-backend`

### Required GitHub Secrets

| Secret | Description |
|---|---|
| `HOSTINGER_FTP_HOST` | VPS IP |
| `HOSTINGER_FTP_USER` | SSH username |
| `SSH` | SSH private key |
| `LITELLM_KEY` | LiteLLM API key |
| `LITELLM_URL` | LiteLLM base URL |
| `DB_URL` | PostgreSQL connection string |
| `CHESS_JWT_SECRET` | JWT signing secret |

## Building

```bash
npm run build
# output in dist/
```

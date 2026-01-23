# WebGPU Chess Replay

A 3D chess game replay viewer built with Babylon.js, React, and TypeScript. Features WebGPU rendering with automatic WebGL fallback.

## Features

- 🎮 Interactive 3D chess board with smooth animations
- ⚡ WebGPU rendering (falls back to WebGL if unavailable)
- ♟️ Parse and replay chess games from PGN notation
- 🎨 Glowing square highlights for move visualization
- 📱 Responsive camera controls
- ⏯️ Step forward/backward through game moves

## Tech Stack

- **Babylon.js** - 3D rendering engine
- **React** - UI framework
- **TypeScript** - Type-safe development
- **Vite** - Build tool
- **chess.js** - Chess logic and move validation

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

Open your browser to the local development server (typically `http://localhost:5173`).

## Usage

1. Enter chess moves in PGN notation in the text area
2. Optionally specify a custom starting FEN position
3. Click "Load" to parse the game
4. Use "Next" and "Back" buttons to step through moves
5. Use mouse to rotate and zoom the 3D board

## Project Structure

```
src/
├── App.tsx           # Main React component
├── babylonChess.ts   # Babylon.js 3D chess view
├── parser.ts         # PGN parsing logic
├── types.ts          # TypeScript type definitions
└── main.tsx          # Application entry point
```

## Building for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

## License

MIT

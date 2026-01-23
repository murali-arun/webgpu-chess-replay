# 3D Model Assets

This directory contains the 3D chess piece models (.glb files) used by the application.

## Files Required

### Set 1: Original Chess Set
- `chess_set.glb` (146MB)

### Set 2: Lewis Chess Pieces
- `Pawn_white.glb` (692KB)
- `Pawn_black.glb` (942KB)
- `Knight_white.glb` (859KB)
- `Knight_black.glb` (986KB)
- `Bishop_white.glb` (868KB)
- `Bishop_black.glb` (1.1MB)
- `Castle_white.glb` (804KB)
- `Castle_black.glb` (1.1MB)
- `Queen_white.glb` (861KB)
- `Queen_black.glb` (995KB)
- `King_white.glb` (949KB)
- `King_black.glb` (1.1MB)

### Optional
- `replica_lewis_chess_pieces_on_chessboard.glb` (38MB) - Not used, single board file
- `Chess Board.glb` (5.2MB) - Not used

## Deployment

These files are **NOT** included in git due to their size (199MB total).

### Option 1: CDN Hosting (Recommended)
Upload models to a CDN like:
- AWS S3 + CloudFront
- Cloudflare R2
- Vercel Blob Storage
- Azure Blob Storage

Update `/models/` paths in code to point to CDN URL.

### Option 2: Git LFS
```bash
git lfs install
git lfs track "public/models/*.glb"
git add .gitattributes
git add public/models/*.glb
git commit -m "Add 3D models via LFS"
```

### Option 3: Manual Upload
For platforms like Netlify/Vercel:
1. Build: `npm run build`
2. Upload `dist/` folder
3. Manually upload `public/models/` to the deployed server

### Option 4: Environment-Specific Storage
- Dev: Local files
- Prod: Download from external source during build or runtime

## Production Setup

Add these environment variables:
```
VITE_MODELS_CDN_URL=https://your-cdn.com/chess-models/
```

Update code to use:
```typescript
const modelsPath = import.meta.env.VITE_MODELS_CDN_URL || "/models/";
```

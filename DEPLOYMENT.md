# Deployment Guide

## Quick Deploy (Without Models in Git)

Your 3D models are now excluded from git via `.gitignore`. Here's how to deploy:

### 1. Push Code to Git

```bash
git add .
git commit -m "Add chess replay app"
git push origin main
```

This will push all code **except** the 199MB of .glb files.

### 2. Deploy to Production

Choose one of these approaches:

#### Option A: Vercel/Netlify with Manual Upload (Easiest)

**Step 1:** Deploy the app normally
```bash
# Vercel
vercel

# Or Netlify
netlify deploy --prod
```

**Step 2:** After deployment, manually upload models
- Go to your deployment dashboard
- Upload `public/models/*.glb` files to the deployed site's `/models/` directory
- Or use their CLI to add the files

#### Option B: Use CDN (Best for Production)

**Step 1:** Upload models to CDN
```bash
# Example with AWS S3
aws s3 sync public/models/ s3://your-bucket/chess-models/ --exclude "*.Identifier"

# Get CloudFront URL
# e.g., https://d1234567890.cloudfront.net/chess-models/
```

**Step 2:** Update code to use CDN
Create `.env.production`:
```env
VITE_MODELS_BASE_URL=https://your-cdn.com/chess-models/
```

Update `babylonChess.ts`:
```typescript
const MODELS_PATH = import.meta.env.VITE_MODELS_BASE_URL || "/models/";

// Then use MODELS_PATH instead of "/models/" everywhere
SceneLoader.ImportMeshAsync(null, MODELS_PATH, fileName, this.scene)
```

**Step 3:** Deploy
```bash
npm run build
vercel --prod
```

#### Option C: Git LFS (If using GitHub/GitLab)

**Step 1:** Install Git LFS
```bash
git lfs install
```

**Step 2:** Track .glb files
```bash
# Remove .glb from .gitignore first
git lfs track "public/models/*.glb"
git add .gitattributes
```

**Step 3:** Commit and push
```bash
git add public/models/*.glb
git commit -m "Add 3D models via Git LFS"
git push origin main
```

Note: Git LFS has storage limits on free plans.

#### Option D: Build-Time Download

Keep models in a separate repo or cloud storage, download during build.

Create `scripts/download-models.sh`:
```bash
#!/bin/bash
mkdir -p public/models
cd public/models

# Download from your storage
wget https://your-storage.com/chess_set.glb
wget https://your-storage.com/Pawn_white.glb
# ... etc
```

Update `package.json`:
```json
{
  "scripts": {
    "prebuild": "sh scripts/download-models.sh",
    "build": "tsc && vite build"
  }
}
```

## Recommended Approach for Tomorrow

**For quick deployment tomorrow:**

1. Use **Option A** (Manual Upload):
   - Deploy code to Vercel/Netlify
   - Manually upload the `public/models/` folder after deployment
   - Takes 5-10 minutes

2. For long-term, migrate to **Option B** (CDN):
   - Better performance (global distribution)
   - No git bloat
   - Professional approach

## Current File Sizes

```
Total: 199MB
├── chess_set.glb (146MB) - Could be optimized
├── replica_lewis_*.glb (38MB) - Not used, can delete
├── Lewis pieces (12 files, ~11MB total)
└── Chess Board.glb (5.2MB) - Not used, can delete
```

## Optimization Tips

1. **Remove unused files:**
   ```bash
   rm public/models/replica_lewis_chess_pieces_on_chessboard.glb
   rm public/models/"Chess Board.glb"
   ```
   Saves 43MB!

2. **Compress models:** Use glTF-Pipeline or Blender to reduce file sizes
   ```bash
   npm install -g gltf-pipeline
   gltf-pipeline -i chess_set.glb -o chess_set_compressed.glb -d
   ```

3. **Use .gltf + .bin** instead of .glb for better compression

## Environment Variables

Create `.env.production`:
```env
# CDN URL for 3D models (if using Option B)
VITE_MODELS_BASE_URL=https://your-cdn.com/chess-models/

# Or keep empty to use local /models/
VITE_MODELS_BASE_URL=
```

## Troubleshooting

**Models not loading in production:**
- Check browser console for 404 errors
- Verify `/models/` path is accessible
- Check CORS headers if using CDN
- Ensure files uploaded to correct directory

**Slow loading:**
- Use CDN with global edge locations
- Enable gzip compression on server
- Consider lazy loading sets (only load active set)

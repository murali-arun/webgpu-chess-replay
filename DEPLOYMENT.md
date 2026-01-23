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

1. **Option A** (Deploy as subdirectory on existing site):
   - Build: `npm run build` (creates `dist/` folder)
   - Upload `dist/` contents to `thearunmurali.com/chess/`
   - Upload models separately to `/chess/models/`
   - Access at: `https://thearunmurali.com/chess`
   - Takes 5-10 minutes

2. **Option B** (Separate subdomain):
   - Deploy to `chess.thearunmurali.com`
   - Same infrastructure as your main site
   - Cleaner URLs

3. For long-term, migrate to **CDN for models**:
   - Better performance (global distribution)
   - No git bloat
   - Professional approach

## Deploy to Your Existing Website

If you're already hosting `thearunmurali.com`, you can add this chess app easily:

### As a Subdirectory (e.g., /chess)

**Step 1:** Build the app
```bash
npm run build
```

**Step 2:** Configure base path
Update `vite.config.ts`:
```typescript
export default defineConfig({
  base: '/chess/', // Important for subdirectory deployment
  plugins: [react()],
})
```

Rebuild:
```bash
npm run build
```

**Step 3:** Upload to your server
```bash
# If using same server as thearunmurali.com
scp -r dist/* user@yourserver:/var/www/thearunmurali.com/chess/

# Or if using Netlify/Vercel
# Just point to the dist folder
```

**Step 4:** Upload models separately
```bash
# Upload to same server
scp -r public/models/*.glb user@yourserver:/var/www/thearunmurali.com/chess/models/

# Or upload to your existing CDN/storage if you have one
```

**Step 5:** Access at `https://thearunmurali.com/chess`

### As a Subdomain (e.g., chess.thearunmurali.com)

**Step 1:** Build normally (no base path needed)
```bash
npm run build
```

**Step 2:** Create subdomain in your hosting provider
- Add DNS A/CNAME record: `chess.thearunmurali.com`
- Point to same server or separate deployment

**Step 3:** Deploy dist folder to subdomain root
```bash
scp -r dist/* user@yourserver:/var/www/chess.thearunmurali.com/
```

**Step 4:** Upload models
```bash
scp -r public/models/*.glb user@yourserver:/var/www/chess.thearunmurali.com/models/
```

### Reusing Your Existing Infrastructure

Since you already have a site deployed, you likely have:

**If using Docker/Nginx:**
```nginx
# Add to your nginx config
server {
    server_name thearunmurali.com;
    
    # Existing site
    location / {
        root /var/www/thearunmurali.com;
    }
    
    # Chess app
    location /chess {
        alias /var/www/thearunmurali.com/chess;
        try_files $uri $uri/ /chess/index.html;
    }
}
```

**If using Netlify/Vercel:**
- Create new site: `chess-replay`
- Link to this repo
- Deploy will create: `chess-replay.netlify.app`
- Add custom domain: `chess.thearunmurali.com`

**If using your LiteLLM/OpenWebUI server:**
- Add chess app to same server
- Serve as static files alongside existing apps
- Use reverse proxy to route `/chess` to the app

## Quick Integration with Your Blog

Add a link to your blog post or navigation:
```html
<a href="/chess">Play Chess Replay</a>
```

Or embed as iframe:
```html
<iframe src="/chess" width="100%" height="800px"></iframe>
```

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

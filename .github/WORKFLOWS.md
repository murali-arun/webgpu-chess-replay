# GitHub Actions Deployment Setup

## Workflows Created

### 1. `deploy.yml` - Build and Deploy App
Automatically builds and deploys on push to main branch.

**Choose your deployment method** (uncomment the one you want):

#### Option A: GitHub Pages (Free, Easy)
- Already enabled in the workflow
- Models must be uploaded separately
- URL: `https://yourusername.github.io/webgpu-chess-replay`

**Setup:**
1. Go to repo Settings > Pages
2. Set Source to "GitHub Actions"
3. Push to main branch
4. Models won't be included - upload separately or use CDN

#### Option B: Vercel
Uncomment the Vercel section in `deploy.yml`

**Setup:**
1. Get Vercel token: https://vercel.com/account/tokens
2. Add GitHub Secrets:
   ```
   VERCEL_TOKEN=your_token
   VERCEL_ORG_ID=your_org_id
   VERCEL_PROJECT_ID=your_project_id
   ```
3. Push to main branch

#### Option C: Your Own Server (SSH)
Uncomment the SSH section in `deploy.yml`

**Setup:**
1. Generate SSH key for GitHub Actions
2. Add GitHub Secrets:
   ```
   SSH_HOST=your.server.com
   SSH_USERNAME=deploy_user
   SSH_PRIVATE_KEY=your_ssh_private_key
   ```
3. Ensure target directory exists on server
4. Push to main branch

### 2. `upload-models.yml` - Upload 3D Models to CDN
Manual workflow to upload models to cloud storage.

**Setup for AWS S3:**
```bash
# Add these secrets to GitHub repo:
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
S3_BUCKET=your-bucket-name
CLOUDFRONT_DOMAIN=d1234567890.cloudfront.net
```

**Setup for Cloudflare R2 (Recommended - Free):**
```bash
# Add these secrets:
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret
R2_BUCKET=chess-models
```

## Quick Start Guide

### Automated Deployment (Recommended)

**Step 1:** Choose deployment target in `.github/workflows/deploy.yml`
- Uncomment your preferred option (GitHub Pages, Vercel, or SSH)

**Step 2:** Add required secrets
```bash
# GitHub repo > Settings > Secrets and variables > Actions > New repository secret
```

**Step 3:** Update base path if needed
Edit `deploy.yml`:
```yaml
env:
  VITE_BASE_PATH: /chess  # or / for root deployment
```

**Step 4:** Push to trigger deployment
```bash
git add .github/
git commit -m "Add deployment workflows"
git push origin main
```

**Step 5:** Upload models (one-time)
- Go to GitHub Actions tab
- Run "Upload 3D Models to Storage" workflow manually
- Choose storage provider (S3/R2/Azure)

### Manual Deployment

If you prefer manual deployment:

**Build:**
```bash
npm run build
```

**Deploy:**
```bash
# GitHub Pages
npm run build
gh-pages -d dist

# Or download from workflow artifacts
# GitHub Actions > Latest run > Artifacts > Download chess-replay-dist
```

## GitHub Secrets Required

### For GitHub Pages
None - uses `GITHUB_TOKEN` automatically

### For Vercel
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

### For SSH Deployment
- `SSH_HOST`
- `SSH_USERNAME`
- `SSH_PRIVATE_KEY`

### For AWS S3 (Models)
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `S3_BUCKET`
- `CLOUDFRONT_DOMAIN` (optional)

### For Cloudflare R2 (Models)
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`

## Workflow Triggers

### Automatic Triggers
- `deploy.yml`: Runs on every push to `main` branch

### Manual Triggers
- `upload-models.yml`: Manual only (Actions tab > Run workflow)
- `deploy.yml`: Can also be triggered manually via "workflow_dispatch"

## Testing the Workflow

**Local test before pushing:**
```bash
# Install act (GitHub Actions local runner)
brew install act  # or: curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash

# Test the workflow
act push -j build-and-deploy
```

**Or just push and monitor:**
```bash
git push origin main

# Watch progress at:
# https://github.com/yourusername/webgpu-chess-replay/actions
```

## Customization

### Change deployment path
Edit `deploy.yml`:
```yaml
env:
  VITE_BASE_PATH: /  # Root deployment
  # or
  VITE_BASE_PATH: /chess  # Subdirectory deployment
```

### Add environment variables
```yaml
- name: Build application
  run: npm run build
  env:
    VITE_BASE_PATH: /chess
    VITE_MODELS_BASE_URL: https://cdn.example.com/models/
```

### Deploy to multiple environments
Create separate workflow files:
- `.github/workflows/deploy-staging.yml`
- `.github/workflows/deploy-production.yml`

## Troubleshooting

**Build fails:**
- Check Node version matches (currently set to 20)
- Verify all dependencies in package.json

**Models not loading:**
- Upload models separately using `upload-models.yml`
- Or add model download step to `deploy.yml`

**SSH deployment fails:**
- Verify SSH key has correct permissions
- Check server path exists
- Test SSH connection manually first

## Next Steps

1. Choose your deployment method (GitHub Pages is easiest)
2. Add required secrets to GitHub repo
3. Edit `deploy.yml` to uncomment your chosen method
4. Push to main branch
5. Upload models using the models workflow or manually
6. Visit your deployed site!

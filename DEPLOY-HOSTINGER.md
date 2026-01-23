# Deploy to Your Existing Hostinger VPS

## You Already Have Everything Needed!

Your Hostinger VPS is running:
- ✅ Ollama
- ✅ OpenWebUI
- ✅ Web server (likely nginx or Apache)
- ✅ FTP access (credentials already in GitHub secrets)

You can deploy the chess app **alongside** your existing setup at:
`https://your-vps-ip/chess` or `https://yourdomain.com/chess`

## Option 1: Automatic Deployment via GitHub Actions (Recommended)

### Setup (One-time, 2 minutes)

**Step 1:** The workflow is ready! Your secrets are already set:
- ✅ `HOSTINGER_FTP_HOST`
- ✅ `HOSTINGER_FTP_USER`
- ✅ `HOSTINGER_FTP_PASS`

**Step 2:** Push the workflow
```bash
git add .github/workflows/deploy-hostinger.yml
git commit -m "Add Hostinger deployment"
git push origin main
```

**Step 3:** It deploys automatically! 🎉
- App code goes to: `/public_html/chess/`
- Access at: `https://your-ip/chess` or `https://yourdomain.com/chess`

**Step 4:** Upload models (one-time)
```bash
# Option A: Via FTP client (FileZilla, WinSCP)
# Connect to your VPS and upload public/models/*.glb to /public_html/chess/models/

# Option B: Via command line
lftp -u $HOSTINGER_FTP_USER,$HOSTINGER_FTP_PASS $HOSTINGER_FTP_HOST <<EOF
mirror -R public/models /public_html/chess/models
quit
EOF
```

## Option 2: Direct SSH Deployment (Faster for models)

If you have SSH access to your VPS:

```bash
# 1. Build locally
npm run build

# 2. Upload via SCP (much faster than FTP)
scp -r dist/* root@your-vps-ip:/var/www/html/chess/
scp -r public/models/*.glb root@your-vps-ip:/var/www/html/chess/models/

# 3. Set permissions
ssh root@your-vps-ip "chmod -R 755 /var/www/html/chess"
```

## VPS Configuration

### If using Nginx (most likely)

**Step 1:** SSH into your VPS
```bash
ssh root@your-vps-ip
```

**Step 2:** Edit nginx config
```bash
nano /etc/nginx/sites-available/default
# or
nano /etc/nginx/conf.d/default.conf
```

**Step 3:** Add chess app location
```nginx
server {
    listen 80;
    server_name your-domain.com;  # or your IP
    
    # Your existing OpenWebUI location
    location / {
        proxy_pass http://localhost:3000;  # or wherever OpenWebUI runs
        # ... existing config
    }
    
    # NEW: Chess replay app
    location /chess {
        alias /var/www/html/chess;  # or /public_html/chess
        try_files $uri $uri/ /chess/index.html;
        
        # Handle large model files
        client_max_body_size 200M;
    }
    
    # Serve models with proper MIME types
    location /chess/models {
        alias /var/www/html/chess/models;
        types {
            model/gltf-binary glb;
        }
        add_header Access-Control-Allow-Origin *;
    }
}
```

**Step 4:** Test and reload nginx
```bash
nginx -t
systemctl reload nginx
```

### If using Apache

```bash
# Edit .htaccess in /public_html/chess/
nano /public_html/chess/.htaccess
```

Add:
```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /chess/
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /chess/index.html [L]
</IfModule>

# Handle large files
<IfModule mod_mime.c>
  AddType model/gltf-binary .glb
</IfModule>
```

## File Structure on Your VPS

```
/var/www/html/  (or /public_html/)
├── chess/                    # Your new chess app
│   ├── index.html
│   ├── assets/
│   │   ├── index-xxx.js
│   │   └── index-xxx.css
│   └── models/               # 3D files
│       ├── chess_set.glb
│       ├── Pawn_white.glb
│       └── ... (12 files)
│
└── openwebui/                # Your existing app
    └── ...
```

## Access Your Apps

After deployment:

- **OpenWebUI**: `https://your-vps-ip/` or `https://yourdomain.com/`
- **Chess Replay**: `https://your-vps-ip/chess` or `https://yourdomain.com/chess`

Both running on the same VPS! 🎮

## Quick Deploy Commands

```bash
# 1. Commit workflows
git add .github/workflows/deploy-hostinger.yml
git commit -m "Add Hostinger deployment"
git push origin main

# 2. Models (choose one method):

# Via FTP (slow but works):
# Use FileZilla to upload public/models/ to /public_html/chess/models/

# Via SSH (fast):
ssh root@your-vps-ip "mkdir -p /var/www/html/chess/models"
scp public/models/*.glb root@your-vps-ip:/var/www/html/chess/models/

# 3. Configure nginx (if needed)
ssh root@your-vps-ip
# Add the nginx config above
nginx -t && systemctl reload nginx

# 4. Done! Visit https://your-ip/chess
```

## Storage Tips

Your VPS likely has enough space for the models (~160MB after cleanup):

```bash
# Check available space
ssh root@your-vps-ip "df -h"

# If tight on space, delete unused model files
rm public/models/replica_lewis_chess_pieces_on_chessboard.glb
rm public/models/"Chess Board.glb"
# Saves 43MB!
```

## Cost

**Total additional cost: $0**
- Using your existing VPS ✅
- Using your existing domain/IP ✅
- No extra storage needed ✅
- No additional bandwidth charges ✅

## Troubleshooting

**404 Not Found:**
- Check file permissions: `chmod -R 755 /var/www/html/chess`
- Verify nginx config: `nginx -t`
- Check nginx is reloaded: `systemctl reload nginx`

**Models not loading:**
- Upload to correct path: `/var/www/html/chess/models/`
- Check file permissions on .glb files
- Verify MIME type in nginx/apache config

**FTP deployment fails:**
- Verify secrets in GitHub: Settings > Secrets > Actions
- Check FTP path (might be `/public_html/` not `/var/www/html/`)
- Try manual FTP first to confirm credentials

## Next Steps

1. Push the workflow: `git push origin main`
2. Upload models via FTP or SSH
3. Configure nginx (add location block)
4. Visit `https://your-ip/chess`
5. Share the link! 🎉

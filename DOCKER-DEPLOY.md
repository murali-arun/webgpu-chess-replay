# Docker Deployment Guide

## Quick Start

### 1. Build and Run with Docker Compose (Recommended)

```bash
# Build and start the container
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop the container
docker-compose down
```

The app will be available at `http://localhost:3000`

### 2. Build and Run with Docker

```bash
# Build the image
docker build -t webgpu-chess-replay .

# Run the container
docker run -d -p 3000:80 --name webgpu-chess webgpu-chess-replay

# View logs
docker logs -f webgpu-chess

# Stop and remove
docker stop webgpu-chess
docker rm webgpu-chess
```

## VPS Deployment

### Option A: Using Docker Compose on VPS

1. **SSH into your VPS**
   ```bash
   ssh user@your-vps-ip
   ```

2. **Install Docker and Docker Compose**
   ```bash
   # Install Docker
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   
   # Install Docker Compose
   sudo apt-get update
   sudo apt-get install docker-compose-plugin
   ```

3. **Clone your repository**
   ```bash
   git clone https://github.com/yourusername/webgpu-chess-replay.git
   cd webgpu-chess-replay
   ```

4. **Deploy**
   ```bash
   # Build and start
   sudo docker-compose up -d --build
   
   # Check status
   sudo docker-compose ps
   ```

5. **Access your app**
   - If using port 3000: `http://your-vps-ip:3000`
   - For production on port 80: Change `docker-compose.yml` to `"80:80"`

### Option B: Build Locally, Deploy Image

1. **Build locally and push to Docker Hub**
   ```bash
   # Build
   docker build -t yourusername/webgpu-chess-replay:latest .
   
   # Login to Docker Hub
   docker login
   
   # Push
   docker push yourusername/webgpu-chess-replay:latest
   ```

2. **Pull and run on VPS**
   ```bash
   ssh user@your-vps-ip
   docker pull yourusername/webgpu-chess-replay:latest
   docker run -d -p 80:80 --restart unless-stopped webgpu-chess-replay:latest
   ```

### Option C: Manual Build on VPS (No Docker)

1. **Install Node.js on VPS**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. **Clone and build**
   ```bash
   git clone https://github.com/yourusername/webgpu-chess-replay.git
   cd webgpu-chess-replay
   npm install
   npm run build
   ```

3. **Serve with Nginx**
   ```bash
   # Install Nginx
   sudo apt-get install nginx
   
   # Copy built files
   sudo cp -r dist/* /var/www/html/
   
   # Copy nginx config
   sudo cp nginx.conf /etc/nginx/sites-available/webgpu-chess
   sudo ln -s /etc/nginx/sites-available/webgpu-chess /etc/nginx/sites-enabled/
   
   # Restart Nginx
   sudo systemctl restart nginx
   ```

## Production Optimizations

### Enable HTTPS (Let's Encrypt)

```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d yourdomain.com

# Auto-renewal is configured automatically
```

### Update nginx.conf for custom domain

Replace `server_name localhost;` with:
```nginx
server_name yourdomain.com www.yourdomain.com;
```

### Environment Variables

If you need environment variables, create a `.env` file:
```bash
VITE_API_URL=https://api.yourdomain.com
```

Update Dockerfile to use them during build.

## Maintenance

### Update Deployment

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose up -d --build
```

### View Logs

```bash
docker-compose logs -f
```

### Backup

```bash
# Backup the entire directory
tar -czf webgpu-chess-backup-$(date +%Y%m%d).tar.gz webgpu-chess-replay/
```

## Troubleshooting

### Container won't start
```bash
docker-compose logs
```

### Port already in use
```bash
# Check what's using the port
sudo lsof -i :3000

# Change port in docker-compose.yml
```

### Build fails
```bash
# Clear Docker cache
docker system prune -a
docker-compose build --no-cache
```

## Performance Tips

1. **Use CDN** for 3D models if they're large
2. **Enable Gzip** (already configured in nginx.conf)
3. **Use HTTP/2** (configure in nginx for HTTPS)
4. **Add CloudFlare** for DDoS protection and caching

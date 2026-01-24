# Nginx Proxy Manager Setup Guide

Since you already have Nginx Proxy Manager running, follow these steps to deploy your WebGPU Chess app.

## 1. Deploy the Chess App

```bash
# Clone your repo on the VPS
cd ~
git clone <your-repo-url> webgpu-chess-replay
cd webgpu-chess-replay

# Build and start the container
docker-compose up -d --build

# Verify it's running
docker ps | grep webgpu-chess
```

The app will run on internal port **8080** (accessible only from localhost).

## 2. Configure Nginx Proxy Manager

### Access Nginx Proxy Manager
1. Go to `http://your-vps-ip:81`
2. Login with your credentials

### Add Proxy Host

1. Click **"Hosts"** → **"Proxy Hosts"** → **"Add Proxy Host"**

2. **Details Tab:**
   - **Domain Names:** `chess.yourdomain.com` (or whatever subdomain you want)
   - **Scheme:** `http`
   - **Forward Hostname/IP:** `webgpu-chess-replay` (container name)
   - **Forward Port:** `80` (internal container port)
   - **Cache Assets:** ✅ Enable
   - **Block Common Exploits:** ✅ Enable
   - **Websockets Support:** ❌ Not needed

3. **SSL Tab:**
   - **SSL Certificate:** Select "Request a new SSL Certificate"
   - **Force SSL:** ✅ Enable
   - **HTTP/2 Support:** ✅ Enable
   - **HSTS Enabled:** ✅ Enable
   - **Email:** your-email@example.com
   - **I Agree to Let's Encrypt TOS:** ✅ Enable

4. Click **"Save"**

### Alternative: Use IP Address (No Domain)

If you don't have a domain, you can access via IP:

1. **Domain Names:** `your-vps-ip`
2. Follow same steps but **skip SSL tab** (or use self-signed certificate)
3. Access at: `http://your-vps-ip`

## 3. DNS Configuration

If using a custom domain, add an A record:

```
Type: A
Name: chess (or @)
Value: your-vps-ip
TTL: 3600
```

Wait a few minutes for DNS propagation, then access: `https://chess.yourdomain.com`

## 4. Verify Deployment

```bash
# Check container status
docker ps | grep webgpu-chess

# View logs
docker logs -f webgpu-chess-replay

# Check if app is accessible locally
curl http://localhost:8080
```

## 5. Update Deployment

When you push changes to Git:

```bash
cd ~/webgpu-chess-replay
git pull origin main
docker-compose up -d --build
```

## Network Architecture

```
Internet → Nginx Proxy Manager (ports 80/443)
            ↓
          Proxy to webgpu-chess-replay:80 (internal)
            ↓
          Your Chess App
```

## Troubleshooting

### Container not accessible from NPM

```bash
# Verify they're on the same network
docker network ls
docker network inspect npm_default

# Should show both containers
```

### SSL Certificate fails

- Make sure DNS is pointing to your VPS
- Check port 80 and 443 are accessible (firewall)
- Wait a few minutes after DNS changes

### App not loading

```bash
# Check container logs
docker logs webgpu-chess-replay

# Test direct access
curl http://localhost:8080
```

### Port 8080 already in use

Edit `docker-compose.yml` and change port:
```yaml
ports:
  - "8081:80"  # Use 8081 instead
```

Then update NPM forward port to 8081.

## Performance Tips

1. In NPM, enable "Cache Assets" for better performance
2. Enable HTTP/2 in SSL settings
3. Consider adding CloudFlare in front of NPM for additional caching and DDoS protection

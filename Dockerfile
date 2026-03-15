# Multi-stage build for WebGPU Chess Replay

# ── Stage 1: Build the frontend ───────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 2: Frontend — nginx serving built static files ──────────────────────
FROM nginx:alpine AS frontend
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

# ── Stage 3: Backend — Node.js running server.js ──────────────────────────────
FROM node:20-alpine AS backend
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js .
RUN mkdir -p lessons-input/pending lessons-input/processing lessons-input/done lessons-input/failed src/lessons
EXPOSE 3010
CMD ["node", "server.js"]

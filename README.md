# 🚀 TeslaReflect HUD Setup Guide

TeslaReflect HUD is a high-performance mirrored display for your Tesla, designed to be placed on your dashboard and reflected in the windshield. It connects to your **TeslaMate** MQTT broker via a secure server-side proxy.

## 🛠️ Deployment Options

### Option 1: Docker (Recommended)

Since this app requires a server-side proxy to handle MQTT and provide a secure WebSocket for your phone, Docker is the easiest way to run it.

#### 1. Create a `Dockerfile`
Create a file named `Dockerfile` in the root directory:
```dockerfile
# Build stage
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Run stage
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY --from=builder /app/dist ./dist
COPY server.js ./
EXPOSE 80
CMD ["node", "server.js"]
```

#### 2. Create a `docker-compose.yml`
Create a file named `docker-compose.yml` in the root directory:
```yaml
services:
  tesla-hud:
    build: .
    container_name: tesla-reflect-hud
    restart: unless-stopped
    ports:
      - "8080:80"
    environment:
      - API_KEY=your_gemini_api_key_here
      - MQTT_HOST=mosquitto  # Internal Docker network name or IP
      - MQTT_PORT=1883
      - MQTT_PROTOCOL=mqtt
      - MQTT_TOPIC_PREFIX=teslamate
      - MQTT_CAR_ID=1
      - PUBLIC_URL= # Only set if using a complex reverse proxy path
```

#### 3. Start the HUD
```bash
docker-compose up -d --build
```

### Option 2: Manual Node.js Execution

1. **Install dependencies**: `npm install`
2. **Build frontend**: `npm run build`
3. **Set environment variables**:
   - `API_KEY`: Your Google Gemini API Key.
   - `MQTT_HOST`: Your Mosquitto broker IP.
4. **Run server**: `node server.js`

## 📡 Reverse Proxy Configuration

If you use Nginx, Traefik, or Caddy, ensure you enable **WebSocket support** for the `/ws` path.
- The HUD automatically detects the protocol (`ws` vs `wss`) based on how you load the page.
- Use the **Settings** gear (bottom right, low opacity) to override the Proxy URL if needed.

## 📱 In-Car Usage
1. Open the app on your phone.
2. Ensure you are in **Landscape** mode.
3. Tap the **Fullscreen** icon.
4. Tap the **Mirror** icon until the text is reversed.
5. Place the phone on top of the steering wheel column/dashboard so the image reflects clearly in the windshield.

## 🧠 AI Insights
The HUD uses Google Gemini to provide context-aware driving insights based on your real-time Tesla data. These appear in the glass-morphic bubble at the bottom of the screen.

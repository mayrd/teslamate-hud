# 🚀 teslamate-HUD Setup Guide

teslamate-HUD is a high-performance mirrored display for your Tesla, designed to be placed on your dashboard and reflected in the windshield. It securely connects to your **TeslaMate** MQTT broker via a lightweight server-side proxy and offers a clean, dark-mode, dashboard UI optimized for landscape mobile devices.

## ✨ Features

- **Windshield Reflection Ready:** Dedicated toggle to horizontally or vertically flip the UI rendering for perfect windshield alignment.
- **Modern Interface:** High-contrast cyan and gray glow aesthetics to pierce ambient light, making numbers readable and elegant.
- **TeslaMate Native:** Listens to modern `active_route` payloads to automatically map out navigation routines, battery ranges, and ETAs.
- **Intelligent HUD Controls:** Automatically hides control icons out-of-the-way when driving fullscreen to prevent distraction. Double-tap the mobile display or double-click to exit/enter fullscreen.
- **Offline Demo Mode:** Curious to see how it works but away from the car? Run the built-in 30s HUD mockup loop.

## 🛠️ Deployment Options

Since this app requires a backend proxy to securely bridge your MQTT Broker over WebSockets for a mobile browser, we recommend employing Docker. Given that TeslaMate is usually deployed via Docker Compose, deployment alongside it is seamless.

### Option 1: Docker Compose (Recommended)

You can launch the proxy directly alongside TeslaMate by merging this configuration into your existing `docker-compose.yml`.

Ensure you configure the required environment variables:

```yaml
services:
  teslahud:
    image: ghcr.io/<your_github_username>/teslahud:latest
    container_name: teslamate-hud
    restart: unless-stopped
    ports:
      - "8080:80"
    environment:
      - MQTT_URL=mqtt://mosquitto:1883    # Use the internal docker network name for your mosquitto service 
      - MQTT_TOPIC_PREFIX=teslamate       # Change if your TeslaMate prefix differs
      - MQTT_CAR_ID=1                     # Change if tracking multiple vehicles
      - PUBLIC_WS_URL=wss://hud.example.org/ws  # Specify if sitting behind a strict reverse proxy ruleset
```

To start the HUD, execute:

```bash
docker-compose up -d
```

### Option 2: Manual Node.js Execution

For development purposes, or if you prefer running apps natively, use `npm`.

1. **Install Dependencies**: `npm install`
2. **Build Frontend**: `npm run build`
3. **Export Environment Variables**:
   ```bash
   export MQTT_URL="mqtt://192.168.1.10:1883"
   export MQTT_TOPIC_PREFIX="teslamate"
   export MQTT_CAR_ID="1"
   ```
4. **Run Server**: `npm start` (or `node server.js`)

## 📡 Reverse Proxy & HTTPS Configuration

To allow your mobile device to establish a WebSocket connection to the hosted HUD securely in modern browsers, wrap the backend behind an SSL reverse proxy (like Nginx, Traefik, or Caddy) and proxy the `/ws` path traffic correctly over SSL (`wss://`). The frontend auto-detects `ws` vs `wss` contexts natively.

## 📱 In-Car Usage

1. **Load Dashboard:** Navigate to the hosted application from your Tesla or personal smartphone browser.
2. **Prepare View:** Turn your device orientation to **Landscape**. 
3. **Engage Fullscreen:** Tap the **Fullscreen** double-arrow icon (or double-tap anywhere on the screen). *Note: The tools menu purposefully hides during fullscreen to reduce visual fatigue.*
4. **Mirror:** Ensure you tap the **Flip** icon from the menu so the numbers mirror.
5. **Mount:** Rest your device against the lower dash or atop the steering column housing. Wait for the image to clear on your windshield.

## 🤝 Contributing / Architecture

The application is written strictly in HTML/Typescript, using `React` & `TailwindCSS` fed up from lightweight ESM script CDNs on the client.
- `server.js` functions as a fast intermediate `express` bridge reading local MQTT arrays and funneling formatted JSON down to all connected frontend WS clients.
- The repository utilizes GitHub actions to instantly formulate and bump a `ghcr.io` docker container titled `latest` upon every commit!

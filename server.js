
import express from 'express';
import { WebSocketServer } from 'ws';
import mqtt from 'mqtt';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 80;

// MQTT Configuration (Server-side ONLY)
const MQTT_HOST = process.env.MQTT_HOST || 'localhost';
const MQTT_PORT = process.env.MQTT_PORT || '1883';
const MQTT_PROTOCOL = process.env.MQTT_PROTOCOL || 'mqtt'; 
const MQTT_PREFIX = process.env.MQTT_TOPIC_PREFIX || 'teslamate';
const CAR_ID = process.env.MQTT_CAR_ID || '1';
const PUBLIC_URL = process.env.PUBLIC_URL || ''; // Optional override for WS connection

const mqttUrl = `${MQTT_PROTOCOL}://${MQTT_HOST}:${MQTT_PORT}`;

// API for Frontend to get its config
app.get('/api/config', (req, res) => {
  res.json({
    topicPrefix: MQTT_PREFIX,
    carId: parseInt(CAR_ID),
    proxyUrl: PUBLIC_URL
  });
});

// Serve static files from the built frontend
app.use(express.static(path.join(__dirname, 'dist')));

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 HUD Proxy running at http://0.0.0.0:${port}`);
  console.log(`🔗 Attempting MQTT connection to: ${mqttUrl}`);
});

// Setup WebSocket Server for the Frontend
const wss = new WebSocketServer({ server, path: '/ws' });

// Setup MQTT Client
const mqttClient = mqtt.connect(mqttUrl, {
  reconnectPeriod: 5000,
  connectTimeout: 30 * 1000,
});

mqttClient.on('connect', () => {
  console.log('✅ MQTT: Connected to internal broker');
  const topicPattern = `${MQTT_PREFIX}/cars/${CAR_ID}/#`;
  mqttClient.subscribe(topicPattern);
  console.log(`📡 MQTT: Subscribed to ${topicPattern}`);
});

mqttClient.on('message', (topic, message) => {
  const payload = JSON.stringify({
    topic,
    data: message.toString(),
    timestamp: Date.now()
  });
  
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // OPEN
      client.send(payload);
    }
  });
});

mqttClient.on('error', (err) => {
  console.error('❌ MQTT Error:', err.message);
});

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`📱 Client connected from ${ip}`);
  ws.send(JSON.stringify({ type: 'status', msg: 'Linked to Tesla Proxy' }));
});

// Fallback for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

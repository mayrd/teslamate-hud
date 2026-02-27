
import { TeslaData, MqttConfig, ConnectionStatus } from '../types.ts';

export class MqttService {
  private ws: WebSocket | null = null;
  private onDataUpdate: (data: Partial<TeslaData>) => void;
  private onLog: (msg: string) => void;
  private onStatusChange?: (status: ConnectionStatus) => void;

  constructor(
    onDataUpdate: (data: Partial<TeslaData>) => void,
    onLog: (msg: string) => void,
    onStatusChange?: (status: ConnectionStatus) => void
  ) {
    this.onDataUpdate = onDataUpdate;
    this.onLog = onLog;
    this.onStatusChange = onStatusChange;
  }

  private log(msg: string) {
    const timestamp = new Date().toLocaleTimeString();
    const formattedMsg = `[${timestamp}] ${msg}`;
    console.log(formattedMsg);
    this.onLog(formattedMsg);
  }

  connect(config: MqttConfig) {
    if (this.ws) {
      this.ws.close();
    }

    let wsUrl = config.proxyUrl || '';

    if (!wsUrl) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/ws`;
    } else {
      if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = wsUrl.startsWith('/')
          ? `${protocol}//${window.location.host}${wsUrl}`
          : `${protocol}//${wsUrl}`;
      }
    }

    this.log(`Attempting connection: ${wsUrl}`);
    this.onStatusChange?.('connecting');

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.log('✅ Linked to HUD Proxy Server');
        this.onStatusChange?.('connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          if (payload.type === 'status') {
            this.log(`Status: ${payload.msg}`);
            return;
          }

          const { topic, data } = payload;
          const prefix = `${config.topicPrefix}/cars/${config.carId}`;
          const updates: Partial<TeslaData> = {};

          // ── Core telemetry ──────────────────────────────────────────
          if (topic === `${prefix}/speed`) updates.speed = parseFloat(data) || 0;
          if (topic === `${prefix}/battery_level`) updates.batteryLevel = parseInt(data);
          if (topic === `${prefix}/power`) updates.power = parseFloat(data);
          if (topic === `${prefix}/shift_state`) updates.gear = data;
          if (topic === `${prefix}/ideal_battery_range_km`) updates.range = parseFloat(data);
          if (topic === `${prefix}/outside_temp`) updates.outsideTemp = parseFloat(data);
          if (topic === `${prefix}/inside_temp`) updates.insideTemp = parseFloat(data);
          if (topic === `${prefix}/odometer`) updates.odometer = parseFloat(data);
          if (topic === `${prefix}/heading`) updates.heading = parseFloat(data);
          if (topic === `${prefix}/elevation`) updates.elevation = parseFloat(data);
          if (topic === `${prefix}/geofence`) updates.geofence = data;

          if (topic === `${prefix}/state`) {
            updates.state = data;
            updates.isCharging = data === 'charging';
          }
          if (topic === `${prefix}/locked`) updates.isLocked = data === 'true';

          // ── Charging ────────────────────────────────────────────────
          if (topic === `${prefix}/charger_power`) updates.chargerPower = parseFloat(data);
          if (topic === `${prefix}/time_to_full_charge`) updates.timeToFullCharge = parseFloat(data);
          if (topic === `${prefix}/charge_limit_soc`) updates.chargeLimitSoc = parseInt(data);

          // ── Navigation (legacy flat topics) ─────────────────────────
          if (topic === `${prefix}/destination`) updates.destination = data;
          if (topic === `${prefix}/est_arrival_time`) updates.estArrivalTime = data;
          if (topic === `${prefix}/time_to_arrival`) updates.timeToArrival = parseFloat(data);

          // ── Navigation (rich active_route JSON) ─────────────────────
          if (topic === `${prefix}/active_route`) {
            try {
              const route = JSON.parse(data);
              // Only store if no error (i.e. a real route is active)
              updates.activeRoute = route.error ? null : route;
            } catch {
              updates.activeRoute = null;
            }
          }

          if (Object.keys(updates).length > 0) {
            this.onDataUpdate(updates);
          }
        } catch (err) {
          console.error('Proxy parse error', err);
        }
      };

      this.ws.onclose = (event) => {
        this.log(`❌ Proxy disconnected (Code: ${event.code}). Retrying in 5s...`);
        this.onStatusChange?.('disconnected');
        setTimeout(() => this.connect(config), 5000);
      };

      this.ws.onerror = (e) => {
        this.log('⚠️ WebSocket Error (Check Reverse Proxy /ws mapping)');
        console.error(e);
      };
    } catch (err: any) {
      this.log(`🔥 Connection error: ${err.message}`);
    }
  }

  disconnect() {
    this.log('Disconnecting Proxy...');
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.onStatusChange?.('disconnected');
  }
}

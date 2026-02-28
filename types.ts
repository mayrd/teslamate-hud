export interface ActiveRoute {
  destination: string;
  energy_at_arrival: number;       // battery % when arriving
  miles_to_arrival: number;
  minutes_to_arrival: number;
  traffic_minutes_delay: number;   // traffic delay in minutes
  location: { latitude: number; longitude: number } | null;
  error: string | null;
}

export interface TeslaData {
  speed: number;
  batteryLevel: number;
  power: number;         // kW
  gear: string;
  range: number;
  outsideTemp: number;
  insideTemp: number;
  odometer: number;
  state: string;
  isLocked: boolean;
  isCharging: boolean;
  heading: number;
  elevation: number;       // meters
  geofence: string;        // named geofence (e.g. "Home", "Work")
  tpms_front_left: number;
  tpms_front_right: number;
  tpms_rear_left: number;
  tpms_rear_right: number;
  // Charging extras
  chargerPower: number;         // kW
  timeToFullCharge: number;     // hours
  chargeLimitSoc: number;       // %
  // Navigation (legacy flat topics)
  destination: string;
  estArrivalTime: string;
  timeToArrival: number;        // minutes
  // Navigation (rich active_route JSON)
  activeRoute: ActiveRoute | null;
}

export interface MqttConfig {
  proxyUrl: string;    // The HUD Proxy WebSocket URL (e.g., ws://192.168.1.50:8080/ws)
  topicPrefix: string;
  carId: number;
}

export enum HUDMode {
  NORMAL = 'NORMAL',
  MIRROR = 'MIRROR',
  FLIPPED = 'FLIPPED'
}

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';
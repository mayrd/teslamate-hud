import { MqttConfig } from './types.ts';

const getEnv = (key: string, fallback: string): string => {
  try {
    return (window as any).process?.env?.[key] || fallback;
  } catch {
    return fallback;
  }
};

export const APP_CONFIG = {
  // HUD Proxy configuration
  mqtt: {
    proxyUrl: '', // Default empty uses window.location
    topicPrefix: getEnv('MQTT_TOPIC_PREFIX', 'teslamate'),
    carId: parseInt(getEnv('MQTT_CAR_ID', '1'))
  } as MqttConfig,

  // HUD UI Settings
  ui: {
    paddingX: 'px-20',
    paddingY: 'py-12',
    speedFontSize: 'text-[22rem]',
    refreshInterval: 30000,
  }
};
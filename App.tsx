
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MqttService } from './services/mqttService.ts';
import { getDemoState, getDemoLabel, DEMO_DURATION } from './services/demoService.ts';
import { TeslaData, MqttConfig, HUDMode, ConnectionStatus } from './types.ts';
import { APP_CONFIG } from './config.ts';
import {
  Settings,
  Maximize2,
  Minimize2,
  FlipHorizontal,
  Battery,
  Zap,
  RefreshCw,
  MapPin,
  Clock,
  Terminal,
  Link2,
  Play
} from 'lucide-react';

const INITIAL_DATA: TeslaData = {
  speed: 0,
  batteryLevel: 0,
  power: 0,
  gear: 'P',
  range: 0,
  outsideTemp: 0,
  insideTemp: 0,
  odometer: 0,
  state: 'asleep',
  isLocked: true,
  isCharging: false,
  heading: 0,
  tpms_front_left: 0,
  tpms_front_right: 0,
  tpms_rear_left: 0,
  tpms_rear_right: 0,
  destination: '',
  estArrivalTime: '',
  timeToArrival: 0,
  activeRoute: null as any,
  elevation: 0,
  geofence: '',
  chargerPower: 0,
  timeToFullCharge: 0,
  chargeLimitSoc: 0
};

export default function App() {
  const [config, setConfig] = useState<MqttConfig>(() => {
    const saved = localStorage.getItem('mqtt_config');
    return saved ? JSON.parse(saved) : APP_CONFIG.mqtt;
  });

  const [data, setData] = useState<TeslaData>(INITIAL_DATA);
  const [hudMode, setHudMode] = useState<HUDMode>(HUDMode.MIRROR);
  const [showSettings, setShowSettings] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMqttConnected, setIsMqttConnected] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');

  // Demo state
  const [isDemo, setIsDemo] = useState(false);
  const [demoElapsed, setDemoElapsed] = useState(0);
  const [demoData, setDemoData] = useState<Partial<TeslaData>>({});
  const demoIntervalRef = useRef<any>(null);

  const lastTapRef = useRef<number>(0);
  const mqttServiceRef = useRef<MqttService | null>(null);
  const wakeLockRef = useRef<any>(null);

  const addDebugLog = useCallback((msg: string) => {
    setDebugLogs(prev => [msg, ...prev].slice(0, 15));
  }, []);

  // Sync fullscreen state
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => { });
    } else {
      document.exitFullscreen().catch(() => { });
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      toggleFullscreen();
    }
    lastTapRef.current = now;
  }, [toggleFullscreen]);

  // Fetch Server Config on Mount - Priority over LocalStorage
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const serverConfig = await res.json();
          addDebugLog(`System: Fetched server environment (Prefix: ${serverConfig.topicPrefix}, Car: ${serverConfig.carId})`);

          setConfig(prev => {
            const merged = { ...prev, ...serverConfig };
            // Persist the merged version so it stays across refreshes but respects new env vars
            localStorage.setItem('mqtt_config', JSON.stringify(merged));
            return merged;
          });
        }
      } catch (err) {
        addDebugLog(`System: Could not fetch server config, using local defaults.`);
      }
    };
    fetchConfig();
  }, [addDebugLog]);

  const updateData = useCallback((updates: Partial<TeslaData>) => {
    setData(prev => ({ ...prev, ...updates }));
    setIsMqttConnected(true);
  }, []);

  // Demo Clock
  useEffect(() => {
    if (!isDemo) {
      if (demoIntervalRef.current) clearInterval(demoIntervalRef.current);
      setDemoElapsed(0);
      setDemoData({});
      return;
    }
    const TICK = 100; // ms
    let elapsed = 0;
    demoIntervalRef.current = setInterval(() => {
      elapsed += TICK / 1000;
      setDemoElapsed(elapsed);
      setDemoData(getDemoState(elapsed));
      if (elapsed >= DEMO_DURATION) {
        clearInterval(demoIntervalRef.current);
        setIsDemo(false);
      }
    }, TICK);
    setDemoData(getDemoState(0));
    return () => clearInterval(demoIntervalRef.current);
  }, [isDemo]);

  const startDemo = () => {
    setShowSettings(false);
    setIsDemo(true);
  };
  const stopDemo = () => setIsDemo(false);

  // The displayed data is overridden by demo data if isDemo
  const displayData: TeslaData = isDemo
    ? { ...INITIAL_DATA, ...data, ...demoData } as TeslaData
    : data;

  useEffect(() => {
    const service = new MqttService(updateData, addDebugLog, setConnectionStatus);
    mqttServiceRef.current = service;
    service.connect(config);

    return () => service.disconnect();
  }, [config, updateData, addDebugLog]);

  // Wake Lock
  useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        } catch (err) {
          addDebugLog(`Wake Lock: Failed`);
        }
      }
    };
    requestWakeLock();
    return () => {
      if (wakeLockRef.current) wakeLockRef.current.release().catch(() => { });
    };
  }, [addDebugLog]);



  const cycleHudMode = () => {
    setHudMode(prev => {
      if (prev === HUDMode.NORMAL) return HUDMode.MIRROR;
      if (prev === HUDMode.MIRROR) return HUDMode.FLIPPED;
      return HUDMode.NORMAL;
    });
  };

  const saveConfig = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newConfig: MqttConfig = {
      proxyUrl: formData.get('proxyUrl') as string,
      topicPrefix: formData.get('topicPrefix') as string,
      carId: parseInt(formData.get('carId') as string)
    };
    setConfig(newConfig);
    localStorage.setItem('mqtt_config', JSON.stringify(newConfig));
    setShowSettings(false);
    setIsMqttConnected(false);
    setDebugLogs([]);
  };

  const getBatteryColor = (b: number) => {
    if (b < 10) return 'text-red-500';
    if (b < 25) return 'text-yellow-500';
    return 'text-green-500';
  };

  const formatTime = (isoString: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  const detectedProxyUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

  return (
    <div
      className="fixed inset-0 h-[100dvh] w-[100dvw] bg-black flex flex-col items-center justify-center overflow-hidden cursor-none select-none"
      onDoubleClick={toggleFullscreen}
      onTouchEnd={handleTouchEnd}
    >

      {/* Connection Status Dot */}
      <div className="absolute top-4 right-4 z-40 pointer-events-none">
        <div className={`w-3 h-3 rounded-full transition-colors duration-500 ${connectionStatus === 'connected' ? 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.8)]' :
          connectionStatus === 'connecting' ? 'bg-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.8)] animate-pulse' :
            'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)]'
          }`} />
      </div>

      {/* HUD Content */}
      <div className={`w-full h-full flex flex-col justify-between p-2 md:p-12 transition-transform duration-300 ${hudMode === HUDMode.MIRROR ? 'hud-mirror' :
        hudMode === HUDMode.FLIPPED ? 'hud-mirror-flipped' : ''
        }`}>

        {/* Top: Nav */}
        <div className="flex flex-col items-center justify-center">
          {displayData.destination && (
            <div className="animate-in fade-in slide-in-from-top duration-700 min-h-[60px] md:min-h-[120px] flex flex-col items-center justify-center">
              <div className="flex items-center gap-3 md:gap-6 text-cyan-400">
                <MapPin className="w-10 h-10 md:w-16 md:h-16 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]" />
                <span className="text-3xl md:text-6xl font-black tracking-tighter uppercase truncate max-w-[80vw] md:max-w-4xl">{displayData.destination}</span>
              </div>
              <div className="flex items-center justify-center gap-4 md:gap-8 text-gray-400 mt-2 md:mt-4">
                <div className="flex items-center gap-3">
                  <Clock className="w-6 h-6 md:w-10 md:h-10" />
                  <span className="text-2xl md:text-5xl font-bold">ETA: {formatTime(displayData.estArrivalTime)}</span>
                </div>
                {displayData.timeToArrival > 0 && (
                  <span className="text-2xl md:text-5xl font-bold text-gray-600">• {Math.round(displayData.timeToArrival)} min</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Mid: Speed */}
        <div className="relative flex flex-col items-center justify-center">
          <div className="flex flex-col md:flex-row items-center justify-center md:gap-8 lg:gap-16 w-full">

            {/* Left Stat (Range) - Only on MD+ */}
            <div className="hidden md:flex flex-col items-center justify-center w-48 text-center">
              <span className="text-6xl lg:text-8xl font-black text-gray-400">{Math.round(displayData.range)}</span>
              <span className="text-2xl lg:text-3xl font-bold text-gray-600 uppercase tracking-widest">KM</span>
            </div>

            {/* Speed (central element) */}
            <div className="flex flex-col items-center text-white">
              <span className={`text-9xl md:text-[14rem] lg:text-[20rem] leading-none font-black tracking-tighter drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]`}>
                {Math.round(displayData.speed)}
              </span>
              <span className="text-2xl md:text-5xl font-bold text-gray-500 uppercase tracking-widest -mt-2 md:-mt-8">km/h</span>
            </div>

            {/* Right Stat (Gear) - Only on MD+ */}
            <div className="hidden md:flex items-center justify-center w-48">
              <div className="text-6xl lg:text-8xl font-black text-white italic tracking-tighter w-28 lg:w-32 text-center bg-white/5 px-4 py-2 rounded-2xl border border-white/10">
                {displayData.gear || 'P'}
              </div>
            </div>
          </div>

          <div className="w-[80%] max-w-5xl h-8 bg-gray-900/60 rounded-full mt-4 overflow-hidden relative border border-white/10">
            <div className="absolute left-1/2 top-0 bottom-0 w-1.5 bg-white/30 z-10"></div>
            <div className={`absolute top-0 bottom-0 transition-all duration-300 ${displayData.power < 0 ? 'bg-green-500 shadow-[0_0_25px_rgba(34,197,94,0.6)]' : 'bg-orange-600 shadow-[0_0_25px_rgba(249,115,22,0.6)]'}`} style={{ left: displayData.power < 0 ? `${50 + (displayData.power / 60) * 50}%` : '50%', right: displayData.power > 0 ? `${50 - (displayData.power / 300) * 50}%` : '50%' }} />
          </div>
        </div>

        {/* Bottom: Stats */}
        <div className="grid grid-cols-3 items-end w-full">
          <div className="flex flex-col items-start gap-2">
            <div className={`flex items-center gap-1 md:gap-5 ${getBatteryColor(displayData.batteryLevel)} font-black`}>
              <Battery className="w-8 h-8 md:w-20 md:h-20" />
              <span className="text-4xl md:text-8xl">{displayData.batteryLevel}%</span>
            </div>
            <span className="text-lg md:hidden text-gray-500 font-bold ml-1">{Math.round(displayData.range)} KM</span>
          </div>

          <div className="flex flex-col items-center justify-end pb-2">
            <div className="flex md:hidden items-center">
              <div className="text-5xl font-black text-white italic tracking-tighter w-20 text-center bg-white/5 px-2 py-2 rounded-2xl border border-white/10 opacity-80 backdrop-blur-sm">
                {displayData.gear || 'P'}
              </div>
            </div>
          </div>

          <div></div>
        </div>
      </div>

      {isDemo && (
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-gray-900 border border-gray-700 px-6 py-2 rounded-full z-50 shadow-2xl">
          <div className="text-center font-bold text-white uppercase text-xs">
            {getDemoLabel(demoElapsed)} - {Math.ceil(DEMO_DURATION - demoElapsed)}s Left
          </div>
        </div>
      )}

      {/* Settings (Discrete) - out of mirror div */}
      {!isFullscreen && (
        <div className="absolute bottom-4 right-4 z-[90] flex gap-4 opacity-100 hover:opacity-100 transition-opacity">
          <button onClick={isDemo ? stopDemo : startDemo} className={`p-4 rounded-full text-white transition-colors ${isDemo ? 'bg-red-600 hover:bg-red-500' : 'bg-indigo-600 hover:bg-indigo-500'}`} title={isDemo ? 'Stop Demo' : 'Run Demo'}><Play size={24} /></button>
          <button onClick={() => setShowSettings(true)} className="p-4 bg-gray-900 rounded-full text-white hover:bg-gray-800"><Settings size={24} /></button>
          <button onClick={cycleHudMode} className="p-4 bg-gray-900 rounded-full text-white hover:bg-gray-800"><FlipHorizontal size={24} /></button>
          <button onClick={toggleFullscreen} className="p-4 bg-gray-900 rounded-full text-white hover:bg-gray-800">{isFullscreen ? <Minimize2 size={24} /> : <Maximize2 size={24} />}</button>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-6 cursor-default">
          <div className="bg-gray-900 border border-gray-800 rounded-[40px] w-full max-w-2xl p-10 text-white animate-in zoom-in-95 duration-200">
            <h2 className="text-4xl font-black mb-10 flex items-center gap-5">
              <Settings size={40} className="text-blue-500" /> HUD Config
            </h2>

            <form onSubmit={saveConfig} className="space-y-8">
              <div>
                <label className="block text-sm text-gray-500 uppercase font-black mb-2 tracking-[0.2em] flex items-center gap-2">
                  <Link2 size={16} /> Proxy WebSocket URL
                </label>
                <input
                  name="proxyUrl"
                  defaultValue={config.proxyUrl}
                  className="w-full bg-gray-800 p-6 rounded-2xl border border-gray-700 outline-none text-xl focus:border-blue-500 font-mono"
                  placeholder={detectedProxyUrl}
                />
                <p className="text-gray-600 text-sm mt-2 font-medium">Leave blank to auto-detect (recommended for reverse proxies)</p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm text-gray-500 uppercase font-black mb-2 tracking-[0.2em]">TeslaMate Prefix</label>
                  <input name="topicPrefix" defaultValue={config.topicPrefix} className="w-full bg-gray-800 p-6 rounded-2xl border border-gray-700 outline-none text-xl" required />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 uppercase font-black mb-2 tracking-[0.2em]">Car ID</label>
                  <input name="carId" type="number" defaultValue={config.carId} className="w-full bg-gray-800 p-6 rounded-2xl border border-gray-700 outline-none text-xl" required />
                </div>
              </div>

              <div className="bg-black/40 rounded-2xl p-6 border border-gray-800 h-48 overflow-y-auto font-mono text-xs">
                <div className="flex items-center gap-2 mb-4 text-blue-400 font-bold uppercase tracking-widest sticky top-0 bg-black/10 backdrop-blur-sm py-1">
                  <Terminal size={16} /> Link Status
                </div>
                {debugLogs.map((log, i) => (
                  <div key={i} className={`mb-2 ${log.includes('✅') ? 'text-green-400' : log.includes('❌') ? 'text-red-400' : 'text-gray-500'}`}>
                    {log}
                  </div>
                ))}
              </div>

              <div className="pt-6 flex gap-6">
                <button type="button" onClick={() => setShowSettings(false)} className="flex-1 py-6 bg-gray-800 rounded-2xl font-black text-xl hover:bg-gray-700 transition-all">CLOSE</button>
                <button type="submit" className="flex-1 py-6 bg-blue-600 rounded-2xl font-black text-xl hover:bg-blue-500 shadow-xl shadow-blue-600/20 active:scale-95 transition-all">RE-LINK</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Disconnected Notice */}
      {!isMqttConnected && !showSettings && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className="bg-red-600/10 border border-red-600/50 text-red-500 px-10 py-6 rounded-full animate-pulse uppercase font-black tracking-[0.3em] backdrop-blur-xl flex items-center gap-6 shadow-2xl">
            <RefreshCw className="animate-spin" size={32} /> Searching for Vehicle...
          </div>
        </div>
      )}
    </div>
  );
}

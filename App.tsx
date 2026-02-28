
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
  Zap,
  RefreshCw,
  Clock,
  Navigation,
  Terminal,
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
  const [hudMode, setHudMode] = useState<HUDMode>(() => {
    return (localStorage.getItem('hud_mode') as HUDMode) || HUDMode.MIRROR;
  });
  const [showSettings, setShowSettings] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMqttConnected, setIsMqttConnected] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [units, setUnits] = useState<'KM' | 'MI'>(() => {
    return (localStorage.getItem('hud_units') as 'KM' | 'MI') || 'KM';
  });

  // Demo state
  const [isDemo, setIsDemo] = useState(false);
  const [demoElapsed, setDemoElapsed] = useState(0);
  const [demoData, setDemoData] = useState<Partial<TeslaData>>({});
  const demoIntervalRef = useRef<any>(null);

  const lastTapRef = useRef<number>(0);
  const mqttServiceRef = useRef<MqttService | null>(null);
  const wakeLockRef = useRef<any>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addDebugLog = useCallback((msg: string) => {
    setDebugLogs(prev => [...prev, msg].slice(-20)); // Keep last 20, newest at the bottom
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (showSettings) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [debugLogs, showSettings]);

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
      const state = getDemoState(elapsed);
      // Auto-calculate arrival time in demo if duration is set in activeRoute
      const mins = state.activeRoute?.minutes_to_arrival ?? state.timeToArrival;
      if (mins && !state.estArrivalTime) {
        const minsNum = Number(mins);
        state.timeToArrival = minsNum;
        state.estArrivalTime = new Date(Date.now() + minsNum * 60000).toISOString();
      }
      setDemoData(state);
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
      let nextMode = HUDMode.NORMAL;
      if (prev === HUDMode.NORMAL) nextMode = HUDMode.MIRROR;
      else if (prev === HUDMode.MIRROR) nextMode = HUDMode.FLIPPED;

      localStorage.setItem('hud_mode', nextMode);
      return nextMode;
    });
  };

  const handleRelink = (e: React.FormEvent) => {
    e.preventDefault();
    // Re-triggering the useEffect by updating the config reference
    setConfig({ ...config });
    setShowSettings(false);
    setIsMqttConnected(false);
    setDebugLogs([]);
  };



  const convertValue = (val: number) => {
    return units === 'MI' ? val * 0.621371 : val;
  };

  const speedUnit = units === 'KM' ? 'km/h' : 'mph';
  const distUnit = units === 'KM' ? 'KM' : 'MI';

  const formatTime = (isoString: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  return (
    <div
      className="fixed inset-0 h-[100dvh] w-[100dvw] bg-black flex flex-col items-center justify-center overflow-hidden cursor-none select-none"
      onDoubleClick={toggleFullscreen}
      onTouchEnd={handleTouchEnd}
    >

      {/* Status & Notifications */}
      <div className="absolute top-6 right-6 z-40 pointer-events-none flex items-center gap-4 bg-black/20 backdrop-blur-md px-4 py-2 rounded-full border border-white/5">
        {isDemo && (
          <span className="text-indigo-400 font-bold uppercase tracking-[0.2em] text-[10px] md:text-xs">
            DEMO: {getDemoLabel(demoElapsed)} - {Math.ceil(DEMO_DURATION - demoElapsed)}s
          </span>
        )}
        {!isMqttConnected && !showSettings && !isDemo && (
          <div className="flex items-center gap-3">
            <RefreshCw className="animate-spin text-yellow-500 w-4 h-4" />
            <span className="text-yellow-500 font-black uppercase tracking-[0.2em] text-[10px] md:text-xs">Searching for Vehicle...</span>
          </div>
        )}
        <div className={`w-3 h-3 rounded-full transition-colors duration-500 ${connectionStatus === 'connected' ? 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.8)]' :
          (!isMqttConnected || connectionStatus === 'connecting') ? 'bg-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.8)] animate-pulse' :
            'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)]'
          }`} />
      </div>

      {/* HUD Content */}
      <div className={`w-full h-full flex flex-col justify-between p-4 md:p-12 transition-transform duration-300 ${hudMode === HUDMode.MIRROR ? 'hud-mirror' :
        hudMode === HUDMode.FLIPPED ? 'hud-mirror-flipped' : ''
        }`}>



        {/* Mid: Speed */}
        <div className="relative flex flex-col items-center justify-center flex-1">
          <div className="flex flex-col md:grid md:grid-cols-3 items-center w-full relative">

            {/* Left Stat (Range) - Only on MD+ */}
            <div className="hidden md:flex justify-start pl-4 lg:pl-12">
              <div className="flex flex-col items-center justify-center w-48 text-center shrink-0">
                <span className={`text-6xl lg:text-8xl font-black transition-colors duration-500 ${displayData.range <= 25 ? 'text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.8)]' : 'text-gray-200 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]'}`}>
                  {Math.round(convertValue(displayData.range))}
                </span>
                <span className="text-xl lg:text-2xl font-bold text-cyan-300 uppercase tracking-widest">{distUnit}</span>
              </div>
            </div>

            {/* Speed (central element) */}
            <div className="flex flex-col items-center justify-center text-white w-full">
              <div className="flex flex-col items-center">
                <span className="text-[10rem] md:text-[14rem] lg:text-[20rem] leading-none font-black tabular-nums tracking-tight drop-shadow-[0_0_30px_rgba(255,255,255,0.5)]">
                  {Math.round(convertValue(displayData.speed))}
                </span>
                <span className="text-2xl md:text-3xl font-bold text-cyan-300 uppercase tracking-widest -mt-4 md:-mt-8 drop-shadow-[0_0_8px_rgba(103,232,249,0.5)]">{speedUnit}</span>
              </div>
            </div>

            {/* Right Stat (Gear & Power Bar) - Only on MD+ */}
            <div className="hidden md:flex justify-end pr-4 lg:pr-12">
              <div className="flex items-center justify-center gap-6 shrink-0">
                {/* Gear Indicator */}
                <div className="text-6xl lg:text-8xl font-black text-white italic tracking-tighter w-28 lg:w-32 text-center bg-white/5 px-4 py-2 rounded-2xl border border-white/10">
                  {displayData.gear || 'P'}
                </div>

                {/* Vertical Power Bar (Landscape only) */}
                <div className="w-4 h-32 md:h-48 bg-gray-900/60 rounded-full overflow-hidden relative border border-white/10 shrink-0">
                  <div className="absolute top-1/2 left-0 right-0 h-1 bg-white/30 z-10"></div>
                  <div
                    className={`absolute left-0 right-0 transition-all duration-300 ${displayData.power < 0 ? 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.6)]' : 'bg-orange-600 shadow-[0_0_15px_rgba(249,115,22,0.6)]'}`}
                    style={{
                      top: displayData.power > 0 ? `${50 - (displayData.power / 300) * 50}%` : '50%',
                      bottom: displayData.power < 0 ? `${50 + (displayData.power / 60) * 50}%` : '50%'
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="w-[66%] md:hidden max-w-3xl h-4 bg-gray-900/60 rounded-full mt-6 overflow-hidden relative border border-white/10 shrink-0">
            <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-white/30 z-10"></div>
            <div className={`absolute top-0 bottom-0 transition-all duration-300 ${displayData.power < 0 ? 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.6)]' : 'bg-orange-600 shadow-[0_0_15px_rgba(249,115,22,0.6)]'}`} style={{ left: displayData.power < 0 ? `${50 + (displayData.power / 60) * 50}%` : '50%', right: displayData.power > 0 ? `${50 - (displayData.power / 300) * 50}%` : '50%' }} />
          </div>

          {/* Portrait-only Row: Gear & Range */}
          <div className="flex md:hidden w-full justify-between items-center px-12 mt-6 shrink-0">
            <div className="text-4xl font-black text-white italic tracking-tighter bg-white/5 px-5 py-2 rounded-2xl border border-white/10 backdrop-blur-sm">
              {displayData.gear || 'P'}
            </div>
            <div className="flex flex-col items-center drop-shadow-[0_0_10px_rgba(0,0,0,0.5)]">
              <span className={`text-5xl font-black transition-colors duration-500 ${displayData.range <= 25 ? 'text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]' : 'text-gray-200'}`}>
                {Math.round(convertValue(displayData.range))}
              </span>
              <span className="text-xs font-bold text-cyan-300 uppercase -mt-1">{distUnit}</span>
            </div>
          </div>

          {/* Nav Overview (Portrait only, to prevent center jump in landscape) */}
          {(displayData.destination || displayData.activeRoute) && (
            <div className="mt-6 md:hidden w-full flex flex-col items-center justify-center z-20 pointer-events-none shrink-0 relative">
              <div className="animate-in fade-in slide-in-from-top duration-700 flex flex-col items-center justify-center">
                <div className="flex flex-wrap items-center justify-center gap-x-4 md:gap-x-12 gap-y-2 text-gray-200 drop-shadow-[0_0_8px_rgba(255,255,255,0.4)] bg-black/20 backdrop-blur-sm px-4 md:px-6 py-2 rounded-full border border-white/5 mx-4 text-center">
                  <div className="flex items-center gap-2 md:gap-4 shrink-0">
                    <Clock className="w-5 h-5 md:w-8 md:h-8 text-cyan-300" />
                    <span className="text-lg md:text-3xl font-bold">ETA: {formatTime(displayData.estArrivalTime)}</span>
                  </div>

                  {displayData.timeToArrival > 0 && (
                    <div className="flex items-center gap-2 md:gap-4 shrink-0">
                      <span className="text-gray-500 text-xl font-black hidden md:block">•</span>
                      <span className="text-lg md:text-3xl font-bold">{Math.round(displayData.timeToArrival)}</span>
                      <span className="text-base md:text-xl font-bold text-cyan-200 md:ml-0 -ml-1">min</span>
                    </div>
                  )}

                  {displayData.activeRoute?.miles_to_arrival && (
                    <div className="flex items-center gap-2 md:gap-4 shrink-0">
                      <span className="text-gray-500 text-xl font-black hidden md:block">•</span>
                      <Navigation className="w-5 h-5 md:w-8 md:h-8 text-cyan-300 rotate-45" />
                      <span className="text-lg md:text-3xl font-bold">
                        {Math.round(units === 'KM' ? displayData.activeRoute.miles_to_arrival * 1.60934 : displayData.activeRoute.miles_to_arrival)}
                      </span>
                      <span className="text-base md:text-xl font-bold text-cyan-200 md:ml-0 -ml-1">{distUnit}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom: Navigation (Landscape - Absolute to avoid layout shift) */}
        <div className="hidden md:flex absolute bottom-8 left-0 right-0 justify-center z-50 pointer-events-none">
          {(displayData.destination || displayData.activeRoute) && (
            <div className="animate-in fade-in slide-in-from-bottom duration-700">
              <div className="flex items-center justify-center gap-x-12 text-gray-200 drop-shadow-[0_0_8px_rgba(255,255,255,0.4)] bg-black/40 backdrop-blur-md px-10 py-3 rounded-full border border-white/10 text-center">
                <div className="flex items-center gap-4 shrink-0">
                  <Clock className="w-8 h-8 text-cyan-300" />
                  <span className="text-3xl font-bold">ETA: {formatTime(displayData.estArrivalTime)}</span>
                </div>

                {displayData.timeToArrival > 0 && (
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="text-gray-500 text-xl font-black">•</span>
                    <span className="text-3xl font-bold">{Math.round(displayData.timeToArrival)}</span>
                    <span className="text-xl font-bold text-cyan-200">min</span>
                  </div>
                )}

                {displayData.activeRoute?.miles_to_arrival && (
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="text-gray-500 text-xl font-black">•</span>
                    <Navigation className="w-8 h-8 text-cyan-300 rotate-45" />
                    <span className="text-3xl font-bold">
                      {Math.round(units === 'KM' ? displayData.activeRoute.miles_to_arrival * 1.60934 : displayData.activeRoute.miles_to_arrival)}
                    </span>
                    <span className="text-xl font-bold text-cyan-200">{distUnit}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>



      {/* Settings (Discrete) - out of mirror div */}
      {!isFullscreen && (
        <div className="absolute bottom-4 right-4 z-[90] flex gap-4 opacity-100 hover:opacity-100 transition-opacity">
          <button onClick={() => setShowSettings(true)} className="p-4 bg-gray-900 rounded-full text-white hover:bg-gray-800"><Settings size={24} /></button>
          <button onClick={cycleHudMode} className="p-4 bg-gray-900 rounded-full text-white hover:bg-gray-800"><FlipHorizontal size={24} /></button>
          <button onClick={toggleFullscreen} className="p-4 bg-gray-900 rounded-full text-white hover:bg-gray-800">{isFullscreen ? <Minimize2 size={24} /> : <Maximize2 size={24} />}</button>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] bg-gray-950 flex flex-col text-white animate-in zoom-in-95 duration-200 cursor-default">
          <div className="flex-1 overflow-y-auto px-6 py-8 md:px-12 md:py-12 hide-scrollbar">
            <div className="max-w-4xl mx-auto flex flex-col min-h-full">

              <div className="mb-8 md:mb-12 shrink-0">
                <h2 className="text-3xl md:text-5xl font-black tracking-tight text-white mb-2">Settings</h2>
                <p className="text-gray-400 font-medium text-sm md:text-base">Configure display and data connection preferences.</p>
              </div>

              <form onSubmit={handleRelink} className="flex flex-col flex-1 space-y-6 md:space-y-8">

                <div className="flex flex-col gap-3 shrink-0">
                  <span className="text-gray-500 font-bold uppercase tracking-widest text-xs md:text-sm">Measurement Units</span>
                  <div className="flex gap-2 p-1.5 bg-gray-900 rounded-xl border border-gray-800 shadow-inner">
                    <button
                      type="button"
                      onClick={() => { setUnits('KM'); localStorage.setItem('hud_units', 'KM'); }}
                      className={`flex-1 py-2.5 md:py-4 rounded-lg font-bold text-xs md:text-base transition-all ${units === 'KM' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'text-gray-400 hover:text-white'}`}
                    >
                      KILOMETERS (KM)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setUnits('MI'); localStorage.setItem('hud_units', 'MI'); }}
                      className={`flex-1 py-2.5 md:py-4 rounded-lg font-bold text-xs md:text-base transition-all ${units === 'MI' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'text-gray-400 hover:text-white'}`}
                    >
                      MILES (MPH/MI)
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-3 shrink-0">
                  <span className="text-gray-500 font-bold uppercase tracking-widest text-xs md:text-sm">Testing & Simulation</span>
                  <button
                    type="button"
                    onClick={isDemo ? stopDemo : startDemo}
                    className={`w-full py-2.5 md:py-4 rounded-xl font-bold text-xs md:text-base transition-all border ${isDemo ? 'bg-red-600/20 text-red-500 border-red-500/50 hover:bg-red-600/30 shadow-[0_0_10px_rgba(239,68,68,0.2)]' : 'bg-indigo-600/20 text-indigo-400 border-indigo-500/50 hover:bg-indigo-600/30'}`}
                  >
                    {isDemo ? 'STOP DEMO SEQUENCE' : 'START DEMO SEQUENCE'}
                  </button>
                </div>

                <div className="flex flex-col gap-3 flex-1">
                  <span className="text-gray-500 font-bold uppercase tracking-widest text-xs md:text-sm flex items-center gap-2">
                    <Terminal size={14} className="md:w-4 md:h-4" /> Link Status
                  </span>
                  <div className="bg-gray-900 rounded-2xl p-4 md:p-6 border border-gray-800 shadow-inner flex flex-col h-48 md:h-auto md:flex-1 overflow-y-auto font-mono text-xs md:text-sm">
                    {debugLogs.length === 0 && <div className="text-gray-600 italic">No connection established yet...</div>}
                    {debugLogs.map((log, i) => (
                      <div key={i} className={`mb-2 md:mb-3 ${log.includes('✅') ? 'text-green-400' : log.includes('❌') ? 'text-red-400' : 'text-gray-400'}`}>
                        {log}
                      </div>
                    ))}
                    <div ref={logEndRef} />
                  </div>
                </div>

                <div className="pt-4 md:pt-8 flex gap-3 md:gap-6 pb-4 md:pb-8 shrink-0 mt-auto">
                  <button type="button" onClick={() => setShowSettings(false)} className="flex-1 py-3 md:py-5 bg-gray-800 rounded-xl font-bold text-sm md:text-lg text-gray-300 hover:bg-gray-700 hover:text-white transition-all">DISMISS</button>
                  <button type="submit" className="flex-1 py-3 md:py-5 bg-blue-600 rounded-xl font-bold text-sm md:text-lg text-white hover:bg-blue-500 shadow-md shadow-blue-600/20 active:scale-95 transition-all outline-none">RE-LINK DATA FEED</button>
                </div>

              </form>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}

import React from 'react';
import { PolarisAppState } from '../../types/state';
import { polarisStore } from '../../store/polarisStore';

interface HeaderProps {
  state: PolarisAppState;
  onOpenEventLog: () => void;
  onOpenDemoDirector: () => void;
}

export const Header: React.FC<HeaderProps> = ({ state, onOpenEventLog, onOpenDemoDirector }) => {
  const isOffline = state.offlineMode;

  return (
    <header className="w-full flex flex-col border-b border-slate-800 bg-[#080D18] select-none">
      {isOffline && (
        <div className="offline-banner">
          <svg className="w-4 h-4 inline-block animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          OFFLINE MODE ACTIVE — USING LAST VERIFIED ANTARCTIC ENVIRONMENTAL SNAPSHOT (12:40 UTC) — SATELLITE FEEDS DISCONNECTED
        </div>
      )}

      <div className="px-5 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-sky-500 to-cyan-700 flex items-center justify-center border border-sky-400/30 shadow-[0_0_12px_rgba(56,189,248,0.3)]">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold tracking-wider text-white">POLARIS</h1>
              <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-sky-950 text-sky-400 border border-sky-600/40">PROTOTYPE v2.4</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium tracking-tight">Intelligent Antarctic Navigation Co-Pilot</p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-6 text-xs">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Telemetry Link</span>
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-semibold ${isOffline ? 'text-amber-400 bg-amber-950/80 border-amber-500/40' : 'text-emerald-400 bg-emerald-950/80 border-emerald-500/40'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isOffline ? 'bg-amber-400' : 'bg-emerald-400 animate-ping'}`}></span>
              {isOffline ? 'OFFLINE (CACHED)' : 'CONNECTED (SAT-LINK)'}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">AI Drift Engine</span>
            <button
              onClick={() => polarisStore.syncAllIcebergsWithGRUModel()}
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-semibold transition-all ${
                state.aiModelStatus === 'ONLINE'
                  ? 'text-cyan-300 bg-cyan-950/80 border-cyan-500/40 hover:bg-cyan-900/60 shadow-[0_0_8px_rgba(6,182,212,0.3)]'
                  : state.aiModelStatus === 'CONNECTING'
                  ? 'text-amber-300 bg-amber-950/80 border-amber-500/40'
                  : 'text-rose-400 bg-rose-950/80 border-rose-500/40 hover:bg-rose-900/60'
              }`}
              title="Trained GRU Sequential Neural Model. Click to sync."
            >
              <span className={`w-1.5 h-1.5 rounded-full ${
                state.aiModelStatus === 'ONLINE'
                  ? 'bg-cyan-400 animate-pulse'
                  : state.aiModelStatus === 'CONNECTING'
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-rose-500'
              }`}></span>
              {state.aiModelStatus === 'ONLINE' ? 'GRU MODEL: ACTIVE' : state.aiModelStatus === 'CONNECTING' ? 'CONNECTING...' : 'GRU: OFFLINE'}
            </button>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Sea Ice AI</span>
            <button
              onClick={() => polarisStore.syncSeaIceForecast()}
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-semibold transition-all ${
                state.seaIceModelStatus === 'ONLINE'
                  ? 'text-teal-300 bg-teal-950/80 border-teal-500/40 hover:bg-teal-900/60 shadow-[0_0_8px_rgba(20,184,166,0.3)]'
                  : state.seaIceModelStatus === 'CONNECTING'
                  ? 'text-amber-300 bg-amber-950/80 border-amber-500/40'
                  : 'text-rose-400 bg-rose-950/80 border-rose-500/40 hover:bg-rose-900/60'
              }`}
              title="Trained ConvLSTM Spatiotemporal Sea-Ice Model. Click to sync."
            >
              <span className={`w-1.5 h-1.5 rounded-full ${
                state.seaIceModelStatus === 'ONLINE'
                  ? 'bg-teal-400 animate-pulse'
                  : state.seaIceModelStatus === 'CONNECTING'
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-rose-500'
              }`}></span>
              {state.seaIceModelStatus === 'ONLINE' ? 'CONVLSTM: ACTIVE' : state.seaIceModelStatus === 'CONNECTING' ? 'CONNECTING...' : 'CONVLSTM: OFFLINE'}
            </button>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Weather AI</span>
            <button
              onClick={() => polarisStore.syncWeatherForecast()}
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-semibold transition-all ${
                state.weatherModelStatus === 'ONLINE'
                  ? 'text-purple-300 bg-purple-950/80 border-purple-500/40 hover:bg-purple-900/60 shadow-[0_0_8px_rgba(168,85,247,0.3)]'
                  : state.weatherModelStatus === 'CONNECTING'
                  ? 'text-amber-300 bg-amber-950/80 border-amber-500/40'
                  : 'text-rose-400 bg-rose-950/80 border-rose-500/40 hover:bg-rose-900/60'
              }`}
              title="Trained PyTorch Weather Risk MLP Engine. Click to sync."
            >
              <span className={`w-1.5 h-1.5 rounded-full ${
                state.weatherModelStatus === 'ONLINE'
                  ? 'bg-purple-400 animate-pulse'
                  : state.weatherModelStatus === 'CONNECTING'
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-rose-500'
              }`}></span>
              {state.weatherModelStatus === 'ONLINE' ? 'WEATHER MLP: ACTIVE' : state.weatherModelStatus === 'CONNECTING' ? 'CONNECTING...' : 'WEATHER: OFFLINE'}
            </button>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Environmental Data</span>
            <span className={`font-mono text-[11px] font-medium ${isOffline ? 'text-amber-400' : 'text-cyan-400'}`}>
              {isOffline ? 'CACHED (12:40 UTC)' : 'GOOD (12 MIN AGO)'}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Simulation Offset</span>
            <span className="font-mono text-[11px] text-sky-400 font-bold">+{state.simulationTimeHours}h 00m</span>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">System UTC Clock</span>
            <span className="font-mono text-[11px] text-slate-200 font-semibold">{new Date().toISOString().substring(11, 19)} UTC</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => polarisStore.togglePresentationMode()}
            className={`btn-secondary !py-1 !px-2.5 text-xs ${state.presentationMode ? 'border-sky-400 text-sky-300' : ''}`}
            title="Toggle SIH Presentation HUD"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            {state.presentationMode ? 'HUD Active' : 'Presentation Mode'}
          </button>

          <button onClick={onOpenEventLog} className="btn-secondary !py-1 !px-2.5 text-xs" title="View Operational Event Log">
            <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Audit Log ({state.eventLog.length})
          </button>

          <button
            onClick={onOpenDemoDirector}
            className="btn-primary !py-1 !px-3 text-xs bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 border-amber-500/40 text-amber-100"
            title="SIH Presentation Controller"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/></svg>
            Demo Director
          </button>

          <button onClick={() => polarisStore.logout()} className="btn-secondary !py-1 !px-2 text-slate-400 hover:text-rose-400" title="Sign Out">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
          </button>
        </div>
      </div>

      <div className="w-full bg-[#050912] border-t border-slate-800/80 px-5 py-1 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
          <span className="font-medium text-slate-300">Operational Rule:</span>
          <span className="text-sky-300 font-semibold tracking-wide">AI recommends; Captain / Ice Navigator makes the final operational decision.</span>
        </div>
        <div className="text-[10px] text-slate-500 hidden sm:block">
          Vessel: <span className="text-slate-300 font-medium">{state.vessel.name}</span> ({state.vessel.iceClass}) | Safe SIC Limit: <span className="text-slate-300 font-medium">{state.vessel.safeSicThresholdPercent}%</span> | Iceberg Buffer: <span className="text-slate-300 font-medium">{state.vessel.icebergSafetyBufferKm} km</span>
        </div>
      </div>
    </header>
  );
};

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
    <header className="w-full flex flex-col bg-[#0E2360] text-white border-b border-[#152E75] select-none shadow-md">
      {isOffline && (
        <div className="w-full bg-[#D89B2B] text-slate-900 px-4 py-1 text-xs font-bold flex items-center justify-center gap-2 border-b border-amber-600">
          <svg className="w-4 h-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          OFFLINE MISSION MODE — USING VERIFIED ANTARCTIC ENVIRONMENTAL SNAPSHOT (12:40 UTC)
        </div>
      )}

      <div className="px-5 py-2.5 flex items-center justify-between">
        {/* LEFT: Branding */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#415BB1] flex items-center justify-center border border-[#7097D2]/40 shadow-sm">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black tracking-wider text-white">POLARIS</h1>
              <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-[#415BB1]/40 text-[#D7E8FD] border border-[#7097D2]/40">PROTOTYPE</span>
            </div>
            <p className="text-[11px] text-[#D7E8FD] font-medium tracking-tight">Predictive Ocean–Ice Learning for Antarctic Route Intelligence and Safety</p>
          </div>
        </div>

        {/* CENTER: Engine & Data Status */}
        <div className="hidden lg:flex items-center gap-5 text-xs">
          <div className="flex flex-col items-center">
            <span className="text-[9px] text-[#7097D2] font-semibold uppercase tracking-wider">GRU Drift</span>
            <button
              onClick={() => polarisStore.syncAllIcebergsWithGRUModel()}
              className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-colors ${
                state.aiModelStatus === 'ONLINE'
                  ? 'bg-[#1F9D73]/20 text-[#6EE7B7] border-[#1F9D73]/50'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              }`}
              title="GRU Iceberg Drift Engine"
            >
              GRU ACTIVE
            </button>
          </div>

          <div className="flex flex-col items-center">
            <span className="text-[9px] text-[#7097D2] font-semibold uppercase tracking-wider">ConvLSTM Ice</span>
            <button
              onClick={() => polarisStore.syncSeaIceForecast()}
              className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-colors ${
                state.seaIceModelStatus === 'ONLINE'
                  ? 'bg-[#1F9D73]/20 text-[#6EE7B7] border-[#1F9D73]/50'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              }`}
              title="ConvLSTM Sea-Ice Forecasting Model"
            >
              CONVLSTM ACTIVE
            </button>
          </div>

          <div className="flex flex-col items-center">
            <span className="text-[9px] text-[#7097D2] font-semibold uppercase tracking-wider">Weather MLP</span>
            <button
              onClick={() => polarisStore.syncWeatherForecast()}
              className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-colors ${
                state.weatherModelStatus === 'ONLINE'
                  ? 'bg-[#1F9D73]/20 text-[#6EE7B7] border-[#1F9D73]/50'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              }`}
              title="PyTorch Weather Risk MLP Engine"
            >
              WEATHER MLP ACTIVE
            </button>
          </div>

          <div className="flex flex-col items-center">
            <span className="text-[9px] text-[#7097D2] font-semibold uppercase tracking-wider">Data Age</span>
            <span className="font-mono text-[11px] font-semibold text-[#D7E8FD]">
              {isOffline ? '12h CACHED' : '12m AGO'}
            </span>
          </div>

          <div className="flex flex-col items-center">
            <span className="text-[9px] text-[#7097D2] font-semibold uppercase tracking-wider">UTC Time</span>
            <span className="font-mono text-[11px] font-semibold text-white">
              {new Date().toISOString().substring(11, 19)} UTC
            </span>
          </div>
        </div>

        {/* RIGHT: System Mode & Controls */}
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-md border text-xs font-bold flex items-center gap-1.5 ${
            isOffline ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-[#1F9D73]/20 text-[#6EE7B7] border-[#1F9D73]/40'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isOffline ? 'bg-amber-400' : 'bg-[#1F9D73] animate-pulse'}`}></span>
            {isOffline ? 'OFFLINE MISSION' : 'CONNECTED'}
          </span>

          <button onClick={onOpenEventLog} className="px-2.5 py-1 rounded-md bg-[#152E75] hover:bg-[#415BB1] text-xs font-semibold text-[#D7E8FD] transition-colors border border-[#7097D2]/30 flex items-center gap-1">
            <svg className="w-3.5 h-3.5 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Audit Log ({state.eventLog.length})
          </button>

          <button onClick={onOpenDemoDirector} className="px-2.5 py-1 rounded-md bg-[#D89B2B] hover:bg-amber-600 text-xs font-bold text-slate-900 transition-colors shadow-sm flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/></svg>
            Demo Director
          </button>

          <button onClick={() => polarisStore.logout()} className="p-1.5 rounded-md hover:bg-rose-500/20 text-[#D7E8FD] hover:text-rose-300 transition-colors" title="Sign Out">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
          </button>
        </div>
      </div>
    </header>
  );
};


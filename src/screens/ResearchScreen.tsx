import React from 'react';
import { PolarisAppState } from '../types/state';
import { polarisStore } from '../store/polarisStore';
import { formatCoordinates } from '../utils/formatters';

interface ResearchScreenProps {
  state: PolarisAppState;
}

export const ResearchScreen: React.FC<ResearchScreenProps> = ({ state }) => {
  return (
    <div className="flex-1 w-full bg-[#060B14] p-6 flex flex-col gap-5 overflow-y-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white tracking-wider">ANTARCTIC RESEARCH OPERATIONS</h2>
            <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-amber-950 text-amber-400 border border-amber-500/40">INDIAN ANTARCTIC PROGRAM FOCUS</span>
          </div>
          <p className="text-xs text-slate-400">Bharati &amp; Maitri Research Station Corridors &bull; Oceanographic Sampling Sites</p>
        </div>
        <button onClick={() => polarisStore.setScreen('VOYAGE_PLANNER')} className="btn-primary !py-2 text-xs">
          Plan Scientific Transit &rarr;
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {state.researchStations.map((st) => (
          <div key={st.id} className={`glass-panel p-4 rounded-xl border ${st.country === 'India' ? 'border-amber-500/50 bg-amber-950/15' : 'border-slate-800'} flex flex-col gap-2.5`}>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${st.country === 'India' ? 'text-amber-400' : 'text-slate-400'}`}>{st.operator}</span>
              <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${st.accessRiskLevel === 'SAFE' ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' : 'bg-amber-950 text-amber-400 border border-amber-500/30'}`}>{st.accessRiskLevel} ACCESS</span>
            </div>
            <h3 className="text-sm font-bold text-white">{st.name} ({st.country})</h3>
            <div className="flex flex-col gap-1 text-[11px] text-slate-300 p-2.5 rounded-lg bg-black/40">
              <div className="flex justify-between"><span>Position:</span><strong className="font-mono text-slate-200">{formatCoordinates(st.position)}</strong></div>
              <div className="flex justify-between"><span>Elevation:</span><strong className="font-mono text-slate-200">{st.elevationMeters} m</strong></div>
              <div className="flex justify-between"><span>Type:</span><strong className="font-mono text-cyan-300">{st.type}</strong></div>
              <div className="flex justify-between"><span>Stability:</span><strong className="font-mono text-emerald-400">{st.environmentalStabilityPercent}%</strong></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

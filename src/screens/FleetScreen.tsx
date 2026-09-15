import React from 'react';
import { PolarisAppState } from '../types/state';
import { polarisStore } from '../store/polarisStore';
import { formatCoordinates } from '../utils/formatters';

interface FleetScreenProps {
  state: PolarisAppState;
}

export const FleetScreen: React.FC<FleetScreenProps> = ({ state }) => {
  return (
    <div className="flex-1 w-full bg-[#060B14] p-6 flex flex-col gap-5 overflow-y-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white tracking-wider">DEMONSTRATION FLEET MANAGEMENT</h2>
            <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-sky-950 text-sky-400 border border-sky-600/40">{state.fleet.length} VESSELS ACTIVE</span>
          </div>
          <p className="text-xs text-slate-400">Antarctic Research, Logistics &amp; Hydrographic Patrol Corridors</p>
        </div>
        <button onClick={() => polarisStore.setScreen('DECISION_CENTER')} className="btn-primary !py-2 text-xs">
          Open Live Decision Center &rarr;
        </button>
      </div>

      <div className="glass-panel rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-900/90 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">
            <tr>
              <th className="p-3.5">Vessel Name</th>
              <th className="p-3.5">Polar Ice Class</th>
              <th className="p-3.5">Coordinates</th>
              <th className="p-3.5">Destination</th>
              <th className="p-3.5">Risk Index</th>
              <th className="p-3.5">Transit ETA</th>
              <th className="p-3.5">Fuel Rem.</th>
              <th className="p-3.5">Satellite</th>
              <th className="p-3.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {state.fleet.map((v) => (
              <tr key={v.id} className={`hover:bg-slate-800/40 transition-colors ${v.id === 'FLEET-01' ? 'bg-sky-950/20' : ''}`}>
                <td className="p-3.5 font-bold text-white flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${v.id === 'FLEET-01' ? 'bg-cyan-400 animate-ping' : 'bg-slate-500'}`}></span>
                  {v.name}
                </td>
                <td className="p-3.5 font-mono font-semibold text-emerald-400">{v.iceClass}</td>
                <td className="p-3.5 font-mono text-[11px] text-slate-400">{formatCoordinates(v.currentPosition)}</td>
                <td className="p-3.5 text-slate-200">{v.destination}</td>
                <td className={`p-3.5 font-mono font-bold ${v.riskIndex > 50 ? 'text-amber-400' : 'text-emerald-400'}`}>{v.riskIndex}/100</td>
                <td className="p-3.5 font-mono text-slate-300">{v.etaFormatted}</td>
                <td className="p-3.5 font-mono text-slate-300">{v.fuelRemainingPercent}%</td>
                <td className="p-3.5">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${v.satelliteStatus === 'CONNECTED' ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' : 'bg-amber-950 text-amber-400 border border-amber-500/30'}`}>
                    {v.satelliteStatus}
                  </span>
                </td>
                <td className="p-3.5">
                  <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-900 text-slate-300 border border-slate-700">{v.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

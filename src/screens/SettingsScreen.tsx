import React from 'react';
import { PolarisAppState } from '../types/state';
import { ModelTransparency } from '../components/common/ModelTransparency';

interface SettingsScreenProps {
  state: PolarisAppState;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ state }) => {
  return (
    <div className="flex-1 w-full bg-[#060B14] p-6 flex flex-col gap-6 overflow-y-auto text-xs text-slate-300">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-white tracking-wider">SYSTEM CONFIGURATION &amp; PARAMETERS</h2>
          <p className="text-xs text-slate-400">Vessel Safety Envelope, Risk Model Weights &amp; Prototype Telemetry</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-panel p-5 rounded-xl border border-slate-800 flex flex-col gap-4">
          <span className="text-xs font-bold text-sky-400 uppercase tracking-wider">Vessel Profile &amp; Hard Safety Limits</span>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1"><label className="text-[11px] text-slate-400">Vessel Name</label><input type="text" value={state.vessel.name} className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono" readOnly /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1"><label className="text-[11px] text-slate-400">Safe SIC (%)</label><input type="number" value={state.vessel.safeSicThresholdPercent} className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono" readOnly /></div>
              <div className="flex flex-col gap-1"><label className="text-[11px] text-slate-400">Iceberg Buffer (km)</label><input type="number" value={state.vessel.icebergSafetyBufferKm} className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono" readOnly /></div>
              <div className="flex flex-col gap-1"><label className="text-[11px] text-slate-400">Max Wave (m)</label><input type="number" value={state.vessel.maxSafeWaveHeightMeters} className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono" readOnly /></div>
              <div className="flex flex-col gap-1"><label className="text-[11px] text-slate-400">Safety Depth Margin (m)</label><input type="number" value={state.vessel.safetyDepthMarginMeters} className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono" readOnly /></div>
            </div>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-xl border border-slate-800 flex flex-col gap-4">
          <span className="text-xs font-bold text-sky-400 uppercase tracking-wider">Spatiotemporal Risk Engine Weights</span>
          <div className="flex flex-col gap-2.5">
            <div className="flex justify-between items-center text-[11px]"><span className="text-slate-300">Sea-Ice Risk Weight:</span><strong className="text-sky-400 font-mono">{state.riskWeights.seaIceWeight.toFixed(2)} (35%)</strong></div>
            <div className="flex justify-between items-center text-[11px]"><span className="text-slate-300">Iceberg Drift &amp; Uncertainty:</span><strong className="text-sky-400 font-mono">{state.riskWeights.icebergWeight.toFixed(2)} (30%)</strong></div>
            <div className="flex justify-between items-center text-[11px]"><span className="text-slate-300">Wave &amp; Swell Risk:</span><strong className="text-sky-400 font-mono">{state.riskWeights.waveWeight.toFixed(2)} (15%)</strong></div>
            <div className="flex justify-between items-center text-[11px]"><span className="text-slate-300">Wind Risk:</span><strong className="text-sky-400 font-mono">{state.riskWeights.windWeight.toFixed(2)} (10%)</strong></div>
            <div className="flex justify-between items-center text-[11px]"><span className="text-slate-300">Current Vector Risk:</span><strong className="text-sky-400 font-mono">{state.riskWeights.currentWeight.toFixed(2)} (5%)</strong></div>
            <div className="flex justify-between items-center text-[11px]"><span className="text-slate-300">Temporal Horizon Uncertainty:</span><strong className="text-sky-400 font-mono">{state.riskWeights.uncertaintyWeight.toFixed(2)} (5%)</strong></div>
          </div>
        </div>
      </div>

      <ModelTransparency />
    </div>
  );
};

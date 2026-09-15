import React from 'react';
import { Route, VesselProfile } from '../../types/domain';

interface WhyNotShortestModalProps {
  shortestRoute: Route | undefined;
  vessel: VesselProfile;
  isOpen: boolean;
  onClose: () => void;
}

export const WhyNotShortestModal: React.FC<WhyNotShortestModalProps> = ({
  shortestRoute,
  vessel,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !shortestRoute) return null;

  const m = shortestRoute.metrics;
  const rej = shortestRoute.rejectionDetails;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel w-full max-w-2xl bg-[#09111E] border-2 border-rose-500/80 rounded-2xl shadow-[0_0_50px_rgba(239,68,68,0.35)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-rose-950 to-slate-900 border-b border-rose-500/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-950 flex items-center justify-center border border-rose-500/50">
              <svg className="w-5 h-5 text-rose-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-white tracking-widest uppercase">
                WHY NOT THE SHORTEST ROUTE?
              </h2>
              <p className="text-[11px] text-rose-300">
                Deterministic Constraint Rejection Analysis &bull; POLARIS Safety Core
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl font-bold">&times;</button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-4 text-xs overflow-y-auto max-h-[75vh]">
          {/* Status banner */}
          <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/40 flex flex-col gap-1 text-rose-100">
            <div className="flex items-center justify-between">
              <span className="font-bold text-rose-300 uppercase tracking-wider text-[11px]">Primary Rejection Reason</span>
              <span className="px-2 py-0.5 text-[9px] font-extrabold rounded bg-rose-900 text-rose-200 border border-rose-500/50">
                HARD SAFETY VIOLATION
              </span>
            </div>
            <p className="text-xs leading-relaxed font-medium mt-1">
              {rej?.primaryReason || shortestRoute.dynamicExplanation}
            </p>
          </div>

          {/* Actual Simulated Route Measurements */}
          <div className="glass-panel p-4 rounded-xl border border-slate-800 flex flex-col gap-2.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Simulated Route Physical Telemetry (Arrival-Time Evaluated)
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[11px]">
              <div className="p-2.5 rounded bg-slate-950/80 border border-slate-800">
                <span className="text-slate-500 block text-[9px]">TOTAL DISTANCE</span>
                <strong className="text-white font-mono text-xs">{m.totalDistanceNm} nm</strong>
              </div>
              <div className="p-2.5 rounded bg-slate-950/80 border border-slate-800">
                <span className="text-slate-500 block text-[9px]">ESTIMATED ETA</span>
                <strong className="text-white font-mono text-xs">{m.estimatedTransitFormatted}</strong>
              </div>
              <div className="p-2.5 rounded bg-slate-950/80 border border-rose-500/40 bg-rose-950/20">
                <span className="text-rose-400 block text-[9px]">MAX RISK INDEX</span>
                <strong className="text-rose-400 font-mono text-xs">{m.maxRisk} / 100</strong>
              </div>
              <div className="p-2.5 rounded bg-slate-950/80 border border-rose-500/40 bg-rose-950/20">
                <span className="text-rose-400 block text-[9px]">MAX SEA-ICE (SIC)</span>
                <strong className="text-rose-400 font-mono text-xs">{m.maxSicPercent}%</strong>
              </div>
              <div className="p-2.5 rounded bg-slate-950/80 border border-rose-500/40 bg-rose-950/20">
                <span className="text-rose-400 block text-[9px]">MIN B-22 CLEARANCE</span>
                <strong className="text-rose-400 font-mono text-xs">{m.minIcebergClearanceKm} km</strong>
              </div>
              <div className="p-2.5 rounded bg-slate-950/80 border border-rose-500/40 bg-rose-950/20">
                <span className="text-rose-400 block text-[9px]">CRITICAL NO-GO CELLS</span>
                <strong className="text-rose-400 font-mono text-xs">{m.criticalCellsCount} Waypoints</strong>
              </div>
              <div className="p-2.5 rounded bg-slate-950/80 border border-amber-500/40 bg-amber-950/20">
                <span className="text-amber-400 block text-[9px]">HIGH-RISK CELLS</span>
                <strong className="text-amber-400 font-mono text-xs">{m.highRiskCellsCount} Waypoints</strong>
              </div>
              <div className="p-2.5 rounded bg-slate-950/80 border border-slate-800">
                <span className="text-slate-500 block text-[9px]">WAVE EXPOSURE</span>
                <strong className="text-slate-300 font-mono text-xs">{m.waveExposureIndex} m avg</strong>
              </div>
            </div>
          </div>

          {/* Violated Thresholds Breakdown */}
          <div className="glass-panel p-4 rounded-xl border border-slate-800 flex flex-col gap-2">
            <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">
              Violated Vessel Operational Thresholds
            </span>
            <div className="flex flex-col gap-2 text-[11px]">
              <div className="p-2.5 rounded-lg bg-black/40 border border-rose-500/30 flex items-start gap-2.5">
                <span className="text-rose-400 font-bold">&times;</span>
                <div>
                  <strong className="text-white block">Iceberg B-22 Proximity &amp; Uncertainty Envelope Conflict:</strong>
                  <span className="text-slate-300">
                    Calculated minimum clearance is <strong className="text-rose-400 font-mono">{m.minIcebergClearanceKm} km</strong>, which severely violates the configured vessel safety buffer of <strong className="text-sky-400 font-mono">{vessel.icebergSafetyBufferKm} km</strong>.
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-black/40 border border-rose-500/30 flex items-start gap-2.5">
                <span className="text-rose-400 font-bold">&times;</span>
                <div>
                  <strong className="text-white block">Sea-Ice Concentration (SIC) Limit Breach:</strong>
                  <span className="text-slate-300">
                    Route intersects dense multi-year pack ice reaching <strong className="text-rose-400 font-mono">{m.maxSicPercent}% SIC</strong>, exceeding the vessel's configured polar threshold of <strong className="text-sky-400 font-mono">{vessel.safeSicThresholdPercent}% SIC</strong>.
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-black/40 border border-rose-500/30 flex items-start gap-2.5">
                <span className="text-rose-400 font-bold">&times;</span>
                <div>
                  <strong className="text-white block">Spatiotemporal Arrival Risk:</strong>
                  <span className="text-slate-300">
                    At estimated arrival time (+14.2h), the waypoint risk index surges to <strong className="text-rose-400 font-mono">{m.maxRisk}/100 (CRITICAL)</strong> due to concurrent iceberg drift compression.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-400 font-mono">Recommendation: Execute <strong>Safe Route A</strong> or <strong>Alternative Route B</strong></span>
          <button onClick={onClose} className="btn-secondary !py-1.5 text-xs">Close Explanation</button>
        </div>
      </div>
    </div>
  );
};

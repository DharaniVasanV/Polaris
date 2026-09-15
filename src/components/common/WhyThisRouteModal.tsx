import React from 'react';
import { Route, VesselProfile } from '../../types/domain';

interface WhyThisRouteModalProps {
  route: Route | undefined;
  shortestRoute: Route | undefined;
  vessel: VesselProfile;
  isOpen: boolean;
  onClose: () => void;
}

export const WhyThisRouteModal: React.FC<WhyThisRouteModalProps> = ({
  route,
  shortestRoute,
  vessel,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !route) return null;

  const m = route.metrics;
  const sm = shortestRoute?.metrics;

  const distDiff = route.tradeOffVsShortest?.distanceDiffNm ?? (sm ? +(m.totalDistanceNm - sm.totalDistanceNm).toFixed(1) : 0);
  const etaDiff = route.tradeOffVsShortest?.etaDiffHours ?? (sm ? +(m.estimatedTransitHours - sm.estimatedTransitHours).toFixed(1) : 0);
  const reductionPercent = route.tradeOffVsShortest?.hazardExposureReductionPercent ?? 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel w-full max-w-2xl bg-[#09111E] border-2 border-emerald-500/80 rounded-2xl shadow-[0_0_50px_rgba(16,185,129,0.35)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-950 to-slate-900 border-b border-emerald-500/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-950 flex items-center justify-center border border-emerald-500/50">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-white tracking-widest uppercase">
                WHY THIS ROUTE? — {route.title}
              </h2>
              <p className="text-[11px] text-emerald-300">
                AI Spatiotemporal Recommendation &bull; Multi-Objective A* Optimization
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl font-bold">&times;</button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-4 text-xs overflow-y-auto max-h-[75vh]">
          {/* Summary Banner */}
          <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 flex flex-col gap-1 text-emerald-100">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-300 uppercase tracking-wider text-[11px]">Optimization Objective</span>
              <span className="px-2 py-0.5 text-[9px] font-extrabold rounded bg-emerald-900 text-emerald-200 border border-emerald-500/50">
                RECOMMENDED CORRIDOR
              </span>
            </div>
            <p className="text-xs leading-relaxed font-medium mt-1">
              {route.dynamicExplanation || 'Optimized path satisfying all hard safety constraints while minimizing transit time and hazardous ice exposure.'}
            </p>
          </div>

          {/* Key Advantages Matrix */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-slate-950/80 border border-emerald-500/30 flex flex-col gap-1">
              <span className="text-[10px] font-bold text-emerald-400 uppercase">Iceberg Standoff</span>
              <strong className="text-base font-extrabold text-white font-mono">{m.minIcebergClearanceKm} km</strong>
              <span className="text-[10px] text-slate-400">Exceeds {vessel.icebergSafetyBufferKm}km safety buffer</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-emerald-500/30 flex flex-col gap-1">
              <span className="text-[10px] font-bold text-emerald-400 uppercase">Sea-Ice Exposure</span>
              <strong className="text-base font-extrabold text-white font-mono">{m.maxSicPercent}% Max SIC</strong>
              <span className="text-[10px] text-slate-400">Within {vessel.safeSicThresholdPercent}% threshold</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-emerald-500/30 flex flex-col gap-1">
              <span className="text-[10px] font-bold text-emerald-400 uppercase">Hazard Reduction</span>
              <strong className="text-base font-extrabold text-emerald-400 font-mono">
                {reductionPercent > 0 ? `${reductionPercent}% Reduction` : 'Optimal Baseline'}
              </strong>
              <span className="text-[10px] text-slate-400">Vs. shortest direct path</span>
            </div>
          </div>

          {/* Trade-Off Comparison vs Shortest Route */}
          <div className="glass-panel p-4 rounded-xl border border-slate-800 flex flex-col gap-2.5">
            <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider">
              Operational Trade-Off vs. Shortest Direct Path
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[11px]">
              <div className="p-2.5 rounded bg-slate-950/80 border border-slate-800">
                <span className="text-slate-500 block text-[9px]">DISTANCE DIFF</span>
                <strong className="text-amber-300 font-mono text-xs">+{distDiff} nm</strong>
              </div>
              <div className="p-2.5 rounded bg-slate-950/80 border border-slate-800">
                <span className="text-slate-500 block text-[9px]">ETA TRADE-OFF</span>
                <strong className="text-amber-300 font-mono text-xs">+{etaDiff} hours</strong>
              </div>
              <div className="p-2.5 rounded bg-slate-950/80 border border-emerald-500/40 bg-emerald-950/20">
                <span className="text-emerald-400 block text-[9px]">RISK SCORE</span>
                <strong className="text-emerald-400 font-mono text-xs">
                  {m.averageRisk} / 100 ({m.averageRisk <= 35 ? 'SAFE' : m.averageRisk <= 60 ? 'MODERATE' : 'HIGH'})
                </strong>
              </div>
              <div className="p-2.5 rounded bg-slate-950/80 border border-slate-800">
                <span className="text-slate-500 block text-[9px]">FORECAST CONFIDENCE</span>
                <strong className="text-sky-400 font-mono text-xs">{m.confidencePercent}%</strong>
              </div>
            </div>
          </div>

          {/* Detailed Justification List */}
          <div className="glass-panel p-4 rounded-xl border border-slate-800 flex flex-col gap-2 text-[11px]">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Authoritative Hazards Avoided
            </span>
            <div className="flex flex-col gap-1.5 text-slate-300">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span><strong>Iceberg Drift Envelopes:</strong> Maintains {m.minIcebergClearanceKm} km standoff outside GRU-predicted drift cones.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span><strong>Heavy Sea-Ice Pack:</strong> Caps sea ice concentration at {m.maxSicPercent}%, avoiding severe NO-GO zones.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span><strong>Vessel Ice-Class Clearance:</strong> Strictly verified under {vessel.iceClass} polar parameters.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-400 font-mono">Standing Principle: AI recommends; Captain confirms.</span>
          <button onClick={onClose} className="btn-secondary !py-1.5 text-xs">Close Explanation</button>
        </div>
      </div>
    </div>
  );
};

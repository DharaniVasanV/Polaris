import React, { useState } from 'react';
import { PolarisAppState } from '../types/state';
import { PolarMap } from '../components/map/PolarMap';
import { polarisStore } from '../store/polarisStore';
import { WhyNotShortestModal } from '../components/common/WhyNotShortestModal';
import { WhyThisRouteModal } from '../components/common/WhyThisRouteModal';
import { VesselCoordinateControl } from '../components/common/VesselCoordinateControl';

interface VoyagePlannerScreenProps {
  state: PolarisAppState;
}


export const VoyagePlannerScreen: React.FC<VoyagePlannerScreenProps> = ({ state }) => {
  const activeRoute = state.routes.find((r) => r.id === state.selectedRouteId) || state.routes[0];
  const shortestRoute = state.routes.find((r) => r.type === 'SHORTEST_REJECTED' || r.id === 'route_shortest');
  const isGenerating = state.isGeneratingRoute;

  const [isWhyNotShortestOpen, setIsWhyNotShortestOpen] = useState(false);
  const [isWhyThisRouteOpen, setIsWhyThisRouteOpen] = useState(false);

  return (
    <div className="flex-1 w-full flex flex-col md:flex-row overflow-hidden bg-[#060B14]">
      {/* Left Configuration Column */}
      <aside className="w-full md:w-80 bg-[#090F1C] border-r border-slate-800 p-4 flex flex-col gap-4 overflow-y-auto text-xs shrink-0 select-none">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h2 className="text-sm font-bold text-white tracking-wider">VOYAGE CONFIGURATION</h2>
          <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-sky-950 text-sky-400 border border-sky-600/40">SPATIOTEMPORAL</span>
        </div>

        <button
          onClick={() => polarisStore.loadDemoVoyage()}
          className="btn-secondary !py-2 w-full justify-center text-xs font-semibold text-sky-300 border-sky-500/40 hover:bg-sky-950/50"
        >
          <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
          </svg>
          LOAD DEMO VOYAGE (QUEEN MAUD &rarr; BHARATI)
        </button>

        <div className="flex flex-col gap-3">
          <VesselCoordinateControl state={state} />

          <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-col gap-2">

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase">Departure Corridor</label>
              <input type="text" value={state.departureLocation.name} className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200 text-xs font-mono" readOnly />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase">Destination Corridor</label>
              <input type="text" value={state.destinationLocation.name} className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200 text-xs font-mono" readOnly />
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-col gap-2">
            <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider">Vessel Profile &amp; Safety Thresholds</span>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-slate-400">VESSEL NAME</label>
                <input type="text" value={state.vessel.name} className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white font-mono text-[11px]" readOnly />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-slate-400">POLAR ICE CLASS</label>
                <input type="text" value={state.vessel.iceClass} className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-emerald-400 font-bold font-mono text-[11px]" readOnly />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-slate-400">DRAFT / SAFETY DEPTH</label>
                <input type="text" value={`${state.vessel.draftMeters}m / ${(state.vessel.draftMeters + state.vessel.safetyDepthMarginMeters).toFixed(1)}m`} className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 font-mono text-[11px]" readOnly />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-slate-400">NOMINAL SPEED</label>
                <input type="text" value={`${state.vessel.nominalSpeedKnots} knots`} className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 font-mono text-[11px]" readOnly />
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-slate-800">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-300">Safe SIC Threshold:</span>
                <strong className="text-sky-400 font-mono">{state.vessel.safeSicThresholdPercent}%</strong>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-300">Iceberg Safety Buffer:</span>
                <strong className="text-sky-400 font-mono">{state.vessel.icebergSafetyBufferKm} km</strong>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-300">Max Safe Wave Height:</span>
                <strong className="text-sky-400 font-mono">{state.vessel.maxSafeWaveHeightMeters} m</strong>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={() => polarisStore.generateRoutesAsync()}
          disabled={isGenerating}
          className="btn-primary !py-3 w-full justify-center text-xs font-bold tracking-wider shadow-[0_0_20px_rgba(2,132,199,0.5)] mt-1"
        >
          {isGenerating ? 'RUNNING SPATIOTEMPORAL A*...' : 'GENERATE POLARIS ROUTE'}
        </button>
      </aside>

      {/* Center Polar Map View with Animated Pipeline */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#060B14] relative">
        <div className="flex-1 w-full h-full relative overflow-hidden">
          <PolarMap state={state} />

          {/* AI Pipeline Loading Sequence Modal */}
          {isGenerating && (
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center z-30 p-6">
              <div className="glass-panel max-w-lg w-full p-6 rounded-2xl border border-sky-500/50 shadow-[0_0_50px_rgba(56,189,248,0.3)] flex flex-col gap-4">
                <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
                  <div className="w-3 h-3 rounded-full bg-sky-400 animate-ping"></div>
                  <h3 className="text-sm font-extrabold text-white tracking-widest">POLARIS SPATIOTEMPORAL AI PIPELINE</h3>
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-mono text-sky-300 animate-pulse">{state.routeGenerationStage || 'Synchronizing environmental datasets...'}</p>
                  <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800 mt-2">
                    <div className="bg-gradient-to-r from-sky-500 to-cyan-400 h-full w-full animate-pulse"></div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Right Column: Comparative Route Alternatives Deck */}
      <aside className="w-full md:w-96 bg-[#090F1C] border-l border-slate-800 p-4 flex flex-col gap-4 overflow-y-auto text-xs shrink-0 select-none">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">AI Route Alternatives</span>
          <span className="text-[10px] text-sky-400 font-mono">{state.routes.length} Candidates Evaluated</span>
        </div>

        <div className="flex flex-col gap-2.5">
          {state.routes.map((route) => {
            const isSelected = route.id === state.selectedRouteId;
            const isRejected = route.type === 'SHORTEST_REJECTED' || route.status === 'REJECTED';
            const isRecommended = route.status === 'RECOMMENDED';
            return (
              <div
                key={route.id}
                onClick={() => polarisStore.selectRoute(route.id)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 ${
                  isSelected
                    ? isRejected
                      ? 'border-rose-500/80 shadow-[0_0_15px_rgba(239,68,68,0.3)] bg-rose-950/20'
                      : 'border-emerald-500/80 shadow-[0_0_15px_rgba(16,185,129,0.3)] bg-emerald-950/20'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-950/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: route.color }}></span>
                    <strong className="text-xs font-bold text-white">{route.title}</strong>
                  </div>
                  {isRejected ? (
                    <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-rose-950 text-rose-400 border border-rose-500/40">REJECTED</span>
                  ) : isRecommended ? (
                    <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-emerald-950 text-emerald-400 border border-emerald-500/40">RECOMMENDED</span>
                  ) : (
                    <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-slate-900 text-slate-400 border border-slate-700">AVAILABLE</span>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] py-1 bg-black/40 rounded-lg">
                  <div><span className="text-slate-500 block">DISTANCE</span><strong className="text-slate-200 font-mono">{route.metrics.totalDistanceNm} nm</strong></div>
                  <div><span className="text-slate-500 block">ETA</span><strong className="text-slate-200 font-mono">{route.metrics.estimatedTransitFormatted}</strong></div>
                  <div><span className="text-slate-500 block">RISK</span><strong className={`${route.metrics.averageRisk > 60 ? 'text-rose-400' : 'text-emerald-400'} font-mono`}>{route.metrics.averageRisk}/100</strong></div>
                  <div><span className="text-slate-500 block">FUEL</span><strong className="text-slate-200 font-mono">{route.metrics.estimatedFuelIndex}</strong></div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
                  <span>B-22 Clearance: <strong className={`${route.metrics.minIcebergClearanceKm < 12 ? 'text-rose-400' : 'text-emerald-400'} font-mono`}>{route.metrics.minIcebergClearanceKm} km</strong></span>
                  <span>Max SIC: <strong className={`${route.metrics.maxSicPercent > 70 ? 'text-rose-400' : 'text-slate-300'} font-mono`}>{route.metrics.maxSicPercent}%</strong></span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Dynamic Explanation Card */}
        <div className="glass-panel p-4 rounded-xl border border-slate-800 flex flex-col gap-2.5 mt-1">
          {activeRoute.type === 'SHORTEST_REJECTED' || activeRoute.status === 'REJECTED' ? (
            <>
              <div className="flex items-center justify-between border-b border-rose-900/50 pb-2">
                <div className="flex items-center gap-2 text-rose-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                  </svg>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-rose-300">WHY NOT THE SHORTEST ROUTE?</h4>
                </div>
                <button
                  onClick={() => setIsWhyNotShortestOpen(true)}
                  className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 hover:text-white border border-rose-500/50 text-[10px] font-bold"
                >
                  Inspect &rarr;
                </button>
              </div>
              <p className="text-[11px] text-rose-200/90 leading-relaxed">
                {activeRoute.rejectionDetails?.primaryReason || activeRoute.dynamicExplanation}
              </p>
              <div className="p-2.5 rounded bg-rose-950/40 border border-rose-500/30 flex flex-col gap-1 text-[10px]">
                <strong className="text-rose-300">Violated Safety Constraints:</strong>
                {(activeRoute.rejectionDetails?.violatingHazards || []).map((h, i) => (
                  <div key={i} className="text-rose-200">&bull; {h}</div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-emerald-900/50 pb-2">
                <div className="flex items-center gap-2 text-emerald-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-300">WHY THIS ROUTE?</h4>
                </div>
                <button
                  onClick={() => setIsWhyThisRouteOpen(true)}
                  className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 hover:text-white border border-emerald-500/50 text-[10px] font-bold"
                >
                  Inspect &rarr;
                </button>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                {activeRoute.dynamicExplanation}
              </p>
            </>
          )}

          <button onClick={() => polarisStore.setScreen('DECISION_CENTER')} className="btn-primary !py-2 w-full justify-center text-xs mt-1">
            Proceed to Decision Center &rarr;
          </button>
        </div>
      </aside>

      {/* Dedicated Modals */}
      <WhyNotShortestModal
        shortestRoute={shortestRoute}
        vessel={state.vessel}
        isOpen={isWhyNotShortestOpen}
        onClose={() => setIsWhyNotShortestOpen(false)}
      />

      <WhyThisRouteModal
        route={activeRoute}
        shortestRoute={shortestRoute}
        vessel={state.vessel}
        isOpen={isWhyThisRouteOpen}
        onClose={() => setIsWhyThisRouteOpen(false)}
      />
    </div>
  );
};

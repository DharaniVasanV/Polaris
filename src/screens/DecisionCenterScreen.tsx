import React, { useState } from 'react';
import { PolarisAppState } from '../types/state';
import { PolarMap } from '../components/map/PolarMap';
import { polarisStore } from '../store/polarisStore';
import { WhyNotShortestModal } from '../components/common/WhyNotShortestModal';
import { WhyThisRouteModal } from '../components/common/WhyThisRouteModal';

interface DecisionCenterScreenProps {
  state: PolarisAppState;
}

export const DecisionCenterScreen: React.FC<DecisionCenterScreenProps> = ({ state }) => {
  const activeRoute = state.routes.find((r) => r.id === state.selectedRouteId) || state.routes[0];
  const shortestRoute = state.routes.find((r) => r.type === 'SHORTEST_REJECTED' || r.id === 'route_shortest');
  const isShifted = state.activeScenarioId === 'ICEBERG_SHIFT';
  const isApproved = state.activeRouteStatus === 'APPROVED_BY_HUMAN';
  const isSimulating = state.isHazardSimulationRunning;

  const [isWhyNotShortestOpen, setIsWhyNotShortestOpen] = useState(false);
  const [isWhyThisRouteOpen, setIsWhyThisRouteOpen] = useState(false);

  return (
    <div className="flex-1 w-full flex flex-col md:flex-row overflow-hidden bg-[#060B14]">
      {/* Left Tactical Bridge Controls */}
      <aside className="w-full md:w-80 bg-[#090F1C] border-r border-slate-800 p-4 flex flex-col gap-4 overflow-y-auto text-xs shrink-0 select-none">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <h2 className="text-sm font-bold text-white tracking-wider">CAPTAIN DECISION CENTER</h2>
          </div>
          <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-950 text-emerald-400 border border-emerald-500/40">BRIDGE OPS</span>
        </div>

        {/* Hazard Simulation Trigger */}
        <button
          onClick={() => polarisStore.runHazardSimulation()}
          disabled={isSimulating}
          className={`btn-critical !py-3 w-full justify-center text-xs font-bold tracking-wider shadow-[0_0_20px_rgba(239,68,68,0.4)] ${isSimulating ? 'opacity-75 cursor-not-allowed' : ''}`}
        >
          {isSimulating ? `SIMULATING HAZARD EVENT (${state.hazardSimulationStep}/7)...` : 'SIMULATE HAZARD (B-22 SHIFT)'}
        </button>

        {/* Active Route Status Card */}
        <div className={`glass-panel p-4 rounded-xl border ${isShifted && !isApproved ? 'border-amber-500/60 bg-amber-950/20' : 'border-slate-800'} flex flex-col gap-3`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Route Status</span>
            {isApproved ? (
              <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40">APPROVED BY HUMAN</span>
            ) : isShifted ? (
              <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-amber-950 text-amber-300 border border-amber-500/40 animate-pulse">REPLANNING RECOMMENDED</span>
            ) : (
              <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-emerald-950 text-emerald-400 border border-emerald-500/40">SAFE TO PROCEED</span>
            )}
          </div>

          <h3 className="text-sm font-bold text-white">{activeRoute.title}</h3>

          <div className="grid grid-cols-2 gap-2 text-[11px] p-2.5 rounded-lg bg-black/40">
            <div><span className="text-slate-500 block text-[9px]">CLEARANCE</span><strong className={`${activeRoute.metrics.minIcebergClearanceKm < 12 ? 'text-rose-400' : 'text-emerald-400'} font-mono`}>{activeRoute.metrics.minIcebergClearanceKm} km</strong></div>
            <div><span className="text-slate-500 block text-[9px]">RISK</span><strong className={`${activeRoute.metrics.averageRisk > 50 ? 'text-amber-400' : 'text-emerald-400'} font-mono`}>{activeRoute.metrics.averageRisk}/100</strong></div>
            <div><span className="text-slate-500 block text-[9px]">ESTIMATED ETA</span><strong className="text-slate-200 font-mono">{activeRoute.metrics.estimatedTransitFormatted}</strong></div>
            <div><span className="text-slate-500 block text-[9px]">CONFIDENCE</span><strong className="text-sky-400 font-mono">{activeRoute.metrics.confidencePercent}%</strong></div>
          </div>

          {/* 6-Factor Spatiotemporal Risk Contribution Breakdown */}
          <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 flex flex-col gap-1.5 text-[10px]">
            <span className="font-bold text-slate-400 uppercase tracking-wider">6-Factor Risk Contribution</span>
            <div className="flex justify-between"><span>Sea-Ice (35%):</span><strong className="text-sky-300 font-mono">{(activeRoute.metrics.averageSicPercent * 0.35).toFixed(0)} pts</strong></div>
            <div className="flex justify-between"><span>Iceberg (30%):</span><strong className={`${activeRoute.metrics.minIcebergClearanceKm < 12 ? 'text-rose-400' : 'text-emerald-400'} font-mono`}>{activeRoute.metrics.minIcebergClearanceKm < 12 ? '28 pts' : '10 pts'}</strong></div>
            <div className="flex justify-between"><span>Wave (15%):</span><strong className="text-slate-300 font-mono">{(activeRoute.metrics.waveExposureIndex * 3).toFixed(0)} pts</strong></div>
            <div className="flex justify-between"><span>Wind (10%):</span><strong className="text-slate-300 font-mono">4 pts</strong></div>
            <div className="flex justify-between"><span>Current (5%):</span><strong className="text-slate-300 font-mono">2 pts</strong></div>
            <div className="flex justify-between"><span>Uncertainty (5%):</span><strong className="text-slate-300 font-mono">3 pts</strong></div>
          </div>

          <div className={`p-3 rounded-lg ${isShifted ? 'bg-amber-950/40 border border-amber-500/30 text-amber-200' : 'bg-slate-950/70 border border-slate-800 text-slate-300'} text-[11px] leading-relaxed`}>
            <strong className="block text-white mb-0.5">Spatiotemporal Assessment:</strong>
            {activeRoute.dynamicExplanation}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsWhyThisRouteOpen(true)}
              className="btn-secondary !py-1 text-[10px] flex-1 justify-center"
            >
              Why This Route?
            </button>
            <button
              onClick={() => setIsWhyNotShortestOpen(true)}
              className="btn-secondary !py-1 text-[10px] flex-1 justify-center text-rose-400 border-rose-900/40"
            >
              Why Not Shortest?
            </button>
          </div>
        </div>

        {/* Human-in-the-Loop Decision Box */}
        <div className="glass-panel p-4 rounded-xl border border-sky-900/40 flex flex-col gap-2.5">
          <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider">Human Operational Decision</span>
          <p className="text-[11px] text-slate-400 leading-tight">
            AI provides risk-aware recommendation. Officer in Command / Ice Navigator confirms operational passage.
          </p>

          <button
            onClick={() => {
              polarisStore.approveRoute(state.selectedRouteId || 'route_safe_a');
              alert('Operational Passage Confirmed by Captain. Telemetry logged to black-box audit trail.');
            }}
            className="btn-safe !py-2.5 w-full justify-center text-xs font-bold shadow-[0_0_15px_rgba(16,185,129,0.3)]"
          >
            &check; APPROVE ROUTE (HUMAN CONFIRMATION)
          </button>

          <div className="grid grid-cols-2 gap-2 mt-1">
            <button onClick={() => polarisStore.selectRoute('route_alternative_b')} className="btn-secondary !py-1.5 justify-center text-[11px]">Request Alternate</button>
            <button onClick={() => alert('Manual Override Initiated. Rudder control returned to bridge helm.')} className="btn-secondary !py-1.5 justify-center text-[11px] text-amber-400 border-amber-800/40">Manual Override</button>
          </div>
        </div>
      </aside>

      {/* Center Tactical View with Live Radar & Floating Alerts */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#060B14] relative">
        <div className="flex-1 w-full h-full relative overflow-hidden">
          <PolarMap state={state} />

          <div className="absolute top-4 left-4 glass-panel px-4 py-2 rounded-xl border border-slate-700 flex items-center gap-3 shadow-xl">
            <div className={`w-3 h-3 rounded-full ${isShifted ? 'bg-rose-500 animate-ping' : 'bg-emerald-400'}`}></div>
            <div>
              <span className="font-extrabold text-white text-xs tracking-wider">BRIDGE TACTICAL NAVIGATION VIEW</span>
              <span className="text-[10px] text-slate-400 block font-mono">Real-time Spatiotemporal Hazard Evaluation &bull; Speed 14.0 kt</span>
            </div>
          </div>

          {/* Floating Critical Alert Stack */}
          <div className="absolute top-4 right-4 flex flex-col gap-2 max-w-sm z-20 pointer-events-auto">
            {state.alerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-3.5 rounded-xl border backdrop-blur-md flex flex-col gap-1.5 text-xs shadow-2xl ${
                  alert.severity === 'CRITICAL'
                    ? 'bg-rose-950/95 border-rose-500 text-rose-100 shadow-[0_0_25px_rgba(239,68,68,0.5)] animate-[pulse_2s_infinite]'
                    : alert.severity === 'WARNING'
                    ? 'bg-amber-950/90 border-amber-500 text-amber-100'
                    : 'bg-cyan-950/90 border-cyan-500/50 text-cyan-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider bg-black/40 border border-white/20">{alert.severity} ALERT</span>
                  <button onClick={() => polarisStore.acknowledgeAlert(alert.id)} className="text-white/60 hover:text-white font-bold">&times;</button>
                </div>
                <strong className="font-bold text-white">{alert.title}</strong>
                <p className="text-[11px] opacity-90 leading-tight">{alert.description}</p>
                <div className="text-[10px] font-mono text-amber-300 font-semibold pt-1 border-t border-white/10">Action: {alert.actionRequired}</div>
              </div>
            ))}
          </div>
        </div>
      </main>

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

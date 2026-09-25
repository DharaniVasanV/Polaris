import React, { useState } from 'react';
import { PolarisAppState } from '../types/state';
import { PolarMap } from '../components/map/PolarMap';
import { polarisStore } from '../store/polarisStore';
import { formatRiskBadge } from '../utils/formatters';
import { WhyThisRouteModal } from '../components/common/WhyThisRouteModal';
import { ModelTransparency } from '../components/common/ModelTransparency';
import { VesselCoordinateControl } from '../components/common/VesselCoordinateControl';
import { formatSentinel1StatusLabel, formatAcquisitionTime } from '../services/sentinel1Service';

interface DashboardScreenProps {
  state: PolarisAppState;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ state }) => {
  const [leftTab, setLeftTab] = useState<'TELEMETRY' | 'ENGINES' | 'LAYERS' | 'PROVENANCE'>('TELEMETRY');
  const [showWhyThisRouteModal, setShowWhyThisRouteModal] = useState(false);
  const [showTransparency, setShowTransparency] = useState(false);

  const activeRoute = state.routes.find((r) => r.id === state.selectedRouteId) || state.routes[0];
  const shortestRoute = state.routes.find((r) => r.type === 'SHORTEST_REJECTED' || r.status === 'REJECTED');
  const metrics = activeRoute.metrics;
  const riskBadge = formatRiskBadge(metrics.averageRisk);

  const selectedIceberg = state.icebergs.find((i) => i.id === state.selectedIcebergId) || state.icebergs[0];

  // Navigation Status from Risk Twin Summary (Phase 8 backend source of truth)
  const navStatus = state.riskTwinSummary?.navigation_status || {
    status: 'TRAVERSABLE',
    status_level: 'SAFE',
    explanation: 'Recommended navigation corridor satisfies all Polar Code safety thresholds and vessel ice-class constraints.',
    no_go_cells_encountered: 0,
    critical_violations: [],
  };

  // 7-Engine Health Map from backend or fallback definitions
  const engineHealthMap = state.systemEngineHealth || state.riskTwinSummary?.system_health || {
    gru_iceberg_engine: {
      engine_id: 'gru_iceberg_engine',
      name: 'GRU Iceberg Trajectory Model',
      status: 'READY',
      framework: 'TensorFlow / Keras',
      model_type: 'Recurrent GRU (64 units)',
      details: 'Trained on 214k satellite observations',
    },
    convlstm_sea_ice_engine: {
      engine_id: 'convlstm_sea_ice_engine',
      name: 'ConvLSTM Sea-Ice Model',
      status: 'READY',
      framework: 'TensorFlow / Keras',
      model_type: 'ConvLSTM2D (5 physical channels)',
      details: 'Multi-step spatiotemporal prediction',
    },
    weather_intelligence_engine: {
      engine_id: 'weather_intelligence_engine',
      name: 'Weather Risk MLP',
      status: 'READY',
      framework: 'PyTorch',
      model_type: 'PyTorch MLP (128-64-32-1)',
      details: '27 ERA5 features, 6h horizon',
    },
    risk_fusion_engine: {
      engine_id: 'risk_fusion_engine',
      name: 'Multi-Model Risk Fusion',
      status: 'READY',
      framework: 'POLARIS Engine',
      model_type: 'Spatiotemporal Risk(x,y,t)',
      details: '6-factor normalized weighted fusion',
    },
    safety_constraint_engine: {
      engine_id: 'safety_constraint_engine',
      name: 'Safety Constraint Layer',
      status: 'READY',
      framework: 'POLARIS Engine',
      model_type: 'IMO Polar Code & Physical Limits',
      details: 'Deterministic NO-GO masking',
    },
    route_optimizer_engine: {
      engine_id: 'route_optimizer_engine',
      name: 'Time-Aware A* Optimizer',
      status: 'READY',
      framework: 'POLARIS Engine',
      model_type: 'Multi-Objective Time-Expanded A*',
      details: 'Pareto dominance & dynamic ranking',
    },
    scenario_engine: {
      engine_id: 'scenario_engine',
      name: 'What-If Counterfactual Engine',
      status: 'READY',
      framework: 'POLARIS Engine',
      model_type: 'Non-Destructive Scenario Simulator',
      details: 'Sensitivity sweep & inflection analysis',
    },
  };

  // 6-Factor Multi-Model Risk Breakdown (Authoritative 35% SIC, 30% Iceberg, 15% Wave, 10% Weather, 5% Current, 5% Uncertainty)
  const riskBreakdown = state.riskTwinSummary?.risk_breakdown || {
    sea_ice_score: Math.round(metrics.maxSicPercent * 0.75),
    sea_ice_weight: 0.35,
    iceberg_score: 25,
    iceberg_weight: 0.30,
    wave_score: Math.round(metrics.waveExposureIndex * 15),
    wave_weight: 0.15,
    weather_score: 32,
    weather_weight: 0.10,
    current_score: 20,
    current_weight: 0.05,
    uncertainty_score: 18,
    uncertainty_weight: 0.05,
    dominant_factor: 'ICEBERG_PROXIMITY',
    composite_risk: metrics.averageRisk,
    risk_category: (metrics.averageRisk <= 35 ? 'SAFE' : metrics.averageRisk <= 60 ? 'MODERATE' : 'HIGH') as any,
  };

  const isLiveTelemetry = state.riskTwinSummary?.telemetry_mode === 'LIVE_BACKEND_DATA';
  const inspection = state.selectedCellInspection;

  return (
    <div className="flex-1 w-full flex flex-col overflow-hidden bg-[#060B14]">
      {/* ─────────────────────────────────────────────────────────────
          1. TOP EXECUTIVE LIVE DECISION CARD
          ───────────────────────────────────────────────────────────── */}
      <header className="w-full bg-[#080E1B] border-b border-slate-800/80 px-4 py-2.5 shrink-0 select-none shadow-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Status Badge & Dynamic Navigation Clearance */}
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`px-3 py-1.5 rounded-lg border text-xs font-black tracking-wider flex items-center gap-2 shadow-sm ${
                navStatus.status === 'TRAVERSABLE'
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/50 shadow-emerald-500/20'
                  : navStatus.status === 'NOT_CLEARED'
                  ? 'bg-amber-950/80 text-amber-400 border-amber-500/50 shadow-amber-500/20'
                  : 'bg-rose-950/80 text-rose-400 border-rose-500/50 shadow-rose-500/20'
              }`}
            >
              <span className="w-2 h-2 rounded-full animate-pulse bg-current"></span>
              {navStatus.status.replace('_', ' ')}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xs font-extrabold text-white uppercase tracking-wider truncate">
                  {activeRoute.title}
                </h1>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-950 text-sky-300 border border-sky-600/40">
                  {activeRoute.type}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                    isLiveTelemetry
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
                      : 'bg-amber-950 text-amber-300 border-amber-500/40'
                  }`}
                >
                  {isLiveTelemetry ? '● LIVE AI INFERENCE (SIMULATED TELEMETRY)' : '⚡ DEMO / OFFLINE FALLBACK'}
                </span>
                {/* Phase 10A: Sentinel-1 header badge */}
                {state.sentinel1Status === 'ONLINE' && state.sentinel1Data?.observation ? (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold border bg-sky-950 text-sky-300 border-sky-500/40">
                    🛰 SAR RECENT · {state.sentinel1Data.observation.platform ?? 'S1'}
                  </span>
                ) : state.sentinel1Status === 'CONNECTING' ? null : (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold border bg-slate-900 text-slate-500 border-slate-700">
                    🛰 SAR {state.sentinel1Status === 'NOT_CONFIGURED' ? 'NOT CFG' : 'UNAVAIL'}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 truncate max-w-2xl mt-0.5">
                {navStatus.explanation}
              </p>
            </div>
          </div>

          {/* Key Executive Metrics & Quick Actions */}
          <div className="flex items-center gap-4 text-xs shrink-0 self-end lg:self-center">
            <div className="flex items-center gap-3 border-r border-slate-800 pr-4">
              <div className="text-right">
                <span className="text-[9px] uppercase tracking-wider text-slate-500 block">Risk Score</span>
                <span className="font-mono font-extrabold text-white text-sm">
                  {metrics.averageRisk} <span className="text-[10px] text-slate-400 font-normal">({riskBadge.label})</span>
                </span>
              </div>
              <div className="text-right">
                <span className="text-[9px] uppercase tracking-wider text-slate-500 block">Min Standoff</span>
                <span className="font-mono font-extrabold text-emerald-400 text-sm">
                  {metrics.minIcebergClearanceKm} km
                </span>
              </div>
              <div className="text-right">
                <span className="text-[9px] uppercase tracking-wider text-slate-500 block">Transit & ETA</span>
                <span className="font-mono font-extrabold text-sky-400 text-sm">
                  {metrics.totalDistanceNm} nm <span className="text-[10px] text-slate-400 font-normal">({metrics.estimatedTransitFormatted})</span>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowWhyThisRouteModal(true)}
                className="btn-secondary !py-1 !px-2.5 text-[11px] font-semibold text-emerald-400 border-emerald-500/40 hover:bg-emerald-950/30"
                title="Inspect detailed mathematical and spatiotemporal justifications"
              >
                Why This Route?
              </button>
              <button
                onClick={() => polarisStore.setScreen('DECISION_CENTER')}
                className="btn-primary !py-1 !px-2.5 text-[11px] font-semibold"
                title="Open Captain Decision Center for What-If simulation and human confirmation"
              >
                Decision Center &rarr;
              </button>
              <button
                onClick={() => setShowTransparency(!showTransparency)}
                className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 bg-slate-950"
                title="Model Transparency & Provenance"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {showTransparency && (
          <div className="mt-3 pt-3 border-t border-slate-800/80">
            <ModelTransparency />
          </div>
        )}
      </header>

      {/* ─────────────────────────────────────────────────────────────
          2. MAIN WORKSPACE (LEFT PANEL + MAP + RIGHT COMMAND CENTER)
          ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 w-full flex flex-col md:flex-row overflow-hidden relative">
        {/* ── LEFT SIDEBAR: TELEMETRY, HEALTH, LAYERS ───────────── */}
        <aside className="w-full md:w-72 bg-[#090F1C] border-r border-slate-800 p-3.5 flex flex-col gap-3 overflow-y-auto text-xs shrink-0 select-none">
          {/* Sub-navigation tabs */}
          <div className="grid grid-cols-4 gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
            {[
              { id: 'TELEMETRY', label: 'Vessel (Sim)' },
              { id: 'ENGINES', label: 'AI (7)' },
              { id: 'LAYERS', label: 'Layers' },
              { id: 'PROVENANCE', label: 'Data' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setLeftTab(tab.id as any)}
                className={`py-1 text-[10px] font-bold rounded transition-all ${
                  leftTab === tab.id
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* TAB 1: VESSEL SIMULATED TELEMETRY & MISSION */}
          {leftTab === 'TELEMETRY' && (
            <div className="flex flex-col gap-3">
              <div className="glass-panel p-3 rounded-lg border border-slate-800 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider">Vessel Profile (Simulated)</span>
                  <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-slate-900 text-slate-300 border border-slate-700">
                    {state.vessel.iceClass}
                  </span>
                </div>
                <div className="text-xs font-bold text-white">{state.vessel.name}</div>
                <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-400 pt-1">
                  <div>Draft: <strong className="text-slate-200 font-mono">{state.vessel.draftMeters} m</strong></div>
                  <div>Speed: <strong className="text-slate-200 font-mono">{state.vessel.nominalSpeedKnots} kts</strong></div>
                  <div>SIC Cap: <strong className="text-emerald-400 font-mono">&le; {state.vessel.safeSicThresholdPercent}%</strong></div>
                  <div>Standoff: <strong className="text-emerald-400 font-mono">&ge; {state.vessel.icebergSafetyBufferKm} km</strong></div>
                </div>
              </div>

              {/* Phase 10C: Manual Vessel Position & Coordinate-Driven Satellite Control */}
              <VesselCoordinateControl state={state} />

              <div className="glass-panel p-3 rounded-lg border border-slate-800 flex flex-col gap-1.5 text-[11px]">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Simulated AIS Telemetry & Heading</span>
                <div className="flex justify-between text-slate-400">
                  <span>Current Pos:</span>
                  <strong className="text-sky-300 font-mono">
                    {Math.abs(state.departureLocation.latitude).toFixed(2)}°S, {state.departureLocation.longitude.toFixed(2)}°E
                  </strong>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Heading:</span>
                  <strong className="text-slate-200 font-mono">042° True North</strong>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Departure:</span>
                  <strong className="text-slate-200">{state.departureLocation.name}</strong>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Destination:</span>
                  <strong className="text-slate-200">{state.destinationLocation.name}</strong>
                </div>
              </div>


              <div className="glass-panel p-3 rounded-lg border border-slate-800 flex flex-col gap-1.5 text-[11px]">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Environmental Sensors</span>
                <div className="flex justify-between text-slate-400"><span>Wind:</span><strong className="text-slate-200 font-mono">22 km/h WNW</strong></div>
                <div className="flex justify-between text-slate-400"><span>Wave Height:</span><strong className="text-slate-200 font-mono">1.8 m (Swell)</strong></div>
                <div className="flex justify-between text-slate-400"><span>Ocean Current:</span><strong className="text-slate-200 font-mono">1.1 kt Eastward</strong></div>
                <div className="flex justify-between text-slate-400"><span>Air Temp:</span><strong className="text-slate-200 font-mono">-14.2°C</strong></div>
              </div>

              {/* Phase 10A & 10B: Sentinel-1 GRD Recent Observation & SAR Imagery */}
              <div className={`glass-panel p-3 rounded-lg border flex flex-col gap-1.5 text-[11px] ${
                state.sentinel1Status === 'ONLINE' ? 'border-sky-700/50 bg-sky-950/20' : 'border-slate-800'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Satellite Observation</span>
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold font-mono border ${
                    state.sentinel1Status === 'ONLINE'
                      ? 'bg-sky-900 text-sky-300 border-sky-500/40'
                      : state.sentinel1Status === 'NO_DATA'
                      ? 'bg-amber-950 text-amber-400 border-amber-500/40'
                      : 'bg-slate-900 text-slate-500 border-slate-700'
                  }`}>
                    {state.sentinel1Status === 'ONLINE' ? 'RECENT' :
                     state.sentinel1Status === 'NO_DATA' ? 'NO PASS' :
                     state.sentinel1Status === 'CONNECTING' ? 'SYNCING' :
                     state.sentinel1Status === 'NOT_CONFIGURED' ? 'NOT CFG' : 'UNAVAIL'}
                  </span>
                </div>
                {state.sentinel1Status === 'ONLINE' && state.sentinel1Data?.observation ? (
                  <>
                    <div className="flex justify-between text-slate-400">
                      <span>Source:</span>
                      <strong className="text-sky-300 font-mono">Sentinel-1 GRD</strong>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Platform:</span>
                      <strong className="text-slate-200 font-mono">{state.sentinel1Data.observation.platform ?? '—'}</strong>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Mode:</span>
                      <strong className="text-slate-200 font-mono">{state.sentinel1Data.observation.mode ?? '—'} {state.sentinel1Data.observation.product_type ?? ''}</strong>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Acquired:</span>
                      <strong className="text-slate-200 font-mono text-[9px]">{formatAcquisitionTime(state.sentinel1Data.observation.acquisition_time)}</strong>
                    </div>
                    {/* Phase 10B SAR Image Details */}
                    <div className="pt-1.5 border-t border-slate-800/80 flex flex-col gap-2">
                      <div className="flex justify-between items-center text-slate-400">
                        <span className="font-semibold text-slate-300">🛰 Sentinel-1 SAR:</span>
                        <button
                          onClick={() => polarisStore.toggleMapLayer('sentinel1Sar')}
                          className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all border flex items-center gap-1 ${
                            state.mapLayers.sentinel1Sar
                              ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-sm shadow-sky-500/50'
                              : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                          }`}
                        >
                          <span>{state.mapLayers.sentinel1Sar ? '● ON' : '○ OFF'}</span>
                        </button>
                      </div>

                      {/* SAR Opacity Control Slider */}
                      {state.mapLayers.sentinel1Sar && (
                        <div className="flex flex-col gap-1 bg-slate-900/70 p-1.5 rounded border border-slate-800">
                          <div className="flex justify-between items-center text-[9px] text-slate-400">
                            <span>SAR Opacity:</span>
                            <strong className="font-mono font-bold text-sky-300">{Math.round(state.sentinel1Opacity * 100)}%</strong>
                          </div>
                          <input
                            type="range"
                            min="0.30"
                            max="0.90"
                            step="0.05"
                            value={state.sentinel1Opacity}
                            onChange={(e) => polarisStore.setSentinel1Opacity(parseFloat(e.target.value))}
                            className="w-full accent-sky-400 h-1 bg-slate-800 rounded cursor-pointer"
                          />
                        </div>
                      )}

                      {state.sentinel1ImageMetadata && (
                        <div className="flex flex-col gap-1 text-[10px]">
                          <div className="flex justify-between text-slate-400">
                            <span>Polarization:</span>
                            <strong className="text-cyan-300 font-mono">
                              {state.sentinel1ImageMetadata.polarization}
                              {state.sentinel1ImageMetadata.selected_band ? ` (${state.sentinel1ImageMetadata.selected_band})` : ''}
                            </strong>
                          </div>

                          {/* SAR Backscatter Spectrum Legend */}
                          <div className="mt-1 pt-1.5 border-t border-slate-800/60 flex flex-col gap-1">
                            <span className="text-[8px] font-bold text-sky-400 uppercase tracking-wider">
                              SENTINEL-1 SAR BACKSCATTER
                            </span>
                            <div className="h-2 w-full rounded bg-gradient-to-r from-slate-950 via-cyan-900 to-cyan-300 border border-slate-700" />
                            <div className="flex justify-between text-[8px] text-slate-400 font-mono">
                              <span>Low backscatter</span>
                              <span>High backscatter</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <p className="text-[9px] text-slate-500 leading-tight pt-0.5">
                      Provenance: RECENT (not LIVE) · Copernicus Process API
                    </p>
                  </>
                ) : (
                  <p className="text-[10px] text-slate-500">
                    {state.sentinel1Status === 'NOT_CONFIGURED'
                      ? 'Set COPERNICUS_CLIENT_ID + CLIENT_SECRET to enable.'
                      : state.sentinel1Status === 'NO_DATA'
                      ? 'No SAR pass over AOI in the lookback window.'
                      : 'Copernicus Data Space unavailable or backend offline.'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: 7-ENGINE SYSTEM HEALTH */}
          {leftTab === 'ENGINES' && (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                7-Engine Operational Readiness
              </span>
              {Object.values(engineHealthMap).map((eng: any) => (
                <div
                  key={eng.engine_id}
                  className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 text-[11px] truncate">{eng.name}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold font-mono ${
                        eng.status === 'READY'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'
                          : 'bg-amber-950 text-amber-400 border border-amber-500/40'
                      }`}
                    >
                      {eng.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span className="text-cyan-400 font-mono">{eng.model_type || eng.framework}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-tight truncate" title={eng.details}>
                    {eng.details}
                  </p>
                </div>
              ))}

              {/* Phase 10A: Data Sources section — below the 7 AI engines */}
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                External Data Sources
              </span>
              <div className={`p-2.5 rounded-lg border flex flex-col gap-1 ${
                state.sentinel1Status === 'ONLINE'
                  ? 'bg-sky-950/30 border-sky-600/40'
                  : state.sentinel1Status === 'NO_DATA'
                  ? 'bg-amber-950/20 border-amber-600/30'
                  : 'bg-slate-950/80 border-slate-800/80'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sky-300 text-[11px]">🛰 Sentinel-1 GRD</span>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold font-mono border ${
                    state.sentinel1Status === 'ONLINE'
                      ? 'bg-sky-900 text-sky-300 border-sky-500/40'
                      : state.sentinel1Status === 'NO_DATA'
                      ? 'bg-amber-950 text-amber-400 border-amber-500/40'
                      : 'bg-slate-900 text-slate-500 border-slate-700'
                  }`}>
                    {state.sentinel1Status === 'ONLINE' ? 'RECENT' :
                     state.sentinel1Status === 'NO_DATA' ? 'NO PASS' :
                     state.sentinel1Status === 'CONNECTING' ? 'SYNCING...' :
                     state.sentinel1Status === 'NOT_CONFIGURED' ? 'NOT CFG' : 'UNAVAIL'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400">
                  <span className="text-cyan-400 font-mono">Copernicus Data Space STAC</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">
                  {state.sentinel1Status === 'ONLINE' && state.sentinel1Data?.observation
                    ? `Latest: ${state.sentinel1Data.observation.product_id.slice(0, 30)}…`
                    : state.sentinel1Status === 'NOT_CONFIGURED'
                    ? 'Credentials not configured in backend/.env'
                    : 'SAR metadata — recent observation (not live feed)'}
                </p>
                {state.lastSentinel1Sync && (
                  <p className="text-[9px] text-slate-600">Synced: {state.lastSentinel1Sync}</p>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: 10-LAYER MAP CONTROLS */}
          {leftTab === 'LAYERS' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  10 Map Visualization Layers
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {[
                  { key: 'seaIce', label: '1. Sea-Ice Concentration (ConvLSTM)' },
                  { key: 'icebergs', label: '2. Iceberg Markers & Drift (GRU)' },
                  { key: 'icebergForecast', label: '3. Multi-Step Forecast Vectors' },
                  { key: 'icebergUncertainty', label: '4. Expanding Uncertainty Cones' },
                  { key: 'noGoZones', label: '5. Hard NO-GO Physical Masks' },
                  { key: 'recommendedRoute', label: '6. Recommended Safe Route A' },
                  { key: 'alternativeRoute', label: '7. Alternative Route B' },
                  { key: 'shortestRoute', label: '8. Shortest Direct (Rejected)' },
                  { key: 'oceanCurrent', label: '9. ACC Ocean Current Vectors' },
                  { key: 'bathymetry', label: '10. Bathymetry Depth Contours' },
                  { key: 'sentinel1Sar', label: '11. 🛰 Sentinel-1 SAR Backscatter Overlay' },
                ].map(({ key, label }) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-900 cursor-pointer text-[11px] text-slate-300"
                  >
                    <input
                      type="checkbox"
                      checked={(state.mapLayers as any)[key]}
                      onChange={() => polarisStore.toggleMapLayer(key as any)}
                      className="rounded bg-slate-900 border-slate-700 text-sky-500"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: MODEL PROVENANCE & TRAINING DATA */}
          {leftTab === 'PROVENANCE' && (
            <div className="flex flex-col gap-2.5 text-[11px]">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Authoritative Data Provenance
              </span>
              <div className="p-2.5 rounded bg-slate-950/80 border border-slate-800 flex flex-col gap-1">
                <strong className="text-cyan-300">Iceberg Drift (GRU):</strong>
                <p className="text-slate-400 text-[10px] leading-tight">
                  Trained on 214,561 satellite observations from BYU Antarctic Iceberg Database.
                </p>
              </div>
              <div className="p-2.5 rounded bg-slate-950/80 border border-slate-800 flex flex-col gap-1">
                <strong className="text-teal-300">Sea-Ice Pack (ConvLSTM):</strong>
                <p className="text-slate-400 text-[10px] leading-tight">
                  AMSR2 + Sentinel-1 SAR combined with ERA5 wind and current fields.
                </p>
              </div>
              <div className="p-2.5 rounded bg-slate-950/80 border border-slate-800 flex flex-col gap-1">
                <strong className="text-purple-300">Weather Risk (MLP):</strong>
                <p className="text-slate-400 text-[10px] leading-tight">
                  ECMWF ERA5 reanalysis features across 468 cells (6h horizon).
                </p>
              </div>
              <div className="p-2.5 rounded bg-slate-950/80 border border-slate-800 flex flex-col gap-1">
                <strong className="text-emerald-300">Route Engine (Time-Aware A*):</strong>
                <p className="text-slate-400 text-[10px] leading-tight">
                  Continuous arrival time projection with discrete 6h horizon hazard lookups.
                </p>
              </div>

              {/* ── Phase 10A: Sentinel-1 GRD Recent Observation Card ── */}
              {(() => {
                const s1 = state.sentinel1Data;
                const s1Status = state.sentinel1Status;
                const obs = s1?.observation ?? null;
                const isOk = s1Status === 'ONLINE' && obs !== null;
                const isNoData = s1Status === 'NO_DATA';
                const isNotConfigured = s1Status === 'NOT_CONFIGURED';
                const isOffline = s1Status === 'OFFLINE' || s1Status === 'CONNECTING';

                return (
                  <div
                    className={`p-2.5 rounded border flex flex-col gap-1.5 ${
                      isOk
                        ? 'bg-sky-950/40 border-sky-500/50'
                        : isNoData
                        ? 'bg-amber-950/30 border-amber-500/40'
                        : isNotConfigured
                        ? 'bg-slate-950/80 border-slate-700'
                        : 'bg-slate-950/80 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <strong className="text-sky-300 flex items-center gap-1.5">
                        🛰️ Sentinel-1 GRD
                      </strong>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold font-mono ${
                          isOk
                            ? 'bg-sky-900 text-sky-300 border border-sky-500/40'
                            : isNoData
                            ? 'bg-amber-950 text-amber-400 border border-amber-500/40'
                            : 'bg-slate-900 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {isOk ? 'RECENT' : formatSentinel1StatusLabel(s1Status as any)}
                      </span>
                    </div>

                    {isOk && obs ? (
                      <>
                        <p className="text-[9px] text-sky-400/80 font-semibold uppercase tracking-wider">
                          Recent Satellite Observation
                        </p>
                        <div className="flex flex-col gap-0.5 text-[10px]">
                          <div className="flex justify-between text-slate-400">
                            <span>Acquired:</span>
                            <strong className="text-slate-200 font-mono text-[9px]">
                              {formatAcquisitionTime(obs.acquisition_time)}
                            </strong>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>Platform:</span>
                            <strong className="text-slate-200 font-mono">
                              {obs.platform ?? 'Unknown'}
                            </strong>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>Mode:</span>
                            <strong className="text-slate-200 font-mono">
                              {obs.mode ?? '—'} {obs.product_type ?? ''}
                            </strong>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>Product:</span>
                            <strong className="text-slate-200 font-mono text-[8px] truncate max-w-[120px]" title={obs.product_id}>
                              {obs.product_id}
                            </strong>
                          </div>
                          {obs.orbit_direction && (
                            <div className="flex justify-between text-slate-400">
                              <span>Orbit:</span>
                              <strong className="text-slate-200 font-mono">
                                {obs.orbit_direction}
                                {obs.relative_orbit ? ` #${obs.relative_orbit}` : ''}
                              </strong>
                            </div>
                          )}
                        </div>
                        <p className="text-[9px] text-slate-500 leading-tight mt-0.5">
                          Source: Copernicus Data Space · Provenance: RECENT (not LIVE)
                        </p>
                      </>
                    ) : isNoData ? (
                      <p className="text-amber-400/80 text-[10px] leading-tight">
                        NO RECENT ACQUISITION FOUND in the lookback window.
                      </p>
                    ) : isNotConfigured ? (
                      <p className="text-slate-500 text-[10px] leading-tight">
                        Copernicus credentials not configured.
                        Set COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET.
                      </p>
                    ) : (
                      <p className="text-slate-500 text-[10px] leading-tight">
                        SATELLITE SOURCE UNAVAILABLE —
                        Copernicus Data Space unreachable or backend offline.
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </aside>

        {/* ── CENTER: INTERACTIVE POLAR MAP & TIMELINE ─────────── */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#060B14] relative">
          <div className="flex-1 w-full h-full relative overflow-hidden">
            {/* Map Canvas */}
            <PolarMap state={state} />

            {/* Corridor Header Overlay */}
            <div className="absolute top-3 left-3 glass-panel px-3 py-1.5 rounded-lg border border-slate-700/80 flex items-center gap-2.5 text-xs shadow-lg pointer-events-none">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></div>
              <div>
                <span className="font-bold text-white text-[11px]">ANTARCTIC OPERATIONAL SECTOR</span>
                <span className="text-[9px] text-slate-400 block font-mono">
                  Queen Maud Land &bull; 60°S–75°S &bull; 25°W–75°E &bull; Click cell/route to inspect
                </span>
              </div>
            </div>

            {/* INTERACTIVE CELL / HAZARD INSPECTOR FLOATING CARD */}
            {inspection && (
              <div className="absolute top-3 right-3 glass-panel w-80 p-3.5 rounded-xl border border-sky-500/50 shadow-2xl bg-[#09111E]/95 backdrop-blur-md flex flex-col gap-2 z-30 text-xs animate-in fade-in">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        inspection.is_traversable ? 'bg-emerald-400' : 'bg-rose-500'
                      }`}
                    ></span>
                    <strong className="text-white font-mono text-[11px]">
                      CELL [{inspection.row}, {inspection.column}]
                    </strong>
                  </div>
                  <button
                    onClick={() => polarisStore.clearCellInspection()}
                    className="text-slate-400 hover:text-white text-lg font-bold leading-none"
                    title="Close Inspector"
                  >
                    &times;
                  </button>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Coordinates:</span>
                  <span className="font-mono text-slate-200">
                    {Math.abs(inspection.latitude).toFixed(2)}°S, {inspection.longitude.toFixed(2)}°E
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Traversability:</span>
                  <span
                    className={`px-1.5 py-0.5 rounded font-extrabold text-[9px] ${
                      inspection.is_traversable
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'
                        : 'bg-rose-950 text-rose-400 border border-rose-500/40'
                    }`}
                  >
                    {inspection.safety_status}
                  </span>
                </div>

                {inspection.blocking_reasons && inspection.blocking_reasons.length > 0 && (
                  <div className="p-2 rounded bg-rose-950/40 border border-rose-500/30 text-[10px] text-rose-300 flex flex-col gap-0.5">
                    <strong className="text-rose-200">Violations:</strong>
                    {inspection.blocking_reasons.map((r, i) => (
                      <div key={i}>&bull; {r}</div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Total Fused Risk:</span>
                  <span className="font-mono font-bold text-white">
                    {inspection.total_risk.toFixed(1)} / 100 ({inspection.risk_category})
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Dominant Factor:</span>
                  <span className="font-mono text-amber-300 text-[10px]">{inspection.dominant_factor}</span>
                </div>

                {/* 6-Factor Micro Breakdown */}
                <div className="p-2 rounded bg-slate-950/80 border border-slate-800 text-[10px] flex flex-col gap-1">
                  <div className="flex justify-between text-slate-400">
                    <span>Sea Ice:</span>
                    <span className="text-slate-200 font-mono">
                      {inspection.sic_percent !== null ? `${inspection.sic_percent.toFixed(1)}%` : 'N/A'} ({inspection.sic_provenance})
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Iceberg Risk:</span>
                    <span className="text-slate-200 font-mono">
                      {inspection.iceberg_risk.toFixed(1)} (Nearest: {inspection.nearest_iceberg_dist_km?.toFixed(1) ?? 'N/A'} km)
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Weather Risk:</span>
                    <span className="text-slate-200 font-mono">
                      {inspection.weather_risk !== null ? inspection.weather_risk.toFixed(1) : 'UNAVAILABLE'} ({inspection.weather_provenance})
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Wave / Current:</span>
                    <span className="text-slate-200 font-mono">
                      {inspection.wave_height_meters.toFixed(1)}m / {inspection.current_speed_knots.toFixed(1)}kt
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Uncertainty:</span>
                    <span className="text-slate-200 font-mono">{inspection.uncertainty_score.toFixed(1)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 4D FORECAST TIMELINE BAR (NOW, +6h, +12h, +18h, +24h) */}
            <div className="absolute bottom-3 left-4 right-4 glass-panel px-4 py-2.5 rounded-xl border border-sky-500/30 flex flex-col gap-1.5 shadow-2xl bg-[#09111E]/90 backdrop-blur-md z-20">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-bold text-white uppercase tracking-wider text-[10px]">
                    4D Forecast Time Horizon:
                  </span>
                  <span className="font-mono text-sky-400 font-bold text-xs">
                    +{state.simulationTimeHours}h 00m
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono hidden sm:block">
                  Spatiotemporal hazard evaluation at estimated arrival times
                </div>
              </div>

              <div className="flex items-center gap-2">
                {([0, 6, 12, 18, 24] as const).map((h) => {
                  const isSelected = state.simulationTimeHours === h;
                  const weatherAvailable = h <= 6;
                  return (
                    <button
                      key={h}
                      onClick={() => polarisStore.setSimulationTime(h)}
                      className={`flex-1 py-1.5 px-2 rounded-lg border text-xs text-center transition-all flex flex-col items-center justify-center gap-0.5 ${
                        isSelected
                          ? 'bg-sky-600 text-white font-bold border-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.4)]'
                          : 'bg-slate-900/90 text-slate-400 hover:text-slate-200 border-slate-800 font-medium'
                      }`}
                    >
                      <span className="text-[11px] font-mono">{h === 0 ? 'NOW' : `+${h}h`}</span>
                      <span className="text-[8px] font-mono opacity-80">
                        {h === 0
                          ? 'ConvLSTM+GRU'
                          : weatherAvailable
                          ? 'All 3 Models'
                          : 'GRU+SIC (Wx N/A)'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </main>

        {/* ── RIGHT SIDEBAR: ROUTE COMMAND CENTER ──────────────── */}
        <aside className="w-full md:w-80 bg-[#090F1C] border-l border-slate-800 p-3.5 flex flex-col gap-3.5 overflow-y-auto text-xs shrink-0 select-none">
          {/* ROUTE CANDIDATES DECK */}
          <div className="glass-panel p-3.5 rounded-xl border border-slate-800 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider">
                Route Candidates Deck
              </span>
              <span className="text-[9px] text-slate-500 font-mono">
                {state.routes.length} Evaluated
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {state.routes.map((r) => {
                const isSelected = r.id === state.selectedRouteId;
                const isRec = r.status === 'RECOMMENDED';
                const isRej = r.type === 'SHORTEST_REJECTED' || r.status === 'REJECTED';

                return (
                  <div
                    key={r.id}
                    onClick={() => polarisStore.selectRoute(r.id)}
                    className={`p-2.5 rounded-lg border cursor-pointer transition-all flex flex-col gap-1.5 ${
                      isSelected
                        ? isRej
                          ? 'bg-rose-950/40 border-rose-500/80 shadow-md'
                          : 'bg-emerald-950/40 border-emerald-500/80 shadow-md'
                        : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: r.color }}
                        ></span>
                        <strong className="text-[11px] text-white truncate">{r.title}</strong>
                      </div>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold ${
                          isRec
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                            : isRej
                            ? 'bg-rose-950 text-rose-300 border border-rose-500/40'
                            : 'bg-sky-950 text-sky-300 border border-sky-500/40'
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1 text-[10px] text-slate-400">
                      <div>
                        Dist: <strong className="text-slate-200 font-mono">{r.metrics.totalDistanceNm} nm</strong>
                      </div>
                      <div>
                        ETA: <strong className="text-slate-200 font-mono">{r.metrics.estimatedTransitFormatted}</strong>
                      </div>
                      <div>
                        Risk: <strong className="text-slate-200 font-mono">{r.metrics.averageRisk}</strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* DYNAMIC "WHY THIS ROUTE?" CARD */}
          <div className="glass-panel p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-950/10 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                Why This Route?
              </span>
              <span className="text-[9px] font-mono font-bold text-emerald-300">
                {metrics.minIcebergClearanceKm} km Standoff
              </span>
            </div>

            <p className="text-[11px] text-slate-300 leading-relaxed font-medium">
              {activeRoute.dynamicExplanation ||
                'Authoritative corridor skirting north of predicted iceberg drift and heavy sea-ice consolidation.'}
            </p>

            {/* Trade-off summary */}
            <div className="grid grid-cols-3 gap-1.5 p-2 rounded-lg bg-slate-950/80 border border-slate-800 text-center text-[10px]">
              <div>
                <span className="text-slate-500 block text-[8px]">DIFF DIST</span>
                <strong className="text-amber-300 font-mono">
                  +{activeRoute.tradeOffVsShortest?.distanceDiffNm ?? 45} nm
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[8px]">ETA DELAY</span>
                <strong className="text-amber-300 font-mono">
                  +{activeRoute.tradeOffVsShortest?.etaDiffHours ?? 3.8} h
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[8px]">HAZARD CUT</span>
                <strong className="text-emerald-400 font-mono">
                  {activeRoute.tradeOffVsShortest?.hazardExposureReductionPercent ?? 58}%
                </strong>
              </div>
            </div>

            <button
              onClick={() => setShowWhyThisRouteModal(true)}
              className="btn-secondary !py-1 text-[11px] w-full justify-center text-emerald-300 border-emerald-500/40 hover:bg-emerald-950/40 mt-1"
            >
              Explain Full Justification &rarr;
            </button>
          </div>

          {/* 6-FACTOR MULTI-MODEL RISK CONTRIBUTION WIDGET */}
          <div className="glass-panel p-3.5 rounded-xl border border-slate-800 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Multi-Model Risk Breakdown
              </span>
              <span className="text-[9px] font-mono text-amber-400 font-bold">
                Dom: {riskBreakdown.dominant_factor}
              </span>
            </div>

            <div className="flex flex-col gap-2 text-[10px]">
              {[
                { label: 'Sea-Ice (ConvLSTM)', score: riskBreakdown.sea_ice_score, weight: `${Math.round(riskBreakdown.sea_ice_weight * 100)}%`, color: 'bg-cyan-500' },
                { label: 'Iceberg Drift (GRU)', score: riskBreakdown.iceberg_score, weight: `${Math.round(riskBreakdown.iceberg_weight * 100)}%`, color: 'bg-rose-500' },
                { label: 'Wave Baseline', score: riskBreakdown.wave_score, weight: `${Math.round(riskBreakdown.wave_weight * 100)}%`, color: 'bg-blue-500' },
                { label: 'Weather Risk (MLP)', score: riskBreakdown.weather_score, weight: `${Math.round(riskBreakdown.weather_weight * 100)}%`, color: 'bg-purple-500' },
                { label: 'Ocean Current', score: riskBreakdown.current_score, weight: `${Math.round(riskBreakdown.current_weight * 100)}%`, color: 'bg-teal-500' },
                { label: 'Forecast Uncertainty', score: riskBreakdown.uncertainty_score, weight: `${Math.round(riskBreakdown.uncertainty_weight * 100)}%`, color: 'bg-amber-500' },
              ].map((item, idx) => (
                <div key={idx} className="flex flex-col gap-0.5">
                  <div className="flex justify-between text-slate-400">
                    <span>{item.label} <span className="text-slate-600 font-mono">({item.weight})</span></span>
                    <span className="font-mono text-slate-200">{item.score} / 100</span>
                  </div>
                  <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${item.color}`}
                      style={{ width: `${Math.min(100, item.score)}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SELECTED ICEBERG TRAJECTORY PANEL */}
          <div className="glass-panel p-3.5 rounded-xl border border-slate-800 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Iceberg Trajectory (GRU)
              </span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-rose-950 text-rose-300 border border-rose-500/40">
                {selectedIceberg ? selectedIceberg.name : 'B-22'}
              </span>
            </div>

            {selectedIceberg ? (
              <div className="flex flex-col gap-1.5 text-[11px]">
                <div className="flex justify-between text-slate-400">
                  <span>Drift Dynamics:</span>
                  <strong className="text-slate-200 font-mono">
                    {selectedIceberg.speedKmh} km/h {selectedIceberg.driftDirectionLabel}
                  </strong>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Uncertainty Cone:</span>
                  <strong className="text-amber-400 font-mono">
                    &plusmn;{selectedIceberg.forecastTrack?.[1]?.uncertaintyRadiusKm ?? 18} km (+24h)
                  </strong>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Vessel Standoff:</span>
                  <strong className="text-emerald-400 font-mono">
                    {metrics.minIcebergClearanceKm} km (&gt; {state.vessel.icebergSafetyBufferKm} km Buffer)
                  </strong>
                </div>

                <div className="p-2 rounded bg-slate-950/80 border border-slate-800 flex flex-col gap-1 text-[10px] mt-1">
                  <span className="text-slate-400 font-bold">5-Step GRU Forecast (Day +1 Primary; Recursive to +120h):</span>
                  <div className="grid grid-cols-5 gap-1 text-center font-mono">
                    <div className="p-1 rounded bg-slate-900 text-slate-300">NOW</div>
                    <div className="p-1 rounded bg-slate-900 text-slate-300">+6h</div>
                    <div className="p-1 rounded bg-slate-900 text-slate-300">+12h</div>
                    <div className="p-1 rounded bg-slate-900 text-slate-300">+18h</div>
                    <div className="p-1 rounded bg-slate-900 text-cyan-400 font-bold">+24h</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-slate-500 text-[11px]">No iceberg selected</div>
            )}
          </div>
        </aside>
      </div>

      {/* WHY THIS ROUTE MODAL */}
      <WhyThisRouteModal
        route={activeRoute}
        shortestRoute={shortestRoute}
        vessel={state.vessel}
        isOpen={showWhyThisRouteModal}
        onClose={() => setShowWhyThisRouteModal(false)}
      />
    </div>
  );
};

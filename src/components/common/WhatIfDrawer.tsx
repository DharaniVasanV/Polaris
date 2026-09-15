import React, { useState } from 'react';
import { PolarisAppState } from '../../types/state';
import { BackendScenarioType } from '../../types/scenario';
import { polarisStore } from '../../store/polarisStore';

interface WhatIfDrawerProps {
  state: PolarisAppState;
  isOpen: boolean;
  onClose: () => void;
}

export const WhatIfDrawer: React.FC<WhatIfDrawerProps> = ({ state, isOpen, onClose }) => {
  if (!isOpen) return null;

  const [selectedScenarioType, setSelectedScenarioType] = useState<BackendScenarioType>('ICEBERG_DRIFT');
  const [icebergShiftKm, setIcebergShiftKm] = useState<number>(50.0);
  const [sicIncreasePercent, setSicIncreasePercent] = useState<number>(20.0);
  const [weatherDelta, setWeatherDelta] = useState<number>(0.25);
  const [activeTab, setActiveTab] = useState<'SIMULATION' | 'SENSITIVITY'>('SIMULATION');

  const handleRunSimulation = async () => {
    let params = {};
    if (selectedScenarioType === 'ICEBERG_DRIFT') {
      params = { iceberg_shift_km: icebergShiftKm, iceberg_delta_lat: icebergShiftKm / 111.0 };
    } else if (selectedScenarioType === 'SEA_ICE_INCREASE') {
      params = { sic_increase_percent: sicIncreasePercent };
    } else if (selectedScenarioType === 'WEATHER_DETERIORATION') {
      params = { weather_risk_delta: weatherDelta };
    } else if (selectedScenarioType === 'ICEBERG_CLEARANCE') {
      params = { iceberg_delta_lat: 1.5 };
    }

    await polarisStore.simulateWhatIfScenario(selectedScenarioType, params);
  };

  const handleRunSensitivity = async () => {
    await polarisStore.runSensitivitySweep(selectedScenarioType);
  };

  const whatIf = state.activeWhatIfResult;
  const comp = whatIf?.comparison;
  const sens = state.activeSensitivityResult;
  const isSimulating = Boolean(state.isSimulatingWhatIf);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex justify-end">
      <div className="glass-panel w-full max-w-2xl bg-[#080E1B] border-l border-cyan-500/40 h-full p-6 flex flex-col gap-5 overflow-y-auto shadow-[-10px_0_40px_rgba(6,182,212,0.25)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-950 flex items-center justify-center border border-cyan-500/40">
              <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wider">WHAT-IF SCENARIO &amp; SENSITIVITY ENGINE</h2>
              <p className="text-[11px] text-slate-400">Authoritative Backend Counterfactual Simulation &amp; Decision Boundary Analysis</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl font-bold">&times;</button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-800 gap-2">
          <button
            onClick={() => setActiveTab('SIMULATION')}
            className={`pb-2 px-3 text-xs font-bold transition-colors ${
              activeTab === 'SIMULATION' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Scenario Simulation
          </button>
          <button
            onClick={() => setActiveTab('SENSITIVITY')}
            className={`pb-2 px-3 text-xs font-bold transition-colors ${
              activeTab === 'SENSITIVITY' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Decision Sensitivity Sweep
          </button>
        </div>

        {/* Configuration Controls */}
        <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Select Counterfactual Perturbation</label>
            <select
              value={selectedScenarioType}
              onChange={(e) => setSelectedScenarioType(e.target.value as BackendScenarioType)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
            >
              <option value="ICEBERG_DRIFT">ICEBERG DRIFT — Encroach On Navigation Track</option>
              <option value="SEA_ICE_INCREASE">SEA-ICE EXPANSION — Rapid Concentration Increase</option>
              <option value="WEATHER_DETERIORATION">WEATHER DETERIORATION — Synoptic Gale / High Sea State</option>
              <option value="ICEBERG_CLEARANCE">ICEBERG CLEARANCE — Hazard Deflected Out of Lead</option>
              <option value="SAFETY_PRIORITY_CHANGE">OBJECTIVE SHIFT — Extreme Safety Priority</option>
              <option value="EFFICIENCY_PRIORITY_CHANGE">OBJECTIVE SHIFT — Transit Time &amp; Distance Priority</option>
            </select>
          </div>

          {/* Dynamic Parameter Sliders */}
          {selectedScenarioType === 'ICEBERG_DRIFT' && (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Iceberg Drift Magnitude:</span>
                <span className="font-mono text-cyan-400 font-bold">{icebergShiftKm} km</span>
              </div>
              <input
                type="range"
                min="10"
                max="120"
                step="5"
                value={icebergShiftKm}
                onChange={(e) => setIcebergShiftKm(Number(e.target.value))}
                className="w-full accent-cyan-400"
              />
              <span className="text-[10px] text-slate-500">Shifts active iceberg coordinates toward intended corridor to test standoff clearance.</span>
            </div>
          )}

          {selectedScenarioType === 'SEA_ICE_INCREASE' && (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Sea-Ice Concentration Delta:</span>
                <span className="font-mono text-cyan-400 font-bold">+{sicIncreasePercent}%</span>
              </div>
              <input
                type="range"
                min="5"
                max="40"
                step="5"
                value={sicIncreasePercent}
                onChange={(e) => setSicIncreasePercent(Number(e.target.value))}
                className="w-full accent-cyan-400"
              />
              <span className="text-[10px] text-slate-500">Adds concentration across polar cells; triggers EXCESSIVE_SEA_ICE (NO-GO) if threshold exceeded.</span>
            </div>
          )}

          {selectedScenarioType === 'WEATHER_DETERIORATION' && (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Direct Weather Risk Delta:</span>
                <span className="font-mono text-cyan-400 font-bold">+{weatherDelta.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.50"
                step="0.05"
                value={weatherDelta}
                onChange={(e) => setWeatherDelta(Number(e.target.value))}
                className="w-full accent-cyan-400"
              />
              <span className="text-[10px] text-slate-500">Directly escalates Weather MLP risk score [0, 1] across the corridor.</span>
            </div>
          )}

          <div className="flex gap-3">
            {activeTab === 'SIMULATION' ? (
              <button
                onClick={handleRunSimulation}
                disabled={isSimulating}
                className="btn-primary flex-1 !py-2.5 text-xs font-bold flex items-center justify-center gap-2"
              >
                {isSimulating ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Recomputing Risk, Safety &amp; Routes...
                  </>
                ) : (
                  'RUN WHAT-IF ANALYSIS'
                )}
              </button>
            ) : (
              <button
                onClick={handleRunSensitivity}
                className="btn-primary flex-1 !py-2.5 text-xs font-bold bg-purple-600 hover:bg-purple-500"
              >
                RUN DECISION SENSITIVITY SWEEP
              </button>
            )}

            <button
              onClick={() => polarisStore.clearWhatIfSimulation()}
              className="btn-secondary !py-2.5 text-xs"
            >
              Reset
            </button>
          </div>
        </div>

        {/* What-If Simulation Results */}
        {activeTab === 'SIMULATION' && whatIf && comp && (
          <div className="glass-panel p-4 rounded-xl border border-slate-800 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider">Authoritative Backend Comparison</span>
              <span className={`px-2 py-0.5 text-[9px] font-extrabold rounded ${
                comp.route_changed ? 'bg-amber-950 text-amber-300 border border-amber-500/50' : 'bg-emerald-950 text-emerald-300 border border-emerald-500/50'
              }`}>
                ROUTE CHANGED: {comp.route_changed ? 'YES (DETOUR SELECTED)' : 'NO (BASELINE ROBUST)'}
              </span>
            </div>

            {/* Side by Side Metric Cards */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              {/* Baseline Card */}
              <div className="p-3.5 rounded-lg bg-slate-950/90 border border-slate-800 flex flex-col gap-2">
                <div className="flex justify-between items-center border-b border-slate-800 pb-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Baseline Route</span>
                  <span className="text-[10px] text-emerald-400 font-bold">{comp.baseline_profile}</span>
                </div>
                <div className="flex justify-between text-slate-300 text-[11px]">
                  <span>Distance:</span><strong className="font-mono text-white">{comp.baseline_distance_nm.toFixed(1)} NM</strong>
                </div>
                <div className="flex justify-between text-slate-300 text-[11px]">
                  <span>Transit Time:</span><strong className="font-mono text-white">{comp.baseline_transit_hours.toFixed(1)} h</strong>
                </div>
                <div className="flex justify-between text-slate-300 text-[11px]">
                  <span>Avg Risk Score:</span><strong className="font-mono text-emerald-400">{comp.baseline_average_risk.toFixed(1)}/100</strong>
                </div>
                <div className="flex justify-between text-slate-300 text-[11px]">
                  <span>Weighted Exposure:</span><strong className="font-mono text-white">{comp.baseline_weighted_risk_exposure.toFixed(1)}</strong>
                </div>
                <div className="flex justify-between text-slate-300 text-[11px]">
                  <span>Iceberg Clearance:</span>
                  <strong className="font-mono text-white">{comp.baseline_iceberg_clearance_km != null ? `${comp.baseline_iceberg_clearance_km.toFixed(1)} km` : 'N/A'}</strong>
                </div>
                <div className="flex justify-between text-slate-300 text-[11px]">
                  <span>Peak Sea-Ice:</span><strong className="font-mono text-white">{comp.baseline_max_sic_percent.toFixed(1)}%</strong>
                </div>
                <div className="flex justify-between text-slate-300 text-[11px]">
                  <span>Fuel Proxy Index:</span><strong className="font-mono text-white">{comp.baseline_fuel_proxy.toFixed(1)}</strong>
                </div>
              </div>

              {/* Scenario Card */}
              <div className="p-3.5 rounded-lg bg-slate-950/90 border border-cyan-500/40 flex flex-col gap-2">
                <div className="flex justify-between items-center border-b border-slate-800 pb-1.5">
                  <span className="text-[10px] font-bold text-cyan-300 uppercase">What-If Optimal</span>
                  <span className="text-[10px] text-cyan-400 font-bold">{comp.scenario_profile}</span>
                </div>
                <div className="flex justify-between text-slate-300 text-[11px]">
                  <span>Distance:</span>
                  <strong className="font-mono text-white">
                    {comp.scenario_distance_nm.toFixed(1)} NM
                    <span className="text-[9px] text-cyan-400 ml-1">({comp.distance_diff_nm >= 0 ? '+' : ''}{comp.distance_diff_nm.toFixed(1)})</span>
                  </strong>
                </div>
                <div className="flex justify-between text-slate-300 text-[11px]">
                  <span>Transit Time:</span>
                  <strong className="font-mono text-white">
                    {comp.scenario_transit_hours.toFixed(1)} h
                    <span className="text-[9px] text-cyan-400 ml-1">({comp.transit_time_diff_hours >= 0 ? '+' : ''}{comp.transit_time_diff_hours.toFixed(1)})</span>
                  </strong>
                </div>
                <div className="flex justify-between text-slate-300 text-[11px]">
                  <span>Avg Risk Score:</span>
                  <strong className="font-mono text-cyan-300">
                    {comp.scenario_average_risk.toFixed(1)}/100
                    <span className="text-[9px] ml-1">({comp.average_risk_diff >= 0 ? '+' : ''}{comp.average_risk_diff.toFixed(1)})</span>
                  </strong>
                </div>
                <div className="flex justify-between text-slate-300 text-[11px]">
                  <span>Weighted Exposure:</span>
                  <strong className="font-mono text-white">
                    {comp.scenario_weighted_risk_exposure.toFixed(1)}
                    <span className="text-[9px] text-cyan-400 ml-1">({comp.risk_exposure_change_percent >= 0 ? '+' : ''}{comp.risk_exposure_change_percent.toFixed(1)}%)</span>
                  </strong>
                </div>
                <div className="flex justify-between text-slate-300 text-[11px]">
                  <span>Iceberg Clearance:</span>
                  <strong className="font-mono text-white">
                    {comp.scenario_iceberg_clearance_km != null ? `${comp.scenario_iceberg_clearance_km.toFixed(1)} km` : 'N/A'}
                  </strong>
                </div>
                <div className="flex justify-between text-slate-300 text-[11px]">
                  <span>Peak Sea-Ice:</span><strong className="font-mono text-white">{comp.scenario_max_sic_percent.toFixed(1)}%</strong>
                </div>
                <div className="flex justify-between text-slate-300 text-[11px]">
                  <span>Fuel Proxy Index:</span><strong className="font-mono text-white">{comp.scenario_fuel_proxy.toFixed(1)}</strong>
                </div>
              </div>
            </div>

            {/* Dynamic Runtime Decision Explanation */}
            <div className="p-3.5 rounded-lg bg-cyan-950/40 border border-cyan-600/40 text-xs flex flex-col gap-1.5 text-cyan-100">
              <strong className="text-white text-xs flex items-center gap-1.5">
                <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Runtime Decision Synthesis:
              </strong>
              <p className="leading-relaxed text-[11px] text-slate-200">{whatIf.dynamic_decision_explanation}</p>
              <div className="pt-1 text-[11px] text-cyan-300 font-semibold border-t border-cyan-800/40">
                Action: {whatIf.operational_recommendation}
              </div>
            </div>
          </div>
        )}

        {/* Sensitivity Sweep Results */}
        {activeTab === 'SENSITIVITY' && sens && (
          <div className="glass-panel p-4 rounded-xl border border-slate-800 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">Decision Boundary Sensitivity Analysis</span>
              <span className="text-[10px] text-slate-400">Inflection Points: <strong>{sens.inflection_points_found}</strong></span>
            </div>

            <div className="overflow-x-auto text-[11px]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-1.5 px-2">Step</th>
                    <th className="py-1.5 px-2">{sens.parameter_name}</th>
                    <th className="py-1.5 px-2">Recommended</th>
                    <th className="py-1.5 px-2">Dist (NM)</th>
                    <th className="py-1.5 px-2">Exposure</th>
                    <th className="py-1.5 px-2">Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {sens.sweep_points.map((pt, idx) => (
                    <tr key={idx} className={`border-b border-slate-900 ${pt.route_changed_from_baseline ? 'bg-amber-950/30' : ''}`}>
                      <td className="py-1.5 px-2 font-mono text-slate-400">{pt.step_index}</td>
                      <td className="py-1.5 px-2 font-mono text-cyan-300">{pt.parameter_label}</td>
                      <td className="py-1.5 px-2 text-white font-semibold">{pt.recommended_profile}</td>
                      <td className="py-1.5 px-2 font-mono text-slate-300">{pt.total_distance_nm.toFixed(1)}</td>
                      <td className="py-1.5 px-2 font-mono text-slate-300">{pt.weighted_risk_exposure.toFixed(1)}</td>
                      <td className="py-1.5 px-2">
                        {pt.route_changed_from_baseline ? (
                          <span className="text-amber-400 text-[10px] font-bold">DETOURED</span>
                        ) : (
                          <span className="text-emerald-400 text-[10px] font-bold">MAINTAINED</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-3 rounded-lg bg-purple-950/30 border border-purple-600/30 text-[11px] text-purple-200">
              <strong className="text-white">Decision Boundary Synthesis: </strong>
              {sens.decision_boundary_explanation}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-xs">
          <button onClick={() => polarisStore.clearWhatIfSimulation()} className="btn-secondary !py-2 text-xs">Reset All What-If</button>
          <button onClick={onClose} className="btn-primary !py-2 text-xs">Return to Main View &rarr;</button>
        </div>
      </div>
    </div>
  );
};

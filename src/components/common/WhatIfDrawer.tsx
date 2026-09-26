import React, { useState } from 'react';
import { PolarisAppState } from '../../types/state';
import { BackendScenarioType } from '../../types/scenario';
import { polarisStore } from '../../store/polarisStore';

interface WhatIfDrawerProps {
  state: PolarisAppState;
  isOpen: boolean;
  onClose: () => void;
}

function DR({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: accent ? 'var(--info)' : 'var(--text-primary)' }}>{value}</span>
    </div>
  );
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
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(14,35,96,0.4)', backdropFilter: 'blur(4px)',
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div style={{
        width: '100%', maxWidth: 560, height: '100%',
        background: 'var(--surface-card)', borderLeft: '1px solid var(--border)',
        boxShadow: 'var(--shadow-lg)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>What-If Engine</h2>
            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Backend counterfactual simulation & sensitivity analysis</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)' }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
          {(['SIMULATION', 'SENSITIVITY'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: '10px 16px', border: 'none', cursor: 'pointer',
              borderBottom: activeTab === tab ? '2px solid var(--navy-800)' : '2px solid transparent',
              background: 'none', fontSize: 12, fontWeight: activeTab === tab ? 700 : 500,
              color: activeTab === tab ? 'var(--navy-800)' : 'var(--text-muted)',
            }}>
              {tab === 'SIMULATION' ? 'Scenario Simulation' : 'Sensitivity Sweep'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Controls */}
          <div style={{ padding: 16, borderRadius: 'var(--r-lg)', background: 'var(--surface-alt)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>PERTURBATION TYPE</label>
              <select value={selectedScenarioType} onChange={e => setSelectedScenarioType(e.target.value as BackendScenarioType)}
                className="p-input" style={{ fontSize: 12, fontFamily: 'var(--font-sans)' }}>
                <option value="ICEBERG_DRIFT">Iceberg Drift — Encroach on corridor</option>
                <option value="SEA_ICE_INCREASE">Sea-Ice Expansion — Rapid SIC increase</option>
                <option value="WEATHER_DETERIORATION">Weather Deterioration — Gale / high sea</option>
                <option value="ICEBERG_CLEARANCE">Iceberg Clearance — Hazard deflected</option>
                <option value="SAFETY_PRIORITY_CHANGE">Objective: Extreme Safety Priority</option>
                <option value="EFFICIENCY_PRIORITY_CHANGE">Objective: Transit Time Priority</option>
              </select>
            </div>

            {selectedScenarioType === 'ICEBERG_DRIFT' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Drift Magnitude</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--info)' }}>{icebergShiftKm} km</span>
                </div>
                <input type="range" min="10" max="120" step="5" value={icebergShiftKm}
                  onChange={e => setIcebergShiftKm(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--blue-500)' }} />
                <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4 }}>Shifts iceberg coordinates toward corridor to test standoff clearance.</p>
              </div>
            )}
            {selectedScenarioType === 'SEA_ICE_INCREASE' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-muted)' }}>SIC Delta</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--info)' }}>+{sicIncreasePercent}%</span>
                </div>
                <input type="range" min="5" max="40" step="5" value={sicIncreasePercent}
                  onChange={e => setSicIncreasePercent(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--blue-500)' }} />
              </div>
            )}
            {selectedScenarioType === 'WEATHER_DETERIORATION' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Weather Risk Delta</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--info)' }}>+{weatherDelta.toFixed(2)}</span>
                </div>
                <input type="range" min="0.05" max="0.50" step="0.05" value={weatherDelta}
                  onChange={e => setWeatherDelta(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--blue-500)' }} />
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              {activeTab === 'SIMULATION' ? (
                <button onClick={handleRunSimulation} disabled={isSimulating} className="btn btn-primary" style={{ flex: 1 }}>
                  {isSimulating ? 'Recomputing…' : 'Run What-If Analysis'}
                </button>
              ) : (
                <button onClick={handleRunSensitivity} className="btn btn-primary" style={{ flex: 1, background: '#7C68C8', borderColor: '#7C68C8' }}>
                  Run Sensitivity Sweep
                </button>
              )}
              <button onClick={() => polarisStore.clearWhatIfSimulation()} className="btn btn-secondary">Reset</button>
            </div>
          </div>

          {/* Simulation Results */}
          {activeTab === 'SIMULATION' && whatIf && comp && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="section-label">BACKEND COMPARISON</span>
                <span className={`badge ${comp.route_changed ? 'badge-warning' : 'badge-safe'}`}>
                  ROUTE {comp.route_changed ? 'CHANGED' : 'MAINTAINED'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* Baseline */}
                <div className="p-card" style={{ padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: '0.04em' }}>BASELINE</div>
                  <DR label="Profile" value={comp.baseline_profile} />
                  <DR label="Distance" value={`${comp.baseline_distance_nm.toFixed(1)} nm`} />
                  <DR label="Transit" value={`${comp.baseline_transit_hours.toFixed(1)} h`} />
                  <DR label="Avg Risk" value={`${comp.baseline_average_risk.toFixed(1)}/100`} />
                  <DR label="Exposure" value={comp.baseline_weighted_risk_exposure.toFixed(1)} />
                  <DR label="Berg Clear." value={comp.baseline_iceberg_clearance_km != null ? `${comp.baseline_iceberg_clearance_km.toFixed(1)} km` : 'N/A'} />
                  <DR label="Peak SIC" value={`${comp.baseline_max_sic_percent.toFixed(1)}%`} />
                  <DR label="Fuel" value={comp.baseline_fuel_proxy.toFixed(1)} />
                </div>

                {/* Scenario */}
                <div className="p-card" style={{ padding: 12, borderColor: 'var(--blue-200)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--info)', marginBottom: 8, letterSpacing: '0.04em' }}>WHAT-IF</div>
                  <DR label="Profile" value={comp.scenario_profile} accent />
                  <DR label="Distance" value={<>{comp.scenario_distance_nm.toFixed(1)} nm <small style={{ color: 'var(--info)' }}>({comp.distance_diff_nm >= 0 ? '+' : ''}{comp.distance_diff_nm.toFixed(1)})</small></>} />
                  <DR label="Transit" value={<>{comp.scenario_transit_hours.toFixed(1)} h <small style={{ color: 'var(--info)' }}>({comp.transit_time_diff_hours >= 0 ? '+' : ''}{comp.transit_time_diff_hours.toFixed(1)})</small></>} />
                  <DR label="Avg Risk" value={<>{comp.scenario_average_risk.toFixed(1)}/100 <small style={{ color: 'var(--info)' }}>({comp.average_risk_diff >= 0 ? '+' : ''}{comp.average_risk_diff.toFixed(1)})</small></>} />
                  <DR label="Exposure" value={<>{comp.scenario_weighted_risk_exposure.toFixed(1)} <small style={{ color: 'var(--info)' }}>({comp.risk_exposure_change_percent >= 0 ? '+' : ''}{comp.risk_exposure_change_percent.toFixed(1)}%)</small></>} />
                  <DR label="Berg Clear." value={comp.scenario_iceberg_clearance_km != null ? `${comp.scenario_iceberg_clearance_km.toFixed(1)} km` : 'N/A'} />
                  <DR label="Peak SIC" value={`${comp.scenario_max_sic_percent.toFixed(1)}%`} />
                  <DR label="Fuel" value={comp.scenario_fuel_proxy.toFixed(1)} />
                </div>
              </div>

              {/* Decision explanation */}
              <div style={{ padding: 12, borderRadius: 'var(--r-md)', background: 'var(--blue-50)', border: '1px solid var(--border)', fontSize: 12 }}>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="14" height="14" fill="none" stroke="var(--info)" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  Decision Synthesis
                </div>
                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 6 }}>{whatIf.dynamic_decision_explanation}</p>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--info)', paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                  Action: {whatIf.operational_recommendation}
                </div>
              </div>
            </div>
          )}

          {/* Sensitivity Results */}
          {activeTab === 'SENSITIVITY' && sens && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="section-label">SENSITIVITY ANALYSIS</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Inflection Points: <strong>{sens.inflection_points_found}</strong></span>
              </div>

              <div style={{ overflowX: 'auto', borderRadius: 'var(--r-md)', border: '1px solid var(--border)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-alt)', borderBottom: '1px solid var(--border)' }}>
                      {['Step', sens.parameter_name, 'Recommended', 'Dist', 'Exposure', 'Decision'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sens.sweep_points.map((pt, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border)', background: pt.route_changed_from_baseline ? 'var(--warning-bg)' : 'transparent' }}>
                        <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{pt.step_index}</td>
                        <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', color: 'var(--info)' }}>{pt.parameter_label}</td>
                        <td style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--text-primary)' }}>{pt.recommended_profile}</td>
                        <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)' }}>{pt.total_distance_nm.toFixed(1)}</td>
                        <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)' }}>{pt.weighted_risk_exposure.toFixed(1)}</td>
                        <td style={{ padding: '6px 10px' }}>
                          <span className={`badge ${pt.route_changed_from_baseline ? 'badge-warning' : 'badge-safe'}`} style={{ fontSize: 9 }}>
                            {pt.route_changed_from_baseline ? 'DETOURED' : 'MAINTAINED'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ padding: 12, borderRadius: 'var(--r-md)', background: '#F3F0FF', border: '1px solid #E0DAFF', fontSize: 12 }}>
                <strong style={{ color: 'var(--text-primary)' }}>Decision Boundary: </strong>
                <span style={{ color: 'var(--text-secondary)' }}>{sens.decision_boundary_explanation}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
          <button onClick={() => polarisStore.clearWhatIfSimulation()} className="btn btn-ghost btn-sm">Reset What-If</button>
          <button onClick={onClose} className="btn btn-primary btn-sm">Close →</button>
        </div>
      </div>
    </div>
  );
};

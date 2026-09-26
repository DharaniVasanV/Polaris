import React, { useState } from 'react';
import { PolarisAppState } from '../types/state';
import { ScenarioId } from '../types/scenario';
import { PolarMap } from '../components/map/PolarMap';
import { polarisStore } from '../store/polarisStore';
import { WhatIfDrawer } from '../components/common/WhatIfDrawer';

interface Props { state: PolarisAppState; }

const SCENARIOS: { id: ScenarioId; label: string; desc: string }[] = [
  { id: 'NORMAL',                  label: 'Baseline (Normal)',        desc: 'Current environmental conditions.' },
  { id: 'HIGH_WAVES',              label: 'High Wave Scenario',       desc: 'Elevated sea state — wave heights +2.5m.' },
  { id: 'ICE_GROWTH',              label: 'Ice Pack Expansion',       desc: 'SIC increases significantly across the grid.' },
  { id: 'ICEBERG_SHIFT',           label: 'Iceberg Drift Shift',      desc: '45° course change in principal tabular berg.' },
  { id: 'SAFETY_BUFFER_INCREASED', label: 'Maximum Safety Priority',  desc: 'Maximize standoff from all hazards.' },
  { id: 'VESSEL_SPEED_REDUCED',    label: 'Reduced Speed Transit',    desc: 'Vessel speed cut by 30% — fuel saver mode.' },
];

export const WhatIfScreen: React.FC<Props> = ({ state }) => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="dash-grid">

      {/* ═══ LEFT — Scenario Selector ═══ */}
      <aside style={{
        background: 'var(--surface-card)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '10px 16px', background: 'var(--navy-800)' }}>
          <span style={{ color: 'var(--text-inverse)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>SCENARIO SELECTOR</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {SCENARIOS.map(sc => {
            const active = state.activeScenarioId === sc.id;
            return (
              <button key={sc.id} onClick={() => polarisStore.applyScenario(sc.id)} style={{
                padding: '10px 12px', borderRadius: 'var(--r-md)', border: 'none', cursor: 'pointer',
                width: '100%', textAlign: 'left',
                background: active ? 'var(--blue-50)' : 'var(--surface-alt)',
                borderLeft: active ? '3px solid var(--navy-800)' : '3px solid transparent',
                transition: 'all 0.1s',
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{sc.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{sc.desc}</div>
              </button>
            );
          })}

          <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <button onClick={() => setDrawerOpen(true)} className="btn btn-secondary" style={{ width: '100%', fontSize: 12 }}>
              Open Backend What-If Engine →
            </button>
          </div>
        </div>
      </aside>

      {/* ═══ CENTER — Map ═══ */}
      <div style={{ position: 'relative', overflow: 'hidden', minWidth: 0 }}>
        <PolarMap state={state} />
        <div style={{
          position: 'absolute', top: 12, left: 12, zIndex: 20,
          background: 'rgba(255,255,255,0.92)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)', padding: '6px 12px',
          boxShadow: 'var(--shadow-sm)', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>What-If Scenario Map</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Active: {state.activeScenario?.title ?? 'Normal'}
          </div>
        </div>

        {/* Result overlay */}
        {state.activeWhatIfResult?.scenario_optimization && (
          <div style={{
            position: 'absolute', bottom: 12, left: 12, zIndex: 20,
            background: 'rgba(255,255,255,0.96)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)', padding: 12, width: 260,
            boxShadow: 'var(--shadow-md)',
          }}>
            <span className="section-label" style={{ display: 'block', marginBottom: 6 }}>SCENARIO RESULT</span>
            <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
              <span style={{ color: 'var(--text-muted)' }}>Routes Evaluated</span>
              <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                {state.activeWhatIfResult.scenario_optimization?.candidate_routes?.length ?? 0}
              </span>
            </div>
            {state.activeWhatIfResult.dynamic_decision_explanation && (
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
                {state.activeWhatIfResult.dynamic_decision_explanation}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ═══ RIGHT — Impact Summary ═══ */}
      <aside style={{
        background: 'var(--surface-card)', borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '10px 16px', background: 'var(--navy-800)' }}>
          <span style={{ color: 'var(--text-inverse)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>IMPACT SUMMARY</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

          <div style={{
            padding: '12px', borderRadius: 'var(--r-md)',
            background: 'var(--blue-50)', border: '1px solid var(--border)', marginBottom: 16,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, letterSpacing: '0.04em' }}>ACTIVE SCENARIO</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{state.activeScenario?.title ?? 'Normal'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{state.activeScenario?.description ?? 'Baseline conditions.'}</div>
          </div>

          <span className="section-label" style={{ display: 'block', marginBottom: 8 }}>RECOMMENDED ROUTE</span>
          {state.routes.filter(r => r.status === 'RECOMMENDED').map(route => (
            <div key={route.id} style={{ padding: '10px', borderRadius: 'var(--r-md)', background: 'var(--surface-alt)', border: '1px solid var(--border)', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>{route.title}</div>
              <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                <span style={{ color: 'var(--text-muted)' }}>Distance</span>
                <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{route.metrics.totalDistanceNm} nm</span>
              </div>
              <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                <span style={{ color: 'var(--text-muted)' }}>ETA</span>
                <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{route.metrics.estimatedTransitFormatted}</span>
              </div>
              <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                <span style={{ color: 'var(--text-muted)' }}>Avg Risk</span>
                <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{route.metrics.averageRisk}/100</span>
              </div>
            </div>
          ))}

          <div style={{
            marginTop: 12, padding: '10px', borderRadius: 'var(--r-md)',
            background: 'var(--warning-bg)', border: '1px solid var(--warning-border)',
            fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5,
          }}>
            <strong>Note:</strong> Scenario simulations update the local environment model and route candidates.
            Use the backend What-If Engine for full sensitivity sweep analysis.
          </div>
        </div>
      </aside>

      <WhatIfDrawer state={state} isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
};

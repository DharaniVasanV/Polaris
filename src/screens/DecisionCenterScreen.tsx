import React, { useState } from 'react';
import { PolarisAppState } from '../types/state';
import { PolarMap } from '../components/map/PolarMap';
import { polarisStore } from '../store/polarisStore';
import { WhyNotShortestModal } from '../components/common/WhyNotShortestModal';
import { WhyThisRouteModal } from '../components/common/WhyThisRouteModal';

interface Props { state: PolarisAppState; }

export const DecisionCenterScreen: React.FC<Props> = ({ state }) => {
  const activeRoute = state.routes.find(r => r.id === state.selectedRouteId) || state.routes[0];
  const shortestRoute = state.routes.find(r => r.type === 'SHORTEST_REJECTED' || r.id === 'route_shortest');
  const isShifted = state.activeScenarioId === 'ICEBERG_SHIFT';
  const isApproved = state.activeRouteStatus === 'APPROVED_BY_HUMAN';
  const isSimulating = state.isHazardSimulationRunning;

  const [whyNotOpen, setWhyNotOpen] = useState(false);
  const [whyThisOpen, setWhyThisOpen] = useState(false);

  return (
    <div className="dash-grid">
      {/* LEFT — Controls */}
      <aside style={{
        background: 'var(--surface-card)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '10px 16px', background: 'var(--navy-800)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-inverse)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>DECISION CENTER</span>
          <span className="badge badge-safe" style={{ fontSize: 8 }}>BRIDGE OPS</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

          <button onClick={() => polarisStore.runHazardSimulation()} disabled={isSimulating} className="btn btn-danger" style={{ width: '100%' }}>
            {isSimulating ? `Simulating (${state.hazardSimulationStep}/7)…` : 'Simulate Hazard (B-22 Shift)'}
          </button>

          <div style={{ padding: 12, borderRadius: 'var(--r-lg)', background: isShifted && !isApproved ? 'var(--warning-bg)' : 'var(--surface-alt)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span className="section-label">ACTIVE ROUTE</span>
              {isApproved ? <span className="badge badge-safe">APPROVED</span>
               : isShifted ? <span className="badge badge-warning">REPLAN</span>
               : <span className="badge badge-safe">SAFE</span>}
            </div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{activeRoute.title}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {[
                { l: 'CLEARANCE', v: `${activeRoute.metrics.minIcebergClearanceKm} km`, c: activeRoute.metrics.minIcebergClearanceKm < 12 ? 'var(--critical)' : 'var(--success)' },
                { l: 'RISK', v: `${activeRoute.metrics.averageRisk}/100`, c: activeRoute.metrics.averageRisk > 50 ? 'var(--warning)' : 'var(--success)' },
                { l: 'ETA', v: activeRoute.metrics.estimatedTransitFormatted, c: 'var(--text-primary)' },
                { l: 'CONFIDENCE', v: `${activeRoute.metrics.confidencePercent}%`, c: 'var(--info)' },
              ].map(({ l, v, c }) => (
                <div key={l} style={{ padding: 6, borderRadius: 'var(--r-sm)', background: 'var(--surface-card)', border: '1px solid var(--border)', textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-faint)', letterSpacing: '0.04em' }}>{l}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: c }}>{v}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 8 }}>{activeRoute.dynamicExplanation}</p>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button onClick={() => setWhyThisOpen(true)} className="btn btn-ghost btn-sm" style={{ flex: 1 }}>Why This?</button>
              <button onClick={() => setWhyNotOpen(true)} className="btn btn-ghost btn-sm" style={{ flex: 1 }}>Why Not Shortest?</button>
            </div>
          </div>

          <div style={{ padding: 12, borderRadius: 'var(--r-lg)', background: 'var(--surface-alt)', border: '1px solid var(--border)' }}>
            <span className="section-label" style={{ display: 'block', marginBottom: 8 }}>HUMAN DECISION</span>
            <button onClick={() => { polarisStore.approveRoute(state.selectedRouteId || 'route_safe_a'); }} className="btn btn-primary" style={{ width: '100%', marginBottom: 8 }}>
              ✓ Approve Route
            </button>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => polarisStore.selectRoute('route_alternative_b')} className="btn btn-secondary btn-sm" style={{ flex: 1 }}>Request Alternate</button>
              <button className="btn btn-ghost btn-sm" style={{ flex: 1, color: 'var(--warning)' }}>Manual Override</button>
            </div>
          </div>
        </div>
      </aside>

      {/* CENTER — Map */}
      <div style={{ position: 'relative', overflow: 'hidden', minWidth: 0 }}>
        <PolarMap state={state} />
        <div style={{
          position: 'absolute', top: 12, left: 12, zIndex: 20,
          background: 'rgba(255,255,255,0.92)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)', padding: '6px 12px', boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>Bridge Tactical View</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Real-time hazard evaluation</div>
        </div>

        {/* Alert stack */}
        <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 300, zIndex: 20 }}>
          {state.alerts.map(alert => {
            const isCrit = alert.severity === 'CRITICAL';
            const isWarn = alert.severity === 'WARNING';
            return (
              <div key={alert.id} style={{
                padding: 12, borderRadius: 'var(--r-md)',
                background: isCrit ? 'var(--critical-bg)' : isWarn ? 'var(--warning-bg)' : 'var(--info-bg)',
                border: `1px solid ${isCrit ? 'var(--critical-border)' : isWarn ? 'var(--warning-border)' : 'var(--border)'}`,
                boxShadow: 'var(--shadow-md)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span className={`badge ${isCrit ? 'badge-critical' : isWarn ? 'badge-warning' : 'badge-info'}`} style={{ fontSize: 8 }}>{alert.severity}</span>
                  <button onClick={() => polarisStore.acknowledgeAlert(alert.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>×</button>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{alert.title}</div>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{alert.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT — empty panel for symmetry */}
      <aside style={{ background: 'var(--surface-card)', borderLeft: '1px solid var(--border)' }} />

      {whyNotOpen && shortestRoute && activeRoute && <WhyNotShortestModal state={state} shortestRoute={shortestRoute} recommendedRoute={activeRoute} onClose={() => setWhyNotOpen(false)} />}
      {whyThisOpen && activeRoute && <WhyThisRouteModal state={state} route={activeRoute} onClose={() => setWhyThisOpen(false)} />}
    </div>
  );
};

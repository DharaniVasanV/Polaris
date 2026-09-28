import React from 'react';
import { PolarisAppState } from '../types/state';
import { PolarMap } from '../components/map/PolarMap';
import { polarisStore } from '../store/polarisStore';
import { formatRiskBadge } from '../utils/formatters';

interface Props { state: PolarisAppState; }

function DR({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '3px 0', fontSize: 12 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

export const RoutesScreen: React.FC<Props> = ({ state }) => {
  const activeRoute = state.routes.find(r => r.id === state.selectedRouteId) || state.routes[0];

  return (
    <div className="dash-grid">

      {/* ═══ LEFT — Route List ═══ */}
      <aside style={{
        background: 'var(--surface-card)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '10px 16px', background: 'var(--navy-800)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-inverse)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>ROUTE CANDIDATES</span>
          <span style={{ fontSize: 10, color: 'var(--text-on-navy)', fontFamily: 'var(--font-mono)' }}>{state.routes.length} routes</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {state.routes.map(route => {
            const sel = route.id === state.selectedRouteId;
            const rec = route.status === 'RECOMMENDED';
            const rej = route.type === 'SHORTEST_REJECTED' || route.status === 'REJECTED';
            return (
              <button key={route.id} onClick={() => polarisStore.selectRoute(route.id)} style={{
                display: 'flex', flexDirection: 'column', gap: 6,
                padding: '8px 12px', borderRadius: 'var(--r-md)',
                marginBottom: 8, border: '1px solid transparent', cursor: 'pointer',
                width: '100%', textAlign: 'left', transition: 'all 0.1s',
                background: sel ? 'var(--surface-blue)' : rej ? 'var(--critical-bg)' : 'var(--surface-card)',
                borderLeft: sel ? '4px solid var(--blue-500)' : '4px solid transparent',
                outline: sel ? '1px solid var(--blue-300)' : '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: route.color || 'var(--blue-300)', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: rej ? 'var(--critical)' : 'var(--text-primary)', textDecoration: rej ? 'line-through' : 'none' }}>
                      {route.title}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {rej && <span className="badge badge-critical">REJECTED</span>}
                    {rec && <span className="badge badge-safe">RECOMMENDED</span>}
                    {!rej && !rec && <span className="badge badge-muted">{route.status}</span>}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, fontSize: 11, color: rej ? 'var(--critical)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  <span>{route.metrics.totalDistanceNm} nm</span>
                  <span>{route.metrics.estimatedTransitFormatted}</span>
                  <span>Risk {route.metrics.averageRisk}</span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ═══ CENTER — Route Map ═══ */}
      <div style={{ position: 'relative', overflow: 'hidden', minWidth: 0 }}>
        <PolarMap state={state} />
        <div style={{
          position: 'absolute', top: 12, left: 12, zIndex: 20,
          background: 'rgba(255,255,255,0.92)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)', padding: '6px 12px',
          boxShadow: 'var(--shadow-sm)', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>Route Comparison Map</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Click a route card to highlight</div>
        </div>
      </div>

      {/* ═══ RIGHT — Selected Route Detail ═══ */}
      <aside style={{
        background: 'var(--surface-card)', borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '10px 16px', background: 'var(--navy-800)' }}>
          <span style={{ color: 'var(--text-inverse)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>ROUTE DETAIL</span>
        </div>
        {activeRoute && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>{activeRoute.title}</h3>

            <span className="section-label" style={{ display: 'block', marginBottom: 8 }}>METRICS</span>
            <DR label="Distance" value={`${activeRoute.metrics.totalDistanceNm} nm`} />
            <DR label="Transit" value={activeRoute.metrics.estimatedTransitFormatted} />
            <DR label="Avg Risk" value={`${activeRoute.metrics.averageRisk}/100`} />
            <DR label="Max SIC" value={`${activeRoute.metrics.maxSicPercent}%`} />
            <DR label="Min Berg Clearance" value={`${activeRoute.metrics.minIcebergClearanceKm} km`} />
            <DR label="Critical Cells" value={String(activeRoute.metrics.criticalCellsCount ?? 0)} />
            <DR label="Fuel Index" value={activeRoute.metrics.estimatedFuelIndex.toFixed(1)} />

            {activeRoute.dynamicExplanation && (
              <>
                <span className="section-label" style={{ display: 'block', marginTop: 16, marginBottom: 8 }}>EXPLANATION</span>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{activeRoute.dynamicExplanation}</p>
              </>
            )}

            {activeRoute.tradeOffVsShortest && (
              <>
                <span className="section-label" style={{ display: 'block', marginTop: 16, marginBottom: 8 }}>VS SHORTEST PATH</span>
                <DR label="Distance Δ" value={`+${activeRoute.tradeOffVsShortest.distanceDiffNm} nm`} />
                <DR label="ETA Δ" value={`+${activeRoute.tradeOffVsShortest.etaDiffHours.toFixed(1)} h`} />
                <DR label="Hazard Reduction" value={`${activeRoute.tradeOffVsShortest.hazardExposureReductionPercent}%`} />
              </>
            )}
          </div>
        )}
      </aside>
    </div>
  );
};

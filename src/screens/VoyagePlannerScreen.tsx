import React, { useState } from 'react';
import { PolarisAppState } from '../types/state';
import { PolarMap } from '../components/map/PolarMap';
import { polarisStore } from '../store/polarisStore';
import { WhyNotShortestModal } from '../components/common/WhyNotShortestModal';
import { WhyThisRouteModal } from '../components/common/WhyThisRouteModal';
import { VesselCoordinateControl } from '../components/common/VesselCoordinateControl';

interface Props { state: PolarisAppState; }

function DR({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '3px 0', fontSize: 12 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

export const VoyagePlannerScreen: React.FC<Props> = ({ state }) => {
  const activeRoute = state.routes.find(r => r.id === state.selectedRouteId) || state.routes[0];
  const shortestRoute = state.routes.find(r => r.type === 'SHORTEST_REJECTED' || r.id === 'route_shortest');
  const isGenerating = state.isGeneratingRoute;

  const [whyNotOpen, setWhyNotOpen] = useState(false);
  const [whyThisOpen, setWhyThisOpen] = useState(false);

  return (
    <div className="dash-grid">

      {/* ═══ LEFT — Mission Parameters ═══ */}
      <aside style={{
        background: 'var(--surface-card)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '10px 16px', background: 'var(--navy-800)' }}>
          <span style={{ color: 'var(--text-inverse)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>MISSION PLANNER</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

          <button onClick={() => polarisStore.loadDemoVoyage()} className="btn btn-secondary" style={{ width: '100%', fontSize: 12 }}>
            Load Demo Voyage (Queen Maud → Bharati)
          </button>

          <VesselCoordinateControl state={state} />

          <div>
            <span className="section-label" style={{ marginBottom: 8, display: 'block' }}>CORRIDORS</span>
            <DR label="Departure" value={state.departureLocation.name} />
            <DR label="Destination" value={state.destinationLocation.name} />
          </div>

          <div>
            <span className="section-label" style={{ marginBottom: 8, display: 'block' }}>VESSEL SAFETY</span>
            <DR label="Vessel" value={state.vessel.name} />
            <DR label="Ice Class" value={state.vessel.iceClass} />
            <DR label="Draft" value={`${state.vessel.draftMeters} m`} />
            <DR label="Speed" value={`${state.vessel.nominalSpeedKnots} kn`} />
            <DR label="SIC Limit" value={`${state.vessel.safeSicThresholdPercent}%`} />
            <DR label="Berg Buffer" value={`${state.vessel.icebergSafetyBufferKm} km`} />
            <DR label="Max Wave" value={`${state.vessel.maxSafeWaveHeightMeters} m`} />
          </div>

          <button
            onClick={() => polarisStore.generateRoutes()}
            disabled={isGenerating}
            className="btn btn-primary"
            style={{ width: '100%' }}
          >
            {isGenerating ? 'Generating Routes…' : 'Generate Routes'}
          </button>
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
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>Route Planning Map</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {state.routes.length} candidates evaluated
          </div>
        </div>
      </div>

      {/* ═══ RIGHT — Route Constraints & Results ═══ */}
      <aside style={{
        background: 'var(--surface-card)', borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '10px 16px', background: 'var(--navy-800)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-inverse)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>ROUTE CANDIDATES</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>

          {state.routes.map(route => {
            const sel = route.id === state.selectedRouteId;
            const rej = route.type === 'SHORTEST_REJECTED' || route.status === 'REJECTED';
            return (
              <button key={route.id} onClick={() => polarisStore.selectRoute(route.id)} style={{
                padding: '10px 12px', borderRadius: 'var(--r-md)', border: 'none', cursor: 'pointer',
                width: '100%', textAlign: 'left',
                background: sel ? 'var(--blue-50)' : 'var(--surface-alt)',
                borderLeft: sel ? '3px solid var(--navy-800)' : '3px solid transparent',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: route.color || 'var(--blue-300)' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: rej ? 'var(--text-faint)' : 'var(--text-primary)', textDecoration: rej ? 'line-through' : 'none', flex: 1 }}>{route.title}</span>
                  <span className={`badge ${route.status === 'RECOMMENDED' ? 'badge-safe' : rej ? 'badge-critical' : 'badge-muted'}`} style={{ fontSize: 8 }}>{route.status}</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {route.metrics.totalDistanceNm}nm · {route.metrics.estimatedTransitFormatted} · Risk {route.metrics.averageRisk}
                </div>
              </button>
            );
          })}

          {activeRoute && (
            <div style={{ marginTop: 8, padding: 12, borderRadius: 'var(--r-md)', background: 'var(--surface-alt)', border: '1px solid var(--border)' }}>
              <span className="section-label" style={{ display: 'block', marginBottom: 8 }}>SELECTED: {activeRoute.title}</span>
              <DR label="Distance" value={`${activeRoute.metrics.totalDistanceNm} nm`} />
              <DR label="ETA" value={activeRoute.metrics.estimatedTransitFormatted} />
              <DR label="Avg Risk" value={`${activeRoute.metrics.averageRisk}/100`} />
              <DR label="Max SIC" value={`${activeRoute.metrics.maxSicPercent}%`} />
              <DR label="Berg Clearance" value={`${activeRoute.metrics.minIcebergClearanceKm} km`} />

              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>{activeRoute.dynamicExplanation}</p>

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={() => setWhyThisOpen(true)} className="btn btn-ghost btn-sm" style={{ flex: 1 }}>Why This?</button>
                {shortestRoute && <button onClick={() => setWhyNotOpen(true)} className="btn btn-ghost btn-sm" style={{ flex: 1 }}>Why Not Shortest?</button>}
              </div>

              {activeRoute.status !== 'APPROVED_BY_HUMAN' && activeRoute.status !== 'REJECTED' && (
                <button onClick={() => polarisStore.approveRoute(activeRoute.id)} className="btn btn-primary btn-sm" style={{ width: '100%', marginTop: 8 }}>
                  Approve Route
                </button>
              )}
            </div>
          )}
        </div>
      </aside>

      {whyThisOpen && activeRoute && <WhyThisRouteModal state={state} route={activeRoute} onClose={() => setWhyThisOpen(false)} />}
      {whyNotOpen && shortestRoute && activeRoute && <WhyNotShortestModal state={state} shortestRoute={shortestRoute} recommendedRoute={activeRoute} onClose={() => setWhyNotOpen(false)} />}
    </div>
  );
};

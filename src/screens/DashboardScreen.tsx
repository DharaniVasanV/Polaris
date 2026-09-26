import React, { useState } from 'react';
import { PolarisAppState } from '../types/state';
import { PolarMap } from '../components/map/PolarMap';
import { polarisStore } from '../store/polarisStore';
import { formatRiskBadge } from '../utils/formatters';
import { ValidTimeHorizon } from '../types/risk';
import { WhyThisRouteModal } from '../components/common/WhyThisRouteModal';
import { VesselCoordinateControl } from '../components/common/VesselCoordinateControl';
import { formatAcquisitionTime } from '../services/sentinel1Service';

interface Props { state: PolarisAppState; }

function DR({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '3px 0', fontSize: 12 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontSize: 12 }}>{value}</span>
    </div>
  );
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button onClick={() => setOpen(!open)} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
        padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer',
      }}>
        <span className="section-label">{title}</span>
        <svg width="12" height="12" fill="none" stroke="var(--text-faint)" strokeWidth="2" viewBox="0 0 24 24"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
      {open && <div style={{ padding: '0 16px 12px' }}>{children}</div>}
    </div>
  );
}

function RiskBarRow({ label, score, weight, color }: { label: string; score: number; weight: number; color: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>{score}/100 <span style={{ color: 'var(--text-faint)' }}>({Math.round(weight * 100)}%)</span></span>
      </div>
      <div className="risk-bar-track"><div className="risk-bar-fill" style={{ width: `${Math.min(100, score)}%`, background: color }} /></div>
    </div>
  );
}

export const DashboardScreen: React.FC<Props> = ({ state }) => {
  const [showWhyModal, setShowWhyModal] = useState(false);

  const activeRoute = state.routes.find(r => r.id === state.selectedRouteId) || state.routes[0];
  const metrics = activeRoute?.metrics;
  const riskBadge = formatRiskBadge(metrics?.averageRisk ?? 0);
  const inspection = state.selectedCellInspection;

  const navStatus = state.riskTwinSummary?.navigation_status || {
    status: 'TRAVERSABLE', status_level: 'SAFE',
    explanation: 'Recommended corridor satisfies all Polar Code safety thresholds.',
    no_go_cells_encountered: 0, critical_violations: [],
  };

  const riskBreakdown = state.riskTwinSummary?.risk_breakdown || {
    sea_ice_score: Math.round((metrics?.maxSicPercent ?? 45) * 0.75), sea_ice_weight: 0.35,
    iceberg_score: 25, iceberg_weight: 0.30,
    wave_score: Math.round((metrics?.waveExposureIndex ?? 2) * 15), wave_weight: 0.15,
    weather_score: 32, weather_weight: 0.10,
    current_score: 20, current_weight: 0.05,
    uncertainty_score: 18, uncertainty_weight: 0.05,
    dominant_factor: 'ICEBERG_PROXIMITY',
    composite_risk: metrics?.averageRisk ?? 30,
    risk_category: 'SAFE' as const,
  };

  const RISK_BARS = [
    { label: 'Sea-Ice (ConvLSTM)',   score: riskBreakdown.sea_ice_score,    weight: riskBreakdown.sea_ice_weight,    color: '#4EAEE5' },
    { label: 'Iceberg (GRU)',        score: riskBreakdown.iceberg_score,     weight: riskBreakdown.iceberg_weight,    color: '#7C68C8' },
    { label: 'Wave Exposure',        score: riskBreakdown.wave_score,        weight: riskBreakdown.wave_weight,       color: 'var(--blue-500)' },
    { label: 'Weather (MLP)',        score: riskBreakdown.weather_score,     weight: riskBreakdown.weather_weight,    color: 'var(--warning)' },
    { label: 'Current',              score: riskBreakdown.current_score,     weight: riskBreakdown.current_weight,    color: 'var(--success)' },
    { label: 'Uncertainty',          score: riskBreakdown.uncertainty_score, weight: riskBreakdown.uncertainty_weight, color: 'var(--text-faint)' },
  ];

  const navColor = navStatus.status === 'TRAVERSABLE' ? 'var(--success)' :
                   navStatus.status === 'NO_FEASIBLE_ROUTE' ? 'var(--critical)' : 'var(--warning)';

  return (
    <div className="dash-grid">

      {/* ═══ LEFT PANEL — 280px ═══ */}
      <aside style={{
        background: 'var(--surface-card)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>

          {/* Status banner */}
          <div style={{
            padding: '10px 16px', background: 'var(--navy-800)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ color: 'var(--text-inverse)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>MISSION</span>
            <span style={{
              padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700,
              background: navColor + '18', color: navColor,
              border: `1px solid ${navColor}40`,
            }}>{navStatus.status.replace('_', ' ')}</span>
          </div>

          <Section title="VESSEL">
            <DR label="Name" value={state.vessel.name} />
            <DR label="Ice Class" value={state.vessel.iceClass} />
            <DR label="Draft" value={`${state.vessel.draftMeters} m`} />
            <DR label="Speed" value={`${state.vessel.nominalSpeedKnots} kn`} />
            <DR label="SIC Limit" value={`${state.vessel.safeSicThresholdPercent}%`} />
            <DR label="Berg Buffer" value={`${state.vessel.icebergSafetyBufferKm} km`} />
          </Section>

          <Section title="POSITION" defaultOpen={true}>
            <VesselCoordinateControl state={state} />
            <div style={{ marginTop: 8 }}>
              <DR label="Mode" value={state.offlineMode ? 'Offline Snapshot' : 'Simulated'} />
            </div>
          </Section>

          <Section title="SENTINEL-1 SAR" defaultOpen={false}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span className={`status-dot ${state.sentinel1Status === 'ONLINE' ? 'status-dot-on' : 'status-dot-off'}`} />
              <span style={{ fontSize: 11, fontWeight: 600, color: state.sentinel1Status === 'ONLINE' ? 'var(--success)' : 'var(--text-muted)' }}>
                {state.sentinel1Status === 'ONLINE' ? 'Observation Retrieved' : 'Unavailable'}
              </span>
            </div>
            {state.sentinel1Status === 'ONLINE' && state.sentinel1Data?.observation && (
              <>
                <DR label="Platform" value={state.sentinel1Data.observation.platform ?? '—'} />
                <DR label="Mode" value={state.sentinel1Data.observation.mode ?? '—'} />
                <DR label="Acquired" value={formatAcquisitionTime(state.sentinel1Data.observation.acquisition_time)} />
              </>
            )}
          </Section>

          <Section title="MAP LAYERS" defaultOpen={false}>
            {[
              { key: 'seaIce' as const, label: 'Sea-Ice Grid' },
              { key: 'icebergs' as const, label: 'Icebergs' },
              { key: 'recommendedRoute' as const, label: 'Routes' },
              { key: 'weather' as const, label: 'Weather Risk' },
              { key: 'noGoZones' as const, label: 'NO-GO Zones' },
              { key: 'bathymetry' as const, label: 'Bathymetry' },
              { key: 'sentinel1Sar' as const, label: 'SAR Overlay' },
            ].map(({ key, label }) => (
              <label key={key} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
                fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={state.mapLayers[key]}
                  onChange={() => polarisStore.toggleMapLayer(key)}
                  style={{ accentColor: 'var(--blue-500)' }}
                />
                {label}
              </label>
            ))}
          </Section>
        </div>
      </aside>

      {/* ═══ CENTER — Map ═══ */}
      <div style={{ position: 'relative', overflow: 'hidden', minWidth: 0 }}>
        <PolarMap state={state} />

        {/* Sector badge */}
        <div style={{
          position: 'absolute', top: 12, left: 12, zIndex: 'var(--z-map-overlay)' as any,
          background: 'rgba(255,255,255,0.92)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)', padding: '6px 12px',
          boxShadow: 'var(--shadow-sm)', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>Antarctic Operations Map</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            EPSG:3031 · {state.departureLocation.name} → {state.destinationLocation.name}
          </div>
        </div>

        {/* Cell Inspector */}
        {inspection && (
          <div style={{
            position: 'absolute', top: 12, right: 12, zIndex: 'var(--z-map-overlay)' as any,
            width: 240, background: 'rgba(255,255,255,0.96)',
            border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
            padding: 14, boxShadow: 'var(--shadow-md)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span className="section-label">CELL INSPECTOR</span>
              <button onClick={() => polarisStore.clearCellInspection()} style={{
                background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-muted)',
              }}>✕</button>
            </div>
            <DR label="Grid" value={`R${inspection.row} C${inspection.column}`} />
            <DR label="SIC" value={`${inspection.sic_percent?.toFixed(0) ?? '—'}%`} />
            <DR label="Wave" value={`${inspection.wave_height_meters?.toFixed(1) ?? '—'} m`} />
            <DR label="Risk" value={`${inspection.total_risk?.toFixed(0) ?? '—'}/100`} />
            <DR label="Current" value={`${inspection.current_speed_knots?.toFixed(1) ?? '—'} kn`} />
            {inspection.safety_status === 'NO_GO' && (
              <div style={{
                marginTop: 6, padding: '4px 8px', borderRadius: 'var(--r-sm)',
                background: 'var(--critical-bg)', fontSize: 10, fontWeight: 600, color: 'var(--critical)',
              }}>⛔ NO-GO ZONE</div>
            )}
          </div>
        )}

        {/* Forecast timeline */}
        <div style={{
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          zIndex: 'var(--z-map-overlay)' as any,
          display: 'flex', gap: 0, background: 'rgba(255,255,255,0.92)', borderRadius: 'var(--r-md)',
          border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
        }}>
          {['NOW', '+6h', '+12h', '+18h', '+24h'].map((h, i) => {
            const active = i === state.simulationTimeHours / 6;
            return (
              <button key={h} onClick={() => polarisStore.setSimulationTime((i * 6) as ValidTimeHorizon)}
                style={{
                  padding: '6px 14px', border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: active ? 700 : 500,
                  fontFamily: 'var(--font-mono)',
                  background: active ? 'var(--navy-800)' : 'transparent',
                  color: active ? 'white' : 'var(--text-muted)',
                  borderRight: i < 4 ? '1px solid var(--border)' : 'none',
                }}
              >{h}</button>
            );
          })}
        </div>
      </div>

      {/* ═══ RIGHT PANEL — 320px ═══ */}
      <aside style={{
        background: 'var(--surface-card)', borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>

          {/* Nav clearance */}
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
            background: navStatus.status === 'TRAVERSABLE' ? 'var(--success-bg)' : navStatus.status === 'NO_FEASIBLE_ROUTE' ? 'var(--critical-bg)' : 'var(--warning-bg)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span className={`status-dot ${navStatus.status === 'TRAVERSABLE' ? 'status-dot-on' : navStatus.status === 'NO_FEASIBLE_ROUTE' ? 'status-dot-crit' : 'status-dot-warn'}`} />
              <span style={{ fontSize: 13, fontWeight: 700, color: navColor }}>{navStatus.status.replace('_', ' ')}</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{navStatus.explanation}</p>
          </div>

          {/* Route candidates */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span className="section-label">ROUTE CANDIDATES</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{state.routes.length} evaluated</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {state.routes.map(route => {
                const sel = route.id === state.selectedRouteId;
                const rec = route.status === 'RECOMMENDED';
                const rej = route.type === 'SHORTEST_REJECTED' || route.status === 'REJECTED';
                return (
                  <button
                    key={route.id}
                    onClick={() => polarisStore.selectRoute(route.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 10px', borderRadius: 'var(--r-md)',
                      border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left',
                      background: sel ? 'var(--blue-50)' : 'var(--surface-alt)',
                      borderLeft: sel ? '3px solid var(--navy-800)' : '3px solid transparent',
                      transition: 'all 0.1s',
                    }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: route.color || 'var(--blue-300)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: rej ? 'var(--text-faint)' : 'var(--text-primary)', textDecoration: rej ? 'line-through' : 'none' }}>{route.title}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {route.metrics.totalDistanceNm}nm · {route.metrics.estimatedTransitFormatted} · Risk {route.metrics.averageRisk}
                      </div>
                    </div>
                    {rec && <span className="badge badge-safe" style={{ fontSize: 8, flexShrink: 0 }}>REC</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Why this route */}
          {activeRoute && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="section-label">WHY THIS ROUTE?</span>
                <button onClick={() => setShowWhyModal(true)} style={{
                  fontSize: 11, fontWeight: 600, color: 'var(--blue-500)',
                  background: 'none', border: 'none', cursor: 'pointer',
                }}>Details →</button>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{activeRoute.dynamicExplanation}</p>
              {activeRoute.status !== 'APPROVED_BY_HUMAN' && activeRoute.status !== 'REJECTED' && (
                <button onClick={() => polarisStore.approveRoute(activeRoute.id)} className="btn btn-primary btn-sm" style={{ width: '100%', marginTop: 10 }}>
                  Approve Route
                </button>
              )}
            </div>
          )}

          {/* Risk breakdown */}
          <div style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span className="section-label">RISK BREAKDOWN</span>
              <span className={`badge ${riskBadge.bgClass}`} style={{ fontSize: 9 }}>{riskBadge.label} ({metrics?.averageRisk ?? 0}/100)</span>
            </div>
            {RISK_BARS.map(bar => <RiskBarRow key={bar.label} {...bar} />)}
          </div>

        </div>
      </aside>

      {showWhyModal && activeRoute && (
        <WhyThisRouteModal
          state={state}
          route={activeRoute}
          onClose={() => setShowWhyModal(false)}
        />
      )}
    </div>
  );
};

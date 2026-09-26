import React from 'react';
import { PolarisAppState } from '../../types/state';
import { Route } from '../../types/domain';

interface WhyThisRouteModalProps {
  state: PolarisAppState;
  route: Route;
  onClose: () => void;
}

function DR({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

export const WhyThisRouteModal: React.FC<WhyThisRouteModalProps> = ({ state, route, onClose }) => {
  const m = route.metrics;
  const vessel = state.vessel;
  const shortestRoute = state.routes.find(r => r.type === 'SHORTEST_REJECTED' || r.status === 'REJECTED');
  const sm = shortestRoute?.metrics;
  const distDiff = route.tradeOffVsShortest?.distanceDiffNm ?? (sm ? +(m.totalDistanceNm - sm.totalDistanceNm).toFixed(1) : 0);
  const etaDiff = route.tradeOffVsShortest?.etaDiffHours ?? (sm ? +(m.estimatedTransitHours - sm.estimatedTransitHours).toFixed(1) : 0);
  const reductionPercent = route.tradeOffVsShortest?.hazardExposureReductionPercent ?? 0;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(14,35,96,0.4)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 640, maxHeight: '80vh',
        background: 'var(--surface-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-lg)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--success-bg)',
        }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Why This Route? — {route.title}</h2>
            <p style={{ fontSize: 11, color: 'var(--success)' }}>Multi-Objective A* Optimization</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)' }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Explanation */}
          <div style={{ padding: 14, borderRadius: 'var(--r-lg)', background: 'var(--success-bg)', border: '1px solid var(--success-border)' }}>
            <span className="badge badge-safe" style={{ marginBottom: 8, display: 'inline-flex' }}>RECOMMENDED</span>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {route.dynamicExplanation || 'Optimized path satisfying all hard safety constraints while minimizing transit time.'}
            </p>
          </div>

          {/* Key advantages */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div className="p-card" style={{ padding: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>ICEBERG STANDOFF</div>
              <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{m.minIcebergClearanceKm} km</div>
              <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>Buffer: {vessel.icebergSafetyBufferKm} km</div>
            </div>
            <div className="p-card" style={{ padding: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>MAX SEA-ICE</div>
              <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{m.maxSicPercent}%</div>
              <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>Limit: {vessel.safeSicThresholdPercent}%</div>
            </div>
            <div className="p-card" style={{ padding: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>HAZARD REDUCTION</div>
              <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--success)' }}>
                {reductionPercent > 0 ? `${reductionPercent}%` : '—'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>vs shortest path</div>
            </div>
          </div>

          {/* Trade-off */}
          <div>
            <span className="section-label" style={{ display: 'block', marginBottom: 8 }}>TRADE-OFF VS SHORTEST</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[
                { l: 'DISTANCE', v: `+${distDiff} nm`, c: 'var(--text-primary)' },
                { l: 'ETA', v: `+${etaDiff} h`, c: 'var(--text-primary)' },
                { l: 'AVG RISK', v: `${m.averageRisk}/100`, c: m.averageRisk <= 35 ? 'var(--success)' : 'var(--warning)' },
                { l: 'CONFIDENCE', v: `${m.confidencePercent}%`, c: 'var(--info)' },
              ].map(({ l, v, c }) => (
                <div key={l} style={{ padding: 8, borderRadius: 'var(--r-md)', background: 'var(--surface-alt)', border: '1px solid var(--border)', textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-faint)', marginBottom: 2, letterSpacing: '0.04em' }}>{l}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: c }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Hazards avoided */}
          <div>
            <span className="section-label" style={{ display: 'block', marginBottom: 8 }}>HAZARDS AVOIDED</span>
            {[
              `Maintains ${m.minIcebergClearanceKm} km standoff outside GRU-predicted iceberg drift envelopes.`,
              `Caps SIC at ${m.maxSicPercent}%, avoiding severe NO-GO zones forecast by ConvLSTM.`,
              `Verified under ${vessel.iceClass} Polar Code vessel classification.`,
            ].map((text, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', borderBottom: i < 2 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', marginTop: 4, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>AI recommends; Captain confirms.</span>
          <button onClick={onClose} className="btn btn-secondary btn-sm">Close</button>
        </div>
      </div>
    </div>
  );
};

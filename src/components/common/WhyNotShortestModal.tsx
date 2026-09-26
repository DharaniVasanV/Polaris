import React from 'react';
import { PolarisAppState } from '../../types/state';
import { Route } from '../../types/domain';

interface WhyNotShortestModalProps {
  state: PolarisAppState;
  shortestRoute: Route;
  recommendedRoute: Route;
  onClose: () => void;
}

export const WhyNotShortestModal: React.FC<WhyNotShortestModalProps> = ({ state, shortestRoute, recommendedRoute, onClose }) => {
  const m = shortestRoute.metrics;
  const vessel = state.vessel;
  const rej = shortestRoute.rejectionDetails;

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
          background: 'var(--critical-bg)',
        }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Why Not the Shortest Route?</h2>
            <p style={{ fontSize: 11, color: 'var(--critical)' }}>Safety Constraint Rejection Analysis</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)' }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Rejection reason */}
          <div style={{ padding: 14, borderRadius: 'var(--r-lg)', background: 'var(--critical-bg)', border: '1px solid var(--critical-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="section-label" style={{ color: 'var(--critical)' }}>PRIMARY REJECTION</span>
              <span className="badge badge-critical">SAFETY VIOLATION</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {rej?.primaryReason || shortestRoute.dynamicExplanation || 'Route violates hard Polar Code safety constraints.'}
            </p>
          </div>

          {/* Metrics */}
          <div>
            <span className="section-label" style={{ display: 'block', marginBottom: 8 }}>SHORTEST ROUTE TELEMETRY</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[
                { l: 'DISTANCE', v: `${m.totalDistanceNm} nm` },
                { l: 'ETA', v: m.estimatedTransitFormatted },
                { l: 'MAX RISK', v: `${m.maxRisk}/100`, danger: true },
                { l: 'MAX SIC', v: `${m.maxSicPercent}%`, danger: m.maxSicPercent > vessel.safeSicThresholdPercent },
              ].map(({ l, v, danger }) => (
                <div key={l} style={{
                  padding: 8, borderRadius: 'var(--r-md)', textAlign: 'center',
                  background: danger ? 'var(--critical-bg)' : 'var(--surface-alt)',
                  border: `1px solid ${danger ? 'var(--critical-border)' : 'var(--border)'}`,
                }}>
                  <div style={{ fontSize: 9, color: 'var(--text-faint)', marginBottom: 2, letterSpacing: '0.04em' }}>{l}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: danger ? 'var(--critical)' : 'var(--text-primary)' }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Violations */}
          <div>
            <span className="section-label" style={{ display: 'block', marginBottom: 8, color: 'var(--critical)' }}>VIOLATED THRESHOLDS</span>
            {[
              {
                title: 'Iceberg Proximity Violation',
                text: `Min clearance is ${m.minIcebergClearanceKm} km — violates ${vessel.icebergSafetyBufferKm} km safety buffer.`,
              },
              {
                title: 'Sea-Ice Concentration Breach',
                text: `Max SIC ${m.maxSicPercent}% exceeds vessel threshold of ${vessel.safeSicThresholdPercent}%.`,
              },
              {
                title: 'Spatiotemporal Arrival Risk',
                text: `At estimated arrival, waypoint risk surges to ${m.maxRisk}/100 (CRITICAL) due to drift compression.`,
              },
            ].map(({ title, text }, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                borderRadius: 'var(--r-md)', background: 'var(--surface-alt)', border: '1px solid var(--border)',
                marginBottom: 8,
              }}>
                <span style={{ color: 'var(--critical)', fontWeight: 700, flexShrink: 0 }}>✕</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>Recommendation: Execute {recommendedRoute.title}</span>
          <button onClick={onClose} className="btn btn-secondary btn-sm">Close</button>
        </div>
      </div>
    </div>
  );
};

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

function RiskBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{score}/100</span>
      </div>
      <div className="risk-bar-track"><div className="risk-bar-fill" style={{ width: `${Math.min(100, score)}%`, background: color }} /></div>
    </div>
  );
}

export const RiskTwinScreen: React.FC<Props> = ({ state }) => {
  const inspection = state.selectedCellInspection;
  const summary = state.riskTwinSummary;
  const breakdown = summary?.risk_breakdown || {
    sea_ice_score: 33, sea_ice_weight: 0.35,
    iceberg_score: 25, iceberg_weight: 0.30,
    wave_score: 20, wave_weight: 0.15,
    weather_score: 32, weather_weight: 0.10,
    current_score: 18, current_weight: 0.05,
    uncertainty_score: 15, uncertainty_weight: 0.05,
    composite_risk: 28, risk_category: 'SAFE' as const,
    dominant_factor: 'SEA_ICE',
  };
  const rb = formatRiskBadge(breakdown.composite_risk);

  return (
    <div className="dash-grid">

      {/* ═══ LEFT — Cell Inspector ═══ */}
      <aside style={{
        background: 'var(--surface-card)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '10px 16px', background: 'var(--navy-800)' }}>
          <span style={{ color: 'var(--text-inverse)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>CELL INSPECTOR</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {inspection ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  R{inspection.row} · C{inspection.column}
                </span>
                <button onClick={() => polarisStore.clearCellInspection()} className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }}>Clear</button>
              </div>
              <DR label="SIC" value={`${inspection.sic_percent?.toFixed(0) ?? '—'}%`} />
              <DR label="Wave Height" value={`${inspection.wave_height_meters?.toFixed(1) ?? '—'} m`} />
              <DR label="Total Risk" value={`${inspection.total_risk?.toFixed(0) ?? '—'}/100`} />
              <DR label="Current" value={`${inspection.current_speed_knots?.toFixed(1) ?? '—'} kn`} />
              <DR label="Iceberg Risk" value={`${inspection.iceberg_risk?.toFixed(0) ?? '—'}`} />
              {inspection.safety_status === 'NO_GO' && (
                <div style={{ marginTop: 12, padding: '8px 10px', borderRadius: 'var(--r-md)', background: 'var(--critical-bg)', border: '1px solid var(--critical-border)', fontSize: 11, fontWeight: 600, color: 'var(--critical)' }}>
                  ⛔ NO-GO — {inspection.blocking_reasons?.join(', ') || 'Constraint violated'}
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 16px' }}>
              <svg width="32" height="32" fill="none" stroke="var(--text-faint)" strokeWidth="1.5" viewBox="0 0 24 24" style={{ margin: '0 auto 12px' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"/>
              </svg>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Click a cell on the map to inspect its risk profile.</p>
            </div>
          )}
        </div>
      </aside>

      {/* ═══ CENTER — Risk Map ═══ */}
      <div style={{ position: 'relative', overflow: 'hidden', minWidth: 0 }}>
        <PolarMap state={state} />
        <div style={{
          position: 'absolute', top: 12, left: 12, zIndex: 20,
          background: 'rgba(255,255,255,0.92)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)', padding: '6px 12px',
          boxShadow: 'var(--shadow-sm)', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>Risk Twin Field</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            4D composite hazard assessment · Click to inspect cells
          </div>
        </div>
      </div>

      {/* ═══ RIGHT — Risk Breakdown ═══ */}
      <aside style={{
        background: 'var(--surface-card)', borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '10px 16px', background: 'var(--navy-800)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-inverse)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>RISK BREAKDOWN</span>
          <span className={`badge ${rb.bgClass}`} style={{ fontSize: 9 }}>{rb.label}</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

          <div style={{
            textAlign: 'center', padding: '16px 0 20px', borderBottom: '1px solid var(--border)', marginBottom: 16,
          }}>
            <div style={{ fontSize: 36, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
              {breakdown.composite_risk}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Composite Risk Score (0–100)</div>
          </div>

          <RiskBar label="Sea-Ice (ConvLSTM)" score={breakdown.sea_ice_score} color="#4EAEE5" />
          <RiskBar label="Iceberg (GRU)" score={breakdown.iceberg_score} color="#7C68C8" />
          <RiskBar label="Wave Exposure" score={breakdown.wave_score} color="var(--blue-500)" />
          <RiskBar label="Weather (MLP)" score={breakdown.weather_score} color="var(--warning)" />
          <RiskBar label="Current" score={breakdown.current_score} color="var(--success)" />
          <RiskBar label="Uncertainty" score={breakdown.uncertainty_score} color="var(--text-faint)" />

          <div style={{ marginTop: 16, padding: '10px 12px', borderRadius: 'var(--r-md)', background: 'var(--blue-50)', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Dominant factor: <strong>{breakdown.dominant_factor?.replace(/_/g, ' ') ?? 'N/A'}</strong>
            <br />Category: <strong>{breakdown.risk_category}</strong>
          </div>
        </div>
      </aside>
    </div>
  );
};

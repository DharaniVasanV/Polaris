import React, { useState } from 'react';
import { PolarisAppState } from '../types/state';
import { PolarMap } from '../components/map/PolarMap';
import { polarisStore } from '../store/polarisStore';
import { ValidTimeHorizon } from '../types/risk';

interface Props { state: PolarisAppState; }

export const AntarcticMapScreen: React.FC<Props> = ({ state }) => {
  const [layersOpen, setLayersOpen] = useState(true);
  const inspection = state.selectedCellInspection;

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ═══ MAP ═══ */}
      <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        <PolarMap state={state} />

        {/* Sector label */}
        <div style={{
          position: 'absolute', top: 12, left: 12, zIndex: 20,
          background: 'rgba(255,255,255,0.92)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)', padding: '6px 12px',
          boxShadow: 'var(--shadow-sm)', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>Antarctic Operations Map</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>EPSG:3031 · Full Southern Ocean</div>
        </div>

        {/* Cell inspector */}
        {inspection && (
          <div style={{
            position: 'absolute', top: 12, right: 12, zIndex: 20,
            width: 220, background: 'rgba(255,255,255,0.96)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)', padding: 12, boxShadow: 'var(--shadow-md)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span className="section-label">CELL INSPECTOR</span>
              <button onClick={() => polarisStore.clearCellInspection()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-muted)' }}>✕</button>
            </div>
            <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[
                ['Grid', `R${inspection.row} C${inspection.column}`],
                ['SIC', `${inspection.sic_percent?.toFixed(0) ?? '—'}%`],
                ['Wave', `${inspection.wave_height_meters?.toFixed(1) ?? '—'} m`],
                ['Risk', `${inspection.total_risk?.toFixed(0) ?? '—'}/100`],
                ['Current', `${inspection.current_speed_knots?.toFixed(1) ?? '—'} kn`],
              ].map(([l, v]) => (
                <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{l}</span>
                  <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{v}</span>
                </div>
              ))}
            </div>
            {inspection.safety_status === 'NO_GO' && (
              <div style={{ marginTop: 6, padding: '3px 6px', borderRadius: 4, background: 'var(--critical-bg)', fontSize: 10, fontWeight: 600, color: 'var(--critical)' }}>⛔ NO-GO</div>
            )}
          </div>
        )}

        {/* Forecast timeline */}
        <div style={{
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 20,
          display: 'flex', background: 'rgba(255,255,255,0.92)', borderRadius: 'var(--r-md)',
          border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
        }}>
          {['NOW', '+6h', '+12h', '+18h', '+24h'].map((h, i) => {
            const active = i === state.simulationTimeHours / 6;
            return (
              <button key={h} onClick={() => polarisStore.setSimulationTime((i * 6) as ValidTimeHorizon)} style={{
                padding: '6px 14px', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: active ? 700 : 500,
                fontFamily: 'var(--font-mono)',
                background: active ? 'var(--navy-800)' : 'transparent',
                color: active ? 'white' : 'var(--text-muted)',
                borderRight: i < 4 ? '1px solid var(--border)' : 'none',
              }}>{h}</button>
            );
          })}
        </div>
      </div>

      {/* ═══ LAYERS PANEL ═══ */}
      <aside style={{
        width: layersOpen ? 260 : 0, overflow: 'hidden',
        background: 'var(--surface-card)', borderLeft: '1px solid var(--border)',
        transition: 'width 0.2s ease', flexShrink: 0,
      }}>
        <div style={{ width: 260, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span className="section-label">MAP LAYERS</span>
            <button onClick={() => setLayersOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-muted)' }}>✕</button>
          </div>
          {[
            { key: 'seaIce' as const, label: 'Sea-Ice Concentration', color: '#4EAEE5' },
            { key: 'icebergs' as const, label: 'Icebergs', color: '#7C68C8' },
            { key: 'recommendedRoute' as const, label: 'Route Corridors', color: '#1E3A5F' },
            { key: 'weather' as const, label: 'Weather Risk', color: '#D89B2B' },
            { key: 'noGoZones' as const, label: 'NO-GO Zones', color: '#C94B4B' },
            { key: 'bathymetry' as const, label: 'Bathymetry', color: '#94A3B8' },
            { key: 'sentinel1Sar' as const, label: 'Sentinel-1 SAR', color: '#1F9D73' },
          ].map(({ key, label, color }) => (
            <label key={key} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
              borderBottom: '1px solid var(--border)', fontSize: 13, cursor: 'pointer',
              color: 'var(--text-secondary)',
            }}>
              <input type="checkbox" checked={state.mapLayers[key]} onChange={() => polarisStore.toggleMapLayer(key)} style={{ accentColor: color }} />
              <div style={{ width: 10, height: 10, borderRadius: 3, background: color, opacity: state.mapLayers[key] ? 1 : 0.3 }} />
              {label}
            </label>
          ))}
        </div>
      </aside>

      {/* Toggle layers button when panel is closed */}
      {!layersOpen && (
        <button onClick={() => setLayersOpen(true)} style={{
          position: 'absolute', top: 12, right: 12, zIndex: 30,
          padding: '8px 12px', borderRadius: 'var(--r-md)',
          background: 'rgba(255,255,255,0.92)', border: '1px solid var(--border)',
          cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          Layers
        </button>
      )}
    </div>
  );
};

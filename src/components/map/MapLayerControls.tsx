import React, { useState } from 'react';
import { MapLayerState } from '../../types/state';

interface MapLayerControlsProps {
  layers: MapLayerState;
  onToggleLayer: (layerKey: keyof MapLayerState) => void;
  sarAvailable?: boolean;
  sarProvenance?: string;
  hasScenarioRoute?: boolean;
}

export const MapLayerControls: React.FC<MapLayerControlsProps> = ({
  layers,
  onToggleLayer,
  sarAvailable = true,
  sarProvenance = 'RECENT',
  hasScenarioRoute = false,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(true);

  const layerItems: { key: keyof MapLayerState; label: string; badge?: string; category: string }[] = [
    { key: 'sentinel1Sar', label: 'Sentinel-1 SAR Overlay', badge: sarAvailable ? sarProvenance : 'N/A', category: 'Satellite' },
    { key: 'seaIce', label: 'Sea-Ice Concentration (ConvLSTM)', category: 'Environment' },
    { key: 'noGoZones', label: 'NO-GO Hazard Zones', category: 'Safety' },
    { key: 'icebergs', label: 'Iceberg Markers & Forecast (GRU)', category: 'Hazards' },
    { key: 'icebergUncertainty', label: 'Selected Iceberg Uncertainty', category: 'Hazards' },
    { key: 'recommendedRoute', label: 'Recommended Corridor (Primary)', category: 'Navigation' },
    { key: 'alternativeRoute', label: 'Alternative Route B', category: 'Navigation' },
    { key: 'shortestRoute', label: 'Shortest Route (Rejected)', category: 'Navigation' },
    { key: 'researchStations', label: 'Research Stations (Bharati/Maitri)', category: 'Infrastructure' },
  ];

  return (
    <div style={{
      width: 280, background: 'var(--surface-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-md)', overflow: 'hidden',
    }}>
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%', padding: '10px 14px', background: 'var(--surface-alt)',
          border: 'none', borderBottom: isOpen ? '1px solid var(--border)' : 'none',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-primary)' }}>
          MAP LAYERS ({Object.values(layers).filter(Boolean).length})
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {/* Layer List */}
      {isOpen && (
        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 340, overflowY: 'auto' }}>
          {layerItems.map((item) => {
            const active = !!layers[item.key];
            return (
              <label
                key={item.key}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 10px', borderRadius: 'var(--r-sm)', cursor: 'pointer',
                  fontSize: 12, background: active ? 'var(--blue-50)' : 'transparent',
                  border: `1px solid ${active ? 'var(--blue-200)' : 'transparent'}`,
                  color: active ? 'var(--navy-800)' : 'var(--text-secondary)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => onToggleLayer(item.key)}
                    style={{ accentColor: 'var(--navy-800)', cursor: 'pointer' }}
                  />
                  <span style={{ fontWeight: active ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.label}
                  </span>
                </div>
                {item.badge && (
                  <span className="badge badge-navy" style={{ fontSize: 8 }}>
                    {item.badge}
                  </span>
                )}
              </label>
            );
          })}

          {hasScenarioRoute && (
            <div style={{
              marginTop: 4, paddingTop: 8, borderTop: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11,
            }}>
              <span style={{ fontWeight: 600, color: 'var(--route-counterfactual)' }}>What-If Candidate</span>
              <span className="badge badge-safe" style={{ fontSize: 8 }}>ACTIVE</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

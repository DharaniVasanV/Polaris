import React, { useState, useEffect } from 'react';
import { PolarisAppState } from '../../types/state';
import { polarisStore } from '../../store/polarisStore';
import { formatAcquisitionTime } from '../../services/sentinel1Service';

interface VesselCoordinateControlProps {
  state: PolarisAppState;
  compact?: boolean;
}

export const VesselCoordinateControl: React.FC<VesselCoordinateControlProps> = ({ state, compact = false }) => {
  const [lat, setLat] = useState<number>(state.departureLocation.latitude);
  const [lon, setLon] = useState<number>(state.departureLocation.longitude);
  const [radiusKm, setRadiusKm] = useState<number>(250);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  useEffect(() => {
    setLat(state.departureLocation.latitude);
    setLon(state.departureLocation.longitude);
  }, [state.departureLocation.latitude, state.departureLocation.longitude]);

  const handleUpdate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isNaN(lat) || lat < -90 || lat > 90) return;
    if (isNaN(lon) || lon < -180 || lon > 180) return;

    setIsUpdating(true);
    polarisStore.updateVesselPosition(lat, lon, false);
    await polarisStore.syncSentinel1(lat, lon, radiusKm);
    setIsUpdating(false);
  };

  const obs = state.sentinel1Data?.observation;
  const invalidCoords = isNaN(lat) || lat < -90 || lat > 90 || isNaN(lon) || lon < -180 || lon > 180;

  return (
    <div style={{
      borderRadius: 'var(--r-lg)', border: '1px solid var(--border)',
      background: 'var(--surface-alt)', padding: compact ? 10 : 14,
      display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="status-dot status-dot-on status-dot-pulse" />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-primary)' }}>POSITION & SAR AOI</span>
        </div>
        <span className="badge badge-warning" style={{ fontSize: 8 }}>SIMULATED</span>
      </div>

      {/* Coordinate form */}
      <form onSubmit={handleUpdate} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>LATITUDE (°S/°N)</label>
            <input type="number" step="0.01" min="-90" max="90" value={lat}
              onChange={e => setLat(parseFloat(e.target.value))} className="p-input" style={{ fontSize: 12 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>LONGITUDE (°E/°W)</label>
            <input type="number" step="0.01" min="-180" max="180" value={lon}
              onChange={e => setLon(parseFloat(e.target.value))} className="p-input" style={{ fontSize: 12 }} />
          </div>
        </div>

        {/* Search radius */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>SEARCH RADIUS</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[100, 250, 500].map(r => (
              <button key={r} type="button" onClick={() => setRadiusKm(r)}
                style={{
                  padding: '2px 8px', borderRadius: 'var(--r-sm)', fontSize: 10, fontFamily: 'var(--font-mono)',
                  fontWeight: 700, cursor: 'pointer',
                  background: radiusKm === r ? 'var(--navy-800)' : 'var(--surface-card)',
                  color: radiusKm === r ? 'white' : 'var(--text-muted)',
                  border: `1px solid ${radiusKm === r ? 'var(--navy-800)' : 'var(--border)'}`,
                }}>
                {r}km
              </button>
            ))}
          </div>
        </div>

        <button type="submit" disabled={isUpdating || state.sentinel1Status === 'CONNECTING'} className="btn btn-secondary btn-sm" style={{ width: '100%' }}>
          {isUpdating || state.sentinel1Status === 'CONNECTING' ? 'Querying Copernicus…' : 'Update Satellite Observation'}
        </button>
      </form>

      {/* SAR feedback */}
      <div style={{ paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
          <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>SAR Status</span>
          {invalidCoords || state.sentinel1ImageError?.includes('INVALID_COORDINATES') ? (
            <span className="badge badge-critical" style={{ fontSize: 8 }}>INVALID_COORDINATES</span>
          ) : state.sentinel1ImageError?.includes('PROCESSING_ERROR') ? (
            <span className="badge badge-high" style={{ fontSize: 8 }}>PROCESSING_ERROR</span>
          ) : state.sentinel1ImageAvailable && state.sentinel1ImageUrl ? (
            <span className="badge badge-safe" style={{ fontSize: 8 }}>IMAGE AVAILABLE</span>
          ) : state.sentinel1Status === 'NO_DATA' || state.sentinel1ImageError?.includes('NO_RECENT_COVERAGE') ? (
            <span className="badge badge-muted" style={{ fontSize: 8 }}>NO COVERAGE</span>
          ) : state.sentinel1ImageLoading ? (
            <span className="badge badge-info" style={{ fontSize: 8 }}>PROCESSING…</span>
          ) : (
            <span className="badge badge-muted" style={{ fontSize: 8 }}>IDLE</span>
          )}
        </div>

        {state.sentinel1ImageAvailable && state.sentinel1ImageMetadata ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px', borderRadius: 'var(--r-md)', background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
            {[
              ['Platform', state.sentinel1ImageMetadata.platform || 'SENTINEL-1'],
              ['Mode', `${state.sentinel1ImageMetadata.mode || 'SAR'} (${state.sentinel1ImageMetadata.polarization || '—'})`],
              ['Acquired', formatAcquisitionTime(state.sentinel1ImageMetadata.acquisition_time)],
              ['Provenance', 'RECENT (NOT LIVE)'],
            ].map(([l, v]) => (
              <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: 'var(--text-muted)' }}>{l}</span>
                <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontSize: 10 }}>{v}</span>
              </div>
            ))}
          </div>
        ) : state.sentinel1ImageError ? (
          <div style={{ padding: 8, borderRadius: 'var(--r-md)', background: 'var(--critical-bg)', border: '1px solid var(--critical-border)', fontSize: 10, color: 'var(--critical)' }}>
            {state.sentinel1ImageError}
          </div>
        ) : (invalidCoords) ? (
          <div style={{ padding: 8, borderRadius: 'var(--r-md)', background: 'var(--critical-bg)', border: '1px solid var(--critical-border)', fontSize: 10, color: 'var(--critical)' }}>
            Coordinates outside valid ranges.
          </div>
        ) : (
          <div style={{ padding: 8, borderRadius: 'var(--r-md)', background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', fontSize: 10, color: 'var(--text-muted)' }}>
            No recent Sentinel-1 acquisition within {radiusKm} km.
          </div>
        )}
      </div>
    </div>
  );
};

import React from 'react';
import { PolarisAppState } from '../types/state';
import { polarisStore } from '../store/polarisStore';
import { formatAcquisitionTime } from '../services/sentinel1Service';

interface Props { state: PolarisAppState; }

function DataCard({ title, badge, children }: { title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="p-card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span className="section-label">{title}</span>
        {badge}
      </div>
      {children}
    </div>
  );
}

function DR({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{label}</span>
      <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

const PROV: Record<string, { label: string; color: string; bg: string }> = {
  HISTORICAL: { label: 'HISTORICAL', color: 'var(--info)',    bg: 'var(--info-bg)' },
  RECENT:     { label: 'RECENT',     color: 'var(--success)', bg: 'var(--success-bg)' },
  SIMULATED:  { label: 'SIMULATED',  color: 'var(--warning)', bg: 'var(--warning-bg)' },
  FORECAST:   { label: 'FORECAST',   color: '#7C68C8',        bg: '#F3F0FF' },
  DERIVED:    { label: 'DERIVED',    color: 'var(--text-muted)', bg: 'var(--surface-alt)' },
};

function ProvBadge({ type }: { type: string }) {
  const t = PROV[type] || PROV.DERIVED;
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700,
      letterSpacing: '0.05em', background: t.bg, color: t.color,
    }}>{t.label}</span>
  );
}

export const EnvironmentalDataScreen: React.FC<Props> = ({ state }) => {
  return (
    <div className="page-scroll">
      <div className="page-container">
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Environmental Data</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Data provenance, satellite observations, and model status for the Southern Ocean operational sector.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>

          {/* Sentinel-1 */}
          <DataCard title="SENTINEL-1 SAR" badge={<ProvBadge type={state.sentinel1Status === 'ONLINE' ? 'RECENT' : 'DERIVED'} />}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span className={`status-dot ${state.sentinel1Status === 'ONLINE' ? 'status-dot-on' : 'status-dot-off'}`} />
              <span style={{ fontSize: 12, fontWeight: 600, color: state.sentinel1Status === 'ONLINE' ? 'var(--success)' : 'var(--text-muted)' }}>
                {state.sentinel1Status === 'ONLINE' ? 'Observation Retrieved' : state.sentinel1Status === 'NOT_CONFIGURED' ? 'Credentials Not Set' : 'Unavailable'}
              </span>
            </div>
            {state.sentinel1Status === 'ONLINE' && state.sentinel1Data?.observation ? (
              <>
                <DR label="Platform" value={state.sentinel1Data.observation.platform ?? '—'} />
                <DR label="Mode" value={`${state.sentinel1Data.observation.mode ?? '—'} ${state.sentinel1Data.observation.product_type ?? ''}`} />
                <DR label="Polarization" value={state.sentinel1Data.observation.polarization ?? '—'} />
                <DR label="Acquired" value={formatAcquisitionTime(state.sentinel1Data.observation.acquisition_time)} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>SAR Overlay</span>
                  <button onClick={() => polarisStore.toggleMapLayer('sentinel1Sar')} className={`btn btn-sm ${state.mapLayers.sentinel1Sar ? 'btn-primary' : 'btn-secondary'}`}>
                    {state.mapLayers.sentinel1Sar ? 'ON' : 'OFF'}
                  </button>
                </div>
              </>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                {state.sentinel1Status === 'NOT_CONFIGURED'
                  ? 'Configure POLARIS_SENTINEL_CLIENT_ID and CLIENT_SECRET in backend.'
                  : 'No recent SAR acquisition in lookback window.'}
              </p>
            )}
          </DataCard>

          {/* SIC */}
          <DataCard title="SEA-ICE CONCENTRATION (ConvLSTM)" badge={<ProvBadge type="FORECAST" />}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span className={`status-dot ${state.seaIceModelStatus === 'ONLINE' ? 'status-dot-on' : 'status-dot-off'}`} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>
                {state.seaIceModelStatus === 'ONLINE' ? 'Model Online' : 'Offline Snapshot'}
              </span>
            </div>
            {state.seaIceForecastData ? (
              <>
                <DR label="Model" value={state.seaIceForecastData.metadata?.model ?? 'ConvLSTM2D'} />
                <DR label="Resolution" value={state.seaIceForecastData.metadata?.model_coverage?.spatial_resolution ?? '25 km'} />
                <DR label="Horizons" value="0h / 6h / 12h / 18h / 24h" />
                <DR label="Last Sync" value={state.lastSeaIceSync ? new Date(state.lastSeaIceSync).toLocaleTimeString() : 'N/A'} />
              </>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Model data not loaded.</p>
            )}
          </DataCard>

          {/* Iceberg */}
          <DataCard title="ICEBERG DRIFT (GRU)" badge={<ProvBadge type="FORECAST" />}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span className={`status-dot ${state.aiModelStatus === 'ONLINE' ? 'status-dot-on' : 'status-dot-off'}`} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>{state.aiModelStatus === 'ONLINE' ? 'GRU Online' : 'Offline Mode'}</span>
            </div>
            <DR label="Tracked Objects" value={String(state.icebergs.length)} />
            <DR label="Model" value="Gated Recurrent Unit" />
            <DR label="Horizon" value="24–72h drift envelopes" />
            <DR label="Last Sync" value={state.lastAiModelSync ? new Date(state.lastAiModelSync).toLocaleTimeString() : 'N/A'} />
          </DataCard>

          {/* Weather */}
          <DataCard title="WEATHER RISK (MLP)" badge={<ProvBadge type="FORECAST" />}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span className={`status-dot ${state.weatherModelStatus === 'ONLINE' ? 'status-dot-on' : 'status-dot-off'}`} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>{state.weatherModelStatus === 'ONLINE' ? 'MLP Online' : 'Offline Estimates'}</span>
            </div>
            <DR label="Model" value="PyTorch MLP Classifier" />
            <DR label="Inputs" value="Wind · Wave · Pressure · Temp" />
            <DR label="Last Sync" value={state.lastWeatherSync ? new Date(state.lastWeatherSync).toLocaleTimeString() : 'N/A'} />
          </DataCard>

          {/* Bathymetry */}
          <DataCard title="BATHYMETRY & COASTLINES" badge={<ProvBadge type="HISTORICAL" />}>
            <DR label="Source" value="GEBCO 2023" />
            <DR label="Resolution" value="15 arc-seconds" />
            <DR label="Projection" value="EPSG:3031" />
            <DR label="Coverage" value="60°S — 90°S" />
            <DR label="Depth Limit" value={`${state.vessel.draftMeters + state.vessel.safetyDepthMarginMeters} m`} />
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
              Hard NO-GO zones enforced on cells with depth &lt; vessel safety limit.
            </div>
          </DataCard>

          {/* BAS Basemap */}
          <DataCard title="BAS POLAR BASEMAP" badge={<ProvBadge type="HISTORICAL" />}>
            <DR label="Provider" value="British Antarctic Survey" />
            <DR label="Projection" value="EPSG:3031" />
            <DR label="Service" value="WMTS Tile" />
            <DR label="Coverage" value="Full Southern Ocean" />
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
              Official polar basemap. Camera constrained to Antarctic extent.
            </div>
          </DataCard>

        </div>
      </div>
    </div>
  );
};

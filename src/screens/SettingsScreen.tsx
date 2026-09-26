import React from 'react';
import { PolarisAppState } from '../types/state';

interface Props { state: PolarisAppState; }

function DR({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

function SettingsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-card" style={{ padding: 20 }}>
      <h3 className="section-label" style={{ marginBottom: 16 }}>{title}</h3>
      {children}
    </div>
  );
}

export const SettingsScreen: React.FC<Props> = ({ state }) => {
  return (
    <div className="page-scroll">
      <div className="page-container">
        {/* Page header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Settings</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Vessel safety envelope, risk model weights, and system configuration.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 20 }}>

          {/* Vessel Profile */}
          <SettingsCard title="VESSEL PROFILE & SAFETY LIMITS">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Vessel Name</label>
                <input type="text" value={state.vessel.name} className="p-input" readOnly />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Ice Class</label>
                  <input type="text" value={state.vessel.iceClass} className="p-input" readOnly />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Draft (m)</label>
                  <input type="number" value={state.vessel.draftMeters} className="p-input" readOnly />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>SIC Threshold (%)</label>
                  <input type="number" value={state.vessel.safeSicThresholdPercent} className="p-input" readOnly />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Iceberg Buffer (km)</label>
                  <input type="number" value={state.vessel.icebergSafetyBufferKm} className="p-input" readOnly />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Max Wave (m)</label>
                  <input type="number" value={state.vessel.maxSafeWaveHeightMeters} className="p-input" readOnly />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Safety Depth Margin (m)</label>
                  <input type="number" value={state.vessel.safetyDepthMarginMeters} className="p-input" readOnly />
                </div>
              </div>
            </div>
          </SettingsCard>

          {/* Risk Weights */}
          <SettingsCard title="RISK ENGINE WEIGHTS">
            <DR label="Sea-Ice Weight" value={`${state.riskWeights.seaIceWeight.toFixed(2)} (35%)`} />
            <DR label="Iceberg Drift" value={`${state.riskWeights.icebergWeight.toFixed(2)} (30%)`} />
            <DR label="Wave & Swell" value={`${state.riskWeights.waveWeight.toFixed(2)} (15%)`} />
            <DR label="Wind Risk" value={`${state.riskWeights.windWeight.toFixed(2)} (10%)`} />
            <DR label="Ocean Current" value={`${state.riskWeights.currentWeight.toFixed(2)} (5%)`} />
            <DR label="Forecast Uncertainty" value={`${state.riskWeights.uncertaintyWeight.toFixed(2)} (5%)`} />
            <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 'var(--r-md)', background: 'var(--blue-50)', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Weights are configured in the backend risk fusion engine and applied to the spatiotemporal composite risk field.
            </div>
          </SettingsCard>

          {/* System */}
          <SettingsCard title="SYSTEM INFORMATION">
            <DR label="Frontend" value="React 18 + TypeScript" />
            <DR label="Map Engine" value="OpenLayers (EPSG:3031)" />
            <DR label="Backend" value="Python FastAPI + PyTorch" />
            <DR label="Basemap" value="BAS Polar WMTS" />
            <DR label="Projection" value="Antarctic Polar Stereographic" />
            <DR label="Version" value="Prototype v2.4" />
          </SettingsCard>

          {/* Models */}
          <SettingsCard title="MODEL TRANSPARENCY">
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <p style={{ marginBottom: 8 }}>
                <strong>GRU Iceberg Drift:</strong> Trained on 271,906 sequences from BYU/NIC Antarctic iceberg tracking database.
                Predicts 24–72h trajectory vectors with expanding uncertainty radii.
              </p>
              <p style={{ marginBottom: 8 }}>
                <strong>ConvLSTM2D Sea-Ice:</strong> Spatiotemporal grid-based SIC% forecasting at five horizons (0h, 6h, 12h, 18h, 24h).
                Resolution: 25 km across the Southern Ocean operational sector.
              </p>
              <p style={{ marginBottom: 8 }}>
                <strong>Weather MLP:</strong> PyTorch multi-layer perceptron classifier estimating severe weather probability
                from wind speed, wave height, atmospheric pressure, and temperature inputs.
              </p>
              <p>
                <strong>Time-Aware A*:</strong> Multi-objective pathfinding that queries future risk states at each waypoint's estimated arrival time,
                producing Pareto-optimal route candidates balancing safety, fuel, and ETA.
              </p>
            </div>
          </SettingsCard>

        </div>
      </div>
    </div>
  );
};

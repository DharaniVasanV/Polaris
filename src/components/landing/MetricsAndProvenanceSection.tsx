import React, { useState, useEffect } from 'react';

function StatCounter({ value, isFloat = false }: { value: number; isFloat?: boolean }) {
  const [val, setVal] = useState(0);

  useEffect(() => {
    let start = performance.now();
    const duration = 1000;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const current = value * progress;
      setVal(current);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value]);

  if (isFloat) return <>{val.toFixed(1)}</>;
  return <>{Math.round(val).toLocaleString()}</>;
}

export const MetricsAndProvenanceSection: React.FC = () => {
  const [isDisconnected, setIsDisconnected] = useState<boolean>(false);

  // Satellite disconnect animation toggle loop for offline capability section
  useEffect(() => {
    const timer = setInterval(() => {
      setIsDisconnected(prev => !prev);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      {/* ═══ 1. VERIFIED PROJECT METRICS ═══ */}
      <section id="metrics" style={{ padding: '80px 32px', background: '#0A205C', color: '#FAFBFF' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{
              display: 'inline-block', padding: '4px 14px', borderRadius: 20,
              background: 'rgba(208, 228, 254, 0.12)', border: '1px solid rgba(208, 228, 254, 0.25)',
              color: '#D0E4FE', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 12
            }}>
              VERIFIED BENCHMARKS & MODEL METRICS
            </div>
            <h2 style={{ fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 800, color: '#FAFBFF' }}>
              PROVEN PERFORMANCE NUMBERS
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
            {[
              { num: 271906, unit: '', label: 'GRU Sequences', sub: 'GRU +1 day unseen test set' },
              { num: 161, unit: '', label: 'Selected Iceberg Tracks', sub: 'Southern Ocean Tabular Icebergs' },
              { num: 468, unit: '', label: 'Decision-Grid Cells', sub: '18×26 High-Res Mesh' },
              { num: 5, unit: '', label: 'Forecast Horizons', sub: 'NOW, +6h, +12h, +18h, +24h' },
              { num: 166.8, unit: ' km', label: 'Mean +1-Day GRU Error', sub: 'Haversine distance error', isFloat: true },
              { num: 395.8, unit: ' ms', label: 'Route Optimization', sub: 'Time-Aware A* benchmark', isFloat: true },
              { num: 977.1, unit: ' ms', label: 'What-If Analysis', sub: 'Dynamic scenario evaluation', isFloat: true },
              { num: 156, unit: '', label: 'Validation Tests', sub: 'Automated system suite' }
            ].map(item => (
              <div key={item.label} style={{
                background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(112, 151, 210, 0.25)',
                borderRadius: 12, padding: 20, textAlign: 'center'
              }}>
                <div style={{ fontSize: 32, fontWeight: 900, color: '#FAFBFF', fontFamily: 'var(--font-mono)', lineHeight: 1.1, marginBottom: 6 }}>
                  <StatCounter value={item.num} isFloat={item.isFloat} />{item.unit}
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#D0E4FE', marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 10, color: '#7097D2' }}>{item.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 2. WHY POLARIS ═══ */}
      <section style={{ padding: '96px 32px', background: '#FAFBFF', borderBottom: '1px solid #D0E4FE' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <h2 style={{ fontSize: 'clamp(26px, 3vw, 36px)', fontWeight: 800, color: '#0A205C', marginBottom: 12 }}>
              WHY POLARIS?
            </h2>
            <p style={{ fontSize: 15, color: '#7097D2', maxWidth: 600, margin: '0 auto' }}>
              Four core principles guiding modern Antarctic research navigation.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
            {[
              { tag: 'PREDICT', title: 'Forecast Behavior', desc: 'Anticipate iceberg trajectories and sea-ice concentration up to 24-72 hours in advance.' },
              { tag: 'UNDERSTAND', title: 'Fuse Hazards', desc: 'Synthesize multi-source environmental threats into a unified 4D Risk Twin field.' },
              { tag: 'CONSTRAIN', title: 'Respect Limits', desc: 'Enforce strict vessel Polar Code limits, bathymetry clearance, and safety buffer zones.' },
              { tag: 'PLAN', title: 'Explain Options', desc: 'Generate fully explainable route candidates with human-in-the-loop decision capability.' }
            ].map(item => (
              <div key={item.tag} style={{
                background: '#FFFFFF', border: '1.5px solid #D0E4FE', borderRadius: 12, padding: 24,
                boxShadow: '0 4px 12px rgba(10,32,92,0.04)'
              }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: '#344DB1', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>
                  {item.tag}
                </span>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0A205C', marginBottom: 8 }}>{item.title}</h3>
                <p style={{ fontSize: 13, color: '#7097D2', lineHeight: 1.6 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 3. DATA PROVENANCE ═══ */}
      <section id="data" style={{ padding: '96px 32px', background: '#FFFFFF', borderBottom: '1px solid #D0E4FE' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{
              display: 'inline-block', padding: '4px 14px', borderRadius: 20,
              background: '#E9F2FF', border: '1px solid #D0E4FE',
              color: '#344DB1', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 12
            }}>
              TRANSPARENT SYSTEM DESIGN
            </div>
            <h2 style={{ fontSize: 'clamp(26px, 3vw, 36px)', fontWeight: 800, color: '#0A205C', marginBottom: 12 }}>
              DESIGNED FOR TRUSTED DECISIONS
            </h2>
            <p style={{ fontSize: 15, color: '#7097D2', maxWidth: 640, margin: '0 auto' }}>
              Clear metadata reporting ensures captains always know the source and status of every data element.
            </p>
          </div>

          {/* Provenance Data Badges */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 32 }}>
            {[
              { label: 'HISTORICAL', color: '#0A205C', bg: '#E9F2FF' },
              { label: 'RECENT', color: '#15803D', bg: '#DCFCE7' },
              { label: 'SIMULATED', color: '#B45309', bg: '#FEF3C7' },
              { label: 'FORECAST', color: '#7C68C8', bg: '#F3F0FF' },
              { label: 'DERIVED', color: '#7097D2', bg: '#FAFBFF' }
            ].map(b => (
              <span key={b.label} style={{
                padding: '4px 14px', borderRadius: 6, fontSize: 11, fontWeight: 800,
                fontFamily: 'var(--font-mono)', background: b.bg, color: b.color,
                border: `1px solid ${b.color}33`
              }}>
                {b.label}
              </span>
            ))}
          </div>

          {/* List Table */}
          <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid #D0E4FE', borderRadius: 12, overflow: 'hidden' }}>
            {[
              { prov: 'HISTORICAL', color: '#0A205C', bg: '#E9F2FF', title: 'GEBCO 2023 Bathymetry & BAS Charting', desc: 'Provides global 15 arc-second seafloor depth limits and Antarctic polar coastlines.' },
              { prov: 'RECENT', color: '#15803D', bg: '#DCFCE7', title: 'Sentinel-1 SAR Satellite Imagery', desc: 'Copernicus Data Space C-band synthetic aperture radar satellite observations.' },
              { prov: 'SIMULATED', color: '#B45309', bg: '#FEF3C7', title: 'Vessel Telemetry & Target Coordinates', desc: 'Manual/simulated vessel GPS position telemetry used for prototype routing.' },
              { prov: 'FORECAST', color: '#7C68C8', bg: '#F3F0FF', title: 'ConvLSTM & GRU Neural Predictions', desc: 'Model-generated sea-ice concentration and iceberg trajectory prediction vectors.' },
              { prov: 'DERIVED', color: '#7097D2', bg: '#FAFBFF', title: 'Risk Twin Field & Time-Aware Routes', desc: 'Weighted 4D composite hazard mesh and constraint-validated navigation corridors.' }
            ].map((row, idx) => (
              <div key={row.title} style={{
                display: 'flex', alignItems: 'center', gap: 20, padding: '16px 24px',
                background: idx % 2 === 0 ? '#FAFBFF' : '#FFFFFF',
                borderBottom: idx === 4 ? 'none' : '1px solid #E9F2FF'
              }}>
                <span style={{
                  padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 800,
                  fontFamily: 'var(--font-mono)', color: row.color, background: row.bg,
                  width: 90, textAlign: 'center', flexShrink: 0
                }}>
                  {row.prov}
                </span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0A205C', marginBottom: 2 }}>{row.title}</div>
                  <div style={{ fontSize: 12, color: '#7097D2' }}>{row.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 4. OFFLINE CAPABILITY SECTION ═══ */}
      <section style={{ padding: '96px 32px', background: '#E9F2FF' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{
              display: 'inline-block', padding: '4px 14px', borderRadius: 20,
              background: '#FFFFFF', border: '1px solid #D0E4FE',
              color: '#344DB1', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 12
            }}>
              ANTARCTIC HIGH-LATITUDE DESIGN
            </div>
            <h2 style={{ fontSize: 'clamp(26px, 3vw, 36px)', fontWeight: 800, color: '#0A205C', marginBottom: 12 }}>
              MISSION CONTINUES BEYOND CONNECTIVITY
            </h2>
            <p style={{ fontSize: 15, color: '#7097D2', maxWidth: 640, margin: '0 auto' }}>
              Full offline decision support capability ensures continuous safe navigation even when satellite communication links degrade south of 60°S.
            </p>
          </div>

          {/* Workflow Diagram */}
          <div style={{
            background: '#FFFFFF', border: '1px solid #D0E4FE', borderRadius: 16, padding: 32,
            boxShadow: '0 8px 24px rgba(10,32,92,0.06)'
          }}>
            {/* Status indicator badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: isDisconnected ? '#B45309' : '#15803D'
                }} />
                <span style={{ fontSize: 12, fontWeight: 800, color: '#0A205C', fontFamily: 'var(--font-mono)' }}>
                  SATELLITE STATUS: {isDisconnected ? 'DISCONNECTED (OFFLINE MODE ACTIVE)' : 'CONNECTED (SYNCHRONIZING)'}
                </span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#344DB1', background: '#E9F2FF', padding: '4px 12px', borderRadius: 20 }}>
                100% LOCAL INFERENCE READY
              </span>
            </div>

            {/* Offline Flow Nodes */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, textAlign: 'center' }}>
              {[
                { step: '01', title: 'Mission Package', desc: 'Pre-cached basemaps & telemetry' },
                { step: '02', title: 'Local Models', desc: 'Onboard GRU & ConvLSTM inference' },
                { step: '03', title: 'Local Map', desc: 'EPSG:3031 polar chart views' },
                { step: '04', title: 'Risk Twin', desc: 'Offline hazard grid calculation' },
                { step: '05', title: 'Route Optimizer', desc: 'Local Time-Aware A* execution' }
              ].map((node, i) => (
                <div key={node.step} style={{
                  padding: 16, borderRadius: 10, background: '#FAFBFF', border: '1px solid #D0E4FE'
                }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#344DB1', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                    {node.step}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0A205C', marginBottom: 4 }}>
                    {node.title}
                  </div>
                  <div style={{ fontSize: 11, color: '#7097D2' }}>
                    {node.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

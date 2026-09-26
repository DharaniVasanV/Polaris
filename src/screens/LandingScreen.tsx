import React, { useEffect, useState } from 'react';
import { polarisStore } from '../store/polarisStore';
import { PolarisAppState } from '../types/state';

interface Props { state: PolarisAppState; }

/* ── Animated counter ────────────────────────────── */
function Counter({ end, duration = 1200 }: { end: number; duration?: number }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      setVal(Math.round(end * t));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [end, duration]);
  return <>{val.toLocaleString()}</>;
}

export const LandingScreen: React.FC<Props> = ({ state }) => {
  const goLogin = () => polarisStore.setScreen('LOGIN');
  const goDash  = () => { if (state.isAuthenticated) polarisStore.setScreen('DASHBOARD'); else goLogin(); };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-card)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)' }}>

      {/* ═══ NAVBAR ═══ */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px', height: 56,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: 'var(--navy-800)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="16" height="16" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </div>
          <span style={{ fontWeight: 900, fontSize: 15, letterSpacing: '0.12em', color: 'var(--navy-800)' }}>POLARIS</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <a href="#workflow" style={{ fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none', fontWeight: 500 }}>How it works</a>
          <a href="#data" style={{ fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none', fontWeight: 500 }}>Data</a>
          <button onClick={goDash} className="btn btn-primary" style={{ fontSize: 13 }}>
            Enter Operations →
          </button>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <section style={{
        position: 'relative', overflow: 'hidden',
        display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 520,
        background: 'linear-gradient(135deg, var(--navy-800) 0%, #132D6E 50%, var(--blue-500) 100%)',
      }}>
        {/* Left text */}
        <div style={{
          padding: '80px 48px 80px 48px',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          maxWidth: 640, marginLeft: 'auto',
          zIndex: 2,
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '4px 14px', borderRadius: 20,
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
            marginBottom: 24, width: 'fit-content',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ADE80' }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.85)' }}>
              RESEARCH-GRADE DECISION SUPPORT
            </span>
          </div>

          <h1 style={{
            fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 800,
            color: 'white', lineHeight: 1.15, marginBottom: 20, letterSpacing: '-0.01em',
          }}>
            Predictive Ocean–Ice Learning for Antarctic Route Intelligence&nbsp;and&nbsp;Safety
          </h1>

          <p style={{
            fontSize: 'clamp(14px, 1.4vw, 17px)',
            color: 'rgba(219,230,245,0.85)', lineHeight: 1.7,
            marginBottom: 32, maxWidth: 520,
          }}>
            AI-powered decision support combining sea-ice forecasting, iceberg trajectory prediction,
            environmental risk modelling, and constraint-aware route optimization for Antarctic research vessels.
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={goDash} style={{
              padding: '14px 28px', borderRadius: 10, border: 'none',
              background: 'white', color: 'var(--navy-800)',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              transition: 'transform 0.2s',
            }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'none'}
            >Enter Operations →</button>
            <a href="#workflow" style={{
              padding: '14px 28px', borderRadius: 10,
              border: '1.5px solid rgba(255,255,255,0.25)',
              background: 'rgba(255,255,255,0.08)',
              color: 'white', fontSize: 14, fontWeight: 600,
              textDecoration: 'none', backdropFilter: 'blur(8px)',
            }}>Explore Platform</a>
          </div>

          {/* Geo metadata */}
          <div style={{
            marginTop: 40, display: 'flex', gap: 24,
            fontSize: 11, color: 'rgba(219,230,245,0.5)', fontFamily: 'var(--font-mono)',
          }}>
            <span>ANTARCTICA</span>
            <span>60°S — 90°S</span>
            <span>RESEARCH NAVIGATION</span>
          </div>
        </div>

        {/* Right image */}
        <div style={{ position: 'relative', overflow: 'hidden' }}>
          <img
            src="/assets/antarctica/hero-antarctica.png"
            alt="Antarctic satellite view"
            style={{
              position: 'absolute', top: 0, right: 0,
              width: '100%', height: '100%', objectFit: 'cover',
              opacity: 0.55, mixBlendMode: 'luminosity',
            }}
          />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(90deg, var(--navy-800) 0%, transparent 40%)',
          }} />
        </div>
      </section>

      {/* ═══ STATS ═══ */}
      <section style={{
        background: 'var(--surface-card)', borderBottom: '1px solid var(--border)',
        padding: '40px 32px',
      }}>
        <div style={{
          maxWidth: 1000, margin: '0 auto',
          display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 24, textAlign: 'center',
        }}>
          {[
            { val: 271906, label: 'GRU training sequences' },
            { val: 161,    label: 'Selected iceberg tracks' },
            { val: 468,    label: 'Decision-grid cells' },
            { val: 5,      label: 'Sea-ice forecast horizons' },
            { val: 156,    label: 'Backend validation tests' },
          ].map(({ val, label }) => (
            <div key={label}>
              <div style={{
                fontSize: 28, fontWeight: 800, color: 'var(--navy-800)',
                fontFamily: 'var(--font-mono)', lineHeight: 1.2, marginBottom: 4,
              }}>
                <Counter end={val} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ WORKFLOW ═══ */}
      <section id="workflow" style={{ padding: '80px 32px', background: 'var(--surface-alt)' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p className="section-label" style={{ marginBottom: 8 }}>OPERATIONAL WORKFLOW</p>
            <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>How POLARIS Works</h2>
            <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Four continuous phases powering Antarctic decision support</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>
            {[
              { n: '01', title: 'Observe', desc: 'Ingest Sentinel-1 SAR imagery, BAS bathymetry, AIS telemetry, and meteorological observations.' },
              { n: '02', title: 'Forecast', desc: 'Predict sea-ice dynamics via ConvLSTM2D and iceberg drift via GRU at 0–24h horizons.' },
              { n: '03', title: 'Assess', desc: 'Compute 4D risk fields combining SIC, iceberg standoff, weather MLP, and vessel constraints.' },
              { n: '04', title: 'Route', desc: 'Execute Time-Aware A* multi-objective optimization with full human approval.' },
            ].map(({ n, title, desc }) => (
              <div key={n} style={{ textAlign: 'center' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%', margin: '0 auto 16px',
                  background: 'var(--navy-800)', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: 14, fontFamily: 'var(--font-mono)',
                  border: '3px solid var(--blue-200)',
                  boxShadow: '0 0 0 6px rgba(65,91,177,0.08)',
                }}>{n}</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{title}</h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ AI ENGINES ═══ */}
      <section style={{ padding: '80px 32px', background: 'var(--surface-card)' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p className="section-label" style={{ marginBottom: 8 }}>INTELLIGENCE LAYER</p>
            <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>AI Engines</h2>
            <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Deep learning models trained on Antarctic polar datasets</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {[
              { tag: 'Sequential GRU', title: 'Iceberg Drift Engine', desc: 'Predicts 24–72h trajectory vectors and spatial drift envelopes for Southern Ocean tabular icebergs.' },
              { tag: 'ConvLSTM2D', title: 'Sea-Ice Forecast', desc: 'Spatiotemporal grid prediction of SIC% across five forecast horizons using convolutional LSTM.' },
              { tag: 'PyTorch MLP', title: 'Weather Risk Classifier', desc: 'Estimates localized severe weather risk from wind, wave, and polar front squall probabilities.' },
            ].map(({ tag, title, desc }) => (
              <div key={title} className="p-card" style={{ padding: '24px' }}>
                <span className="badge badge-safe" style={{ marginBottom: 12, display: 'inline-flex' }}>{tag}</span>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{title}</h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ DECISION PIPELINE ═══ */}
      <section style={{ padding: '80px 32px', background: 'var(--surface-alt)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p className="section-label" style={{ marginBottom: 8 }}>DECISION PIPELINE</p>
            <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>From Data to Safe Routes</h2>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap', justifyContent: 'center',
          }}>
            {['Risk Fusion', 'Safety Engine', 'Time-Aware A*', 'Multi-Route Opt.', 'What-If'].map((step, i) => (
              <React.Fragment key={step}>
                <div style={{
                  padding: '12px 20px', borderRadius: 'var(--r-lg)',
                  background: 'var(--surface-card)', border: '1px solid var(--border)',
                  fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                  boxShadow: 'var(--shadow-sm)',
                }}>{step}</div>
                {i < 4 && (
                  <svg width="24" height="24" fill="none" stroke="var(--blue-200)" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                  </svg>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ DATA PROVENANCE ═══ */}
      <section id="data" style={{ padding: '80px 32px', background: 'var(--surface-card)' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p className="section-label" style={{ marginBottom: 8 }}>DATA PROVENANCE</p>
            <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Honest Data Reporting</h2>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 600, margin: '0 auto' }}>
              POLARIS combines trained historical models, recent satellite observations,
              and simulated vessel telemetry. Every data source is labelled.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 32 }}>
            {[
              { label: 'HISTORICAL', color: 'var(--info)', bg: 'var(--info-bg)' },
              { label: 'RECENT', color: 'var(--success)', bg: 'var(--success-bg)' },
              { label: 'SIMULATED', color: 'var(--warning)', bg: 'var(--warning-bg)' },
              { label: 'FORECAST', color: '#7C68C8', bg: '#F3F0FF' },
              { label: 'DERIVED', color: 'var(--text-muted)', bg: 'var(--surface-alt)' },
            ].map(({ label, color, bg }) => (
              <span key={label} style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                letterSpacing: '0.05em', background: bg, color,
                border: `1px solid ${color}22`,
              }}>{label}</span>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              { prov: 'HISTORICAL', src: 'GEBCO 2023 Bathymetry', desc: '15 arc-second global seafloor elevation' },
              { prov: 'HISTORICAL', src: 'BAS Polar Basemap', desc: 'EPSG:3031 Antarctic WMTS tile service' },
              { prov: 'RECENT', src: 'Sentinel-1 SAR', desc: 'C-band SAR observations from Copernicus Data Space' },
              { prov: 'SIMULATED', src: 'Vessel Telemetry', desc: 'Manual position input / demo coordinates' },
              { prov: 'FORECAST', src: 'ConvLSTM Sea-Ice', desc: 'Multi-horizon SIC% neural prediction' },
              { prov: 'FORECAST', src: 'GRU Iceberg Drift', desc: 'Trajectory and uncertainty envelopes' },
              { prov: 'DERIVED', src: 'Risk Twin Field', desc: 'Weighted 18×26 multi-factor hazard grid' },
            ].map(({ prov, src, desc }) => (
              <div key={src} style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '12px 0', borderBottom: '1px solid var(--border)',
              }}>
                <span style={{
                  width: 80, fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
                  color: 'var(--text-muted)', flexShrink: 0, textAlign: 'right',
                }}>{prov}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{src}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section style={{
        padding: '80px 32px', textAlign: 'center',
        background: 'linear-gradient(135deg, var(--navy-800), var(--blue-500))',
      }}>
        <h2 style={{ fontSize: 32, fontWeight: 800, color: 'white', marginBottom: 12, lineHeight: 1.25 }}>
          Turn Antarctic Data<br />into Safer Route Decisions.
        </h2>
        <p style={{ fontSize: 15, color: 'rgba(219,230,245,0.8)', maxWidth: 520, margin: '0 auto 32px', lineHeight: 1.6 }}>
          Launch the full POLARIS console with EPSG:3031 chart views, Risk Twin analysis, and AI-powered route generation.
        </p>
        <button onClick={goDash} style={{
          padding: '16px 40px', borderRadius: 12, border: 'none',
          background: 'white', color: 'var(--navy-800)',
          fontSize: 15, fontWeight: 800, cursor: 'pointer',
          boxShadow: '0 6px 24px rgba(0,0,0,0.2)',
          transition: 'transform 0.2s',
        }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'none'}
        >Open POLARIS Operations →</button>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer style={{
        background: 'var(--navy-800)', color: 'rgba(112,151,210,0.6)',
        padding: '16px 32px', display: 'flex', justifyContent: 'space-between',
        fontSize: 11, flexWrap: 'wrap', gap: 8,
      }}>
        <span>POLARIS Prototype · Smart India Hackathon 2026</span>
        <span>AI recommends; the Captain makes the final operational decision.</span>
      </footer>
    </div>
  );
};

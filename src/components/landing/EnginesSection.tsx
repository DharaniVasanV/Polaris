import React, { useState, useEffect } from 'react';

export const EnginesSection: React.FC = () => {
  const [gruStep, setGruStep] = useState(0);
  const [iceHorizon, setIceHorizon] = useState<number>(0);
  const [weatherState, setWeatherState] = useState(0);

  // GRU Trajectory Step Loop
  useEffect(() => {
    const timer = setInterval(() => {
      setGruStep(prev => (prev + 1) % 4);
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  // ConvLSTM Horizon Step Loop
  useEffect(() => {
    const timer = setInterval(() => {
      setIceHorizon(prev => (prev + 6) % 30);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  // Weather MLP Risk Shift Loop
  useEffect(() => {
    const timer = setInterval(() => {
      setWeatherState(prev => (prev + 1) % 3);
    }, 3500);
    return () => clearInterval(timer);
  }, []);

  return (
    <section id="engines" style={{ padding: '96px 32px', background: '#0A205C', color: '#FAFBFF' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <div style={{
            display: 'inline-block', padding: '4px 14px', borderRadius: 20,
            background: 'rgba(208, 228, 254, 0.12)', border: '1px solid rgba(208, 228, 254, 0.25)',
            color: '#D0E4FE', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 12
          }}>
            DEEP LEARNING MODEL ARCHITECTURE
          </div>
          <h2 style={{ fontSize: 'clamp(26px, 3vw, 36px)', fontWeight: 800, color: '#FAFBFF', marginBottom: 12 }}>
            THREE PREDICTIVE ENGINES
          </h2>
          <p style={{ fontSize: 15, color: '#7097D2', maxWidth: 640, margin: '0 auto', lineHeight: 1.6 }}>
            Specialized deep neural networks trained on historical Antarctic observation datasets for spatiotemporal hazard modeling.
          </p>
        </div>

        {/* 3 Large Visual Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>

          {/* CARD 1: GRU ICEBERG TRAJECTORY */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(112, 151, 210, 0.3)',
            borderRadius: 14, overflow: 'hidden',
            display: 'flex', flexDirection: 'column'
          }}>
            {/* Visual Canvas Area */}
            <div style={{ height: 200, background: '#07153E', position: 'relative', overflow: 'hidden', padding: 16 }}>
              <div style={{ position: 'absolute', top: 12, left: 12, fontSize: 10, fontWeight: 700, color: '#7097D2', fontFamily: 'var(--font-mono)' }}>
                ICEBERG TRACK // B-22
              </div>
              <svg width="100%" height="100%" viewBox="0 0 300 160">
                {/* Background grid */}
                <path d="M 0 40 L 300 40 M 0 80 L 300 80 M 0 120 L 300 120" stroke="#7097D2" strokeWidth="0.5" strokeDasharray="3 3" opacity="0.3" />
                <path d="M 100 0 L 100 160 M 200 0 L 200 160" stroke="#7097D2" strokeWidth="0.5" strokeDasharray="3 3" opacity="0.3" />

                {/* Historic Track Line */}
                <path d="M 40 120 Q 90 100 140 75" fill="none" stroke="#7097D2" strokeWidth="2" />
                <circle cx="40" cy="120" r="3" fill="#7097D2" />
                <circle cx="90" cy="100" r="3" fill="#7097D2" />
                <circle cx="140" cy="75" r="4" fill="#344DB1" stroke="#FAFBFF" strokeWidth="1.5" />

                {/* +1 Day GRU Predicted Trajectory */}
                <path
                  d="M 140 75 Q 190 55 240 40"
                  fill="none" stroke="#D0E4FE" strokeWidth="2.5" strokeDasharray="4 4"
                  opacity={gruStep >= 1 ? 1 : 0.4}
                  style={{ transition: 'opacity 0.5s' }}
                />

                {/* GRU Uncertainty Envelope Circle */}
                <circle
                  cx="240" cy="40" r="22"
                  fill="rgba(208, 228, 254, 0.12)" stroke="#D0E4FE" strokeWidth="1.5" strokeDasharray="3 3"
                  opacity={gruStep >= 2 ? 1 : 0.2}
                  style={{ transition: 'opacity 0.5s' }}
                />
                <circle cx="240" cy="40" r="4" fill="#D0E4FE" opacity={gruStep >= 2 ? 1 : 0.3} />

                {/* Labels */}
                <text x="145" y="92" fill="#7097D2" fontSize="9" fontFamily="var(--font-mono)">OBSERVED</text>
                <text x="210" y="22" fill="#D0E4FE" fontSize="9" fontFamily="var(--font-mono)">+24H GRU DRIFT (±1.4km)</text>
              </svg>
            </div>

            {/* Content Area */}
            <div style={{ padding: 24, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#344DB1', background: '#D0E4FE', padding: '2px 8px', borderRadius: 4, width: 'fit-content', marginBottom: 12 }}>
                RECURRENT GRU MODEL
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#FAFBFF', marginBottom: 8 }}>
                Iceberg Trajectory
              </h3>
              <p style={{ fontSize: 13, color: '#7097D2', lineHeight: 1.6, marginBottom: 16 }}>
                Predicts 24h to 72h spatial drift vectors and dynamic uncertainty boundaries for tabular Antarctic bergs.
              </p>
              <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid rgba(112, 151, 210, 0.2)', fontSize: 11, color: '#D0E4FE', fontFamily: 'var(--font-mono)' }}>
                166.8 km mean +1-day Haversine error
              </div>
            </div>
          </div>

          {/* CARD 2: CONVLSTM SEA-ICE CONCENTRATION */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(112, 151, 210, 0.3)',
            borderRadius: 14, overflow: 'hidden',
            display: 'flex', flexDirection: 'column'
          }}>
            {/* Visual Canvas Area */}
            <div style={{ height: 200, background: '#07153E', position: 'relative', overflow: 'hidden', padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#7097D2', fontFamily: 'var(--font-mono)' }}>
                  SIC% GRID FORECAST
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#FAFBFF', background: '#344DB1', padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>
                  +{iceHorizon}H
                </span>
              </div>

              {/* Dynamic Grid Cells */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, height: 130 }}>
                {Array.from({ length: 24 }).map((_, idx) => {
                  const baseSic = (idx * 17 + iceHorizon * 3) % 100;
                  const opacity = Math.min(1, Math.max(0.1, baseSic / 100));
                  return (
                    <div
                      key={idx}
                      style={{
                        background: baseSic > 70 ? '#D0E4FE' : baseSic > 40 ? '#7097D2' : '#344DB1',
                        opacity: opacity,
                        borderRadius: 3,
                        transition: 'all 0.8s ease'
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Content Area */}
            <div style={{ padding: 24, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#344DB1', background: '#D0E4FE', padding: '2px 8px', borderRadius: 4, width: 'fit-content', marginBottom: 12 }}>
                SPATIOTEMPORAL CONVLSTM
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#FAFBFF', marginBottom: 8 }}>
                Sea-Ice Concentration
              </h3>
              <p style={{ fontSize: 13, color: '#7097D2', lineHeight: 1.6, marginBottom: 16 }}>
                Predicts grid cell sea-ice concentration percentages (SIC%) across 5 discrete forecast horizons (0h–24h).
              </p>
              <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid rgba(112, 151, 210, 0.2)', fontSize: 11, color: '#D0E4FE', fontFamily: 'var(--font-mono)' }}>
                25 km resolution · 5 forecast horizons
              </div>
            </div>
          </div>

          {/* CARD 3: WEATHER MLP WEATHER RISK */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(112, 151, 210, 0.3)',
            borderRadius: 14, overflow: 'hidden',
            display: 'flex', flexDirection: 'column'
          }}>
            {/* Visual Canvas Area */}
            <div style={{ height: 200, background: '#07153E', position: 'relative', overflow: 'hidden', padding: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#7097D2', fontFamily: 'var(--font-mono)', marginBottom: 12 }}>
                PYTORCH MLP CLASSIFIER // SEVERE WEATHER
              </div>

              {/* Weather Bar Indicators */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { label: 'WIND SQUALL PROB', val: weatherState === 0 ? 35 : weatherState === 1 ? 65 : 42 },
                  { label: 'POLAR FRONT WAVE EXPOSURE', val: weatherState === 0 ? 48 : weatherState === 1 ? 72 : 55 },
                  { label: 'SURFACE CURRENT DRIFT', val: weatherState === 0 ? 22 : weatherState === 1 ? 38 : 28 },
                ].map(({ label, val }) => (
                  <div key={label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#D0E4FE', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                      <span>{label}</span>
                      <span>{val}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'rgba(112,151,210,0.2)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${val}%`,
                        background: val > 60 ? '#B45309' : '#344DB1',
                        transition: 'width 0.8s ease'
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Content Area */}
            <div style={{ padding: 24, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#344DB1', background: '#D0E4FE', padding: '2px 8px', borderRadius: 4, width: 'fit-content', marginBottom: 12 }}>
                MULTILAYER PERCEPTRON
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#FAFBFF', marginBottom: 8 }}>
                Weather Risk Classifier
              </h3>
              <p style={{ fontSize: 13, color: '#7097D2', lineHeight: 1.6, marginBottom: 16 }}>
                Fuses localized wind vectors, wave heights, and barometric pressure data into a normalized weather risk index.
              </p>
              <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid rgba(112, 151, 210, 0.2)', fontSize: 11, color: '#D0E4FE', fontFamily: 'var(--font-mono)' }}>
                Integrated into 4D Risk Twin Field
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};

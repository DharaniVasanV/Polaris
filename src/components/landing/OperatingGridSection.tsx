import React, { useState, useEffect } from 'react';

export const OperatingGridSection: React.FC = () => {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [isAutoPlay, setIsAutoPlay] = useState<boolean>(true);

  // Auto step loop
  useEffect(() => {
    if (!isAutoPlay) return;
    const timer = setInterval(() => {
      setActiveStep(prev => (prev % 7) + 1);
    }, 2800);
    return () => clearInterval(timer);
  }, [isAutoPlay]);

  const stepLabels = [
    '1. Vessel Position',
    '2. Iceberg Drift',
    '3. Sea-Ice Field',
    '4. Risk Twin Layer',
    '5. Primary Route',
    '6. Alt Route',
    '7. Clear Plan'
  ];

  return (
    <section id="map" style={{ padding: '96px 32px', background: '#FAFBFF', borderBottom: '1px solid #D0E4FE' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{
            display: 'inline-block', padding: '4px 14px', borderRadius: 20,
            background: '#E9F2FF', border: '1px solid #D0E4FE',
            color: '#344DB1', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 12
          }}>
            INTEGRATED VISUALIZATION
          </div>
          <h2 style={{ fontSize: 'clamp(26px, 3vw, 36px)', fontWeight: 800, color: '#0A205C', marginBottom: 12 }}>
            THE ANTARCTIC OPERATING GRID
          </h2>
          <p style={{ fontSize: 15, color: '#7097D2', maxWidth: 640, margin: '0 auto', lineHeight: 1.6 }}>
            Experience how POLARIS synthesizes multi-layer environmental intelligence into intuitive decision maps for Southern Ocean operational corridors.
          </p>
        </div>

        {/* Presentation Control Bar */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 24, flexWrap: 'wrap'
        }}>
          {stepLabels.map((lbl, idx) => {
            const stepNum = idx + 1;
            const isActive = activeStep === stepNum;
            return (
              <button
                key={lbl}
                onClick={() => { setActiveStep(stepNum); setIsAutoPlay(false); }}
                style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  cursor: 'pointer', border: '1px solid transparent',
                  background: isActive ? '#0A205C' : '#E9F2FF',
                  color: isActive ? '#FAFBFF' : '#344DB1',
                  borderColor: isActive ? '#0A205C' : '#D0E4FE',
                  transition: 'all 0.2s ease'
                }}
              >
                {lbl}
              </button>
            );
          })}
        </div>

        {/* Interactive Presentation Map Container */}
        <div style={{
          position: 'relative', width: '100%', height: 480, borderRadius: 16,
          overflow: 'hidden', border: '1px solid #D0E4FE', background: '#0A205C',
          boxShadow: '0 16px 40px rgba(10,32,92,0.15)'
        }}>
          {/* Base Image */}
          <img
            src="/assets/antarctica/hero-antarctica.png"
            alt="Antarctic Map Grid"
            style={{
              width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55,
              filter: 'contrast(1.1)'
            }}
          />

          {/* SVG Map Overlays */}
          <svg width="100%" height="100%" viewBox="0 0 1000 480" style={{ position: 'absolute', inset: 0 }}>
            {/* Grid Lat/Lon */}
            <circle cx="500" cy="700" r="400" fill="none" stroke="#7097D2" strokeWidth="0.8" strokeDasharray="4 6" opacity="0.4" />
            <circle cx="500" cy="700" r="540" fill="none" stroke="#7097D2" strokeWidth="0.8" opacity="0.3" />

            {/* STEP 3+: Sea-Ice Field */}
            {activeStep >= 3 && (
              <path
                d="M 100 240 Q 350 160 650 260 T 950 200 L 1000 480 L 0 480 Z"
                fill="#7097D2" opacity={activeStep >= 4 ? 0.15 : 0.3}
                style={{ transition: 'all 0.8s ease' }}
              />
            )}

            {/* STEP 4+: 4D Risk Twin Field Mask */}
            {activeStep >= 4 && (
              <g opacity="0.6">
                <rect x="240" y="180" width="120" height="90" fill="rgba(180, 83, 9, 0.25)" stroke="#B45309" strokeWidth="1" strokeDasharray="3 3" />
                <text x="250" y="200" fill="#FAFBFF" fontSize="9" fontWeight="700" fontFamily="var(--font-mono)">CONCENTRATED ICE HAZARD</text>

                <rect x="520" y="140" width="140" height="100" fill="rgba(185, 28, 28, 0.25)" stroke="#B91C1C" strokeWidth="1" strokeDasharray="3 3" />
                <text x="530" y="160" fill="#FAFBFF" fontSize="9" fontWeight="700" fontFamily="var(--font-mono)">CRITICAL STANDOFF ZONE</text>
              </g>
            )}

            {/* STEP 6+: Alternative Route */}
            {activeStep >= 6 && (
              <path
                d="M 180 380 Q 380 200 820 160"
                fill="none" stroke="#7097D2" strokeWidth="2.5" strokeDasharray="5 5" opacity="0.6"
              />
            )}

            {/* STEP 5+: Recommended Route */}
            {activeStep >= 5 && (
              <path
                d="M 180 380 C 280 320 380 440 560 300 S 720 200 820 160"
                fill="none"
                stroke={activeStep === 7 ? '#FAFBFF' : '#344DB1'}
                strokeWidth={activeStep === 7 ? '4.5' : '3.5'}
                opacity={activeStep === 7 ? 1 : 0.85}
                style={{ transition: 'all 0.4s ease' }}
              />
            )}

            {/* STEP 2+: Icebergs */}
            {activeStep >= 2 && (
              <g>
                <g transform="translate(420, 240)">
                  <circle r="14" fill="rgba(208, 228, 254, 0.15)" stroke="#D0E4FE" strokeWidth="1" strokeDasharray="3 3" />
                  <polygon points="0,-5 4,4 -4,4" fill="#D0E4FE" />
                  <text x="16" y="4" fill="#FAFBFF" fontSize="9" fontFamily="var(--font-mono)">B-22 DRIFT</text>
                </g>
                <g transform="translate(680, 310)">
                  <circle r="12" fill="rgba(208, 228, 254, 0.15)" stroke="#D0E4FE" strokeWidth="1" strokeDasharray="3 3" />
                  <polygon points="0,-5 4,4 -4,4" fill="#D0E4FE" />
                </g>
              </g>
            )}

            {/* STEP 1+: Vessel Departure & Destination */}
            {activeStep >= 1 && (
              <g>
                {/* Vessel */}
                <g transform="translate(180, 380)">
                  <circle r="8" fill="#344DB1" stroke="#FAFBFF" strokeWidth="2" />
                  <text x="-24" y="24" fill="#FAFBFF" fontSize="11" fontWeight="700">R/V POLARIS</text>
                  <text x="-24" y="36" fill="#D0E4FE" fontSize="9" fontFamily="var(--font-mono)">68.2°S, 12.4°E</text>
                </g>
                {/* Destination */}
                <g transform="translate(820, 160)">
                  <circle r="8" fill="#344DB1" stroke="#FAFBFF" strokeWidth="2" />
                  <text x="14" y="4" fill="#FAFBFF" fontSize="11" fontWeight="700">BHARATI STATION</text>
                  <text x="14" y="16" fill="#D0E4FE" fontSize="9" fontFamily="var(--font-mono)">DESTINATION</text>
                </g>
              </g>
            )}
          </svg>

          {/* Bottom Info Overlay Banner */}
          <div style={{
            position: 'absolute', bottom: 16, left: 16, right: 16,
            padding: '12px 20px', borderRadius: 8,
            background: 'rgba(10,32,92,0.85)', border: '1px solid rgba(112,151,210,0.4)',
            backdropFilter: 'blur(10px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#7097D2', letterSpacing: '0.06em' }}>ACTIVE STAGE: </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#FAFBFF', fontFamily: 'var(--font-mono)' }}>
                {stepLabels[activeStep - 1]}
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#D0E4FE', fontFamily: 'var(--font-mono)' }}>
              EPSG:3031 SOUTHERN OCEAN PROJECTION
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

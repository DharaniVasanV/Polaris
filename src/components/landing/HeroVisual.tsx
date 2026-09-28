import React, { useState, useEffect } from 'react';

export const HeroVisual: React.FC = () => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [animStep, setAnimStep] = useState(0);

  // Parallax tracking
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setMousePos({ x, y });
  };

  // 3-6s initial animation reveal sequence
  useEffect(() => {
    const timer1 = setTimeout(() => setAnimStep(1), 400);  // Lat/Lon grid
    const timer2 = setTimeout(() => setAnimStep(2), 1000); // Vessel marker
    const timer3 = setTimeout(() => setAnimStep(3), 1600); // Route drawing
    const timer4 = setTimeout(() => setAnimStep(4), 2400); // Icebergs
    const timer5 = setTimeout(() => setAnimStep(5), 3200); // Sea-Ice
    const timer6 = setTimeout(() => setAnimStep(6), 4000); // Settled operational view

    return () => {
      clearTimeout(timer1); clearTimeout(timer2); clearTimeout(timer3);
      clearTimeout(timer4); clearTimeout(timer5); clearTimeout(timer6);
    };
  }, []);

  // Parallax offsets
  const gridOffset = { x: mousePos.x * 6, y: mousePos.y * 6 };
  const routeOffset = { x: mousePos.x * 12, y: mousePos.y * 12 };
  const labelOffset = { x: mousePos.x * 18, y: mousePos.y * 18 };

  return (
    <div
      onMouseMove={handleMouseMove}
      style={{
        position: 'relative', width: '100%', height: '100%', minHeight: 520,
        overflow: 'hidden', background: '#0A205C',
        userSelect: 'none',
      }}
    >
      {/* 1. Base Satellite Imagery with Fade */}
      <img
        src="/assets/antarctica/hero-antarctica.png"
        alt="Antarctic Satellite Map"
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', opacity: 0.65, filter: 'contrast(1.1) brightness(0.9)',
          transition: 'opacity 1s ease',
        }}
      />

      {/* Deep Navy Gradient Overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(circle at 60% 50%, rgba(10,32,92,0.4) 0%, rgba(10,32,92,0.92) 85%)',
      }} />

      {/* 2. Latitude/Longitude Grid Arcs Layer */}
      <div style={{
        position: 'absolute', inset: 0,
        transform: `translate(${gridOffset.x}px, ${gridOffset.y}px)`,
        transition: 'transform 0.15s ease-out, opacity 0.8s ease',
        opacity: animStep >= 1 ? 0.7 : 0,
        pointerEvents: 'none',
      }}>
        <svg width="100%" height="100%" viewBox="0 0 800 600" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
          {/* Latitude circles */}
          <circle cx="400" cy="800" r="450" fill="none" stroke="#7097D2" strokeWidth="1" strokeDasharray="4 6" opacity="0.4" />
          <circle cx="400" cy="800" r="580" fill="none" stroke="#7097D2" strokeWidth="1" strokeDasharray="3 5" opacity="0.35" />
          <circle cx="400" cy="800" r="700" fill="none" stroke="#7097D2" strokeWidth="1" opacity="0.25" />

          {/* Longitude radials */}
          <line x1="400" y1="800" x2="150" y2="100" stroke="#7097D2" strokeWidth="1" strokeDasharray="4 6" opacity="0.3" />
          <line x1="400" y1="800" x2="400" y2="50" stroke="#7097D2" strokeWidth="1" strokeDasharray="4 6" opacity="0.3" />
          <line x1="400" y1="800" x2="650" y2="100" stroke="#7097D2" strokeWidth="1" strokeDasharray="4 6" opacity="0.3" />

          {/* Coordinate Marks */}
          <text x="160" y="120" fill="#D0E4FE" fontSize="10" fontFamily="var(--font-mono)" opacity="0.6">68°00'S</text>
          <text x="410" y="70" fill="#D0E4FE" fontSize="10" fontFamily="var(--font-mono)" opacity="0.6">70°00'S</text>
          <text x="630" y="120" fill="#D0E4FE" fontSize="10" fontFamily="var(--font-mono)" opacity="0.6">72°00'S</text>
        </svg>
      </div>

      {/* 3. Sea-Ice Concentration Field Overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        opacity: animStep >= 5 ? 0.35 : 0,
        transition: 'opacity 1.2s ease',
        pointerEvents: 'none',
      }}>
        <svg width="100%" height="100%" viewBox="0 0 800 600" preserveAspectRatio="none">
          <path d="M 120 220 Q 300 180 500 240 T 750 200 L 800 600 L 0 600 Z" fill="#7097D2" opacity="0.25" />
          <path d="M 220 300 Q 380 260 560 320 T 780 280 L 800 600 L 100 600 Z" fill="#D0E4FE" opacity="0.2" />
        </svg>
      </div>

      {/* 4. Routes & Vessel Vector Layer */}
      <div style={{
        position: 'absolute', inset: 0,
        transform: `translate(${routeOffset.x}px, ${routeOffset.y}px)`,
        transition: 'transform 0.15s ease-out',
        pointerEvents: 'none',
      }}>
        <svg width="100%" height="100%" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#344DB1" />
              <stop offset="50%" stopColor="#7097D2" />
              <stop offset="100%" stopColor="#D0E4FE" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Alternative Route (Counterfactual) */}
          {animStep >= 3 && (
            <path
              d="M 180 420 Q 300 280 620 180"
              fill="none"
              stroke="#7097D2"
              strokeWidth="2"
              strokeDasharray="4 6"
              opacity="0.4"
            />
          )}

          {/* Primary Recommended Route */}
          {animStep >= 3 && (
            <path
              d="M 180 420 C 260 380 340 460 460 340 S 560 220 620 180"
              fill="none"
              stroke="url(#routeGradient)"
              strokeWidth="3.5"
              strokeDasharray="800"
              strokeDashoffset={animStep >= 3 ? 0 : 800}
              filter="url(#glow)"
              style={{ transition: 'stroke-dashoffset 2.2s ease-in-out' }}
            />
          )}

          {/* Waypoints along route */}
          {animStep >= 3 && (
            <>
              <circle cx="310" cy="425" r="4" fill="#D0E4FE" stroke="#344DB1" strokeWidth="2" />
              <circle cx="460" cy="340" r="4" fill="#D0E4FE" stroke="#344DB1" strokeWidth="2" />
            </>
          )}

          {/* Destination Marker (Bharati Station) */}
          {animStep >= 1 && (
            <g transform="translate(620, 180)">
              <circle r="12" fill="none" stroke="#D0E4FE" strokeWidth="1.5" opacity="0.6" />
              <circle r="4" fill="#344DB1" stroke="#FAFBFF" strokeWidth="1.5" />
              <text x="16" y="4" fill="#FAFBFF" fontSize="11" fontWeight="700" fontFamily="var(--font-sans)">
                BHARATI STATION
              </text>
              <text x="16" y="16" fill="#D0E4FE" fontSize="9" fontFamily="var(--font-mono)">
                69.4000° S, 76.1861° E
              </text>
            </g>
          )}

          {/* Iceberg Markers & Uncertainty Envelopes */}
          {animStep >= 4 && (
            <>
              {/* Iceberg 1 */}
              <g transform="translate(380, 270)">
                <circle r="16" fill="rgba(112, 151, 210, 0.08)" stroke="rgba(112, 151, 210, 0.55)" strokeWidth="1" strokeDasharray="3 3" />
                <polygon points="0,-5 4,4 -4,4" fill="#7097D2" stroke="#FAFBFF" strokeWidth="1" />
                <text x="18" y="3" fill="#D0E4FE" fontSize="9" fontFamily="var(--font-mono)">B-22 (±1.4km)</text>
              </g>

              {/* Iceberg 2 */}
              <g transform="translate(480, 410)">
                <circle r="14" fill="rgba(112, 151, 210, 0.08)" stroke="rgba(112, 151, 210, 0.55)" strokeWidth="1" strokeDasharray="3 3" />
                <polygon points="0,-5 4,4 -4,4" fill="#7097D2" stroke="#FAFBFF" strokeWidth="1" />
                <text x="16" y="3" fill="#D0E4FE" fontSize="9" fontFamily="var(--font-mono)">A-68A</text>
              </g>
            </>
          )}

          {/* Vessel Marker (Departure: Queen Maud Land) */}
          {animStep >= 2 && (
            <g transform="translate(180, 420)">
              <circle r="16" fill="none" stroke="#344DB1" strokeWidth="2" opacity="0.5">
                <animate attributeName="r" values="10;22;10" dur="3s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.8;0;0.8" dur="3s" repeatCount="indefinite" />
              </circle>
              <circle r="6" fill="#344DB1" stroke="#FAFBFF" strokeWidth="2" />
              <text x="-12" y="24" fill="#FAFBFF" fontSize="11" fontWeight="700" fontFamily="var(--font-sans)">
                R/V POLARIS
              </text>
              <text x="-12" y="36" fill="#D0E4FE" fontSize="9" fontFamily="var(--font-mono)">
                QML START (11.5 kn)
              </text>
            </g>
          )}

          {/* Animated AI Forecast Indicator Along Route */}
          {animStep >= 6 && (
            <circle r="5" fill="#D0E4FE" stroke="#344DB1" strokeWidth="2" filter="url(#glow)">
              <animateMotion
                path="M 180 420 C 260 380 340 460 460 340 S 560 220 620 180"
                dur="8s"
                repeatCount="indefinite"
              />
            </circle>
          )}
        </svg>
      </div>

      {/* 5. Micro UI Scientific Data Overlay Labels */}
      <div style={{
        position: 'absolute', inset: 0,
        transform: `translate(${labelOffset.x}px, ${labelOffset.y}px)`,
        transition: 'transform 0.15s ease-out',
        pointerEvents: 'none',
      }}>
        {/* Top-Left Label */}
        <div style={{
          position: 'absolute', top: 32, left: 32,
          padding: '6px 12px', borderRadius: 6,
          background: 'rgba(10,32,92,0.85)', border: '1px solid rgba(112,151,210,0.4)',
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#7097D2', letterSpacing: '0.06em' }}>SEA-ICE FORECAST</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#FAFBFF', fontFamily: 'var(--font-mono)' }}>+24H CONVLSTM MESH</div>
        </div>

        {/* Top-Right Label */}
        <div style={{
          position: 'absolute', top: 32, right: 32,
          padding: '6px 12px', borderRadius: 6,
          background: 'rgba(10,32,92,0.85)', border: '1px solid rgba(112,151,210,0.4)',
          backdropFilter: 'blur(8px)', textAlign: 'right',
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#7097D2', letterSpacing: '0.06em' }}>ICEBERG TRAJECTORY</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#FAFBFF', fontFamily: 'var(--font-mono)' }}>GRU DRIFT MODEL</div>
        </div>

        {/* Bottom-Left Label */}
        <div style={{
          position: 'absolute', bottom: 32, left: 32,
          padding: '6px 12px', borderRadius: 6,
          background: 'rgba(10,32,92,0.85)', border: '1px solid rgba(112,151,210,0.4)',
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#7097D2', letterSpacing: '0.06em' }}>WEATHER RISK</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#FAFBFF', fontFamily: 'var(--font-mono)' }}>PYTORCH MLP CLASSIFIER</div>
        </div>

        {/* Bottom-Right Label */}
        <div style={{
          position: 'absolute', bottom: 32, right: 32,
          padding: '6px 12px', borderRadius: 6,
          background: 'rgba(10,32,92,0.85)', border: '1px solid rgba(112,151,210,0.4)',
          backdropFilter: 'blur(8px)', textAlign: 'right',
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#7097D2', letterSpacing: '0.06em' }}>ROUTE OPTIMIZER</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#FAFBFF', fontFamily: 'var(--font-mono)' }}>TIME-AWARE A* ALGORITHM</div>
        </div>
      </div>
    </div>
  );
};

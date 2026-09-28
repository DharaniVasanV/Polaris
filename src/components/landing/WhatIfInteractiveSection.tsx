import React, { useState } from 'react';

export const WhatIfInteractiveSection: React.FC = () => {
  const [selectedScenario, setSelectedScenario] = useState<string>('BASELINE');

  const scenarios: Record<string, { title: string; routePath: string; risk: number; dist: number; eta: string; desc: string }> = {
    BASELINE: {
      title: 'Baseline Polar Context',
      routePath: 'M 60 220 C 140 180 220 280 340 160 S 460 120 540 100',
      risk: 28, dist: 1420, eta: '94.6 h',
      desc: 'Standard multi-objective optimization balancing risk reduction and fuel efficiency under nominal conditions.'
    },
    ICEBERG_DRIFT: {
      title: 'Accelerated Iceberg Drift (+30%)',
      routePath: 'M 60 220 C 100 240 200 320 340 220 S 480 140 540 100',
      risk: 35, dist: 1465, eta: '97.2 h',
      desc: 'Route adjusts northward to maintain mandatory 10 km safety buffer around drifting iceberg B-22.'
    },
    SEA_ICE_INCREASE: {
      title: 'Sea-Ice Concentration Surge (85% SIC)',
      routePath: 'M 60 220 C 180 140 260 140 380 180 S 480 120 540 100',
      risk: 42, dist: 1490, eta: '104.1 h',
      desc: 'Route circumvents high concentration sea-ice pack to prevent hull ice-locking risk.'
    },
    WEATHER_DETERIORATION: {
      title: 'Polar Front Squall Deterioration',
      routePath: 'M 60 220 C 120 260 260 300 360 200 S 460 110 540 100',
      risk: 39, dist: 1450, eta: '99.5 h',
      desc: 'Alters transit velocity and heading to avoid high wave heights and severe squall cells.'
    },
    SAFETY_PRIORITY: {
      title: 'Strict Safety-First Protocol',
      routePath: 'M 60 220 C 120 300 280 320 400 220 S 480 130 540 100',
      risk: 14, dist: 1540, eta: '108.0 h',
      desc: 'Enforces maximum standoff buffers across all hazard fields, prioritizing vessel safety over ETA.'
    },
    EFFICIENCY_PRIORITY: {
      title: 'Direct Transit Efficiency Priority',
      routePath: 'M 60 220 L 540 100',
      risk: 68, dist: 1350, eta: '88.2 h',
      desc: 'Shortest direct distance corridor; traverses moderate ice pack (fails Polar Code safety constraints).'
    }
  };

  const current = scenarios[selectedScenario];

  return (
    <section style={{ padding: '96px 32px', background: '#FAFBFF', borderBottom: '1px solid #D0E4FE' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* ═══ WHAT-IF DEMONSTRATION ═══ */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{
            display: 'inline-block', padding: '4px 14px', borderRadius: 20,
            background: '#E9F2FF', border: '1px solid #D0E4FE',
            color: '#344DB1', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 12
          }}>
            DYNAMIC SCENARIO RE-EVALUATION
          </div>
          <h2 style={{ fontSize: 'clamp(26px, 3vw, 36px)', fontWeight: 800, color: '#0A205C', marginBottom: 12 }}>
            WHAT-IF ANALYSIS DEMONSTRATION
          </h2>
          <p style={{ fontSize: 15, color: '#7097D2', maxWidth: 640, margin: '0 auto', lineHeight: 1.6 }}>
            Test hypothetical environmental changes and vessel safety priorities in real-time without modifying operational vessel state.
          </p>
        </div>

        {/* Scenario Buttons Bar */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 32 }}>
          {[
            { id: 'BASELINE', label: 'BASELINE ROUTE' },
            { id: 'ICEBERG_DRIFT', label: 'ICEBERG DRIFT' },
            { id: 'SEA_ICE_INCREASE', label: 'SEA-ICE INCREASE' },
            { id: 'WEATHER_DETERIORATION', label: 'WEATHER DETERIORATION' },
            { id: 'SAFETY_PRIORITY', label: 'SAFETY PRIORITY' },
            { id: 'EFFICIENCY_PRIORITY', label: 'EFFICIENCY PRIORITY' }
          ].map(btn => {
            const active = selectedScenario === btn.id;
            return (
              <button
                key={btn.id}
                onClick={() => setSelectedScenario(btn.id)}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 11, fontWeight: 800,
                  fontFamily: 'var(--font-mono)', cursor: 'pointer',
                  background: active ? '#0A205C' : '#FFFFFF',
                  color: active ? '#FAFBFF' : '#0A205C',
                  border: `1.5px solid ${active ? '#0A205C' : '#D0E4FE'}`,
                  boxShadow: active ? '0 4px 12px rgba(10,32,92,0.15)' : 'none',
                  transition: 'all 0.2s ease'
                }}
              >
                {btn.label}
              </button>
            );
          })}
        </div>

        {/* Dynamic Route Visual Display Box */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24,
          background: '#FFFFFF', border: '1px solid #D0E4FE', borderRadius: 16,
          padding: 24, boxShadow: '0 8px 24px rgba(10,32,92,0.06)', marginBottom: 80
        }}>
          {/* Interactive SVG Display */}
          <div style={{ height: 300, background: '#0A205C', borderRadius: 12, position: 'relative', overflow: 'hidden' }}>
            <svg width="100%" height="100%" viewBox="0 0 600 300">
              {/* Grid backdrop */}
              <path d="M 0 75 L 600 75 M 0 150 L 600 150 M 0 225 L 600 225" stroke="#7097D2" strokeWidth="0.5" strokeDasharray="4 6" opacity="0.3" />
              <path d="M 150 0 L 150 300 M 300 0 L 300 300 M 450 0 L 450 300" stroke="#7097D2" strokeWidth="0.5" strokeDasharray="4 6" opacity="0.3" />

              {/* Baseline Ghost Path */}
              {selectedScenario !== 'BASELINE' && (
                <path
                  d="M 60 220 C 140 180 220 280 340 160 S 460 120 540 100"
                  fill="none" stroke="#7097D2" strokeWidth="2" strokeDasharray="4 4" opacity="0.4"
                />
              )}

              {/* Active Scenario Path */}
              <path
                d={current.routePath}
                fill="none"
                stroke={selectedScenario === 'EFFICIENCY_PRIORITY' ? '#B91C1C' : '#344DB1'}
                strokeWidth="3.5"
                style={{ transition: 'd 0.8s ease-in-out, stroke 0.4s' }}
              />

              {/* Vessel & Destination */}
              <circle cx="60" cy="220" r="6" fill="#344DB1" stroke="#FAFBFF" strokeWidth="2" />
              <circle cx="540" cy="100" r="6" fill="#344DB1" stroke="#FAFBFF" strokeWidth="2" />

              <text x="60" y="248" fill="#FAFBFF" fontSize="10" fontWeight="700" textAnchor="middle">QML START</text>
              <text x="540" y="80" fill="#FAFBFF" fontSize="10" fontWeight="700" textAnchor="middle">BHARATI STATION</text>
            </svg>
          </div>

          {/* Details & Metrics Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#344DB1', letterSpacing: '0.06em', marginBottom: 4 }}>
              EVALUATED SCENARIO
            </span>
            <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0A205C', marginBottom: 12 }}>
              {current.title}
            </h3>
            <p style={{ fontSize: 13, color: '#7097D2', lineHeight: 1.6, marginBottom: 24 }}>
              {current.desc}
            </p>

            {/* Metrics Breakdown Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div style={{ padding: 12, borderRadius: 8, background: '#E9F2FF', border: '1px solid #D0E4FE' }}>
                <div style={{ fontSize: 10, color: '#7097D2', fontWeight: 700 }}>COMPOSITE RISK</div>
                <div style={{ fontSize: 18, fontWeight: 900, fontFamily: 'var(--font-mono)', color: current.risk > 50 ? '#B91C1C' : '#0A205C' }}>
                  {current.risk} / 100
                </div>
              </div>
              <div style={{ padding: 12, borderRadius: 8, background: '#E9F2FF', border: '1px solid #D0E4FE' }}>
                <div style={{ fontSize: 10, color: '#7097D2', fontWeight: 700 }}>TRANSIT DISTANCE</div>
                <div style={{ fontSize: 18, fontWeight: 900, fontFamily: 'var(--font-mono)', color: '#0A205C' }}>
                  {current.dist} nm
                </div>
              </div>
              <div style={{ padding: 12, borderRadius: 8, background: '#E9F2FF', border: '1px solid #D0E4FE' }}>
                <div style={{ fontSize: 10, color: '#7097D2', fontWeight: 700 }}>ESTIMATED ETA</div>
                <div style={{ fontSize: 18, fontWeight: 900, fontFamily: 'var(--font-mono)', color: '#0A205C' }}>
                  {current.eta}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ ROUTE DECISION TRADE-OFF COMPARISON ═══ */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h3 style={{ fontSize: 22, fontWeight: 800, color: '#0A205C', marginBottom: 8 }}>
            OPERATIONAL ROUTE TRADE-OFFS
          </h3>
          <p style={{ fontSize: 14, color: '#7097D2' }}>
            POLARIS presents objective trade-off candidates without declaring any single route universally superior.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {[
            {
              name: 'SAFETY FIRST', status: 'RECOMMENDED', badgeBg: '#E9F2FF', badgeColor: '#344DB1',
              dist: '1,540 nm', eta: '108.0 hrs', risk: '14 / 100', fuel: '1.24 Index',
              desc: 'Maximizes ice clearance buffers; ideal for severe weather or un-reinforced vessel hulls.'
            },
            {
              name: 'BALANCED OPERATIONAL', status: 'BALANCED', badgeBg: '#E9F2FF', badgeColor: '#0A205C',
              dist: '1,420 nm', eta: '94.6 hrs', risk: '28 / 100', fuel: '1.00 Index',
              desc: 'Optimal trade-off balancing distance, fuel proxy index, and acceptable risk exposure.'
            },
            {
              name: 'EFFICIENCY DIRECT', status: 'REJECTED', badgeBg: '#FEE2E2', badgeColor: '#B91C1C',
              dist: '1,350 nm', eta: '88.2 hrs', risk: '68 / 100', fuel: '0.88 Index',
              desc: 'Shortest path crossing heavy ice pack; flagged as non-compliant with safety constraints.'
            }
          ].map(card => (
            <div key={card.name} style={{
              background: '#FFFFFF', border: '1px solid #D0E4FE', borderRadius: 12, padding: 20,
              display: 'flex', flexDirection: 'column', gap: 12
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#0A205C' }}>{card.name}</span>
                <span style={{ fontSize: 10, fontWeight: 800, background: card.badgeBg, color: card.badgeColor, padding: '3px 8px', borderRadius: 4 }}>
                  {card.status}
                </span>
              </div>
              <p style={{ fontSize: 12, color: '#7097D2', lineHeight: 1.5 }}>{card.desc}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingTop: 12, borderTop: '1px solid #E9F2FF', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                <div><span style={{ color: '#7097D2' }}>DIST: </span><strong style={{ color: '#0A205C' }}>{card.dist}</strong></div>
                <div><span style={{ color: '#7097D2' }}>ETA: </span><strong style={{ color: '#0A205C' }}>{card.eta}</strong></div>
                <div><span style={{ color: '#7097D2' }}>RISK: </span><strong style={{ color: card.name === 'EFFICIENCY DIRECT' ? '#B91C1C' : '#0A205C' }}>{card.risk}</strong></div>
                <div><span style={{ color: '#7097D2' }}>FUEL: </span><strong style={{ color: '#0A205C' }}>{card.fuel}</strong></div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
};

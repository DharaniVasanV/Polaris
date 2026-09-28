import React, { useState } from 'react';

export const WorkflowSection: React.FC = () => {
  const [activeStage, setActiveStage] = useState<number | null>(null);

  const stages = [
    {
      num: '01',
      title: 'OBSERVE',
      subtitle: 'Environmental & Vessel Ingestion',
      items: ['Vessel position & telemetry', 'Sentinel-1 SAR imagery', 'Oceanographic bathymetry', 'Meteorological data'],
      icon: (
        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3v18M3 12h18" strokeDasharray="2 2" />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
        </svg>
      )
    },
    {
      num: '02',
      title: 'FORECAST',
      subtitle: 'Deep Learning Predictions',
      items: ['GRU iceberg drift model', 'ConvLSTM sea-ice mesh', 'PyTorch Weather MLP', '0h to +24h horizons'],
      icon: (
        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      )
    },
    {
      num: '03',
      title: 'ASSESS RISK',
      subtitle: 'Risk Twin Hazard Synthesis',
      items: ['4D Risk Twin field', 'Iceberg safety buffer masks', 'POLARIS safety constraints', 'Spatial uncertainty envelopes'],
      icon: (
        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      )
    },
    {
      num: '04',
      title: 'ROUTE',
      subtitle: 'Constraint-Aware Navigation',
      items: ['Time-Aware A* algorithm', 'Multi-objective candidate ranking', 'What-If scenario testing', 'Human captain authorization'],
      icon: (
        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      )
    }
  ];

  return (
    <section id="workflow" style={{ padding: '96px 32px', background: '#FAFBFF', borderBottom: '1px solid #D0E4FE' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <div style={{
            display: 'inline-block', padding: '4px 14px', borderRadius: 20,
            background: '#E9F2FF', border: '1px solid #D0E4FE',
            color: '#344DB1', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 12
          }}>
            OPERATIONAL WORKFLOW PIPELINE
          </div>
          <h2 style={{ fontSize: 'clamp(26px, 3vw, 36px)', fontWeight: 800, color: '#0A205C', marginBottom: 12 }}>
            FROM OBSERVATION TO SAFE ROUTE
          </h2>
          <p style={{ fontSize: 15, color: '#7097D2', maxWidth: 620, margin: '0 auto', lineHeight: 1.6 }}>
            A rigorous four-stage scientific architecture converting satellite observations and deep learning models into captain-approved polar navigation plans.
          </p>
        </div>

        {/* Animated Connector Line */}
        <div style={{ position: 'relative', marginBottom: 40 }}>
          <div style={{
            position: 'absolute', top: 24, left: '10%', right: '10%', height: 3,
            background: '#E9F2FF', zIndex: 1
          }} />
          <div style={{
            position: 'absolute', top: 24, left: '10%', right: '10%', height: 3,
            background: 'linear-gradient(90deg, #344DB1, #7097D2, #D0E4FE)',
            backgroundSize: '200% 100%',
            animation: 'pulseLine 4s linear infinite',
            zIndex: 2
          }} />

          {/* Cards Grid */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20,
            position: 'relative', zIndex: 3
          }}>
            {stages.map((st, i) => {
              const isHovered = activeStage === i;
              return (
                <div
                  key={st.num}
                  onMouseEnter={() => setActiveStage(i)}
                  onMouseLeave={() => setActiveStage(null)}
                  style={{
                    background: isHovered ? '#FAFBFF' : '#FFFFFF',
                    border: `1.5px solid ${isHovered ? '#344DB1' : '#D0E4FE'}`,
                    borderRadius: 12, padding: 24,
                    boxShadow: isHovered ? '0 12px 32px rgba(10,32,92,0.12)' : '0 2px 8px rgba(10,32,92,0.04)',
                    transform: isHovered ? 'translateY(-4px)' : 'none',
                    transition: 'all 0.25s ease-out',
                    cursor: 'pointer'
                  }}
                >
                  {/* Stage Icon Number Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 10,
                      background: isHovered ? '#344DB1' : '#0A205C',
                      color: '#FAFBFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'background 0.2s ease'
                    }}>
                      {st.icon}
                    </div>
                    <span style={{
                      fontSize: 20, fontWeight: 900, fontFamily: 'var(--font-mono)',
                      color: isHovered ? '#344DB1' : '#7097D2'
                    }}>
                      {st.num}
                    </span>
                  </div>

                  <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0A205C', marginBottom: 4, letterSpacing: '0.04em' }}>
                    {st.title}
                  </h3>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#7097D2', marginBottom: 16, textTransform: 'uppercase' }}>
                    {st.subtitle}
                  </p>

                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {st.items.map((item, idx) => (
                      <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#0A205C', lineHeight: 1.4 }}>
                        <span style={{ color: '#344DB1', fontWeight: 800, lineHeight: 1 }}>•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

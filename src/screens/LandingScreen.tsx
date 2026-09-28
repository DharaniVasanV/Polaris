import React, { useState, useEffect } from 'react';
import { polarisStore } from '../store/polarisStore';
import { PolarisAppState } from '../types/state';

import { HeroVisual } from '../components/landing/HeroVisual';
import { WorkflowSection } from '../components/landing/WorkflowSection';
import { EnginesSection } from '../components/landing/EnginesSection';
import { OperatingGridSection } from '../components/landing/OperatingGridSection';
import { WhatIfInteractiveSection } from '../components/landing/WhatIfInteractiveSection';
import { MetricsAndProvenanceSection } from '../components/landing/MetricsAndProvenanceSection';

interface Props {
  state: PolarisAppState;
}

export const LandingScreen: React.FC<Props> = ({ state }) => {
  const [isScrolled, setIsScrolled] = useState(false);

  const goLogin = () => polarisStore.setScreen('LOGIN');
  const goDash = () => {
    if (state.isAuthenticated) {
      polarisStore.setScreen('DASHBOARD');
    } else {
      goLogin();
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 40);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#FAFBFF', fontFamily: 'var(--font-sans)', color: '#0A205C' }}>

      {/* ═══ 1. TOP NAVIGATION BAR ═══ */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: isScrolled ? 'rgba(250, 251, 255, 0.96)' : 'rgba(10, 32, 92, 0.95)',
        backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${isScrolled ? '#D0E4FE' : 'rgba(112, 151, 210, 0.3)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px', height: 60, transition: 'all 0.25s ease'
      }}>
        {/* Brand Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: isScrolled ? '#0A205C' : '#344DB1',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <svg width="18" height="18" fill="none" stroke="#FAFBFF" strokeWidth="2.2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </div>
          <span style={{
            fontWeight: 900, fontSize: 16, letterSpacing: '0.12em',
            color: isScrolled ? '#0A205C' : '#FAFBFF'
          }}>
            POLARIS
          </span>
        </div>

        {/* Section Links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {[
            { label: 'SYSTEM', href: '#workflow' },
            { label: 'AI ENGINES', href: '#engines' },
            { label: 'MAP', href: '#map' },
            { label: 'WORKFLOW', href: '#workflow' },
            { label: 'VALIDATION', href: '#metrics' }
          ].map(link => (
            <a
              key={link.label}
              href={link.href}
              style={{
                fontSize: 12, fontWeight: 700, letterSpacing: '0.05em',
                color: isScrolled ? '#7097D2' : '#D0E4FE',
                textDecoration: 'none', transition: 'color 0.2s'
              }}
            >
              {link.label}
            </a>
          ))}

          {/* Primary Action */}
          <button
            onClick={goDash}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none',
              background: '#344DB1', color: '#FAFBFF',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(52, 77, 177, 0.25)',
              transition: 'transform 0.15s ease'
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'none'}
          >
            ENTER OPERATIONS
          </button>
        </div>
      </nav>

      {/* ═══ 2. HERO SECTION ═══ */}
      <section style={{
        position: 'relative', overflow: 'hidden',
        display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 600,
        background: '#0A205C', color: '#FAFBFF'
      }}>
        {/* LEFT Hero Text Column */}
        <div style={{
          padding: '80px 48px 80px 64px',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          maxWidth: 640, zIndex: 2
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '4px 14px', borderRadius: 20,
            background: 'rgba(208, 228, 254, 0.1)', border: '1px solid rgba(208, 228, 254, 0.25)',
            marginBottom: 24, width: 'fit-content'
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#D0E4FE' }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#D0E4FE' }}>
              RESEARCH-GRADE ANTARCTIC DECISION SUPPORT
            </span>
          </div>

          <h1 style={{
            fontSize: 'clamp(32px, 3.6vw, 48px)', fontWeight: 900,
            color: '#FAFBFF', lineHeight: 1.15, marginBottom: 20, letterSpacing: '-0.01em'
          }}>
            Predictive Ocean–Ice Learning for Antarctic Route Intelligence and Safety
          </h1>

          <p style={{
            fontSize: 'clamp(14px, 1.3vw, 16px)',
            color: '#D0E4FE', lineHeight: 1.7,
            marginBottom: 36, maxWidth: 540
          }}>
            AI-enabled decision support for Antarctic research vessels, combining sea-ice forecasting, iceberg trajectory prediction, environmental risk assessment and safe route planning.
          </p>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 40 }}>
            {/* Primary CTA */}
            <button
              onClick={goDash}
              style={{
                padding: '14px 32px', borderRadius: 10, border: 'none',
                background: '#344DB1', color: '#FAFBFF',
                fontSize: 14, fontWeight: 800, cursor: 'pointer',
                boxShadow: '0 6px 20px rgba(52, 77, 177, 0.4)',
                transition: 'transform 0.2s ease, background 0.2s'
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.background = '#2B4099'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.background = '#344DB1'; }}
            >
              ENTER OPERATIONS
            </button>

            {/* Secondary CTA */}
            <a
              href="#workflow"
              style={{
                padding: '14px 28px', borderRadius: 10,
                border: '1.5px solid #D0E4FE',
                background: '#E9F2FF',
                color: '#0A205C', fontSize: 14, fontWeight: 800,
                textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              EXPLORE POLARIS
            </a>
          </div>

          <div style={{
            display: 'flex', gap: 24, fontSize: 11, color: '#7097D2', fontFamily: 'var(--font-mono)'
          }}>
            <span>SOUTHERN OCEAN // 60°S — 90°S</span>
            <span>EPSG:3031 STEREOGRAPHIC</span>
          </div>
        </div>

        {/* RIGHT Antarctic Scientific Visual */}
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <HeroVisual />
        </div>
      </section>

      {/* ═══ HERO OPERATIONAL STATUS STRIP ═══ */}
      <section style={{
        background: '#07153E', borderTop: '1px solid rgba(112, 151, 210, 0.3)',
        borderBottom: '1px solid rgba(112, 151, 210, 0.3)',
        padding: '12px 32px'
      }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 16
        }}>
          {[
            { label: 'GRU MODEL', status: 'ACTIVE', color: '#D0E4FE' },
            { label: 'CONVLSTM2D', status: 'ACTIVE', color: '#D0E4FE' },
            { label: 'WEATHER MLP', status: 'ACTIVE', color: '#D0E4FE' },
            { label: 'RISK TWIN', status: 'READY', color: '#FAFBFF' },
            { label: 'TIME-AWARE A*', status: 'READY', color: '#FAFBFF' }
          ].map(st => (
            <div key={st.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.color }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: '#7097D2', letterSpacing: '0.06em', fontFamily: 'var(--font-mono)' }}>
                {st.label}:
              </span>
              <span style={{ fontSize: 11, fontWeight: 800, color: st.color, fontFamily: 'var(--font-mono)' }}>
                {st.status}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ 3. WORKFLOW PIPELINE ═══ */}
      <WorkflowSection />

      {/* ═══ 4. PREDICTIVE AI ENGINES ═══ */}
      <EnginesSection />

      {/* ═══ 5. ANTARCTIC OPERATING GRID ═══ */}
      <OperatingGridSection />

      {/* ═══ 6. WHAT-IF DEMONSTRATION & TRADE-OFFS ═══ */}
      <WhatIfInteractiveSection />

      {/* ═══ 7. METRICS, PROVENANCE & OFFLINE CAPABILITY ═══ */}
      <MetricsAndProvenanceSection />

      {/* ═══ 8. FINAL CTA ═══ */}
      <section style={{
        padding: '96px 32px', textAlign: 'center',
        background: '#0A205C', color: '#FAFBFF'
      }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 40px)', fontWeight: 900, color: '#FAFBFF', marginBottom: 16, lineHeight: 1.2 }}>
            Turn Antarctic Data into Safer Route Decisions.
          </h2>
          <p style={{ fontSize: 16, color: '#D0E4FE', marginBottom: 36, lineHeight: 1.6 }}>
            Launch the POLARIS operations console with EPSG:3031 polar chart views, 4D Risk Twin analysis, and deep learning-backed route optimization.
          </p>
          <button
            onClick={goDash}
            style={{
              padding: '16px 44px', borderRadius: 12, border: 'none',
              background: '#344DB1', color: '#FAFBFF',
              fontSize: 16, fontWeight: 800, cursor: 'pointer',
              boxShadow: '0 8px 28px rgba(52, 77, 177, 0.4)',
              transition: 'transform 0.2s ease'
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'none'}
          >
            ENTER OPERATIONS →
          </button>
        </div>
      </section>

      {/* ═══ 9. MINIMAL LANDING FOOTER ═══ */}
      <footer style={{
        background: '#07153E', borderTop: '1px solid rgba(112, 151, 210, 0.2)',
        padding: '32px', color: '#7097D2', fontSize: 12
      }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 20
        }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 14, color: '#FAFBFF', letterSpacing: '0.1em', marginBottom: 4 }}>
              POLARIS
            </div>
            <div style={{ fontSize: 11, color: '#7097D2' }}>
              Predictive Ocean–Ice Learning for Antarctic Route Intelligence and Safety
            </div>
          </div>

          <div style={{ display: 'flex', gap: 24, fontSize: 12, fontWeight: 600 }}>
            <a href="#workflow" style={{ color: '#D0E4FE', textDecoration: 'none' }}>System</a>
            <a href="#engines" style={{ color: '#D0E4FE', textDecoration: 'none' }}>Documentation</a>
            <button onClick={goDash} style={{ background: 'none', border: 'none', color: '#D0E4FE', cursor: 'pointer', padding: 0, fontWeight: 600, fontSize: 12 }}>
              Operations
            </button>
          </div>
        </div>
        <div style={{ maxWidth: 1100, margin: '16px auto 0', paddingTop: 16, borderTop: '1px solid rgba(112,151,210,0.1)', fontSize: 10, color: 'rgba(112,151,210,0.6)', textAlign: 'center' }}>
          AI recommends; the Captain retains sole operational command for final routing authorization.
        </div>
      </footer>
    </div>
  );
};

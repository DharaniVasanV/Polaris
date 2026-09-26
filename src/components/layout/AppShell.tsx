import React, { useState, useEffect } from 'react';
import { PolarisAppState, AppScreen } from '../../types/state';
import { polarisStore } from '../../store/polarisStore';
import { WhatIfDrawer } from '../common/WhatIfDrawer';
import { EventLogModal } from '../common/EventLogModal';
import { DemoDirector } from '../common/DemoDirector';

interface AppShellProps {
  state: PolarisAppState;
  children: React.ReactNode;
}

/* ── Navigation definition ───────────────────────── */
const NAV: { screen: AppScreen; label: string; icon: string }[] = [
  { screen: 'DASHBOARD',        label: 'Dashboard',     icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { screen: 'MAP',              label: 'Antarctic Map',  icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7' },
  { screen: 'VOYAGE_PLANNER',   label: 'Mission',        icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { screen: 'DECISION_CENTER',  label: 'Risk Twin',      icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { screen: 'ROUTES',           label: 'Routes',         icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
  { screen: 'WHAT_IF',          label: 'What-If',        icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' },
  { screen: 'ICE_INTELLIGENCE', label: 'Data',           icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { screen: 'SETTINGS',         label: 'Settings',       icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
];

function UtcClock() {
  const [t, setT] = useState('');
  useEffect(() => {
    const update = () => {
      const d = new Date();
      setT(`${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')} UTC`);
    };
    update();
    const id = setInterval(update, 15000);
    return () => clearInterval(id);
  }, []);
  return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-on-navy)' }}>{t}</span>;
}

function StatusPill({ label, online }: { label: string; online: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700,
      background: online ? 'rgba(31,157,115,0.12)' : 'rgba(255,255,255,0.05)',
      border: `1px solid ${online ? 'rgba(31,157,115,0.35)' : 'rgba(255,255,255,0.08)'}`,
      color: online ? '#6EE7B7' : 'rgba(255,255,255,0.4)',
      letterSpacing: '0.03em',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: online ? 'var(--success)' : 'var(--text-faint)' }} />
      {label}
    </span>
  );
}

export const AppShell: React.FC<AppShellProps> = ({ state, children }) => {
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const [eventLogOpen, setEventLogOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <div className="app-shell">

      {/* ═══ HEADER — 56px navy ═══ */}
      <header style={{
        height: 'var(--header-h)', background: 'var(--surface-navy)',
        borderBottom: '1px solid var(--border-navy)',
        display: 'flex', alignItems: 'center', padding: '0 20px', gap: 16,
        flexShrink: 0, zIndex: 'var(--z-shell)' as any,
      }}>
        {/* Logo */}
        <button
          onClick={() => polarisStore.setScreen('DASHBOARD')}
          aria-label="Go to Dashboard"
          style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'var(--blue-500)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="16" height="16" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </div>
          <span style={{ color: 'white', fontWeight: 900, fontSize: 15, letterSpacing: '0.12em' }}>POLARIS</span>
        </button>

        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)' }} />

        {/* Engine status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, overflow: 'hidden' }}>
          <StatusPill label="GRU" online={state.aiModelStatus === 'ONLINE'} />
          <StatusPill label="ConvLSTM" online={state.seaIceModelStatus === 'ONLINE'} />
          <StatusPill label="MLP" online={state.weatherModelStatus === 'ONLINE'} />
          <StatusPill label="SAR" online={state.sentinel1Status === 'ONLINE'} />
          {state.offlineMode && (
            <span style={{
              padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700,
              background: 'rgba(216,155,43,0.15)', border: '1px solid rgba(216,155,43,0.4)',
              color: '#F5D98A',
            }}>⚡ OFFLINE</span>
          )}
        </div>

        {/* Right controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <UtcClock />
          <button onClick={() => setDemoOpen(true)} aria-label="Demo mode"
            style={{
              padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
              color: 'var(--text-on-navy)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/></svg>
            Demo
          </button>
          <button onClick={() => setEventLogOpen(true)} aria-label="Audit log"
            style={{
              padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
              color: 'var(--text-on-navy)', cursor: 'pointer',
            }}
          >Log ({state.eventLog.length})</button>

          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', background: 'var(--blue-500)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: 'white',
            }}>
              {(state.userEmail?.[0] ?? 'C').toUpperCase()}
            </div>
            <button onClick={() => polarisStore.logout()} aria-label="Sign out"
              style={{
                fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)',
                background: 'none', border: 'none', cursor: 'pointer',
              }}
            >Sign Out</button>
          </div>
        </div>
      </header>

      {/* ═══ NAVIGATION — 44px white ═══ */}
      <nav style={{
        height: 'var(--nav-h)', background: 'var(--surface-card)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 2,
        flexShrink: 0, overflowX: 'auto',
      }}>
        {NAV.map((item) => {
          const active = state.activeScreen === item.screen;
          return (
            <button
              key={item.screen}
              onClick={() => polarisStore.setScreen(item.screen)}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 'var(--r-md)',
                border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: active ? 650 : 500,
                fontFamily: 'var(--font-sans)',
                background: active ? 'var(--blue-50)' : 'transparent',
                color: active ? 'var(--navy-800)' : 'var(--text-muted)',
                transition: 'all 0.15s',
                flexShrink: 0, whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'var(--surface-alt)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
              onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; } }}
            >
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon}/>
              </svg>
              {item.label}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <button onClick={() => setWhatIfOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 'var(--r-md)',
            border: '1.5px solid var(--border)', background: 'var(--surface-card)',
            color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/>
          </svg>
          Scenarios
        </button>
      </nav>

      {/* ═══ PAGE CONTENT ═══ */}
      <main className="page-content">
        {children}
      </main>

      {/* ═══ OVERLAYS ═══ */}
      <WhatIfDrawer state={state} isOpen={whatIfOpen} onClose={() => setWhatIfOpen(false)} />
      <DemoDirector state={state} isOpen={demoOpen} onClose={() => setDemoOpen(false)} />
      <EventLogModal eventLog={state.eventLog} isOpen={eventLogOpen} onClose={() => setEventLogOpen(false)} />
    </div>
  );
};

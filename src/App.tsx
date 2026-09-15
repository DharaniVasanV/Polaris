import React, { useState, useEffect } from 'react';
import { polarisStore } from './store/polarisStore';
import { PolarisAppState } from './types/state';

// Layout components
import { Header } from './components/layout/Header';
import { TopNav } from './components/layout/TopNav';
import { AppFooter } from './components/layout/AppFooter';

// Common overlays
import { DemoDirector } from './components/common/DemoDirector';
import { WhatIfDrawer } from './components/common/WhatIfDrawer';
import { EventLogModal } from './components/common/EventLogModal';

// Screens
import { LoginScreen } from './screens/LoginScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { VoyagePlannerScreen } from './screens/VoyagePlannerScreen';
import { IceIntelligenceScreen } from './screens/IceIntelligenceScreen';
import { DecisionCenterScreen } from './screens/DecisionCenterScreen';
import { FleetScreen } from './screens/FleetScreen';
import { ResearchScreen } from './screens/ResearchScreen';
import { SettingsScreen } from './screens/SettingsScreen';

export default function App() {
  const [state, setState] = useState<PolarisAppState>(polarisStore.getState());
  const [isWhatIfOpen, setIsWhatIfOpen] = useState(false);
  const [isDemoDirectorOpen, setIsDemoDirectorOpen] = useState(false);
  const [isEventLogOpen, setIsEventLogOpen] = useState(false);

  // Subscribe to reactive state changes
  useEffect(() => {
    const unsubscribe = polarisStore.subscribe((newState) => {
      setState({ ...newState });
    });
    return () => unsubscribe();
  }, []);

  // Close overlays on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsWhatIfOpen(false);
        setIsDemoDirectorOpen(false);
        setIsEventLogOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Login ──────────────────────────────────────────────────
  if (!state.isAuthenticated) {
    return <LoginScreen />;
  }

  // ── Main Application Shell ─────────────────────────────────
  return (
    <div className="w-full min-h-screen flex flex-col bg-[#060B14] text-slate-100 selection:bg-sky-500 selection:text-black overflow-hidden">

      <Header
        state={state}
        onOpenEventLog={() => setIsEventLogOpen(true)}
        onOpenDemoDirector={() => setIsDemoDirectorOpen(true)}
      />

      <TopNav
        activeScreen={state.activeScreen}
        onOpenWhatIf={() => setIsWhatIfOpen(true)}
      />

      {/* ── Screen Router ── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {state.activeScreen === 'DASHBOARD'       && <DashboardScreen      state={state} />}
        {state.activeScreen === 'VOYAGE_PLANNER'  && <VoyagePlannerScreen  state={state} />}
        {state.activeScreen === 'ICE_INTELLIGENCE'&& <IceIntelligenceScreen state={state} />}
        {state.activeScreen === 'DECISION_CENTER' && <DecisionCenterScreen  state={state} />}
        {state.activeScreen === 'FLEET'           && <FleetScreen          state={state} />}
        {state.activeScreen === 'RESEARCH'        && <ResearchScreen       state={state} />}
        {state.activeScreen === 'SETTINGS'        && <SettingsScreen       state={state} />}
      </div>

      <AppFooter />

      {/* ── Global Overlays ── */}
      <WhatIfDrawer
        state={state}
        isOpen={isWhatIfOpen}
        onClose={() => setIsWhatIfOpen(false)}
      />

      <DemoDirector
        state={state}
        isOpen={isDemoDirectorOpen}
        onClose={() => setIsDemoDirectorOpen(false)}
      />

      <EventLogModal
        eventLog={state.eventLog}
        isOpen={isEventLogOpen}
        onClose={() => setIsEventLogOpen(false)}
      />
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { polarisStore } from './store/polarisStore';
import { PolarisAppState, AppScreen } from './types/state';

// Public screens (no auth required)
import { LandingScreen } from './screens/LandingScreen';
import { LoginScreen } from './screens/LoginScreen';

// App shell
import { AppShell } from './components/layout/AppShell';

// Protected screens
import { DashboardScreen } from './screens/DashboardScreen';
import { AntarcticMapScreen } from './screens/AntarcticMapScreen';
import { MissionPlannerScreen } from './screens/MissionPlannerScreen';
import { RiskTwinScreen } from './screens/RiskTwinScreen';
import { RoutesScreen } from './screens/RoutesScreen';
import { WhatIfScreen } from './screens/WhatIfScreen';
import { EnvironmentalDataScreen } from './screens/EnvironmentalDataScreen';
import { SettingsScreen } from './screens/SettingsScreen';

// Protected screens — these require isAuthenticated
const PROTECTED_SCREENS: AppScreen[] = [
  'DASHBOARD', 'MAP', 'VOYAGE_PLANNER', 'ICE_INTELLIGENCE',
  'DECISION_CENTER', 'ROUTES', 'WHAT_IF', 'FLEET', 'RESEARCH', 'SETTINGS',
];

function renderProtectedRoute(screen: AppScreen, state: PolarisAppState) {
  switch (screen) {
    case 'DASHBOARD':       return <DashboardScreen state={state} />;
    case 'MAP':             return <AntarcticMapScreen state={state} />;
    case 'VOYAGE_PLANNER':  return <MissionPlannerScreen state={state} />;
    case 'DECISION_CENTER': return <RiskTwinScreen state={state} />;
    case 'ROUTES':          return <RoutesScreen state={state} />;
    case 'WHAT_IF':         return <WhatIfScreen state={state} />;
    case 'ICE_INTELLIGENCE':return <EnvironmentalDataScreen state={state} />;
    case 'SETTINGS':        return <SettingsScreen state={state} />;
    default:                return <DashboardScreen state={state} />;
  }
}

export default function App() {
  const [state, setState] = useState<PolarisAppState>(polarisStore.getState());

  useEffect(() => {
    const unsub = polarisStore.subscribe((newState) => setState({ ...newState }));
    return () => unsub();
  }, []);

  const { isAuthenticated, activeScreen } = state;

  // ── PUBLIC: Landing ──────────────────────────────
  if (activeScreen === 'LANDING') {
    return <LandingScreen state={state} />;
  }

  // ── PUBLIC: Login ────────────────────────────────
  if (activeScreen === 'LOGIN' || !isAuthenticated) {
    // If user landed on a protected route, redirect to login
    return <LoginScreen />;
  }

  // ── PROTECTED: Main Application ──────────────────
  return (
    <AppShell state={state}>
      {renderProtectedRoute(activeScreen, state)}
    </AppShell>
  );
}

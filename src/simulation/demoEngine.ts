/**
 * POLARIS: Demo Director & SIH Presentation Script Engine
 * Supports deterministic stage transitions, jump-to-step, and full reset for hackathon demos.
 */

import { AppScreen } from '../types/state';
import { ScenarioId } from '../types/scenario';

export interface DemoStep {
  stepIndex: number;
  stageKey: string;
  title: string;
  targetScreen: AppScreen;
  targetScenarioId: ScenarioId;
  suggestedAction: string;
  narrativeNote: string;
}

export const DEMO_STAGES: DemoStep[] = [
  {
    stepIndex: 1,
    stageKey: 'LOGIN',
    title: '1. Secure Operational Login',
    targetScreen: 'LOGIN',
    targetScenarioId: 'NORMAL',
    suggestedAction: 'Click "SIGN IN" or test "EMERGENCY OFFLINE LOGIN"',
    narrativeNote: 'Show offline-first readiness and role-based Antarctic mission access.',
  },
  {
    stepIndex: 2,
    stageKey: 'DASHBOARD',
    title: '2. Antarctic Mission Control Dashboard',
    targetScreen: 'DASHBOARD',
    targetScenarioId: 'NORMAL',
    suggestedAction: 'Inspect Antarctic polar map, telemetry KPIs, and time slider',
    narrativeNote: 'Point out real-time Antarctic corridor, B-22 tracking, and weather telemetry.',
  },
  {
    stepIndex: 3,
    stageKey: 'VOYAGE_PLANNER',
    title: '3. Voyage Planner & Vessel Profiling',
    targetScreen: 'VOYAGE_PLANNER',
    targetScenarioId: 'NORMAL',
    suggestedAction: 'Click "LOAD DEMO VOYAGE" then "GENERATE POLARIS ROUTE"',
    narrativeNote: 'Show prototype vessel constraints (PC3 ice class, 70% SIC threshold, 12km iceberg buffer).',
  },
  {
    stepIndex: 4,
    stageKey: 'ROUTE_EVALUATION',
    title: '4. AI Route Deck & Rejection Logic',
    targetScreen: 'VOYAGE_PLANNER',
    targetScenarioId: 'NORMAL',
    suggestedAction: 'Select "Shortest Route (Rejected)" then switch to "Safe Route A"',
    narrativeNote: 'Explain WHY shortest route is rejected (B-22 corridor conflict & >70% SIC). Safe Route A avoids hazards.',
  },
  {
    stepIndex: 5,
    stageKey: 'ICE_INTELLIGENCE',
    title: '5. Ice Intelligence & Forecast Horizons',
    targetScreen: 'ICE_INTELLIGENCE',
    targetScenarioId: 'NORMAL',
    suggestedAction: 'Click Today -> +1 Day -> +3 Days -> +7 Days',
    narrativeNote: 'Observe moving ice edge, shifting iceberg forecast vectors, and expanding uncertainty envelopes.',
  },
  {
    stepIndex: 6,
    stageKey: 'DECISION_CENTER',
    title: '6. Captain Decision Center',
    targetScreen: 'DECISION_CENTER',
    targetScenarioId: 'NORMAL',
    suggestedAction: 'Observe bridge navigation HUD and active Safe Route A status',
    narrativeNote: 'Establish baseline safe operating state (Risk 34/100, 16 km clearance).',
  },
  {
    stepIndex: 7,
    stageKey: 'HAZARD_SIMULATION',
    title: '7. Live Hazard Simulation (B-22 Shift)',
    targetScreen: 'DECISION_CENTER',
    targetScenarioId: 'ICEBERG_SHIFT',
    suggestedAction: 'Click "SIMULATE HAZARD" button',
    narrativeNote: 'Watch multi-step animation: B-22 drifts into corridor -> Safe Route A turns critical red -> Critical Alert pulses.',
  },
  {
    stepIndex: 8,
    stageKey: 'AUTO_REPLAN',
    title: '8. Automated Replanning & Route B',
    targetScreen: 'DECISION_CENTER',
    targetScenarioId: 'ICEBERG_SHIFT',
    suggestedAction: 'Inspect Alternative Route B and click "APPROVE ROUTE (HUMAN DECISION)"',
    narrativeNote: 'Highlight human-in-the-loop principle: "AI recommends; Captain / Ice Navigator makes the final operational decision."',
  },
  {
    stepIndex: 9,
    stageKey: 'WHAT_IF_DELAY',
    title: '9. Spatiotemporal What-If (Delayed Departure)',
    targetScreen: 'DASHBOARD',
    targetScenarioId: 'DELAYED_DEPARTURE_6H',
    suggestedAction: 'Open What-If Drawer and select "Delayed Departure +6h"',
    narrativeNote: 'Demonstrate Risk(Location, Time): Same geographic corridor becomes hazardous because arrival shifts into higher SIC window.',
  },
  {
    stepIndex: 10,
    stageKey: 'NO_SAFE_ROUTE',
    title: '10. Multi-Hazard Closure (No Safe Route Found)',
    targetScreen: 'DASHBOARD',
    targetScenarioId: 'NO_SAFE_ROUTE',
    suggestedAction: 'Select "No Safe Route" scenario in What-If Drawer',
    narrativeNote: 'System refuses to recommend unsafe passages; issues mandatory delay and Ice Navigator review advisory.',
  },
];

/**
 * POLARIS: Event-Driven Hazard Simulation
 * Handles the animated multi-step hazard event progression for the Captain Decision Center.
 */

import { PolarisAlert, EventLogEntry } from '../types/domain';

export interface HazardSimStepInfo {
  stepNumber: number;
  stageName: string;
  announcement: string;
  durationMs: number;
}

export const HAZARD_SIMULATION_STEPS: HazardSimStepInfo[] = [
  {
    stepNumber: 1,
    stageName: 'SENSOR_ANOMALY',
    announcement: 'Detecting anomalous environmental change: SAR satellite telemetry update received...',
    durationMs: 700,
  },
  {
    stepNumber: 2,
    stageName: 'TRAJECTORY_SHIFT',
    announcement: 'Iceberg B-22 drift acceleration detected: Trajectory vector shifted +1.2°N, +3.8°E...',
    durationMs: 900,
  },
  {
    stepNumber: 3,
    stageName: 'UNCERTAINTY_EXPANSION',
    announcement: 'Spatiotemporal uncertainty corridor expanding: +12h radius enlarged to 14.0 km...',
    durationMs: 800,
  },
  {
    stepNumber: 4,
    stageName: 'CONFLICT_EVALUATION',
    announcement: 'Evaluating route intersection: Predicted clearance degraded to 8.4 km (< 12 km required buffer)...',
    durationMs: 900,
  },
  {
    stepNumber: 5,
    stageName: 'CRITICAL_ALERT',
    announcement: 'CRITICAL ALERT TRIGGERED: Safe Route A corridor compromised. Immediate review required.',
    durationMs: 800,
  },
  {
    stepNumber: 6,
    stageName: 'AUTO_REPLANNING',
    announcement: 'Running spatiotemporal A* replanning engine... Computing alternative safe passage...',
    durationMs: 1000,
  },
  {
    stepNumber: 7,
    stageName: 'ROUTE_B_READY',
    announcement: 'ALTERNATIVE ROUTE B READY: Safe standoff restored (26.4 km clearance). Human operational decision required.',
    durationMs: 600,
  },
];

export function createHazardAlert(): PolarisAlert {
  return {
    id: `alert_hazard_${Date.now()}`,
    severity: 'CRITICAL',
    title: 'CRITICAL ICEBERG HAZARD: Route Conflict Detected',
    description:
      'Iceberg B-22 has shifted on a collision course with Safe Route A. Predicted clearance has collapsed to 8.4 km (Required safety buffer: 12 km). Corridor arrival in 11h 42m.',
    actionRequired: 'Recalculate Route or Approve Alternative Route B',
    timestampUtc: new Date().toISOString(),
    isAcknowledged: false,
    sourceModule: 'Decision Center Spatiotemporal Monitor',
  };
}

export function createHazardEventLogs(): EventLogEntry[] {
  const now = new Date();
  const timeStr = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')} UTC`;

  return [
    {
      id: `log_${Date.now()}_1`,
      timestampUtc: now.toISOString(),
      simulationTimeFormatted: timeStr,
      category: 'ICEBERG',
      message: 'Iceberg B-22 trajectory updated: Current-driven drift vector rotated ENE to NE.',
      severity: 'WARNING',
    },
    {
      id: `log_${Date.now()}_2`,
      timestampUtc: now.toISOString(),
      simulationTimeFormatted: timeStr,
      category: 'ROUTE',
      message: 'Spatial conflict detected: Safe Route A clearance (8.4 km) violates vessel 12 km safety threshold.',
      severity: 'CRITICAL',
    },
    {
      id: `log_${Date.now()}_3`,
      timestampUtc: now.toISOString(),
      simulationTimeFormatted: timeStr,
      category: 'ROUTE',
      message: 'Automated A* replanning generated Alternative Route B (Min clearance: 26.4 km, ETA: +44h 10m).',
      severity: 'NORMAL',
    },
    {
      id: `log_${Date.now()}_4`,
      timestampUtc: now.toISOString(),
      simulationTimeFormatted: timeStr,
      category: 'DECISION',
      message: 'Standing rule enforced: AI recommends Alternative Route B; Captain confirmation required.',
      severity: 'NORMAL',
    },
  ];
}

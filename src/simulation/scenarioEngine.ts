/**
 * POLARIS: Non-Mutating Scenario Overlay Engine
 * Generates derived environmental state: DerivedState = BaselineState + ScenarioOverlay
 * Supports instant deterministic What-If simulations and reversible rollbacks.
 */

import { EnvironmentalCell } from '../types/risk';
import { Iceberg } from '../types/domain';
import { ScenarioId, ScenarioOverlay, WhatIfComparisonResult } from '../types/scenario';
import { BASELINE_ENVIRONMENT_GRID } from '../data/baselineEnvironment';
import { BASELINE_ICEBERGS } from '../data/icebergs';

export const SCENARIO_PRESETS: Record<ScenarioId, ScenarioOverlay> = {
  NORMAL: {
    id: 'NORMAL',
    title: 'Standard Antarctic Corridor (Baseline)',
    description: 'Verified operational snapshot. High data freshness and expected ice drift.',
    badge: 'BASELINE',
    sicDeltaPercent: 0,
    waveDeltaMeters: 0,
    departureDelayHours: 0,
    icebergPositionShift: null,
    speedMultiplier: 1.0,
    safetyBufferDeltaKm: 0,
    confidencePenaltyPercent: 0,
  },
  ICE_GROWTH: {
    id: 'ICE_GROWTH',
    title: 'Rapid Sea-Ice Expansion (+20%)',
    description: 'Sudden polar front causes rapid consolidation and freezing in northern channels.',
    badge: 'ICE EXPANSION',
    sicDeltaPercent: 20,
    waveDeltaMeters: -0.5,
    departureDelayHours: 0,
    icebergPositionShift: null,
    speedMultiplier: 0.85,
    safetyBufferDeltaKm: 0,
    confidencePenaltyPercent: 5,
  },
  ICEBERG_SHIFT: {
    id: 'ICEBERG_SHIFT',
    title: 'Iceberg B-22 Trajectory Shift',
    description: 'Deep ocean current shifts B-22 drift northeastward directly across Safe Route A corridor.',
    badge: 'ICEBERG CONFLICT',
    sicDeltaPercent: 0,
    waveDeltaMeters: 0,
    departureDelayHours: 0,
    icebergPositionShift: {
      icebergId: 'B-22',
      shiftLat: 1.2,
      shiftLon: 3.8,
      expandUncertaintyFactor: 1.4,
    },
    speedMultiplier: 1.0,
    safetyBufferDeltaKm: 0,
    confidencePenaltyPercent: 4,
  },
  HIGH_WAVES: {
    id: 'HIGH_WAVES',
    title: 'Southern Ocean Gale (+2.5m Swell)',
    description: 'Intense cyclonic low-pressure system creates heavy wave action in open water segments.',
    badge: 'HEAVY SEAS',
    sicDeltaPercent: -5,
    waveDeltaMeters: 2.5,
    departureDelayHours: 0,
    icebergPositionShift: null,
    speedMultiplier: 0.75,
    safetyBufferDeltaKm: 0,
    confidencePenaltyPercent: 8,
  },
  DELAYED_DEPARTURE_6H: {
    id: 'DELAYED_DEPARTURE_6H',
    title: 'Delayed Departure (+6 Hours)',
    description: 'Demonstrates spatiotemporal Risk(Location, Time). Vessel arrival is shifted into peak ice drift window.',
    badge: 'DELAY +6H',
    sicDeltaPercent: 0,
    waveDeltaMeters: 0,
    departureDelayHours: 6,
    icebergPositionShift: null,
    speedMultiplier: 1.0,
    safetyBufferDeltaKm: 0,
    confidencePenaltyPercent: 3,
  },
  DELAYED_DEPARTURE_12H: {
    id: 'DELAYED_DEPARTURE_12H',
    title: 'Delayed Departure (+12 Hours)',
    description: 'Vessel arrives at hazard zone during maximum diurnal ice compression and expanded uncertainty.',
    badge: 'DELAY +12H',
    sicDeltaPercent: 0,
    waveDeltaMeters: 0,
    departureDelayHours: 12,
    icebergPositionShift: null,
    speedMultiplier: 1.0,
    safetyBufferDeltaKm: 0,
    confidencePenaltyPercent: 7,
  },
  VESSEL_SPEED_REDUCED: {
    id: 'VESSEL_SPEED_REDUCED',
    title: 'Reduced Vessel Engine Output (10 Knots)',
    description: 'Main propulsion restricted for energy conservation or technical limits, extending transit time.',
    badge: 'SPEED REDUCED',
    sicDeltaPercent: 0,
    waveDeltaMeters: 0,
    departureDelayHours: 0,
    icebergPositionShift: null,
    speedMultiplier: 0.71,
    safetyBufferDeltaKm: 0,
    confidencePenaltyPercent: 0,
  },
  SAFETY_BUFFER_INCREASED: {
    id: 'SAFETY_BUFFER_INCREASED',
    title: 'Enhanced Safety Buffer (20 km)',
    description: 'Increased iceberg standoff margin enforced for heavy scientific instrument towing.',
    badge: 'BUFFER 20KM',
    sicDeltaPercent: 0,
    waveDeltaMeters: 0,
    departureDelayHours: 0,
    icebergPositionShift: null,
    speedMultiplier: 1.0,
    safetyBufferDeltaKm: 8,
    confidencePenaltyPercent: 0,
  },
  LOW_CONFIDENCE: {
    id: 'LOW_CONFIDENCE',
    title: 'Degraded Satellite Observation',
    description: 'SAR coverage gap over sector reduces data confidence and broadens uncertainty envelopes.',
    badge: 'STALE DATA',
    sicDeltaPercent: 0,
    waveDeltaMeters: 0,
    departureDelayHours: 0,
    icebergPositionShift: null,
    speedMultiplier: 1.0,
    safetyBufferDeltaKm: 0,
    confidencePenaltyPercent: 25,
  },
  NO_SAFE_ROUTE: {
    id: 'NO_SAFE_ROUTE',
    title: 'Severe Multi-Hazard Closure (No Safe Route)',
    description: 'Combined multi-calving event, 95% pack ice closure, and gale force seas block all corridors.',
    badge: 'CRITICAL NO-GO',
    sicDeltaPercent: 35,
    waveDeltaMeters: 3.0,
    departureDelayHours: 0,
    icebergPositionShift: {
      icebergId: 'B-22',
      shiftLat: 1.5,
      shiftLon: 5.0,
      expandUncertaintyFactor: 2.2,
    },
    speedMultiplier: 0.6,
    safetyBufferDeltaKm: 10,
    confidencePenaltyPercent: 15,
    forceAllCorridorsBlocked: true,
  },
};

/**
 * Applies a scenario overlay onto the baseline environmental grid without mutating the baseline
 */
export function applyScenarioToEnvironment(
  baselineGrid: EnvironmentalCell[][],
  scenario: ScenarioOverlay
): EnvironmentalCell[][] {
  return baselineGrid.map((row) =>
    row.map((cell) => {
      if (cell.isLand) return { ...cell };

      const newSicValues = { ...cell.sicValues };
      const newWaveValues = { ...cell.waveValues };
      const newConfidence = { ...cell.confidencePercent };

      const horizons: (0 | 6 | 12 | 18 | 24)[] = [0, 6, 12, 18, 24];
      for (const h of horizons) {
        // Adjust SIC
        let sicVal = cell.sicValues[h] + scenario.sicDeltaPercent;
        if (scenario.forceAllCorridorsBlocked && cell.row > 4 && cell.row < 14) {
          sicVal = Math.max(sicVal, 88); // Exceeds vessel 70% threshold
        }
        newSicValues[h] = Math.round(Math.max(0, Math.min(100, sicVal)));

        // Adjust Wave
        const waveVal = Math.max(0.5, cell.waveValues[h] + scenario.waveDeltaMeters);
        newWaveValues[h] = Number(waveVal.toFixed(1));

        // Adjust Confidence
        const confVal = Math.max(30, cell.confidencePercent[h] - scenario.confidencePenaltyPercent);
        newConfidence[h] = Math.round(confVal);
      }

      return {
        ...cell,
        sicValues: newSicValues,
        waveValues: newWaveValues,
        confidencePercent: newConfidence,
      };
    })
  );
}

/**
 * Applies scenario overlay onto iceberg positions and trajectories
 */
export function applyScenarioToIcebergs(
  baselineIcebergs: Iceberg[],
  scenario: ScenarioOverlay
): Iceberg[] {
  return baselineIcebergs.map((berg) => {
    if (scenario.icebergPositionShift && scenario.icebergPositionShift.icebergId === berg.id) {
      const shift = scenario.icebergPositionShift;
      const newCurrentPos = {
        latitude: Number((berg.currentPosition.latitude + shift.shiftLat * 0.4).toFixed(2)),
        longitude: Number((berg.currentPosition.longitude + shift.shiftLon * 0.4).toFixed(2)),
      };

      const newForecast = berg.forecastTrack.map((pt) => ({
        ...pt,
        latitude: Number((pt.latitude + shift.shiftLat).toFixed(2)),
        longitude: Number((pt.longitude + shift.shiftLon).toFixed(2)),
        uncertaintyRadiusKm: Number((pt.uncertaintyRadiusKm * shift.expandUncertaintyFactor).toFixed(1)),
      }));

      return {
        ...berg,
        currentPosition: newCurrentPos,
        forecastTrack: newForecast,
        riskLevel: 'CRITICAL',
      };
    }
    return { ...berg };
  });
}

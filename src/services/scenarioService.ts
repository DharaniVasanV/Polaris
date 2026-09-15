/**
 * POLARIS: What-If Scenario Simulation & Decision Sensitivity Service (Phase 7).
 * Communicates with backend endpoints:
 *   - POST /scenarios/simulate
 *   - POST /scenarios/sensitivity
 */

import { GeoPoint, VesselProfile } from '../types/domain';
import {
  BackendScenarioType,
  BackendScenarioParameters,
  BackendScenarioSimulateResponse,
  BackendSensitivitySweepResponse
} from '../types/scenario';

const API_BASE_URL = 'http://127.0.0.1:8000';

export async function simulateScenarioViaBackend(params: {
  departureLocation: GeoPoint;
  destinationLocation: GeoPoint;
  vessel: VesselProfile;
  scenarioType: BackendScenarioType;
  parameters?: BackendScenarioParameters;
  departureDelayHours?: number;
}): Promise<BackendScenarioSimulateResponse | null> {
  const payload = {
    start_latitude: params.departureLocation.latitude,
    start_longitude: params.departureLocation.longitude,
    destination_latitude: params.destinationLocation.latitude,
    destination_longitude: params.destinationLocation.longitude,
    nominal_speed_knots: params.vessel.nominalSpeedKnots || 10.0,
    departure_delay_hours: params.departureDelayHours || 0.0,
    allow_diagonal_moves: true,
    max_search_depth_steps: 60,
    scenario_type: params.scenarioType,
    parameters: params.parameters || {},
  };

  try {
    const res = await fetch(`${API_BASE_URL}/scenarios/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.warn(`[POLARIS] Scenario simulate HTTP error: ${res.status}`);
      return null;
    }

    const data: BackendScenarioSimulateResponse = await res.json();
    return data;
  } catch (err) {
    console.error('[POLARIS] Failed to execute scenario simulation via backend:', err);
    return null;
  }
}

export async function runSensitivitySweepViaBackend(params: {
  departureLocation: GeoPoint;
  destinationLocation: GeoPoint;
  vessel: VesselProfile;
  sweepType: BackendScenarioType;
  parameterValues?: number[];
}): Promise<BackendSensitivitySweepResponse | null> {
  const payload = {
    start_latitude: params.departureLocation.latitude,
    start_longitude: params.departureLocation.longitude,
    destination_latitude: params.destinationLocation.latitude,
    destination_longitude: params.destinationLocation.longitude,
    nominal_speed_knots: params.vessel.nominalSpeedKnots || 10.0,
    sweep_type: params.sweepType,
    parameter_values: params.parameterValues || [],
  };

  try {
    const res = await fetch(`${API_BASE_URL}/scenarios/sensitivity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.warn(`[POLARIS] Sensitivity sweep HTTP error: ${res.status}`);
      return null;
    }

    const data: BackendSensitivitySweepResponse = await res.json();
    return data;
  } catch (err) {
    console.error('[POLARIS] Failed to execute sensitivity sweep via backend:', err);
    return null;
  }
}

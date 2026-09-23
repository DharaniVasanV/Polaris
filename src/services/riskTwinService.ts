/**
 * POLARIS: Antarctic Risk Twin & Operational Decision Dashboard Service (Phase 8).
 * Communicates with backend endpoints for unified Risk Twin state, 7-engine health,
 * and spatiotemporal cell inspection.
 */

import {
  RiskTwinSummaryResponse,
  CellInspectionData,
  SystemEngineHealth,
} from '../types/riskTwin';
import { GeoPoint, VesselProfile } from '../types/domain';

import { API_BASE_URL } from '../config/api';

export interface FetchRiskTwinParams {
  departureLocation: GeoPoint;
  destinationLocation: GeoPoint;
  vessel: VesselProfile;
  activeScenarioResult?: Record<string, any> | null;
}

/**
 * Fetches the unified Risk Twin summary snapshot from the backend.
 */
export async function fetchRiskTwinSummary(
  params: FetchRiskTwinParams
): Promise<RiskTwinSummaryResponse | null> {
  const payload = {
    departure_latitude: params.departureLocation.latitude,
    departure_longitude: params.departureLocation.longitude,
    destination_latitude: params.destinationLocation.latitude,
    destination_longitude: params.destinationLocation.longitude,
    vessel_safe_sic: params.vessel.safeSicThresholdPercent ?? 70.0,
    vessel_buffer_km: params.vessel.icebergSafetyBufferKm ?? 12.0,
    vessel_speed_knots: params.vessel.nominalSpeedKnots ?? 14.0,
    active_scenario_result: params.activeScenarioResult ?? null,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`${API_BASE_URL}/risk-twin/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[POLARIS] Risk Twin summary HTTP error: ${res.status}`);
      return null;
    }

    const data: RiskTwinSummaryResponse = await res.json();
    return data;
  } catch (err) {
    console.warn('[POLARIS] Failed to reach Risk Twin summary endpoint:', err);
    return null;
  }
}

/**
 * Fetches operational status of all 7 POLARIS intelligence engines.
 */
export async function fetchSystemEngineHealth(): Promise<Record<string, SystemEngineHealth> | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`${API_BASE_URL}/system/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const data = await res.json();
    return data.engines || null;
  } catch {
    return null;
  }
}

/**
 * Fetches deep inspection data for a specific grid cell on the operational map.
 */
export async function fetchCellInspection(
  row: number,
  column: number,
  horizonHours: number = 6.0,
  vesselSafeSic: number = 70.0,
  vesselDraft: number = 7.8
): Promise<CellInspectionData | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const url = `${API_BASE_URL}/risk-twin/cell-inspect?row=${row}&col=${column}&horizon=${horizonHours}&vessel_safe_sic=${vesselSafeSic}&vessel_draft=${vesselDraft}`;
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const data: CellInspectionData = await res.json();
    return data;
  } catch {
    return null;
  }
}

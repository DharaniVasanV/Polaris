/**
 * POLARIS AI Model Integration Service
 * Connects the React UI to the Python GRU Iceberg Trajectory Model Server.
 * Server Endpoint: http://127.0.0.1:8000
 */

export interface GeoPointPayload {
  lat: number;
  lon: number;
}

export interface TrajectoryStepResponse {
  step: string;
  step_index: number;
  forecast_date?: string | null;
  latitude: number;
  longitude: number;
  empirical_error_radius_km: number;
  vessel_safety_margin_km: number;
  total_hazard_zone_radius_km: number;
}

export interface GRUForecastResponse {
  source: string;
  iceberg_id: string;
  model_name: string;
  prediction_type: string;
  forecast_horizon_days: number;
  forecast_steps: TrajectoryStepResponse[];
  metadata?: {
    trained_model_file: string;
    feature_count: number;
    features: string[];
    sequence_length: number;
  };
}

export interface ModelHealthResponse {
  status: 'HEALTHY' | 'UNHEALTHY' | 'OFFLINE';
  service: string;
  version: string;
  model_engine: {
    adapter_name: string;
    model_type: string;
    model_status: string;
    sequence_length: number;
    features: string[];
  };
}

import { API_BASE_URL } from '../config/api';

/**
 * Ensures the coordinate array has at least 10 points for the GRU sequence window.
 * If fewer points are provided, it extrapolates backwards along the initial trajectory vector.
 */
export function ensure10HistoryPoints(coords: GeoPointPayload[]): GeoPointPayload[] {
  if (coords.length >= 10) {
    return coords.slice(-10);
  }

  if (coords.length === 0) {
    throw new Error('Cannot predict trajectory with empty historical coordinates.');
  }

  if (coords.length === 1) {
    const p = coords[0];
    const points: GeoPointPayload[] = [];
    for (let i = 9; i >= 0; i--) {
      points.push({ lat: p.lat - i * 0.05, lon: p.lon - i * 0.1 });
    }
    return points;
  }

  const p0 = coords[0];
  const p1 = coords[1];
  const dLat = p1.lat - p0.lat;
  const dLon = p1.lon - p0.lon;

  const needed = 10 - coords.length;
  const backfilled: GeoPointPayload[] = [];

  for (let i = needed; i >= 1; i--) {
    backfilled.push({
      lat: p0.lat - i * dLat,
      lon: p0.lon - i * dLon,
    });
  }

  return [...backfilled, ...coords];
}

/**
 * Calls the trained GRU trajectory model backend.
 * @param icebergId - The identifier of the iceberg (e.g. "B-22", "A68A", "A23A")
 * @param historyCoords - Array of historical coordinates [{lat, lon}, ...]
 * @param steps - Number of forecast days ahead (1 to 5)
 * @param safetyMarginKm - Vessel operational clearance buffer in km (default: 30)
 */
export async function getIcebergGRUPrediction(
  icebergId: string,
  historyCoords: GeoPointPayload[],
  steps: number = 5,
  safetyMarginKm: number = 30.0
): Promise<GRUForecastResponse> {
  const preparedCoords = ensure10HistoryPoints(historyCoords);

  const url = `${API_BASE_URL}/iceberg/predict?vessel_safety_margin_km=${safetyMarginKm}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      iceberg_id: icebergId,
      historical_coordinates: preparedCoords,
      steps: Math.min(5, Math.max(1, steps)),
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`GRU Model server error (${response.status}): ${errText}`);
  }

  const data: GRUForecastResponse = await response.json();
  return data;
}

/**
 * Health check to verify if the Python model backend is active.
 */
export async function checkModelServerHealth(): Promise<ModelHealthResponse | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const data: ModelHealthResponse = await res.json();
    return data;
  } catch {
    return null;
  }
}

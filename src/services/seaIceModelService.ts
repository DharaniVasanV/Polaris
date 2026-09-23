/**
 * POLARIS: ConvLSTM Sea-Ice Concentration Model Service
 * Connects the frontend to the ConvLSTM2D spatiotemporal sea-ice forecasting engine.
 * Endpoint: http://127.0.0.1:8000/forecast
 * Fallback: /data/exports/polaris_sea_ice_forecast.json (bundled static export)
 */

export type ForecastHorizon = '0h' | '6h' | '12h' | '18h' | '24h';
export type ForecastProvenance = 'OBSERVED' | 'INTERPOLATED' | 'MODEL_FORECAST';
export type SeaIceClassification = 'OPEN_WATER' | 'LOW_ICE' | 'MODERATE_ICE' | 'DENSE_ICE' | 'EXTREME_ICE';
export type NavigationRiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
export type UncertaintyLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface SeaIceCell {
  row: number;              // 0 to 17 (North to South: -58.47°S to -74.53°S)
  column: number;           // 0 to 25 (West to East: -23.08°W to +73.08°E)
  latitude: number;         // Cell center latitude in decimal degrees
  longitude: number;        // Cell center longitude in decimal degrees
  sic: number | null;       // Concentration fraction (0.0 to 1.0) or null
  sic_percent: number | null;// Concentration percentage (0.0% to 100.0%) or null
  ice_class: SeaIceClassification | null;
  sea_ice_risk: number | null; // Multi-factor risk score (0.0 to 100.0) or null
  risk_level: NavigationRiskLevel | null;
  confidence: number | null;   // Confidence index (0.0 to 100.0) or null
  uncertainty: UncertaintyLevel | null;
  data_available: boolean;     // true if inside coverage; false if outside
  prediction_status: 'PREDICTED' | 'OUTSIDE_MODEL_COVERAGE';
}

export interface PolarisSeaIceForecast {
  metadata: {
    model: string;
    model_version: string;
    generated_at: string;
    model_coverage?: {
      latitude_min: number;
      latitude_max: number;
      longitude_min: number;
      longitude_max: number;
      spatial_resolution: string;
    };
    frontend_grid?: {
      rows: number;
      columns: number;
      total_cells: number;
      latitude_min: number;
      latitude_max: number;
      longitude_min: number;
      longitude_max: number;
    };
    forecast_capability: Record<ForecastHorizon, ForecastProvenance>;
  };
  forecast: Record<ForecastHorizon, SeaIceCell[]>;
}

import { API_BASE_URL } from '../config/api';

/**
 * Fetches the 5-step multi-horizon ConvLSTM sea-ice forecast.
 * Tries the live Python FastAPI backend on port 8000 first.
 * If offline, gracefully falls back to the bundled static export JSON.
 */
export async function fetchSeaIceForecast(
  apiBaseUrl: string = API_BASE_URL
): Promise<{ data: PolarisSeaIceForecast; isLive: boolean }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(`${apiBaseUrl}/forecast`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data: PolarisSeaIceForecast = await res.json();
      return { data, isLive: true };
    }
    throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.warn('[POLARIS] Live ConvLSTM sea-ice endpoint offline, loading bundled static export:', err);
    // Fallback to static pre-generated export in public directory
    const staticRes = await fetch('/data/exports/polaris_sea_ice_forecast.json');
    if (!staticRes.ok) {
      throw new Error(`Static sea-ice export not found at /data/exports/polaris_sea_ice_forecast.json`);
    }
    const staticData: PolarisSeaIceForecast = await staticRes.json();
    return { data: staticData, isLive: false };
  }
}

/**
 * Health check to verify if the ConvLSTM sea-ice engine is loaded.
 */
export async function checkSeaIceServerHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(`${API_BASE_URL}/sea-ice/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) return false;
    const data = await res.json();
    return data.status === 'healthy' && data.model_loaded === true;
  } catch {
    return false;
  }
}

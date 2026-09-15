/**
 * POLARIS: Weather Risk Neural Model Service
 * Connects the frontend to the PyTorch Weather Risk MLP forecasting engine.
 * Endpoint: http://127.0.0.1:8000/weather/forecast
 * Fallback: /data/exports/polaris_weather_forecast.json (bundled static export)
 */

export type WeatherRiskClass = 'SAFE' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export interface WeatherGridCell {
  row: number;              // 0 to 17
  column: number;           // 0 to 25
  latitude: number;         // Decimal degrees
  longitude: number;        // Decimal degrees
  riskScore: number;        // Continuous [0.0, 1.0]
  riskClass: WeatherRiskClass;
  timestamp: string;
  forecastHorizonHours: number; // 6
}

export interface WeatherGridResponse {
  model: string;
  forecastHorizonHours: number;
  gridRows: number;
  gridColumns: number;
  totalCells: number;
  timestamp: string;
  cells: WeatherGridCell[];
}

export interface WeatherHealthResponse {
  model: string;
  status: string;
  framework: string;
  forecast_horizon_hours: number;
  grid_cells: number;
}

const API_BASE_URL = 'http://127.0.0.1:8000';

/**
 * Fetches the 468-cell 6h-ahead weather navigation risk grid.
 * Tries the live Python FastAPI backend on port 8000 first.
 * If offline, gracefully falls back to the bundled static export JSON.
 */
export async function fetchWeatherForecast(
  apiBaseUrl: string = API_BASE_URL
): Promise<{ data: WeatherGridResponse; isLive: boolean }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(`${apiBaseUrl}/weather/forecast?horizon_hours=6`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data: WeatherGridResponse = await res.json();
      return { data, isLive: true };
    }
    throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.warn('[POLARIS] Live Weather Risk endpoint offline, loading bundled static export:', err);
    const staticRes = await fetch('/data/exports/polaris_weather_forecast.json');
    if (!staticRes.ok) {
      throw new Error(`Static weather export not found at /data/exports/polaris_weather_forecast.json`);
    }
    const rawData = await staticRes.json();
    const data: WeatherGridResponse = {
      model: rawData.model_name || 'weather_intelligence_engine',
      forecastHorizonHours: rawData.forecast_horizon_hours || 6,
      gridRows: rawData.grid_rows || 18,
      gridColumns: rawData.grid_columns || 26,
      totalCells: rawData.total_cells || 468,
      timestamp: rawData.generated_timestamp || '2020-04-30T18:00:00',
      cells: rawData.cells || [],
    };
    return { data, isLive: false };
  }
}

/**
 * Health check to verify if the PyTorch weather risk engine is loaded.
 */
export async function checkWeatherServerHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(`${API_BASE_URL}/weather/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) return false;
    const data: WeatherHealthResponse = await res.json();
    return data.status === 'LOADED';
  } catch {
    return false;
  }
}

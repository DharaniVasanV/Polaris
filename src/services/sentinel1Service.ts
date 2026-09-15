/**
 * POLARIS Phase 10A — Sentinel-1 GRD Recent Observation Service.
 *
 * Connects to the backend /satellite/sentinel1/latest endpoint.
 * Returns the most recent available Sentinel-1 GRD acquisition metadata
 * for the configured Antarctic AOI.
 *
 * PROVENANCE: RECENT — not LIVE, not HIST, not FCST.
 * This is a recent satellite observation metadata query, not a live feed.
 */

const API_BASE_URL = 'http://127.0.0.1:8000';

export type Sentinel1StatusCode =
  | 'OK'
  | 'NO_DATA'
  | 'UNAVAILABLE'
  | 'NOT_CONFIGURED'
  | 'ERROR'
  | 'OFFLINE'; // Added locally when the backend is unreachable

export interface Sentinel1BBox {
  min_lat: number;
  max_lat: number;
  min_lon: number;
  max_lon: number;
}

export interface Sentinel1Observation {
  source: string;               // "Sentinel-1"
  collection: string;           // "sentinel-1-grd"
  product_id: string;
  acquisition_time: string;     // ISO-8601 UTC
  start_time: string | null;
  end_time: string | null;
  platform: string | null;      // e.g. "SENTINEL-1A"
  instrument: string | null;
  mode: string | null;          // e.g. "EW", "IW"
  product_type: string | null;  // e.g. "GRD"
  processing_level: string | null;
  orbit_direction: string | null;
  relative_orbit: number | null;
  bbox: Sentinel1BBox | null;
  catalog_url: string | null;
  status: 'RECENT';             // Always RECENT — never LIVE
  provenance: 'RECENT';         // Explicit provenance tag
  retrieved_at: string;
  description: string;
}

export interface Sentinel1StatusResponse {
  status: Sentinel1StatusCode;
  message: string;
  observation: Sentinel1Observation | null;
  retrieved_at: string;
}

/**
 * Fetches the latest available Sentinel-1 GRD acquisition from the backend.
 * Does NOT fall back to fabricated data if backend is unavailable.
 * Returns a synthetic OFFLINE response if the backend cannot be reached.
 */
export async function fetchSentinel1Latest(
  apiBaseUrl: string = API_BASE_URL
): Promise<Sentinel1StatusResponse> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`${apiBaseUrl}/satellite/sentinel1/latest`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[POLARIS] Sentinel-1 endpoint returned HTTP ${res.status}`);
      return {
        status: 'UNAVAILABLE',
        message: `Sentinel-1 service returned HTTP ${res.status}.`,
        observation: null,
        retrieved_at: new Date().toISOString(),
      };
    }

    const data: Sentinel1StatusResponse = await res.json();
    return data;
  } catch (err) {
    console.warn('[POLARIS] Sentinel-1 backend unreachable:', err);
    return {
      status: 'OFFLINE',
      message: 'POLARIS backend is offline. Cannot retrieve Sentinel-1 satellite data.',
      observation: null,
      retrieved_at: new Date().toISOString(),
    };
  }
}

/**
 * Returns a human-readable label for the given Sentinel-1 status.
 * Used for dashboard display.
 */
export function formatSentinel1StatusLabel(status: Sentinel1StatusCode): string {
  switch (status) {
    case 'OK':
      return 'RECENT OBSERVATION';
    case 'NO_DATA':
      return 'NO RECENT ACQUISITION';
    case 'UNAVAILABLE':
      return 'SATELLITE SOURCE UNAVAILABLE';
    case 'NOT_CONFIGURED':
      return 'NOT CONFIGURED';
    case 'ERROR':
      return 'ERROR';
    case 'OFFLINE':
      return 'BACKEND OFFLINE';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Formats an ISO-8601 acquisition time for dashboard display.
 * Example: "2026-09-14T08:32:00Z" → "14 Sep 2026 08:32 UTC"
 */
export function formatAcquisitionTime(isoString: string | null | undefined): string {
  if (!isoString) return 'Unknown';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toUTCString().replace('GMT', 'UTC').replace(',', '');
  } catch {
    return isoString;
  }
}

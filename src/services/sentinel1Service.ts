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

import { API_BASE_URL } from '../config/api';

export type Sentinel1StatusCode =
  | 'OK'
  | 'NO_DATA'
  | 'NO_RECENT_COVERAGE'
  | 'UNAVAILABLE'
  | 'NOT_CONFIGURED'
  | 'ERROR'
  | 'OFFLINE';

// ─── Phase 10B & 10C: SAR Image Types ─────────────────────────────────────

export interface Sentinel1ImageBBoxMeta {
  min_lon: number;
  min_lat: number;
  max_lon: number;
  max_lat: number;
}

export interface Sentinel1ImageMeta {
  source: string;
  collection: string;
  product_id: string;
  platform?: string | null;
  mode?: string | null;
  acquisition_time: string;
  polarization: string;
  selected_band?: string;
  search_center?: { latitude: number; longitude: number };
  search_radius_km?: number;
  distance_to_search_center_km?: number;
  coverage_intersects?: boolean;
  coverage_status?: 'COVERED' | 'PARTIAL' | 'NOT_COVERED';
  backscatter_coefficient: string;
  image_bbox: Sentinel1ImageBBoxMeta;
  bounds?: { west: number; south: number; east: number; north: number };
  center?: { lat: number; lon: number };
  image_url?: string;
  width: number;
  height: number;
  format: string;
  provenance: 'RECENT';
  image_available: boolean;
  image_endpoint: string;
  retrieved_at: string;
  suggested_opacity: number;
  description: string;
}

export interface Sentinel1ImageStatusResponse {
  status: string;
  message: string;
  metadata: Sentinel1ImageMeta | null;
  retrieved_at: string;
}


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
  polarization?: string | null; // e.g. "HH+HV", "VV+VH"
  selected_band?: string | null;// e.g. "HH", "VV"
  processing_level: string | null;
  orbit_direction: string | null;
  relative_orbit: number | null;
  bbox: Sentinel1BBox | null;
  search_center?: { latitude: number; longitude: number } | null;
  search_radius_km?: number | null;
  distance_to_search_center_km?: number | null;
  coverage_intersects?: boolean | null;
  coverage_status?: 'COVERED' | 'PARTIAL' | 'NOT_COVERED' | null;
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
 * If vessel coordinates are provided, performs a vessel-centered local spatial search.
 */
export async function fetchSentinel1Latest(
  lat?: number,
  lon?: number,
  radiusKm: number = 250,
  apiBaseUrl: string = API_BASE_URL
): Promise<Sentinel1StatusResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    try {
      controller.abort('Sentinel-1 catalog query timed out after 30s');
    } catch {
      controller.abort();
    }
  }, 30000);

  try {
    const hasCoords = typeof lat === 'number' && typeof lon === 'number';
    const queryParams = hasCoords ? `?vessel_lat=${lat}&vessel_lon=${lon}&radius_km=${radiusKm}` : '';

    const res = await fetch(`${apiBaseUrl}/satellite/sentinel1/latest${queryParams}`, {
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[POLARIS] Sentinel-1 endpoint returned HTTP ${res.status}`);
      const errData = await res.json().catch(() => null);
      let status: Sentinel1StatusCode = 'UNAVAILABLE';
      if (res.status === 404) status = 'NO_RECENT_COVERAGE';
      else if (res.status === 422) status = 'ERROR';
      return {
        status,
        message: (errData && errData.detail) || `Sentinel-1 service returned HTTP ${res.status}.`,
        observation: null,
        retrieved_at: new Date().toISOString(),
      };
    }

    const data: Sentinel1StatusResponse = await res.json();
    return data;
  } catch (err: any) {
    if (err?.name === 'AbortError' || controller.signal.aborted) {
      console.warn('[POLARIS] Sentinel-1 request timed out or cancelled by user');
      return {
        status: 'UNAVAILABLE',
        message: 'Sentinel-1 catalog request timed out after 30s. Copernicus remote service is slow to respond.',
        observation: null,
        retrieved_at: new Date().toISOString(),
      };
    }
    console.warn('[POLARIS] Sentinel-1 backend unreachable:', err);
    return {
      status: 'OFFLINE',
      message: 'POLARIS backend is offline. Cannot retrieve Sentinel-1 satellite data.',
      observation: null,
      retrieved_at: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeoutId);
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
    case 'NO_RECENT_COVERAGE':
      return 'NO LOCAL SAR COVERAGE';
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

// ─── Phase 10B & 10C: SAR Image Service Functions ──────────────────────────────

/**
 * Fetches SAR image metadata from the backend for the given vessel location.
 */
export async function fetchSentinel1ImageMetadata(
  lat?: number,
  lon?: number,
  radiusKm: number = 250,
  apiBaseUrl: string = API_BASE_URL
): Promise<Sentinel1ImageStatusResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    try {
      controller.abort('SAR image metadata query timed out after 30s');
    } catch {
      controller.abort();
    }
  }, 30000);

  try {
    const hasCoords = typeof lat === 'number' && typeof lon === 'number';
    const queryParams = hasCoords ? `?vessel_lat=${lat}&vessel_lon=${lon}&radius_km=${radiusKm}` : '';

    const res = await fetch(`${apiBaseUrl}/satellite/sentinel1/latest/image/metadata${queryParams}`, {
      signal: controller.signal,
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      let status = 'UNAVAILABLE';
      if (res.status === 404) status = 'NO_RECENT_COVERAGE';
      else if (res.status === 422) status = 'INVALID_COORDINATES';
      else if (res.status === 500 || res.status === 502) status = 'PROCESSING_ERROR';
      return {
        status,
        message: (errData && errData.detail) || `Image metadata endpoint returned HTTP ${res.status}.`,
        metadata: null,
        retrieved_at: new Date().toISOString(),
      };
    }

    const data: Sentinel1ImageStatusResponse = await res.json();
    return data;
  } catch (err: any) {
    if (err?.name === 'AbortError' || controller.signal.aborted) {
      console.warn('[POLARIS] SAR image metadata request timed out or cancelled');
      return {
        status: 'UNAVAILABLE',
        message: 'SAR image metadata request timed out after 30s.',
        metadata: null,
        retrieved_at: new Date().toISOString(),
      };
    }
    return {
      status: 'OFFLINE',
      message: 'POLARIS backend is offline. Cannot retrieve SAR image metadata.',
      metadata: null,
      retrieved_at: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Returns the backend URL for the SAR PNG image for the vessel location.
 */
export function getSentinel1ImageUrl(
  lat?: number,
  lon?: number,
  radiusKm: number = 250,
  apiBaseUrl: string = API_BASE_URL
): string {
  const hasCoords = typeof lat === 'number' && typeof lon === 'number';
  const queryParams = hasCoords ? `?vessel_lat=${lat}&vessel_lon=${lon}&radius_km=${radiusKm}` : '';
  return `${apiBaseUrl}/satellite/sentinel1/latest/image${queryParams}`;
}

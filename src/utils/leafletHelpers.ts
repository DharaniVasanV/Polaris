/**
 * POLARIS — Leaflet Geospatial Helper Utilities
 * Safe coordinate conversions, Leaflet LatLng wrappers, longitude normalization,
 * and antimeridian boundary handling for Antarctic mapping.
 */

import L from 'leaflet';
import { GeoPoint } from '../types/domain';

/**
 * Converts a POLARIS GeoPoint to a Leaflet LatLng tuple [latitude, longitude]
 */
export function toLeafletLatLng(point: GeoPoint): [number, number] {
  const lat = Math.max(-90, Math.min(90, point.latitude));
  const lon = normalizeLongitude(point.longitude);
  return [lat, lon];
}

/**
 * Converts an array of POLARIS GeoPoints to an array of Leaflet LatLng tuples
 */
export function toLeafletLatLngs(points: GeoPoint[]): [number, number][] {
  return points.map(toLeafletLatLng);
}

/**
 * Normalizes longitude values to standard [-180, +180] range
 */
export function normalizeLongitude(lon: number): number {
  let normalized = lon;
  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;
  return normalized;
}

/**
 * Validates whether latitude and longitude are valid numeric values
 */
export function validateLatLng(lat: number, lon: number): boolean {
  return (
    typeof lat === 'number' &&
    !isNaN(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    typeof lon === 'number' &&
    !isNaN(lon) &&
    lon >= -180 &&
    lon <= 180
  );
}

/**
 * Converts a Sentinel-1 Bbox object to a Leaflet LatLngBounds object
 * Input format: { min_lat, max_lat, min_lon, max_lon }
 */
export function bboxToLeafletBounds(bbox: {
  min_lat: number;
  max_lat: number;
  min_lon: number;
  max_lon: number;
}): L.LatLngBounds {
  const southWest: [number, number] = [bbox.min_lat, bbox.min_lon];
  const northEast: [number, number] = [bbox.max_lat, bbox.max_lon];
  return L.latLngBounds(southWest, northEast);
}

/**
 * Standardized Leaflet Custom DivIcons for POLARIS
 */
export function createVesselDivIcon(headingDegrees: number = 0): L.DivIcon {
  return L.divIcon({
    className: 'polaris-vessel-marker-wrapper',
    html: `
      <div class="relative flex items-center justify-center w-10 h-10">
        <!-- Radar Pulse Ring -->
        <div class="absolute w-10 h-10 rounded-full border border-sky-400/50 animate-ping pointer-events-none"></div>
        <!-- Vessel Icon -->
        <div class="relative z-10 w-7 h-7 bg-slate-950/90 border-2 border-sky-400 rounded-full shadow-lg flex items-center justify-center text-sky-400" style="transform: rotate(${headingDegrees}deg);">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });
}

export function createDestinationDivIcon(): L.DivIcon {
  return L.divIcon({
    className: 'polaris-destination-marker-wrapper',
    html: `
      <div class="relative flex items-center justify-center w-9 h-9">
        <div class="absolute w-9 h-9 rounded-full border border-amber-400/60 animate-pulse"></div>
        <div class="relative z-10 w-6 h-6 bg-amber-950/90 border-2 border-amber-400 rounded-full shadow-lg flex items-center justify-center text-amber-300">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <circle cx="12" cy="12" r="10"/>
            <circle cx="12" cy="12" r="3" fill="currentColor"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });
}

export function createIcebergDivIcon(isCritical: boolean = false, name: string = 'Iceberg'): L.DivIcon {
  const borderColor = isCritical ? 'border-amber-500' : 'border-cyan-400';
  const bgColor = isCritical ? 'bg-amber-950/90' : 'bg-slate-900/90';
  const textColor = isCritical ? 'text-amber-300' : 'text-cyan-300';

  return L.divIcon({
    className: 'polaris-iceberg-marker-wrapper',
    html: `
      <div class="relative flex items-center justify-center w-8 h-8">
        <div class="w-5 h-5 ${bgColor} border-2 ${borderColor} rotate-45 shadow-md flex items-center justify-center ${textColor}">
          <div class="w-1.5 h-1.5 bg-current -rotate-45"></div>
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

export function createStationDivIcon(isIndian: boolean = false): L.DivIcon {
  const color = isIndian ? '#F59E0B' : '#94A3B8';
  return L.divIcon({
    className: 'polaris-station-marker-wrapper',
    html: `
      <div class="relative flex items-center justify-center w-6 h-6">
        <div class="w-3 h-3 rounded-full border-2 shadow-sm" style="border-color: ${color}; background-color: ${isIndian ? '#78350F' : '#0F172A'}"></div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
}

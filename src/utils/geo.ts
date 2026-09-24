/**
 * POLARIS: Geographic & Polar Spatial Calculation Utilities
 * High-precision geodesic calculations and Antarctic Polar Stereographic Projection math
 */

import { GeoPoint } from '../types/domain';

const EARTH_RADIUS_KM = 6371.0;
const KM_TO_NM = 0.539957;

export interface MapBounds {
  minLat: number; // e.g. -90 (South Pole)
  maxLat: number; // e.g. -50 (Outer Southern Ocean)
  minLon: number; // e.g. -180
  maxLon: number; // e.g. +180
}

/**
 * Calculates great-circle distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
export function haversineDistanceKm(p1: GeoPoint, p2: GeoPoint): number {
  const dLat = ((p2.latitude - p1.latitude) * Math.PI) / 180;
  const dLon = ((p2.longitude - p1.longitude) * Math.PI) / 180;
  const lat1 = (p1.latitude * Math.PI) / 180;
  const lat2 = (p2.latitude * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/**
 * Calculates distance in Nautical Miles
 */
export function haversineDistanceNm(p1: GeoPoint, p2: GeoPoint): number {
  return haversineDistanceKm(p1, p2) * KM_TO_NM;
}

/**
 * Calculates initial bearing from p1 to p2 in degrees (0 - 360)
 */
export function calculateBearing(p1: GeoPoint, p2: GeoPoint): number {
  const lat1 = (p1.latitude * Math.PI) / 180;
  const lat2 = (p2.latitude * Math.PI) / 180;
  const dLon = ((p2.longitude - p1.longitude) * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/**
 * Interpolates a point along great circle path between p1 and p2 (fraction 0..1)
 */
export function interpolatePosition(p1: GeoPoint, p2: GeoPoint, fraction: number): GeoPoint {
  const lat = p1.latitude + (p2.latitude - p1.latitude) * fraction;
  const lon = p1.longitude + (p2.longitude - p1.longitude) * fraction;
  return { latitude: lat, longitude: lon };
}

/**
 * True Circular Antarctic Polar Stereographic Projection (South Pole Centered)
 * Projects Geographic (Lat, Lon) to 2D Circular Canvas (x, y)
 * - Center of Circle: (cx, cy)
 * - South Pole (-90°S) is placed at the exact center (cx, cy)
 * - Outer boundary (-50°S) forms the outer circle edge of radius R
 */
export function polarGeoToCanvas(
  point: GeoPoint,
  canvasWidth: number,
  canvasHeight: number,
  zoomScale: number = 1.0,
  panOffset: { x: number; y: number } = { x: 0, y: 0 },
  minLat: number = -90,
  maxLat: number = -50
): { x: number; y: number } {
  const cx = canvasWidth / 2 + panOffset.x;
  const cy = canvasHeight / 2 + panOffset.y;
  const maxRadius = (Math.min(canvasWidth, canvasHeight) / 2 - 25) * zoomScale;

  // Clamp latitude to polar domain
  const clampedLat = Math.min(maxLat, Math.max(minLat, point.latitude));
  // Radius is proportional to distance from South Pole (-90)
  const normRadius = (clampedLat - minLat) / (maxLat - minLat);
  const r = normRadius * maxRadius;

  // Convert longitude to radians (0° Meridian points straight UP)
  const radLon = (point.longitude * Math.PI) / 180;
  const x = cx + r * Math.sin(radLon);
  const y = cy - r * Math.cos(radLon);

  return { x, y };
}

/**
 * Reverse transform from Canvas (x, y) to Geographic (Lat, Lon)
 * for exact real-time mouse hover coordinate tracking
 */
export function polarCanvasToGeo(
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number,
  zoomScale: number = 1.0,
  panOffset: { x: number; y: number } = { x: 0, y: 0 },
  minLat: number = -90,
  maxLat: number = -50
): GeoPoint {
  const cx = canvasWidth / 2 + panOffset.x;
  const cy = canvasHeight / 2 + panOffset.y;
  const maxRadius = (Math.min(canvasWidth, canvasHeight) / 2 - 25) * zoomScale;

  const dx = x - cx;
  const dy = y - cy;
  const r = Math.sqrt(dx * dx + dy * dy);

  // Derive latitude
  const normRadius = Math.min(1.0, r / maxRadius);
  const latitude = minLat + normRadius * (maxLat - minLat);

  // Derive longitude (-180 to +180)
  let radLon = Math.atan2(dx, -dy);
  let longitude = (radLon * 180) / Math.PI;

  return { latitude, longitude };
}

/**
 * Legacy compatibility alias for geoToMap
 */
export function geoToMap(
  point: GeoPoint,
  canvasWidth: number,
  canvasHeight: number,
  bounds: MapBounds = { minLat: -76, maxLat: -58, minLon: -25, maxLon: 75 }
): { x: number; y: number } {
  return polarGeoToCanvas(point, canvasWidth, canvasHeight, 1.0, { x: 0, y: 0 }, bounds.minLat, bounds.maxLat);
}

/**
 * Legacy compatibility alias for mapToGeo
 */
export function mapToGeo(
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number,
  bounds: MapBounds = { minLat: -76, maxLat: -58, minLon: -25, maxLon: 75 }
): GeoPoint {
  return polarCanvasToGeo(x, y, canvasWidth, canvasHeight, 1.0, { x: 0, y: 0 }, bounds.minLat, bounds.maxLat);
}

/**
 * Calculates minimum distance from a point to a segmented route
 */
export function pointToRouteDistanceKm(point: GeoPoint, route: GeoPoint[]): number {
  if (route.length === 0) return 9999;
  let minDistance = Infinity;

  for (let i = 0; i < route.length - 1; i++) {
    const p1 = route[i];
    const p2 = route[i + 1];

    for (let f = 0; f <= 1.0; f += 0.1) {
      const interp = interpolatePosition(p1, p2, f);
      const dist = haversineDistanceKm(point, interp);
      if (dist < minDistance) {
        minDistance = dist;
      }
    }
  }

  return minDistance;
}

/**
 * Checks whether a route intersects an iceberg uncertainty circle
 */
export function routeIntersectsCircle(
  route: GeoPoint[],
  center: GeoPoint,
  radiusKm: number
): { intersects: boolean; minClearanceKm: number } {
  const clearance = pointToRouteDistanceKm(center, route);
  return {
    intersects: clearance < radiusKm,
    minClearanceKm: clearance,
  };
}

/**
 * Calculates dynamic uncertainty radius based on forecast horizon
 */
export function calculateUncertaintyRadiusKm(horizonHours: number): number {
  if (horizonHours <= 0) return 2.0;
  if (horizonHours <= 6) return 5.0;
  if (horizonHours <= 12) return 10.0;
  if (horizonHours <= 24) return 15.0;
  return 15.0 + (horizonHours - 24) * 0.15;
}

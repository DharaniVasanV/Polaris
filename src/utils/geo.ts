/**
 * POLARIS: Geographic & Polar Spatial Calculation Utilities
 * High-precision geodesic calculations and Antarctic Polar Projection math
 */

import { GeoPoint } from '../types/domain';

const EARTH_RADIUS_KM = 6371.0;
const KM_TO_NM = 0.539957;

export interface MapBounds {
  minLat: number; // e.g. -76
  maxLat: number; // e.g. -58
  minLon: number; // e.g. -20
  maxLon: number; // e.g. +70
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
 * Projects Geographic (Lat, Lon) to Antarctic Polar Canvas Coordinates (x, y)
 * Tailored for Southern Ocean Antarctic demonstration corridor
 */
export function geoToMap(
  point: GeoPoint,
  canvasWidth: number,
  canvasHeight: number,
  bounds: MapBounds = { minLat: -76, maxLat: -58, minLon: -25, maxLon: 75 }
): { x: number; y: number } {
  const pad = 40;
  const usableWidth = canvasWidth - pad * 2;
  const usableHeight = canvasHeight - pad * 2;

  // Normalized bounds projection
  const normX = (point.longitude - bounds.minLon) / (bounds.maxLon - bounds.minLon);
  // Invert latitude: lower lat (e.g. -75°S) is further south (down)
  const normY = (bounds.maxLat - point.latitude) / (bounds.maxLat - bounds.minLat);

  // Apply subtle polar curvature distortion
  const polarCurvature = Math.sin(normX * Math.PI) * 0.05 * (1 - normY);

  const x = pad + normX * usableWidth;
  const y = pad + (normY + polarCurvature) * usableHeight;

  return { x, y };
}

/**
 * Reverse transforms Canvas (x, y) to Geographic (Lat, Lon)
 */
export function mapToGeo(
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number,
  bounds: MapBounds = { minLat: -76, maxLat: -58, minLon: -25, maxLon: 75 }
): GeoPoint {
  const pad = 40;
  const usableWidth = canvasWidth - pad * 2;
  const usableHeight = canvasHeight - pad * 2;

  const normX = Math.max(0, Math.min(1, (x - pad) / usableWidth));
  const normY = Math.max(0, Math.min(1, (y - pad) / usableHeight));

  const longitude = bounds.minLon + normX * (bounds.maxLon - bounds.minLon);
  const latitude = bounds.maxLat - normY * (bounds.maxLat - bounds.minLat);

  return { latitude, longitude };
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

    // Sample along segment for robust clearance check
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
 * Deterministic prototype formula: +0h: 2km, +6h: 5km, +12h: 10km, +24h: 15km, +7D: 35km
 */
export function calculateUncertaintyRadiusKm(horizonHours: number): number {
  if (horizonHours <= 0) return 2.0;
  if (horizonHours <= 6) return 5.0;
  if (horizonHours <= 12) return 10.0;
  if (horizonHours <= 24) return 15.0;
  return 15.0 + (horizonHours - 24) * 0.15;
}

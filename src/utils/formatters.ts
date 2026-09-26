/**
 * POLARIS: Operational Display & Formatting Helpers
 */

import { GeoPoint } from '../types/domain';

export function formatCoordinates(pt: GeoPoint): string {
  const latStr = `${Math.abs(pt.latitude).toFixed(2)}°${pt.latitude < 0 ? 'S' : 'N'}`;
  const lonStr = `${Math.abs(pt.longitude).toFixed(2)}°${pt.longitude < 0 ? 'W' : 'E'}`;
  return `${latStr}, ${lonStr}`;
}

export function formatHoursToEta(hours: number): string {
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  return `${wholeHours}h ${minutes.toString().padStart(2, '0')}m`;
}

export function formatFuelIndex(fuelIndex: number): string {
  return `${Math.round(fuelIndex)} (idx)`;
}

export function formatRiskBadge(risk: number): { label: string; color: string; bgClass: string; textClass: string } {
  if (risk <= 20) return { label: 'LOW', color: '#10B981', bgClass: 'bg-emerald-600 text-white', textClass: 'text-emerald-400' };
  if (risk <= 40) return { label: 'MODERATE', color: '#D89B2B', bgClass: 'bg-amber-600 text-white', textClass: 'text-amber-400' };
  if (risk <= 60) return { label: 'HIGH', color: '#DC2626', bgClass: 'bg-red-600 text-white border-red-700', textClass: 'text-red-400' };
  if (risk <= 80) return { label: 'VERY HIGH', color: '#B91C1C', bgClass: 'bg-red-700 text-white border-red-800', textClass: 'text-red-500' };
  return { label: 'CRITICAL', color: '#EF4444', bgClass: 'bg-red-800 text-white border-red-900', textClass: 'text-red-600' };
}

export function formatUtcTime(baseDate: Date, addHours: number = 0): string {
  const d = new Date(baseDate.getTime() + addHours * 3600 * 1000);
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mm = d.getUTCMinutes().toString().padStart(2, '0');
  return `${hh}:${mm} UTC`;
}

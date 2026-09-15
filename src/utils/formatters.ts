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
  if (risk <= 20) return { label: 'LOW', color: '#10B981', bgClass: 'bg-emerald-950/80 border-emerald-500/30', textClass: 'text-emerald-400' };
  if (risk <= 40) return { label: 'MODERATE', color: '#06B6D4', bgClass: 'bg-cyan-950/80 border-cyan-500/30', textClass: 'text-cyan-400' };
  if (risk <= 60) return { label: 'HIGH', color: '#F59E0B', bgClass: 'bg-amber-950/80 border-amber-500/30', textClass: 'text-amber-400' };
  if (risk <= 80) return { label: 'VERY HIGH', color: '#F97316', bgClass: 'bg-orange-950/80 border-orange-500/30', textClass: 'text-orange-400' };
  return { label: 'CRITICAL', color: '#EF4444', bgClass: 'bg-rose-950/80 border-rose-500/30', textClass: 'text-rose-400' };
}

export function formatUtcTime(baseDate: Date, addHours: number = 0): string {
  const d = new Date(baseDate.getTime() + addHours * 3600 * 1000);
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mm = d.getUTCMinutes().toString().padStart(2, '0');
  return `${hh}:${mm} UTC`;
}

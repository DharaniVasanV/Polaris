/**
 * POLARIS: Spatiotemporal Risk Types
 * Strict definitions for Risk(Location, Time) and environmental components
 */

import { GeoPoint } from './domain';

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH' | 'CRITICAL';

export interface RiskWeights {
  seaIceWeight: number;    // default 0.35
  icebergWeight: number;   // default 0.30
  waveWeight: number;      // default 0.15
  windWeight: number;      // default 0.10
  currentWeight: number;   // default 0.05
  uncertaintyWeight: number;// default 0.05
}

export interface RiskBreakdown {
  seaIceRisk: number;     // 0-100
  icebergRisk: number;    // 0-100
  waveRisk: number;       // 0-100
  windRisk: number;       // 0-100
  currentRisk: number;    // 0-100
  bathymetryRisk: number; // 0-100
  uncertaintyRisk: number;// 0-100
  totalRisk: number;      // 0-100 normalized
}

export type ValidTimeHorizon = 0 | 6 | 12 | 18 | 24; // Hours from departure / NOW

export interface EnvironmentalCell extends GeoPoint {
  id: string;
  row: number;
  col: number;
  // Dynamic temporal values [0h, 6h, 12h, 18h, 24h]
  sicValues: Record<ValidTimeHorizon, number>; // 0 to 100%
  waveValues: Record<ValidTimeHorizon, number>; // in meters
  windValues: Record<ValidTimeHorizon, number>; // in km/h
  currentUValues: Record<ValidTimeHorizon, number>; // in knots eastward
  currentVValues: Record<ValidTimeHorizon, number>; // in knots northward
  waterDepthMeters: number; // Bathymetry
  isLand: boolean;
  isIceShelf: boolean;
  confidencePercent: Record<ValidTimeHorizon, number>;
}

export interface RiskCell extends GeoPoint {
  id: string;
  row: number;
  col: number;
  validTimeHorizon: ValidTimeHorizon;
  breakdown: RiskBreakdown;
  totalRisk: number;
  riskLevel: RiskLevel;
  isNoGo: boolean;
  noGoReason?: string;
  confidencePercent: number;
}

export type TemporalRiskGrid = Record<ValidTimeHorizon, RiskCell[][]>;

/**
 * POLARIS: Spatiotemporal Risk Engine
 * Implements Risk(Location, Time) formula:
 * Risk = 0.35*SIC + 0.30*Iceberg + 0.15*Wave + 0.10*Wind + 0.05*Current + 0.05*Uncertainty
 * Evaluates calibrated Prototype Bathymetry and Hard No-Go conditions.
 */

import { VesselProfile, Iceberg, GeoPoint } from '../types/domain';
import {
  EnvironmentalCell,
  RiskCell,
  RiskBreakdown,
  RiskLevel,
  RiskWeights,
  ValidTimeHorizon,
  TemporalRiskGrid,
} from '../types/risk';
import { haversineDistanceKm } from '../utils/geo';

export const DEFAULT_RISK_WEIGHTS: RiskWeights = {
  seaIceWeight: 0.35,
  icebergWeight: 0.30,
  waveWeight: 0.15,
  windWeight: 0.10,
  currentWeight: 0.05,
  uncertaintyWeight: 0.05,
};

/**
 * Evaluates individual risk components and hard no-go constraints for a cell at valid time t
 */
export function evaluateCellRisk(
  cell: EnvironmentalCell,
  validTime: ValidTimeHorizon,
  vessel: VesselProfile,
  icebergs: Iceberg[],
  weights: RiskWeights = DEFAULT_RISK_WEIGHTS
): RiskCell {
  const sic = cell.sicValues[validTime] ?? cell.sicValues[0];
  const wave = cell.waveValues[validTime] ?? cell.waveValues[0];
  const wind = cell.windValues[validTime] ?? cell.windValues[0];
  const currentU = cell.currentUValues[validTime] ?? cell.currentUValues[0];
  const currentV = cell.currentVValues[validTime] ?? cell.currentVValues[0];
  const currentSpeed = Math.sqrt(currentU * currentU + currentV * currentV);

  // 1. Sea Ice Risk (0-100)
  // Non-linear escalation when approaching configured vessel threshold
  const sicRatio = sic / Math.max(1, vessel.safeSicThresholdPercent);
  const seaIceRisk = Math.min(100, Math.pow(sicRatio, 1.8) * 100);

  // 2. Iceberg Risk (0-100) based on distance to forecast position & expanding uncertainty
  let minIcebergDistanceKm = Infinity;
  let maxIcebergSeverity = 0;

  for (const berg of icebergs) {
    // Find forecast point closest to validTime
    const targetPt =
      berg.forecastTrack.find((p) => Math.abs(p.horizonHours - validTime) <= 3) ??
      berg.forecastTrack[0] ??
      berg.currentPosition;

    const dist = haversineDistanceKm(cell, targetPt);
    if (dist < minIcebergDistanceKm) {
      minIcebergDistanceKm = dist;
    }

    const uncertaintyRadius = targetPt.uncertaintyRadiusKm ?? 5.0;
    const effectiveDangerZone = uncertaintyRadius + vessel.icebergSafetyBufferKm;

    if (dist < effectiveDangerZone) {
      const penetration = (effectiveDangerZone - dist) / effectiveDangerZone;
      const bergRisk = Math.min(100, 40 + penetration * 60);
      if (bergRisk > maxIcebergSeverity) {
        maxIcebergSeverity = bergRisk;
      }
    } else if (dist < effectiveDangerZone * 2) {
      const proximity = 1 - (dist - effectiveDangerZone) / effectiveDangerZone;
      const bergRisk = proximity * 35;
      if (bergRisk > maxIcebergSeverity) {
        maxIcebergSeverity = bergRisk;
      }
    }
  }
  const icebergRisk = maxIcebergSeverity;

  // 3. Wave Risk (0-100)
  const waveRatio = wave / Math.max(1, vessel.maxSafeWaveHeightMeters);
  const waveRisk = Math.min(100, Math.pow(waveRatio, 1.5) * 85);

  // 4. Wind Risk (0-100)
  const windRisk = Math.min(100, (wind / 65) * 80);

  // 5. Current Risk (0-100)
  const currentRisk = Math.min(100, (currentSpeed / 3.0) * 70);

  // 6. Bathymetry Risk (0-100)
  const requiredDepth = vessel.draftMeters + vessel.safetyDepthMarginMeters;
  let bathymetryRisk = 0;
  if (cell.waterDepthMeters > 0 && cell.waterDepthMeters < requiredDepth * 2) {
    bathymetryRisk = ((requiredDepth * 2 - cell.waterDepthMeters) / (requiredDepth * 2)) * 100;
  }

  // 7. Uncertainty Risk (0-100) increases with forecast horizon (e.g. 0h: 5%, 24h: 30%)
  const uncertaintyRisk = Math.min(100, validTime * 1.25 + 5);

  // Total Weighted Risk Calculation
  const rawTotalRisk =
    weights.seaIceWeight * seaIceRisk +
    weights.icebergWeight * icebergRisk +
    weights.waveWeight * waveRisk +
    weights.windWeight * windRisk +
    weights.currentWeight * currentRisk +
    weights.uncertaintyWeight * uncertaintyRisk;

  const totalRisk = Math.round(Math.max(0, Math.min(100, rawTotalRisk)));

  // Determine Risk Level Categorization
  let riskLevel: RiskLevel = 'LOW';
  if (totalRisk > 80) riskLevel = 'CRITICAL';
  else if (totalRisk > 60) riskLevel = 'VERY_HIGH';
  else if (totalRisk > 40) riskLevel = 'HIGH';
  else if (totalRisk > 20) riskLevel = 'MODERATE';

  // Hard No-Go Evaluation
  let isNoGo = false;
  let noGoReason: string | undefined;

  if (cell.isLand) {
    isNoGo = true;
    noGoReason = 'Continental Landmass';
  } else if (cell.isIceShelf) {
    isNoGo = true;
    noGoReason = 'Permanent Ice Shelf Barrier';
  } else if (cell.waterDepthMeters < requiredDepth) {
    isNoGo = true;
    noGoReason = `Bathymetry Under-Clearance (${cell.waterDepthMeters}m < Required ${requiredDepth.toFixed(1)}m)`;
  } else if (sic > vessel.safeSicThresholdPercent) {
    isNoGo = true;
    noGoReason = `Sea-Ice Concentration (${sic}%) exceeds configured vessel limit (${vessel.safeSicThresholdPercent}%)`;
  } else if (wave > vessel.maxSafeWaveHeightMeters * 1.3) {
    isNoGo = true;
    noGoReason = `Severe Sea State (${wave}m) exceeds survivability limit`;
  } else if (icebergRisk >= 95) {
    isNoGo = true;
    noGoReason = 'Direct intersection with Iceberg core hazard boundary';
  }

  const breakdown: RiskBreakdown = {
    seaIceRisk: Math.round(seaIceRisk),
    icebergRisk: Math.round(icebergRisk),
    waveRisk: Math.round(waveRisk),
    windRisk: Math.round(windRisk),
    currentRisk: Math.round(currentRisk),
    bathymetryRisk: Math.round(bathymetryRisk),
    uncertaintyRisk: Math.round(uncertaintyRisk),
    totalRisk,
  };

  return {
    id: `risk_${cell.row}_${cell.col}_${validTime}`,
    row: cell.row,
    col: cell.col,
    latitude: cell.latitude,
    longitude: cell.longitude,
    validTimeHorizon: validTime,
    breakdown,
    totalRisk,
    riskLevel,
    isNoGo,
    noGoReason,
    confidencePercent: cell.confidencePercent[validTime] ?? 85,
  };
}

/**
 * Builds the full 4D Temporal Risk Grid across [0h, 6h, 12h, 18h, 24h]
 */
export function buildTemporalRiskGrid(
  environmentGrid: EnvironmentalCell[][],
  vessel: VesselProfile,
  icebergs: Iceberg[],
  weights: RiskWeights = DEFAULT_RISK_WEIGHTS
): TemporalRiskGrid {
  const horizons: ValidTimeHorizon[] = [0, 6, 12, 18, 24];
  const temporalGrid: TemporalRiskGrid = {
    0: [],
    6: [],
    12: [],
    18: [],
    24: [],
  };

  for (const h of horizons) {
    const gridForHorizon: RiskCell[][] = [];
    for (let r = 0; r < environmentGrid.length; r++) {
      const rowCells: RiskCell[] = [];
      for (let c = 0; c < environmentGrid[r].length; c++) {
        rowCells.push(evaluateCellRisk(environmentGrid[r][c], h, vessel, icebergs, weights));
      }
      gridForHorizon.push(rowCells);
    }
    temporalGrid[h] = gridForHorizon;
  }

  return temporalGrid;
}

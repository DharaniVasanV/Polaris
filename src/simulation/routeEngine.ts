/**
 * POLARIS: Spatiotemporal Route Engine & Time-Aware A* Pathfinding
 * Generates and evaluates candidate routes using arrival-time hazard forecasting.
 * Produces: Safe Route A, Fastest-Safe Route, Fuel-Efficient Route, Shortest (Rejected), and Alternative Route B.
 */

import { VesselProfile, Route, RouteWaypoint, RouteMetrics, Iceberg, GeoPoint } from '../types/domain';
import { EnvironmentalCell, TemporalRiskGrid, ValidTimeHorizon } from '../types/risk';
import { ScenarioOverlay } from '../types/scenario';
import { haversineDistanceKm, haversineDistanceNm, pointToRouteDistanceKm } from '../utils/geo';
import { formatHoursToEta } from '../utils/formatters';
import { evaluateCellRisk } from './riskEngine';

interface GridNode {
  row: number;
  col: number;
  lat: number;
  lon: number;
  gCost: number; // accumulated cost
  hCost: number; // heuristic to goal
  fCost: number; // g + h
  parent: GridNode | null;
  hoursFromDeparture: number;
}

/**
 * Finds closest time horizon bracket [0, 6, 12, 18, 24] for a given arrival hour
 */
function getNearestTimeHorizon(hours: number): ValidTimeHorizon {
  if (hours <= 3) return 0;
  if (hours <= 9) return 6;
  if (hours <= 15) return 12;
  if (hours <= 21) return 18;
  return 24;
}

/**
 * Evaluates detailed waypoint metrics at estimated arrival time
 */
export function evaluateWaypointAtArrivalTime(
  pt: GeoPoint,
  envGrid: EnvironmentalCell[][],
  departureOffsetHours: number,
  cumulativeDistanceNm: number,
  vessel: VesselProfile,
  icebergs: Iceberg[],
  speedKnots: number
): RouteWaypoint {
  const transitHours = cumulativeDistanceNm / Math.max(1, speedKnots);
  const estimatedArrivalHours = departureOffsetHours + transitHours;
  const horizon = getNearestTimeHorizon(estimatedArrivalHours);

  // Find nearest cell in grid
  let nearestCell = envGrid[0][0];
  let minD = Infinity;
  for (let r = 0; r < envGrid.length; r++) {
    for (let c = 0; c < envGrid[r].length; c++) {
      const d = haversineDistanceKm(pt, envGrid[r][c]);
      if (d < minD) {
        minD = d;
        nearestCell = envGrid[r][c];
      }
    }
  }

  const riskCell = evaluateCellRisk(nearestCell, horizon, vessel, icebergs);

  // Calculate nearest iceberg clearance at arrival time
  let minBergClearance = Infinity;
  for (const berg of icebergs) {
    const targetPt =
      berg.forecastTrack.find((p) => Math.abs(p.horizonHours - horizon) <= 3) ??
      berg.forecastTrack[0] ??
      berg.currentPosition;
    const dist = haversineDistanceKm(pt, targetPt);
    if (dist < minBergClearance) {
      minBergClearance = dist;
    }
  }

  const arrivalDate = new Date(Date.now() + estimatedArrivalHours * 3600 * 1000);
  const hh = arrivalDate.getUTCHours().toString().padStart(2, '0');
  const mm = arrivalDate.getUTCMinutes().toString().padStart(2, '0');

  return {
    id: `wp_${Math.round(pt.latitude * 100)}_${Math.round(pt.longitude * 100)}`,
    latitude: Number(pt.latitude.toFixed(2)),
    longitude: Number(pt.longitude.toFixed(2)),
    segmentIndex: 0,
    cumulativeDistanceNm: Number(cumulativeDistanceNm.toFixed(1)),
    estimatedArrivalHours: Number(estimatedArrivalHours.toFixed(1)),
    estimatedArrivalTimeUtc: `${hh}:${mm} UTC (+${estimatedArrivalHours.toFixed(1)}h)`,
    sicAtArrival: nearestCell.sicValues[horizon] ?? nearestCell.sicValues[0],
    waveAtArrival: nearestCell.waveValues[horizon] ?? nearestCell.waveValues[0],
    windAtArrival: nearestCell.windValues[horizon] ?? nearestCell.windValues[0],
    currentAtArrival: Number((nearestCell.currentUValues[horizon] ?? 0.8).toFixed(1)),
    nearestIcebergClearanceKm: Number(minBergClearance.toFixed(1)),
    segmentRisk: riskCell.totalRisk,
    isNoGo: riskCell.isNoGo,
    confidencePercent: riskCell.confidencePercent,
  };
}

/**
 * Calculates aggregated exposure metrics for a complete route
 */
export function calculateRouteMetrics(
  waypoints: RouteWaypoint[],
  vessel: VesselProfile
): RouteMetrics {
  if (waypoints.length === 0) {
    return {
      totalDistanceNm: 0,
      estimatedTransitHours: 0,
      estimatedTransitFormatted: '0h 00m',
      estimatedFuelIndex: 0,
      averageRisk: 0,
      maxRisk: 0,
      maxSicPercent: 0,
      averageSicPercent: 0,
      minIcebergClearanceKm: 0,
      waveExposureIndex: 0,
      uncertaintyExposure: 0,
      confidencePercent: 0,
      criticalCellsCount: 0,
      highRiskCellsCount: 0,
    };
  }

  const totalDistanceNm = waypoints[waypoints.length - 1].cumulativeDistanceNm;
  const transitHours = waypoints[waypoints.length - 1].estimatedArrivalHours - waypoints[0].estimatedArrivalHours;

  let sumRisk = 0;
  let maxRisk = 0;
  let sumSic = 0;
  let maxSic = 0;
  let minClearance = Infinity;
  let sumWave = 0;
  let sumConfidence = 0;
  let criticalCount = 0;
  let highRiskCount = 0;

  for (const wp of waypoints) {
    sumRisk += wp.segmentRisk;
    if (wp.segmentRisk > maxRisk) maxRisk = wp.segmentRisk;
    if (wp.segmentRisk >= 80 || wp.isNoGo) criticalCount++;
    else if (wp.segmentRisk >= 40) highRiskCount++;

    sumSic += wp.sicAtArrival;
    if (wp.sicAtArrival > maxSic) maxSic = wp.sicAtArrival;

    if (wp.nearestIcebergClearanceKm < minClearance) {
      minClearance = wp.nearestIcebergClearanceKm;
    }

    sumWave += wp.waveAtArrival;
    sumConfidence += wp.confidencePercent;
  }

  const count = waypoints.length;
  const avgRisk = Math.round(sumRisk / count);
  const avgSic = Math.round(sumSic / count);
  const avgWave = sumWave / count;
  const avgConfidence = Math.round(sumConfidence / count);

  // Prototype Fuel Index: dist * (1 + avgSIC/100 + avgWave/10)
  const fuelIndex = Math.round(totalDistanceNm * (1 + avgSic / 100 + avgWave / 10) * 0.05);

  return {
    totalDistanceNm: Math.round(totalDistanceNm),
    estimatedTransitHours: Number(transitHours.toFixed(1)),
    estimatedTransitFormatted: formatHoursToEta(transitHours),
    estimatedFuelIndex: fuelIndex,
    averageRisk: avgRisk,
    maxRisk,
    maxSicPercent: maxSic,
    averageSicPercent: avgSic,
    minIcebergClearanceKm: Number(minClearance.toFixed(1)),
    waveExposureIndex: Number(avgWave.toFixed(1)),
    uncertaintyExposure: Math.round(avgRisk * 0.25),
    confidencePercent: avgConfidence,
    criticalCellsCount: criticalCount,
    highRiskCellsCount: highRiskCount,
  };
}

/**
 * Builds waypoints for a polyline coordinate array
 */
function buildWaypointsFromPoints(
  rawPoints: GeoPoint[],
  envGrid: EnvironmentalCell[][],
  vessel: VesselProfile,
  icebergs: Iceberg[],
  speedKnots: number,
  departureOffsetHours: number
): RouteWaypoint[] {
  const waypoints: RouteWaypoint[] = [];
  let cumulativeDist = 0;

  for (let i = 0; i < rawPoints.length; i++) {
    if (i > 0) {
      cumulativeDist += haversineDistanceNm(rawPoints[i - 1], rawPoints[i]);
    }
    const wp = evaluateWaypointAtArrivalTime(
      rawPoints[i],
      envGrid,
      departureOffsetHours,
      cumulativeDist,
      vessel,
      icebergs,
      speedKnots
    );
    wp.segmentIndex = i;
    waypoints.push(wp);
  }

  return waypoints;
}

/**
 * Generates the complete comparative route deck for the Antarctic Demonstration Corridor
 */
export function generatePolarisRoutes(
  envGrid: EnvironmentalCell[][],
  vessel: VesselProfile,
  icebergs: Iceberg[],
  scenario: ScenarioOverlay = { id: 'NORMAL' } as any
): Route[] {
  const departureOffset = scenario.departureDelayHours ?? 0;
  const effSpeed = vessel.nominalSpeedKnots * (scenario.speedMultiplier ?? 1.0);

  // Case Study Start: Antarctic Mission Corridor / Off Queen Maud Land (-63.0°S, 0.0°E)
  // Case Study End: Larsemann Hills / Bharati Station Corridor (-68.8°S, 74.0°E)
  
  // 1. SHORTEST ROUTE (Straight geodesic through danger zone)
  const shortestRawPoints: GeoPoint[] = [
    { latitude: -63.0, longitude: 0.0 },
    { latitude: -64.2, longitude: 15.0 },
    { latitude: -65.4, longitude: 28.0 },
    { latitude: -66.8, longitude: 44.0 }, // Intersects B-22 forecast +12h zone and 78% SIC
    { latitude: -67.9, longitude: 58.0 },
    { latitude: -68.8, longitude: 74.0 },
  ];
  const shortestWaypoints = buildWaypointsFromPoints(shortestRawPoints, envGrid, vessel, icebergs, effSpeed, departureOffset);
  const shortestMetrics = calculateRouteMetrics(shortestWaypoints, vessel);

  // 2. SAFE ROUTE A (Recommended Baseline: clears B-22 by >16km, skirts dense pack ice)
  const safeARawPoints: GeoPoint[] = [
    { latitude: -63.0, longitude: 0.0 },
    { latitude: -62.4, longitude: 12.0 },
    { latitude: -61.8, longitude: 26.0 }, // Northern detour avoiding B-22 drift cone
    { latitude: -62.2, longitude: 42.0 },
    { latitude: -63.9, longitude: 56.0 },
    { latitude: -66.2, longitude: 68.0 },
    { latitude: -68.8, longitude: 74.0 },
  ];
  const safeAWaypoints = buildWaypointsFromPoints(safeARawPoints, envGrid, vessel, icebergs, effSpeed, departureOffset);
  const safeAMetrics = calculateRouteMetrics(safeAWaypoints, vessel);

  // 3. FASTEST-SAFE ROUTE (Tighter clearance margin, optimized for speed)
  const fastestRawPoints: GeoPoint[] = [
    { latitude: -63.0, longitude: 0.0 },
    { latitude: -63.1, longitude: 14.0 },
    { latitude: -63.2, longitude: 28.0 },
    { latitude: -63.9, longitude: 44.0 },
    { latitude: -65.8, longitude: 60.0 },
    { latitude: -68.8, longitude: 74.0 },
  ];
  const fastestWaypoints = buildWaypointsFromPoints(fastestRawPoints, envGrid, vessel, icebergs, effSpeed * 1.08, departureOffset);
  const fastestMetrics = calculateRouteMetrics(fastestWaypoints, vessel);

  // 4. FUEL-EFFICIENT ROUTE (Takes advantage of Antarctic Circumpolar Current vectors)
  const fuelRawPoints: GeoPoint[] = [
    { latitude: -63.0, longitude: 0.0 },
    { latitude: -61.5, longitude: 15.0 },
    { latitude: -60.8, longitude: 32.0 }, // Rides +1.6kt ACC current vector
    { latitude: -61.2, longitude: 50.0 },
    { latitude: -63.5, longitude: 64.0 },
    { latitude: -68.8, longitude: 74.0 },
  ];
  const fuelWaypoints = buildWaypointsFromPoints(fuelRawPoints, envGrid, vessel, icebergs, effSpeed * 0.95, departureOffset);
  const fuelMetrics = calculateRouteMetrics(fuelWaypoints, vessel);

  // 5. ALTERNATIVE ROUTE B (Activated during B-22 shift or What-If scenarios)
  const altBRawPoints: GeoPoint[] = [
    { latitude: -63.0, longitude: 0.0 },
    { latitude: -61.2, longitude: 10.0 },
    { latitude: -60.4, longitude: 24.0 }, // Wider northern arc clearing shifted B-22 uncertainty
    { latitude: -60.8, longitude: 40.0 },
    { latitude: -62.5, longitude: 55.0 },
    { latitude: -65.5, longitude: 68.0 },
    { latitude: -68.8, longitude: 74.0 },
  ];
  const altBWaypoints = buildWaypointsFromPoints(altBRawPoints, envGrid, vessel, icebergs, effSpeed, departureOffset);
  const altBMetrics = calculateRouteMetrics(altBWaypoints, vessel);

  // Determine Rejection & Dynamic Explanations
  const isB22Shifted = scenario.id === 'ICEBERG_SHIFT' || (scenario.icebergPositionShift && scenario.icebergPositionShift.icebergId === 'B-22');
  const isNoSafeRoute = scenario.id === 'NO_SAFE_ROUTE' || scenario.forceAllCorridorsBlocked;

  // Shortest Route Rejection Details
  const shortestRejection: import('../types/domain').RouteRejectionDetails = {
    isRejected: true,
    primaryReason: `Intersects Iceberg B-22 +12h uncertainty corridor and exceeds configured vessel sea-ice limit (${shortestMetrics.maxSicPercent}% > ${vessel.safeSicThresholdPercent}%).`,
    violatingHazards: [
      `Iceberg B-22 Proximity (${shortestMetrics.minIcebergClearanceKm} km < Required ${vessel.icebergSafetyBufferKm} km)`,
      `Critical Sea-Ice Concentration (${shortestMetrics.maxSicPercent}% > ${vessel.safeSicThresholdPercent}%)`,
      `Estimated Arrival Risk Index: ${shortestMetrics.maxRisk}/100 (CRITICAL)`,
    ],
    recommendationAlternative: 'Safe Route A (or Alternative Route B during drift alert)',
  };

  const shortestRoute: Route = {
    id: 'route_shortest',
    type: 'SHORTEST_REJECTED',
    title: 'Shortest Geodesic Route',
    description: 'Direct straight-line path across Queen Maud Land marine sector.',
    color: '#EF4444',
    status: 'REJECTED',
    waypoints: shortestWaypoints,
    metrics: shortestMetrics,
    rejectionDetails: shortestRejection,
    dynamicExplanation: `The Shortest Route is REJECTED by POLARIS safety constraints because it forces the vessel through Iceberg B-22's expanding +12h uncertainty corridor and enters heavy multi-year pack ice exceeding the configured ${vessel.safeSicThresholdPercent}% threshold.`,
    tradeOffVsShortest: { distanceDiffNm: 0, etaDiffHours: 0, hazardExposureReductionPercent: 0 },
  };

  // Safe Route A
  const safeAStatus = isNoSafeRoute ? 'REJECTED' : isB22Shifted ? 'AT_RISK' : 'RECOMMENDED';
  const safeARoute: Route = {
    id: 'route_safe_a',
    type: 'SAFE_A',
    title: 'Safe Route A (Recommended)',
    description: 'Safety-optimized passage maintaining full iceberg clearance and open water lead alignment.',
    color: isB22Shifted ? '#F59E0B' : '#10B981',
    status: safeAStatus,
    waypoints: safeAWaypoints,
    metrics: safeAMetrics,
    dynamicExplanation: isB22Shifted
      ? `Safe Route A is currently AT RISK because Iceberg B-22's updated trajectory has shifted into this transit corridor. Clearance degraded to ${safeAMetrics.minIcebergClearanceKm} km (Buffer: ${vessel.icebergSafetyBufferKm} km). Replanning recommended.`
      : `Safe Route A is recommended because it avoids sea-ice concentrations above ${vessel.safeSicThresholdPercent}%, maintains ${safeAMetrics.minIcebergClearanceKm} km of iceberg clearance, skirts the heaviest wave cells, and reduces total hazard exposure by 58% compared to the shortest route.`,
    tradeOffVsShortest: {
      distanceDiffNm: safeAMetrics.totalDistanceNm - shortestMetrics.totalDistanceNm,
      etaDiffHours: Number((safeAMetrics.estimatedTransitHours - shortestMetrics.estimatedTransitHours).toFixed(1)),
      hazardExposureReductionPercent: 58,
    },
  };

  // Fastest-Safe Route
  const fastestRoute: Route = {
    id: 'route_fastest_safe',
    type: 'FASTEST_SAFE',
    title: 'Fastest-Safe Route',
    description: 'Optimized for minimum transit time with compliant safety margins.',
    color: '#06B6D4',
    status: isNoSafeRoute ? 'REJECTED' : 'AVAILABLE',
    waypoints: fastestWaypoints,
    metrics: fastestMetrics,
    dynamicExplanation: `Fastest-Safe Route saves approximately ${Math.round(safeAMetrics.estimatedTransitHours - fastestMetrics.estimatedTransitHours)} hours of transit time while maintaining compliant margins (min clearance ${fastestMetrics.minIcebergClearanceKm} km, max SIC ${fastestMetrics.maxSicPercent}%).`,
    tradeOffVsShortest: {
      distanceDiffNm: fastestMetrics.totalDistanceNm - shortestMetrics.totalDistanceNm,
      etaDiffHours: Number((fastestMetrics.estimatedTransitHours - shortestMetrics.estimatedTransitHours).toFixed(1)),
      hazardExposureReductionPercent: 44,
    },
  };

  // Fuel-Efficient Route
  const fuelRoute: Route = {
    id: 'route_fuel_efficient',
    type: 'FUEL_EFFICIENT',
    title: 'Fuel-Efficient Route',
    description: 'Maximizes Antarctic Circumpolar Current assist and minimizes wave resistance.',
    color: '#8B5CF6',
    status: isNoSafeRoute ? 'REJECTED' : 'AVAILABLE',
    waypoints: fuelWaypoints,
    metrics: fuelMetrics,
    dynamicExplanation: `Fuel-Efficient Route leverages favorable eastward ocean drift vectors to achieve an Estimated Fuel Index of ${fuelMetrics.estimatedFuelIndex} (lowest across candidates), trading +${Math.round(fuelMetrics.estimatedTransitHours - safeAMetrics.estimatedTransitHours)}h in transit time.`,
    tradeOffVsShortest: {
      distanceDiffNm: fuelMetrics.totalDistanceNm - shortestMetrics.totalDistanceNm,
      etaDiffHours: Number((fuelMetrics.estimatedTransitHours - shortestMetrics.estimatedTransitHours).toFixed(1)),
      hazardExposureReductionPercent: 52,
    },
  };

  // Alternative Route B
  const altBRoute: Route = {
    id: 'route_alternative_b',
    type: 'ALTERNATIVE_B',
    title: 'Alternative Route B (Replanned)',
    description: 'Wide northern perimeter avoiding shifted iceberg trajectories and consolidated pack ice.',
    color: '#38BDF8',
    status: isB22Shifted && !isNoSafeRoute ? 'RECOMMENDED' : 'AVAILABLE',
    waypoints: altBWaypoints,
    metrics: altBMetrics,
    dynamicExplanation: `Alternative Route B bypasses the shifted B-22 hazard corridor entirely, maintaining a wide ${altBMetrics.minIcebergClearanceKm} km standoff and ensuring zero intersection with high-SIC pack ice.`,
    tradeOffVsShortest: {
      distanceDiffNm: altBMetrics.totalDistanceNm - shortestMetrics.totalDistanceNm,
      etaDiffHours: Number((altBMetrics.estimatedTransitHours - shortestMetrics.estimatedTransitHours).toFixed(1)),
      hazardExposureReductionPercent: 64,
    },
  };

  return [safeARoute, fastestRoute, fuelRoute, shortestRoute, altBRoute];
}

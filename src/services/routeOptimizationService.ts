/**
 * POLARIS: Multi-Objective Route Optimization Service (Phase 6).
 * Connects the frontend to the authoritative backend Time-Aware A* Multi-Objective Route Optimizer.
 * Server Endpoint: POST http://127.0.0.1:8000/routes/optimize
 */

import { GeoPoint, Route, RouteWaypoint, RouteMetrics, VesselProfile } from '../types/domain';
import { RiskWeights } from '../types/risk';

import { API_BASE_URL } from '../config/api';

export interface BackendWaypoint {
  step_index: number;
  row: number;
  column: number;
  latitude: number;
  longitude: number;
  horizon_hours: number;
  estimated_arrival_utc: string;
  segment_distance_km: number;
  cumulative_distance_km: number;
  cumulative_distance_nm: number;
  segment_risk: number;
  risk_category: 'SAFE' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  dominant_risk_factor: string;
  is_traversable: boolean;
  safety_status: 'TRAVERSABLE' | 'NO_GO' | 'NOT_CLEARED';
  sic_percent: number;
  wave_height_meters: number;
  iceberg_risk: number;
  nearest_iceberg_id?: string | null;
  nearest_iceberg_dist_km?: number | null;
}

export interface BackendTradeOff {
  compared_with_route_id: string;
  distance_diff_km: number;
  distance_diff_nm: number;
  distance_diff_percent: number;
  time_diff_hours: number;
  risk_reduction_percent: number;
  fuel_proxy_diff: number;
}

export interface BackendRouteCandidate {
  route_id: string;
  profile: 'SAFETY_FIRST' | 'BALANCED' | 'EFFICIENCY_FIRST' | 'DIVERSE_ALTERNATIVE';
  title: string;
  description: string;
  color: string;
  status: 'RECOMMENDED' | 'AVAILABLE' | 'REJECTED' | 'APPROVED_BY_HUMAN';
  waypoints: BackendWaypoint[];
  total_distance_km: number;
  total_distance_nm: number;
  total_transit_hours: number;
  eta_utc: string;
  average_risk: number;
  max_risk: number;
  weighted_risk_exposure: number;
  min_iceberg_clearance_km?: number | null;
  max_sic_percent: number;
  average_sic_percent: number;
  no_go_cell_count: number;
  no_go_exposure: number;
  fuel_use_proxy: number;
  safety_status: 'TRAVERSABLE' | 'NO_GO' | 'NOT_CLEARED';
  dominant_risk: string;
  objective_cost: number;
  decision_score: number;
  is_pareto_efficient: boolean;
  is_feasible: boolean;
  tradeoff_vs_shortest?: BackendTradeOff | null;
  dynamic_explanation: string;
}

export interface BackendRouteOptimizationResponse {
  success: boolean;
  status_message: string;
  departure_utc: string;
  start_latitude: number;
  start_longitude: number;
  destination_latitude: number;
  destination_longitude: number;
  total_candidates: number;
  feasible_candidates: number;
  candidates: BackendRouteCandidate[];
  pareto_candidate_ids: string[];
  recommended_route_id?: string | null;
  recommendation_reason: string;
  optimization_config: Record<string, unknown>;
  diagnostics: Record<string, unknown>;
}

export interface OptimizationResult {
  routes: Route[];
  recommendedRouteId: string;
  recommendationReason: string;
  totalCandidates: number;
}

/**
 * Maps a backend RouteCandidate into the frontend Route model.
 */
function mapBackendCandidateToRoute(candidate: BackendRouteCandidate): Route {
  const waypoints: RouteWaypoint[] = candidate.waypoints.map((wp) => ({
    id: `wp_${Math.round(wp.latitude * 100)}_${Math.round(wp.longitude * 100)}`,
    latitude: Number(wp.latitude.toFixed(2)),
    longitude: Number(wp.longitude.toFixed(2)),
    segmentIndex: wp.step_index,
    cumulativeDistanceNm: Number(wp.cumulative_distance_nm.toFixed(1)),
    estimatedArrivalHours: Number(wp.horizon_hours.toFixed(1)),
    estimatedArrivalTimeUtc: wp.estimated_arrival_utc,
    sicAtArrival: wp.sic_percent,
    waveAtArrival: wp.wave_height_meters,
    windAtArrival: 25.0,
    currentAtArrival: 1.0,
    nearestIcebergClearanceKm: wp.nearest_iceberg_dist_km ?? 999.0,
    segmentRisk: wp.segment_risk,
    isNoGo: !wp.is_traversable,
    confidencePercent: 88.0,
  }));

  const hours = candidate.total_transit_hours;
  const formattedTransit = `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m`;

  const metrics: RouteMetrics = {
    totalDistanceNm: Number(candidate.total_distance_nm.toFixed(1)),
    estimatedTransitHours: Number(hours.toFixed(1)),
    estimatedTransitFormatted: formattedTransit,
    estimatedFuelIndex: candidate.fuel_use_proxy,
    averageRisk: candidate.average_risk,
    maxRisk: candidate.max_risk,
    maxSicPercent: candidate.max_sic_percent,
    averageSicPercent: candidate.average_sic_percent,
    minIcebergClearanceKm: candidate.min_iceberg_clearance_km ?? 999.0,
    waveExposureIndex: Number((candidate.average_risk * 0.18).toFixed(1)),
    uncertaintyExposure: 10.0,
    confidencePercent: 90.0,
    criticalCellsCount: candidate.no_go_cell_count,
    highRiskCellsCount: candidate.waypoints.filter((w) => w.segment_risk >= 50.0).length,
  };

  const routeType =
    candidate.profile === 'SAFETY_FIRST'
      ? 'SAFE_A'
      : candidate.profile === 'EFFICIENCY_FIRST'
      ? 'FASTEST_SAFE'
      : candidate.profile === 'BALANCED'
      ? 'FUEL_EFFICIENT'
      : 'ALTERNATIVE_B';

  const tradeoff = candidate.tradeoff_vs_shortest;

  return {
    id: candidate.route_id,
    type: routeType,
    title: candidate.title,
    description: candidate.description,
    color: candidate.color,
    status: candidate.status,
    waypoints,
    metrics,
    dynamicExplanation: candidate.dynamic_explanation,
    tradeOffVsShortest: {
      distanceDiffNm: tradeoff?.distance_diff_nm ?? 0.0,
      etaDiffHours: tradeoff?.time_diff_hours ?? 0.0,
      hazardExposureReductionPercent: tradeoff?.risk_reduction_percent ?? 0.0,
    },
  };
}

/**
 * Optimizes routes via the authoritative backend Time-Aware A* Route Optimizer.
 */
export async function optimizeRoutesViaBackend(params: {
  departureLocation: GeoPoint;
  destinationLocation: GeoPoint;
  vessel: VesselProfile;
  riskWeights?: RiskWeights;
  departureDelayHours?: number;
}): Promise<OptimizationResult | null> {
  const payload = {
    start_latitude: params.departureLocation.latitude,
    start_longitude: params.departureLocation.longitude,
    destination_latitude: params.destinationLocation.latitude,
    destination_longitude: params.destinationLocation.longitude,
    nominal_speed_knots: params.vessel.nominalSpeedKnots || 10.0,
    departure_delay_hours: params.departureDelayHours || 0.0,
    allow_diagonal_moves: true,
    max_search_depth_steps: 60,
    weights: params.riskWeights
      ? {
          risk_weight: params.riskWeights.seaIceWeight * 0.5 + params.riskWeights.icebergWeight * 0.5,
          distance_weight: 0.25,
          time_weight: 0.20,
          fuel_weight: 0.15,
        }
      : undefined,
  };

  try {
    const res = await fetch(`${API_BASE_URL}/routes/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.warn(`[POLARIS] Route optimization HTTP error: ${res.status}`);
      return null;
    }

    const data: BackendRouteOptimizationResponse = await res.json();
    if (!data.success || !data.candidates || data.candidates.length === 0) {
      console.warn(`[POLARIS] Route optimization returned zero candidates: ${data.status_message}`);
      return null;
    }

    const routes = data.candidates.map(mapBackendCandidateToRoute);
    const recommendedId = data.recommended_route_id || routes[0]?.id || 'route_safe_a';

    return {
      routes,
      recommendedRouteId: recommendedId,
      recommendationReason: data.recommendation_reason,
      totalCandidates: data.total_candidates,
    };
  } catch (err) {
    console.warn('[POLARIS] Failed to reach backend route optimizer:', err);
    return null;
  }
}

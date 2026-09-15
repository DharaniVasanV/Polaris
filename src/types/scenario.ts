/**
 * POLARIS: Scenario & Overlay Types
 * Non-mutating snapshot system: DerivedState = BaselineState + ScenarioOverlay
 */

import { GeoPoint } from './domain';
import { ValidTimeHorizon } from './risk';

export type ScenarioId = 
  | 'NORMAL'
  | 'ICE_GROWTH'
  | 'ICEBERG_SHIFT'
  | 'HIGH_WAVES'
  | 'DELAYED_DEPARTURE_6H'
  | 'DELAYED_DEPARTURE_12H'
  | 'VESSEL_SPEED_REDUCED'
  | 'SAFETY_BUFFER_INCREASED'
  | 'LOW_CONFIDENCE'
  | 'NO_SAFE_ROUTE';

export interface ScenarioOverlay {
  id: ScenarioId;
  title: string;
  description: string;
  badge: string;
  sicDeltaPercent: number; // e.g. +20%
  waveDeltaMeters: number;  // e.g. +2.5m
  departureDelayHours: number; // 0, 6, 12
  icebergPositionShift: {
    icebergId: string;
    shiftLat: number;
    shiftLon: number;
    expandUncertaintyFactor: number;
  } | null;
  speedMultiplier: number;
  safetyBufferDeltaKm: number;
  confidencePenaltyPercent: number;
  forceAllCorridorsBlocked?: boolean; // For "NO_SAFE_ROUTE"
}

export interface WhatIfComparisonResult {
  scenarioId: ScenarioId;
  baselineMetrics: {
    risk: number;
    etaHours: number;
    fuelIndex: number;
    confidence: number;
    routeTitle: string;
    icebergClearanceKm: number;
  };
  scenarioMetrics: {
    risk: number;
    etaHours: number;
    fuelIndex: number;
    confidence: number;
    routeTitle: string;
    icebergClearanceKm: number;
  };
    deltas: {
    sicChangeFormatted: string;
    icebergClearanceFormatted: string;
    riskChangeFormatted: string;
    routeTransitionFormatted: string;
  };
}

// ==========================================
// Phase 7: Backend What-If Engine Types
// ==========================================

export type BackendScenarioType =
  | 'ICEBERG_DRIFT'
  | 'SEA_ICE_INCREASE'
  | 'WEATHER_DETERIORATION'
  | 'ICEBERG_CLEARANCE'
  | 'SAFETY_PRIORITY_CHANGE'
  | 'EFFICIENCY_PRIORITY_CHANGE';

export interface BackendScenarioParameters {
  iceberg_id?: string;
  iceberg_delta_lat?: number;
  iceberg_delta_lon?: number;
  iceberg_shift_km?: number;
  uncertainty_multiplier?: number;
  sic_increase_percent?: number;
  sic_region_min_lat?: number;
  sic_region_max_lat?: number;
  sic_region_min_lon?: number;
  sic_region_max_lon?: number;
  weather_risk_delta?: number;
  weights_override?: {
    risk_weight: number;
    distance_weight: number;
    time_weight: number;
    fuel_weight: number;
  };
}

export interface BackendScenarioComparison {
  route_changed: boolean;
  recommendation_changed: boolean;
  safety_status_changed: boolean;
  baseline_recommended_id: string;
  scenario_recommended_id: string;
  baseline_profile: string;
  scenario_profile: string;
  baseline_distance_nm: number;
  scenario_distance_nm: number;
  distance_diff_nm: number;
  distance_diff_percent: number;
  baseline_distance_km: number;
  scenario_distance_km: number;
  distance_diff_km: number;
  baseline_transit_hours: number;
  scenario_transit_hours: number;
  transit_time_diff_hours: number;
  transit_time_diff_percent: number;
  baseline_average_risk: number;
  scenario_average_risk: number;
  average_risk_diff: number;
  baseline_max_risk: number;
  scenario_max_risk: number;
  max_risk_diff: number;
  baseline_weighted_risk_exposure: number;
  scenario_weighted_risk_exposure: number;
  weighted_risk_exposure_diff: number;
  risk_exposure_change_percent: number;
  baseline_iceberg_clearance_km?: number | null;
  scenario_iceberg_clearance_km?: number | null;
  iceberg_clearance_diff_km?: number | null;
  baseline_max_sic_percent: number;
  scenario_max_sic_percent: number;
  max_sic_diff_percent: number;
  baseline_fuel_proxy: number;
  scenario_fuel_proxy: number;
  fuel_proxy_diff: number;
  fuel_proxy_diff_percent: number;
  newly_blocked_cells: [number, number][];
  newly_cleared_cells: [number, number][];
}

export interface BackendScenarioSimulateResponse {
  success: boolean;
  status_message: string;
  scenario_type: BackendScenarioType;
  parameters: BackendScenarioParameters;
  baseline_optimization: any;
  scenario_optimization: any;
  comparison: BackendScenarioComparison | null;
  dynamic_decision_explanation: string;
  operational_recommendation: string;
  diagnostics: Record<string, any>;
}

export interface BackendSensitivityPoint {
  step_index: number;
  parameter_value: number;
  parameter_label: string;
  recommended_route_id: string;
  recommended_profile: string;
  total_distance_nm: number;
  total_transit_hours: number;
  weighted_risk_exposure: number;
  iceberg_clearance_km?: number | null;
  max_sic_percent: number;
  fuel_proxy: number;
  route_changed_from_baseline: boolean;
  safety_status: string;
}

export interface BackendSensitivitySweepResponse {
  success: boolean;
  sweep_type: BackendScenarioType;
  parameter_name: string;
  parameter_unit: string;
  baseline_point: BackendSensitivityPoint;
  sweep_points: BackendSensitivityPoint[];
  inflection_points_found: number;
  decision_boundary_explanation: string;
  diagnostics: Record<string, any>;
}


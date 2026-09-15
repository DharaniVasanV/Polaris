/**
 * POLARIS: Antarctic Risk Twin & Operational Decision Dashboard Types (Phase 8).
 * TypeScript interfaces mirroring the authoritative backend schemas.
 */

export interface VesselTelemetry {
  name: string;
  vessel_id: string;
  ice_class: string;
  latitude: number;
  longitude: number;
  heading_degrees: number;
  speed_knots: number;
  departure_utc: string;
  destination_name: string;
  safe_sic_threshold_percent: number;
  iceberg_safety_buffer_km: number;
  draft_meters: number;
  safety_depth_margin_meters: number;
}

export type NavigationStatusCategory = 'TRAVERSABLE' | 'NOT_CLEARED' | 'NO_FEASIBLE_ROUTE';
export type NavigationStatusLevel = 'SAFE' | 'WARNING' | 'CRITICAL';

export interface OperationalNavigationStatus {
  status: NavigationStatusCategory;
  status_level: NavigationStatusLevel;
  explanation: string;
  no_go_cells_encountered: number;
  critical_violations: string[];
}

export interface RiskFactorBreakdown {
  sea_ice_score: number;
  sea_ice_weight: number;
  iceberg_score: number;
  iceberg_weight: number;
  weather_score: number;
  weather_weight: number;
  wave_score: number;
  wave_weight: number;
  current_score: number;
  current_weight: number;
  uncertainty_score: number;
  uncertainty_weight: number;
  dominant_factor: string;
  composite_risk: number;
  risk_category: 'SAFE' | 'MODERATE' | 'HIGH' | 'CRITICAL';
}

export interface ForecastTimelineEntry {
  horizon_label: 'NOW' | '+6h' | '+12h' | '+18h' | '+24h';
  horizon_hours: number;
  is_available: boolean;
  provenance: string;
  mean_risk: number | null;
  max_risk: number | null;
  mean_sic_percent: number | null;
  weather_risk_available: boolean;
  iceberg_movement_summary: string;
}

export interface CellInspectionData {
  row: number;
  column: number;
  latitude: number;
  longitude: number;
  horizon_hours: number;
  is_traversable: boolean;
  safety_status: 'TRAVERSABLE' | 'NO_GO' | 'NOT_CLEARED';
  blocking_reasons: string[];
  total_risk: number;
  risk_category: 'SAFE' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  dominant_factor: string;
  sic_percent: number | null;
  sic_provenance: string;
  iceberg_risk: number;
  nearest_iceberg_id: string | null;
  nearest_iceberg_dist_km: number | null;
  weather_risk: number | null;
  weather_provenance: string;
  wave_height_meters: number;
  wave_provenance: string;
  current_speed_knots: number;
  current_provenance: string;
  uncertainty_score: number;
  model_provenances: Record<string, string>;
}

export interface SystemEngineHealth {
  engine_id: string;
  name: string;
  status: 'READY' | 'DEGRADED' | 'OFFLINE';
  framework: string;
  model_type: string;
  details: string;
}

export interface RiskTwinSummaryResponse {
  timestamp_utc: string;
  service: string;
  version: string;
  is_live: boolean;
  telemetry_mode: 'LIVE_BACKEND_DATA' | 'DEMO_OFFLINE_FALLBACK';
  vessel: VesselTelemetry;
  navigation_status: OperationalNavigationStatus;
  recommended_route_id: string | null;
  recommendation_reason: string;
  recommended_route: Record<string, any> | null;
  candidate_routes: Record<string, any>[];
  risk_breakdown: RiskFactorBreakdown;
  forecast_timeline: ForecastTimelineEntry[];
  active_scenario: Record<string, any> | null;
  system_health: Record<string, SystemEngineHealth>;
  provenance_catalog: Record<string, string>;
}

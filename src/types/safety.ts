/**
 * POLARIS: Spatiotemporal Safety Constraint Types (Phase 4)
 * Strict TypeScript models for traversability and hard constraint evaluations.
 */

export type SafetyStatus = 'TRAVERSABLE' | 'NO_GO' | 'NOT_CLEARED';

export type NoGoReasonCode =
  | 'LAND'
  | 'ICE_SHELF'
  | 'INSUFFICIENT_DEPTH'
  | 'EXCESSIVE_SEA_ICE'
  | 'SEVERE_SEA_STATE'
  | 'ICEBERG_CORE_INTRUSION'
  | 'NOT_CLEARED_INSUFFICIENT_DATA'
  | 'MISSING_SIC_DATA'
  | 'MISSING_BATHYMETRY_DATA'
  | 'MISSING_ICEBERG_DATA'
  | 'MISSING_WAVE_DATA';

export interface LandConstraintState {
  is_land: boolean;
  violated: boolean;
  source: string;
  available: boolean;
}

export interface IceShelfConstraintState {
  is_ice_shelf: boolean;
  violated: boolean;
  source: string;
  available: boolean;
}

export interface BathymetryConstraintState {
  water_depth_meters?: number;
  required_depth_meters: number;
  violated: boolean;
  source: string;
  available: boolean;
}

export interface SeaIceConstraintState {
  value_percent?: number;
  threshold_percent: number;
  violated: boolean;
  source: string;
  available: boolean;
}

export interface SeaStateConstraintState {
  value_meters?: number;
  threshold_meters: number;
  violated: boolean;
  source: string;
  available: boolean;
}

export interface IcebergCoreConstraintState {
  risk_score?: number;
  threshold_risk: number;
  nearest_distance_km?: number;
  nearest_iceberg_id?: string;
  violated: boolean;
  source: string;
  available: boolean;
}

export interface SafetyConstraintBreakdown {
  land: LandConstraintState;
  ice_shelf: IceShelfConstraintState;
  bathymetry: BathymetryConstraintState;
  sea_ice: SeaIceConstraintState;
  sea_state: SeaStateConstraintState;
  iceberg_core: IcebergCoreConstraintState;
}

export interface SoftFactorSummary {
  total_risk_score: number;
  dominant_risk_factor: string;
  weather_risk: number;
  current_risk: number;
  uncertainty_risk: number;
}

export interface SafetyEvaluation {
  cell_id: string;
  row: number;
  column: number;
  latitude: number;
  longitude: number;
  horizon_hours: number;
  timestamp: string;
  traversable: boolean;
  status: SafetyStatus;
  no_go_reasons: NoGoReasonCode[];
  human_explanation: string;
  constraints: SafetyConstraintBreakdown;
  soft_factors: SoftFactorSummary;
  provenance: Record<string, string>;
}

export interface SafetyConstraintConfig {
  safe_sic_threshold_percent: number;
  vessel_draft_meters: number;
  under_keel_safety_margin_meters: number;
  max_safe_wave_height_meters: number;
  severe_sea_state_multiplier: number;
  iceberg_core_risk_threshold: number;
  iceberg_safety_buffer_km: number;
  require_all_sensors_for_clearance?: boolean;
}

export interface SafetyGridResponse {
  reference_timestamp: string;
  valid_timestamp: string;
  horizon_hours: number;
  grid_rows: number;
  grid_columns: number;
  total_cells: number;
  traversable_cell_count: number;
  no_go_cell_count: number;
  not_cleared_cell_count: number;
  reason_distribution: Record<string, number>;
  config_used: SafetyConstraintConfig;
  cells: SafetyEvaluation[];
  metadata: Record<string, unknown>;
}

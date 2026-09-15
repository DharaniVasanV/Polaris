"""
POLARIS: Centralized Multi-Model Risk Fusion Engine (Phase 3).
Calculates Risk(latitude, longitude, time) by harmonizing:
1. ConvLSTM2D -> Sea-Ice Concentration (SIC) Risk
2. GRU Neural Network -> Iceberg Proximity & Trajectory Hazard Risk
3. Weather Risk MLP -> Direct 6-hour Maritime Weather Risk Score
4. Environmental Baseline -> Wave Height & Sea State Risk
5. Environmental Baseline -> Ocean Current Velocity Risk
6. Spatiotemporal Layer -> Forecast Uncertainty Risk
7. Physical Constraints -> Bathymetry Under-Clearance & Hard NO-GO Boundaries

Scientific & Operational Principles:
- Decision-Support Weights: Configurable weights (0.35 SIC, 0.30 Iceberg, 0.15 Wave, 0.10 Weather, 0.05 Current, 0.05 Uncertainty).
- No Fake Conversions: Weather MLP output (0-1) is consumed directly; never converted to synthetic wind speed.
- Strict Provenance: When ConvLSTM or Weather MLP are unavailable or outside domain, explicit fallback to baseline is tagged with source='baseline' and model_available=False.
- Dynamic Sensitivity: Total risk responds monotonically to updates in GRU iceberg trajectories, ConvLSTM sea-ice forecasts, and Weather MLP outputs.
"""

import math
import json
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Literal, Union
from pydantic import BaseModel, Field, model_validator

try:
    from src.engines.spatiotemporal_alignment import (
        REFERENCE_GRID_ROWS,
        REFERENCE_GRID_COLS,
        REFERENCE_TOTAL_CELLS,
        LAT_MIN,
        LAT_MAX,
        LON_MIN,
        LON_MAX,
        COMMON_HORIZONS,
        AlignedEnvironmentalState,
        AlignedGridCell,
        AlignedSeaIce,
        AlignedWeather,
        IcebergHazardIntersection,
        build_aligned_environmental_state,
        haversine_distance_km
    )
except ImportError:
    from engines.spatiotemporal_alignment import (
        REFERENCE_GRID_ROWS,
        REFERENCE_GRID_COLS,
        REFERENCE_TOTAL_CELLS,
        LAT_MIN,
        LAT_MAX,
        LON_MIN,
        LON_MAX,
        COMMON_HORIZONS,
        AlignedEnvironmentalState,
        AlignedGridCell,
        AlignedSeaIce,
        AlignedWeather,
        IcebergHazardIntersection,
        build_aligned_environmental_state,
        haversine_distance_km
    )

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
CONFIG_PATH = PROJECT_ROOT / "config" / "risk_config.json"


# --- Configuration Schemas ---

class RiskWeights(BaseModel):
    """
    Configurable prototype decision-support risk weights.
    Must sum to 1.0 (validated within floating tolerance).
    """
    model_config = {"protected_namespaces": ()}

    sea_ice: float = Field(0.35, ge=0.0, le=1.0, description="Weight for Sea-Ice Concentration risk")
    iceberg: float = Field(0.30, ge=0.0, le=1.0, description="Weight for Iceberg proximity risk")
    wave: float = Field(0.15, ge=0.0, le=1.0, description="Weight for Wave height risk")
    weather: float = Field(0.10, ge=0.0, le=1.0, description="Weight for direct Weather MLP risk score")
    current: float = Field(0.05, ge=0.0, le=1.0, description="Weight for Ocean Current velocity risk")
    uncertainty: float = Field(0.05, ge=0.0, le=1.0, description="Weight for Forecast Uncertainty risk")

    @model_validator(mode="after")
    def validate_weights_sum(self) -> "RiskWeights":
        total = self.sea_ice + self.iceberg + self.wave + self.weather + self.current + self.uncertainty
        if not math.isclose(total, 1.0, abs_tol=1e-4):
            raise ValueError(f"RiskWeights must sum to 1.0; current sum = {total:.4f}")
        return self


class VesselRiskParameters(BaseModel):
    """
    Vessel operational envelope constraints.
    """
    model_config = {"protected_namespaces": ()}

    vessel_id: str = "RV_POLAR_STERN"
    name: str = "RV Polar Stern"
    ice_class: str = "PC5"
    draft_meters: float = Field(7.8, gt=0.0, description="Vessel draft in meters")
    safety_depth_margin_meters: float = Field(2.5, ge=0.0, description="Under-keel safety clearance in meters")
    safe_sic_threshold_percent: float = Field(70.0, ge=0.0, le=100.0, description="Operational SIC threshold before NO-GO")
    iceberg_safety_buffer_km: float = Field(12.0, ge=0.0, description="Operational safety buffer distance around icebergs in km")
    max_safe_wave_height_meters: float = Field(4.0, gt=0.0, description="Max safe significant wave height in meters")


def load_configured_weights(config_file: Optional[Union[str, Path]] = None) -> RiskWeights:
    """
    Loads risk fusion weights from risk_config.json, with default prototype fallback.
    """
    path = Path(config_file) if config_file else CONFIG_PATH
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if "fusion_weights" in data:
                    fw = data["fusion_weights"]
                    return RiskWeights(
                        sea_ice=float(fw.get("sea_ice", 0.35)),
                        iceberg=float(fw.get("iceberg", 0.30)),
                        wave=float(fw.get("wave", 0.15)),
                        weather=float(fw.get("weather", 0.10)),
                        current=float(fw.get("current", 0.05)),
                        uncertainty=float(fw.get("uncertainty", 0.05))
                    )
        except Exception:
            pass
    return RiskWeights()


DEFAULT_WEIGHTS = load_configured_weights()
DEFAULT_VESSEL = VesselRiskParameters()


# --- Result Schemas ---

class RiskBreakdown(BaseModel):
    model_config = {"protected_namespaces": ()}

    sea_ice_risk: float = Field(..., ge=0.0, le=100.0)
    iceberg_risk: float = Field(..., ge=0.0, le=100.0)
    weather_risk: float = Field(..., ge=0.0, le=100.0)
    wave_risk: float = Field(..., ge=0.0, le=100.0)
    current_risk: float = Field(..., ge=0.0, le=100.0)
    bathymetry_risk: float = Field(..., ge=0.0, le=100.0)
    uncertainty_risk: float = Field(..., ge=0.0, le=100.0)
    total_risk: float = Field(..., ge=0.0, le=100.0)


class ComponentProvenance(BaseModel):
    model_config = {"protected_namespaces": ()}

    sea_ice_source: Literal["convlstm_model", "observed", "interpolated", "baseline", "outside_coverage"]
    sea_ice_model_available: bool
    weather_source: Literal["weather_mlp", "baseline", "unavailable"]
    weather_model_available: bool
    iceberg_source: Literal["gru_model", "interpolated_gru", "anchor", "none"]
    iceberg_count_near: int = 0
    nearest_iceberg_id: Optional[str] = None
    nearest_iceberg_distance_km: Optional[float] = None
    wave_source: Literal["baseline"] = "baseline"
    current_source: Literal["baseline"] = "baseline"
    uncertainty_source: str = "forecast_horizon_escalation"


class FusedRiskCell(BaseModel):
    model_config = {"protected_namespaces": ()}

    id: str
    row: int = Field(..., ge=0, le=17)
    column: int = Field(..., ge=0, le=25)
    latitude: float
    longitude: float
    horizon_hours: float
    timestamp: str
    breakdown: RiskBreakdown
    total_risk: float = Field(..., ge=0.0, le=100.0)
    risk_category: Literal["SAFE", "MODERATE", "HIGH", "CRITICAL"]
    risk_level: Literal["LOW", "MODERATE", "HIGH", "VERY_HIGH", "CRITICAL"]
    is_no_go: bool
    no_go_reason: Optional[str] = None
    dominant_risk_factor: str
    explanation: str
    provenance: ComponentProvenance
    confidence_percent: float = Field(..., ge=0.0, le=100.0)


class FusedRiskGridResponse(BaseModel):
    model_config = {"protected_namespaces": ()}

    reference_timestamp: str
    valid_timestamp: str
    horizon_hours: float
    grid_rows: int = REFERENCE_GRID_ROWS
    grid_columns: int = REFERENCE_GRID_COLS
    total_cells: int = REFERENCE_TOTAL_CELLS
    weights: RiskWeights
    vessel: VesselRiskParameters
    cells: List[FusedRiskCell]
    summary: Dict[str, Any]
    metadata: Dict[str, Any]


# --- Deterministic Environmental Baseline Calculator ---

def calculate_baseline_environment(latitude: float, longitude: float, horizon_hours: float = 0.0) -> Dict[str, Any]:
    """
    Calculates deterministic baseline environmental parameters across the Antarctic demonstration corridor.
    Maintains 100% mathematical parity with the reference baseline dataset.
    """
    lat = float(latitude)
    lon = float(longitude)
    h = max(0.0, min(24.0, float(horizon_hours)))

    # 1. Geography & Landmass
    continental_boundary_lat = -69.0 - math.sin((lon * math.pi) / 60.0) * 2.5
    is_land = lat < (continental_boundary_lat - 1.2)
    is_ice_shelf = (not is_land) and (lat < continental_boundary_lat + 0.5) and (-10.0 < lon < 45.0)

    # 2. Bathymetry Depth (meters)
    water_depth = 3800.0 - abs(lat - (-60.0)) * 180.0
    if is_ice_shelf:
        water_depth = 150.0
    elif lat < -67.5:
        water_depth = 420.0 - (lat + 67.5) * 80.0
    if is_land:
        water_depth = 0.0

    # 3. Baseline Sea-Ice Concentration (SIC %)
    base_sic_raw = max(
        0.0,
        min(
            98.0,
            (abs(lat - (-58.0)) / 16.0) * 75.0 +
            (22.0 if lon < 5.0 else -8.0) +
            math.sin((lon + 15.0) * 0.1) * 14.0
        )
    )
    # Drift dynamics across horizons
    drift_factor = math.sin((lon - 10.0) * 0.15) * (17.0 * (h / 24.0)) + ((14.0 * (h / 24.0)) if lat < -64.0 else 0.0)
    sic_percent = 0.0 if is_land else round(max(0.0, min(100.0, base_sic_raw + drift_factor)), 1)

    # 4. Significant Wave Height (meters)
    base_wave = max(1.2, 5.2 - abs(lat - (-58.0)) * 0.22 + math.cos(lon * 0.08) * 0.8)
    wave_delta = {0.0: 0.0, 6.0: 0.3, 12.0: 0.6, 18.0: 0.4, 24.0: -0.2}.get(h, 0.0)
    wave_height_meters = round(max(0.5, base_wave + wave_delta), 2)

    # 5. Baseline Wind Speed (km/h)
    base_wind = 24.0 + abs(lat - (-65.0)) * 2.2 + math.sin(lon * 0.1) * 6.0
    wind_delta = {0.0: 0.0, 6.0: 4.0, 12.0: 8.0, 18.0: 6.0, 24.0: 2.0}.get(h, 0.0)
    wind_speed_kmh = round(base_wind + wind_delta, 1)

    # 6. Ocean Currents (knots)
    current_u = -0.8 if lat < -67.0 else (1.4 + math.sin(lon * 0.05) * 0.3)
    current_v = -0.2 + math.cos(lon * 0.08) * 0.3
    current_speed_knots = round(math.sqrt(current_u ** 2 + current_v ** 2), 2)

    return {
        "is_land": is_land,
        "is_ice_shelf": is_ice_shelf,
        "water_depth_meters": round(water_depth, 1),
        "sic_percent": sic_percent,
        "wave_height_meters": wave_height_meters,
        "wind_speed_kmh": wind_speed_kmh,
        "current_u_knots": round(current_u, 2),
        "current_v_knots": round(current_v, 2),
        "current_speed_knots": current_speed_knots
    }


# --- Core Risk Evaluation Logic ---

def evaluate_cell_risk(
    cell: AlignedGridCell,
    horizon_hours: float,
    valid_timestamp: str,
    vessel: VesselRiskParameters = DEFAULT_VESSEL,
    weights: RiskWeights = DEFAULT_WEIGHTS
) -> FusedRiskCell:
    """
    Evaluates multi-model risk fusion and physical constraints for a single grid cell.
    """
    lat = cell.latitude
    lon = cell.longitude
    base_env = calculate_baseline_environment(lat, lon, horizon_hours)

    # -------------------------------------------------------------
    # 1. Sea-Ice Risk Calculation (0 - 100)
    # -------------------------------------------------------------
    sic_model_avail = False
    sic_source: Literal["convlstm_model", "observed", "interpolated", "baseline", "outside_coverage"] = "baseline"
    sic_confidence = 60.0

    if cell.sea_ice.status == "AVAILABLE" and cell.sea_ice.sic_percent is not None:
        sic_value = float(cell.sea_ice.sic_percent)
        sic_model_avail = True
        sic_source = "convlstm_model" if cell.sea_ice.prediction_type == "model" else (cell.sea_ice.prediction_type or "observed")
        sic_confidence = float(cell.sea_ice.confidence or 85.0)
    else:
        # Fallback to baseline environmental SIC
        sic_value = base_env["sic_percent"]
        sic_model_avail = False
        sic_source = "outside_coverage" if cell.sea_ice.status == "OUTSIDE_MODEL_COVERAGE" else "baseline"
        sic_confidence = 60.0

    # Non-linear escalation approaching safe threshold: (SIC / SafeThreshold)^1.8 * 100
    sic_ratio = sic_value / max(1.0, vessel.safe_sic_threshold_percent)
    sea_ice_risk = round(min(100.0, math.pow(sic_ratio, 1.8) * 100.0), 2)

    # -------------------------------------------------------------
    # 2. Iceberg Proximity & Trajectory Risk Calculation (0 - 100)
    # -------------------------------------------------------------
    # Continuous risk function decreasing monotonically with distance
    min_berg_dist = float("inf")
    nearest_berg_id = None
    max_berg_severity = 0.0
    active_near_count = 0
    berg_source: Literal["gru_model", "interpolated_gru", "anchor", "none"] = "none"

    if cell.iceberg_hazards:
        for hazard in cell.iceberg_hazards:
            dist = hazard.distance_km
            if dist < min_berg_dist:
                min_berg_dist = dist
                nearest_berg_id = hazard.iceberg_id
                if hazard.prediction_type == "model":
                    berg_source = "gru_model"
                elif hazard.prediction_type == "interpolated":
                    berg_source = "interpolated_gru"
                elif hazard.prediction_type == "anchor":
                    berg_source = "anchor"

            # Dynamic effective hazard boundary
            uncertainty_radius = hazard.uncertainty_radius_km
            safety_margin = hazard.vessel_safety_margin_km or vessel.iceberg_safety_buffer_km
            effective_danger_zone = max(5.0, uncertainty_radius + safety_margin)

            if dist < (effective_danger_zone * 2.0):
                active_near_count += 1

            if dist <= effective_danger_zone:
                # Inside effective danger boundary: continuous risk 35.0 to 100.0
                penetration = (effective_danger_zone - dist) / effective_danger_zone
                risk_val = 35.0 + penetration * 65.0
            elif dist <= (effective_danger_zone * 2.0):
                # Buffer caution zone: continuous risk 0.0 to 35.0
                proximity = 1.0 - (dist - effective_danger_zone) / effective_danger_zone
                risk_val = proximity * 35.0
            else:
                risk_val = 0.0

            if risk_val > max_berg_severity:
                max_berg_severity = risk_val

    iceberg_risk = round(min(100.0, max_berg_severity), 2)

    # -------------------------------------------------------------
    # 3. Weather Risk Calculation (0 - 100)
    # -------------------------------------------------------------
    # Use Weather MLP output DIRECTLY. No conversion to synthetic wind speed!
    weather_model_avail = False
    weather_source: Literal["weather_mlp", "baseline", "unavailable"] = "baseline"

    if cell.weather.status == "AVAILABLE" and cell.weather.risk_score is not None:
        # Direct conversion of continuous [0, 1] risk score to [0, 100]
        weather_risk = round(float(cell.weather.risk_score) * 100.0, 2)
        weather_model_avail = True
        weather_source = "weather_mlp"
    else:
        # Explicit fallback to baseline wind speed risk
        weather_model_avail = False
        weather_source = "baseline"
        wind_kmh = base_env["wind_speed_kmh"]
        weather_risk = round(min(100.0, (wind_kmh / 65.0) * 80.0), 2)

    # -------------------------------------------------------------
    # 4. Wave Risk Calculation (0 - 100)
    # -------------------------------------------------------------
    wave_meters = base_env["wave_height_meters"]
    wave_ratio = wave_meters / max(1.0, vessel.max_safe_wave_height_meters)
    wave_risk = round(min(100.0, math.pow(wave_ratio, 1.5) * 85.0), 2)

    # -------------------------------------------------------------
    # 5. Ocean Current Risk Calculation (0 - 100)
    # -------------------------------------------------------------
    current_speed = base_env["current_speed_knots"]
    current_risk = round(min(100.0, (current_speed / 3.0) * 70.0), 2)

    # -------------------------------------------------------------
    # 6. Bathymetry Risk Calculation (0 - 100)
    # -------------------------------------------------------------
    water_depth = base_env["water_depth_meters"]
    required_depth = vessel.draft_meters + vessel.safety_depth_margin_meters
    bathymetry_risk = 0.0
    if 0 < water_depth < (required_depth * 2.0):
        bathymetry_risk = round(((required_depth * 2.0 - water_depth) / (required_depth * 2.0)) * 100.0, 2)

    # -------------------------------------------------------------
    # 7. Uncertainty Risk Calculation (0 - 100)
    # -------------------------------------------------------------
    # Increases with temporal forecast horizon
    base_unc_risk = min(100.0, horizon_hours * 1.25 + 5.0)
    uncertainty_risk = round(base_unc_risk, 2)

    # -------------------------------------------------------------
    # 8. Total Weighted Risk Fusion
    # -------------------------------------------------------------
    c_sic = weights.sea_ice * sea_ice_risk
    c_berg = weights.iceberg * iceberg_risk
    c_wave = weights.wave * wave_risk
    c_weather = weights.weather * weather_risk
    c_current = weights.current * current_risk
    c_unc = weights.uncertainty * uncertainty_risk

    raw_total_risk = c_sic + c_berg + c_wave + c_weather + c_current + c_unc
    total_risk = round(max(0.0, min(100.0, raw_total_risk)), 2)

    # -------------------------------------------------------------
    # 9. Decision-Support Risk Category & Frontend Level
    # -------------------------------------------------------------
    # Documented prototype categories: SAFE (<25), MODERATE (25-50), HIGH (50-75), CRITICAL (>=75)
    if total_risk >= 75.0:
        risk_category: Literal["SAFE", "MODERATE", "HIGH", "CRITICAL"] = "CRITICAL"
    elif total_risk >= 50.0:
        risk_category = "HIGH"
    elif total_risk >= 25.0:
        risk_category = "MODERATE"
    else:
        risk_category = "SAFE"

    # Frontend backward-compatible risk level
    if total_risk > 80.0:
        risk_level: Literal["LOW", "MODERATE", "HIGH", "VERY_HIGH", "CRITICAL"] = "CRITICAL"
    elif total_risk > 60.0:
        risk_level = "VERY_HIGH"
    elif total_risk > 40.0:
        risk_level = "HIGH"
    elif total_risk > 20.0:
        risk_level = "MODERATE"
    else:
        risk_level = "LOW"

    # -------------------------------------------------------------
    # 10. Physical Constraints & Hard NO-GO Evaluation
    # -------------------------------------------------------------
    no_go_reasons = []

    if base_env["is_land"]:
        no_go_reasons.append("Continental Landmass")
    if base_env["is_ice_shelf"]:
        no_go_reasons.append("Permanent Ice Shelf Barrier")
    if water_depth < required_depth:
        no_go_reasons.append(f"Bathymetry Under-Clearance ({water_depth:.1f}m < Required {required_depth:.1f}m)")
    if sic_value > vessel.safe_sic_threshold_percent:
        no_go_reasons.append(f"Sea-Ice Concentration ({sic_value:.1f}%) exceeds configured vessel limit ({vessel.safe_sic_threshold_percent:.1f}%)")
    if wave_meters > (vessel.max_safe_wave_height_meters * 1.3):
        no_go_reasons.append(f"Severe Sea State ({wave_meters:.1f}m) exceeds survivability limit")
    if iceberg_risk >= 95.0:
        no_go_reasons.append("Direct intersection with Iceberg core hazard boundary")

    is_no_go = len(no_go_reasons) > 0
    no_go_reason = "; ".join(no_go_reasons) if no_go_reasons else None

    # -------------------------------------------------------------
    # 11. Dominant Risk Factor & Explainability
    # -------------------------------------------------------------
    contributions = {
        "Sea Ice": c_sic,
        "Iceberg": c_berg,
        "Wave": c_wave,
        "Weather": c_weather,
        "Current": c_current,
        "Uncertainty": c_unc
    }
    dominant_factor = max(contributions, key=contributions.get)

    explanation_parts = [f"Total risk {total_risk:.1f} ({risk_category})."]
    if is_no_go:
        explanation_parts.append(f"NO-GO CONSTRAINT: {no_go_reason}.")
    explanation_parts.append(f"Dominant factor: {dominant_factor} (contributing {contributions[dominant_factor]:.1f} weighted risk).")
    if sic_model_avail:
        explanation_parts.append(f"ConvLSTM SIC: {sic_value:.1f}%.")
    if weather_model_avail:
        explanation_parts.append(f"Weather MLP risk: {cell.weather.risk_score:.2f} ({cell.weather.risk_class}).")
    if nearest_berg_id and min_berg_dist < 100.0:
        explanation_parts.append(f"Nearest iceberg {nearest_berg_id} at {min_berg_dist:.1f} km.")

    explanation = " ".join(explanation_parts)

    breakdown = RiskBreakdown(
        sea_ice_risk=sea_ice_risk,
        iceberg_risk=iceberg_risk,
        weather_risk=weather_risk,
        wave_risk=wave_risk,
        current_risk=current_risk,
        bathymetry_risk=bathymetry_risk,
        uncertainty_risk=uncertainty_risk,
        total_risk=total_risk
    )

    provenance = ComponentProvenance(
        sea_ice_source=sic_source,
        sea_ice_model_available=sic_model_avail,
        weather_source=weather_source,
        weather_model_available=weather_model_avail,
        iceberg_source=berg_source,
        iceberg_count_near=active_near_count,
        nearest_iceberg_id=nearest_berg_id,
        nearest_iceberg_distance_km=round(min_berg_dist, 2) if min_berg_dist < float("inf") else None,
        wave_source="baseline",
        current_source="baseline",
        uncertainty_source="forecast_horizon_escalation"
    )

    # Average confidence calculation
    confidence = round((sic_confidence + (90.0 if weather_model_avail else 65.0) + (90.0 if cell.iceberg_hazards else 80.0)) / 3.0, 1)

    return FusedRiskCell(
        id=f"fused_risk_{cell.row}_{cell.column}_{int(horizon_hours)}h",
        row=cell.row,
        column=cell.column,
        latitude=lat,
        longitude=lon,
        horizon_hours=horizon_hours,
        timestamp=valid_timestamp,
        breakdown=breakdown,
        total_risk=total_risk,
        risk_category=risk_category,
        risk_level=risk_level,
        is_no_go=is_no_go,
        no_go_reason=no_go_reason,
        dominant_risk_factor=dominant_factor,
        explanation=explanation,
        provenance=provenance,
        confidence_percent=confidence
    )


# --- High-Level Risk Fusion Engine ---

class CentralizedRiskFusionEngine:
    """
    Centralized Multi-Model Risk Fusion Engine.
    Executes Risk(latitude, longitude, time) on the standardized 468-cell POLARIS grid.
    """

    def __init__(self, weights: Optional[RiskWeights] = None):
        self.weights = weights or DEFAULT_WEIGHTS

    def fuse_aligned_state(
        self,
        aligned_state: AlignedEnvironmentalState,
        vessel: Optional[VesselRiskParameters] = None,
        weights: Optional[RiskWeights] = None
    ) -> FusedRiskGridResponse:
        """
        Fuses risk across all 468 cells from an existing AlignedEnvironmentalState.
        """
        active_weights = weights or self.weights
        active_vessel = vessel or DEFAULT_VESSEL

        fused_cells: List[FusedRiskCell] = []
        no_go_count = 0
        total_risk_sum = 0.0
        category_counts: Dict[str, int] = {"SAFE": 0, "MODERATE": 0, "HIGH": 0, "CRITICAL": 0}

        for cell in aligned_state.cells:
            fused = evaluate_cell_risk(
                cell=cell,
                horizon_hours=aligned_state.horizon_hours,
                valid_timestamp=aligned_state.valid_timestamp,
                vessel=active_vessel,
                weights=active_weights
            )
            fused_cells.append(fused)
            total_risk_sum += fused.total_risk
            category_counts[fused.risk_category] = category_counts.get(fused.risk_category, 0) + 1
            if fused.is_no_go:
                no_go_count += 1

        avg_risk = round(total_risk_sum / len(fused_cells), 2) if fused_cells else 0.0

        summary = {
            "average_risk": avg_risk,
            "no_go_cell_count": no_go_count,
            "passable_cell_count": len(fused_cells) - no_go_count,
            "category_distribution": category_counts,
            "vessel_ice_class": active_vessel.ice_class,
            "horizon_hours": aligned_state.horizon_hours
        }

        metadata = {
            "phase": "PHASE_3_CENTRALIZED_RISK_FUSION",
            "weights_used": active_weights.model_dump(),
            "sea_ice_model_status": aligned_state.available_horizons.get("sea_ice", []),
            "weather_model_status": aligned_state.available_horizons.get("weather", []),
            "iceberg_model_status": aligned_state.available_horizons.get("iceberg", [])
        }

        return FusedRiskGridResponse(
            reference_timestamp=aligned_state.reference_timestamp,
            valid_timestamp=aligned_state.valid_timestamp,
            horizon_hours=aligned_state.horizon_hours,
            grid_rows=REFERENCE_GRID_ROWS,
            grid_columns=REFERENCE_GRID_COLS,
            total_cells=REFERENCE_TOTAL_CELLS,
            weights=active_weights,
            vessel=active_vessel,
            cells=fused_cells,
            summary=summary,
            metadata=metadata
        )

    def fuse_from_raw_models(
        self,
        reference_timestamp: str,
        horizon_hours: float,
        sea_ice_data: Optional[Dict[str, Any]] = None,
        weather_data: Optional[Dict[str, Any]] = None,
        icebergs_forecast: Optional[List[Dict[str, Any]]] = None,
        vessel: Optional[VesselRiskParameters] = None,
        weights: Optional[RiskWeights] = None
    ) -> FusedRiskGridResponse:
        """
        Convenience pipeline: Aligns raw heterogeneous model predictions into spatiotemporal state,
        then calculates centralized risk fusion.
        """
        aligned_state = build_aligned_environmental_state(
            reference_timestamp=reference_timestamp,
            horizon_hours=horizon_hours,
            sea_ice_data=sea_ice_data,
            weather_data=weather_data,
            icebergs_forecast=icebergs_forecast
        )
        return self.fuse_aligned_state(aligned_state=aligned_state, vessel=vessel, weights=weights)

    def fuse_temporal_risk_grids(
        self,
        reference_timestamp: str,
        horizons: Optional[List[float]] = None,
        sea_ice_data: Optional[Dict[str, Any]] = None,
        weather_data: Optional[Dict[str, Any]] = None,
        icebergs_forecast: Optional[List[Dict[str, Any]]] = None,
        vessel: Optional[VesselRiskParameters] = None,
        weights: Optional[RiskWeights] = None
    ) -> Dict[str, FusedRiskGridResponse]:
        """
        Fuses multi-model risk across the full common prototype timeline: [0h, 6h, 12h, 18h, 24h].
        """
        target_horizons = horizons or COMMON_HORIZONS
        results: Dict[str, FusedRiskGridResponse] = {}

        for h in target_horizons:
            h_key = f"{int(h)}h"
            results[h_key] = self.fuse_from_raw_models(
                reference_timestamp=reference_timestamp,
                horizon_hours=h,
                sea_ice_data=sea_ice_data,
                weather_data=weather_data,
                icebergs_forecast=icebergs_forecast,
                vessel=vessel,
                weights=weights
            )

        return results


# Global singleton instance
risk_fusion_engine = CentralizedRiskFusionEngine()

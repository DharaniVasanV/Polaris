"""
POLARIS: Dedicated Safety Constraint Engine (Phase 4).
Converts spatiotemporal risk and environmental states into deterministic,
machine-readable binary traversability decisions:
    TRAVERSABLE vs. NO-GO vs. NOT_CLEARED
for every spatial-temporal coordinate (lat, lon, horizon_hours).

Key Architecture Principles:
1. Hard Constraints vs. Soft Factors:
   - Hard Constraints (Land, Ice Shelf, Bathymetry Depth, Excessive Sea Ice, Severe Sea State, Iceberg Core)
     strictly govern traversability.
   - Soft Factors (Total Risk Score, Weather Risk, Current, Uncertainty) influence path costs for later
     A* routing, but do NOT independently declare a cell NO-GO.
2. Structured & Exhaustive NO-GO Reasons:
   - Never returns a plain uninformative boolean; returns all violated machine-readable reason codes
     along with human-readable explanations.
3. Conservative Missing Data Policy:
   - If critical safety variables are missing or undefined, data is NEVER silently defaulted to benign values
     (e.g., missing SIC != 0%, missing depth != infinite depth, missing wave != calm sea).
   - Instead, the cell is classified as NOT_CLEARED (non-traversable due to insufficient safety surveillance).
4. Provenance Transparency:
   - Traces the explicit data origin (ConvLSTM model, GRU model, Weather MLP, or calibrated baseline)
     for every constraint.
"""

import json
import math
from pathlib import Path
from typing import Dict, Any, List, Optional, Literal, Union
from pydantic import BaseModel, Field

try:
    from src.engines.spatiotemporal_alignment import (
        REFERENCE_GRID_ROWS,
        REFERENCE_GRID_COLS,
        REFERENCE_TOTAL_CELLS,
        COMMON_HORIZONS
    )
    from src.engines.risk_fusion_engine import (
        FusedRiskCell,
        FusedRiskGridResponse,
        calculate_baseline_environment,
        risk_fusion_engine,
        VesselRiskParameters
    )
except ImportError:
    from engines.spatiotemporal_alignment import (
        REFERENCE_GRID_ROWS,
        REFERENCE_GRID_COLS,
        REFERENCE_TOTAL_CELLS,
        COMMON_HORIZONS
    )
    from engines.risk_fusion_engine import (
        FusedRiskCell,
        FusedRiskGridResponse,
        calculate_baseline_environment,
        risk_fusion_engine,
        VesselRiskParameters
    )

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
CONFIG_PATH = PROJECT_ROOT / "config" / "risk_config.json"


# --- Machine-Readable Reason Codes ---

NoGoReasonCode = Literal[
    "LAND",
    "ICE_SHELF",
    "INSUFFICIENT_DEPTH",
    "EXCESSIVE_SEA_ICE",
    "SEVERE_SEA_STATE",
    "ICEBERG_CORE_INTRUSION",
    "NOT_CLEARED_INSUFFICIENT_DATA",
    "MISSING_SIC_DATA",
    "MISSING_BATHYMETRY_DATA",
    "MISSING_ICEBERG_DATA",
    "MISSING_WAVE_DATA"
]

SafetyStatus = Literal["TRAVERSABLE", "NO_GO", "NOT_CLEARED"]


# --- Configuration ---

class SafetyConstraintConfig(BaseModel):
    """
    Configurable safety threshold limits.
    NOTE: These are PROTOTYPE decision-support thresholds, not certified statutory maritime regulations.
    """
    model_config = {"protected_namespaces": ()}

    safe_sic_threshold_percent: float = Field(70.0, ge=0.0, le=100.0, description="Max safe SIC before NO-GO")
    vessel_draft_meters: float = Field(7.8, gt=0.0, description="Vessel draft in meters")
    under_keel_safety_margin_meters: float = Field(2.5, ge=0.0, description="Safety buffer depth below keel")
    max_safe_wave_height_meters: float = Field(4.0, gt=0.0, description="Max safe significant wave height in meters")
    severe_sea_state_multiplier: float = Field(1.3, ge=1.0, description="Multiplier for survivability sea state limit")
    iceberg_core_risk_threshold: float = Field(95.0, ge=0.0, le=100.0, description="Iceberg risk score threshold for core collision hazard")
    iceberg_safety_buffer_km: float = Field(12.0, ge=0.0, description="Vessel safety buffer around icebergs in km")
    require_all_sensors_for_clearance: bool = Field(False, description="If True, missing any sensor flags NOT_CLEARED")

    @property
    def required_water_depth_meters(self) -> float:
        return round(self.vessel_draft_meters + self.under_keel_safety_margin_meters, 2)

    @property
    def severe_wave_limit_meters(self) -> float:
        return round(self.max_safe_wave_height_meters * self.severe_sea_state_multiplier, 2)


def load_safety_config(config_file: Optional[Union[str, Path]] = None) -> SafetyConstraintConfig:
    """Loads safety constraint thresholds from risk_config.json."""
    path = Path(config_file) if config_file else CONFIG_PATH
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if "safety_constraints" in data:
                    sc = data["safety_constraints"]
                    return SafetyConstraintConfig(
                        safe_sic_threshold_percent=float(sc.get("safe_sic_threshold_percent", 70.0)),
                        vessel_draft_meters=float(sc.get("vessel_draft_meters", 7.8)),
                        under_keel_safety_margin_meters=float(sc.get("under_keel_safety_margin_meters", 2.5)),
                        max_safe_wave_height_meters=float(sc.get("max_safe_wave_height_meters", 4.0)),
                        severe_sea_state_multiplier=float(sc.get("severe_sea_state_multiplier", 1.3)),
                        iceberg_core_risk_threshold=float(sc.get("iceberg_core_risk_threshold", 95.0)),
                        iceberg_safety_buffer_km=float(sc.get("iceberg_safety_buffer_km", 12.0))
                    )
        except Exception:
            pass
    return SafetyConstraintConfig()


DEFAULT_SAFETY_CONFIG = load_safety_config()


# --- Detailed Constraint Breakdown Schemas ---

class LandConstraint(BaseModel):
    model_config = {"protected_namespaces": ()}
    is_land: bool
    violated: bool
    source: str = "baseline_geography"
    available: bool = True


class IceShelfConstraint(BaseModel):
    model_config = {"protected_namespaces": ()}
    is_ice_shelf: bool
    violated: bool
    source: str = "baseline_geography"
    available: bool = True


class BathymetryConstraint(BaseModel):
    model_config = {"protected_namespaces": ()}
    water_depth_meters: Optional[float] = None
    required_depth_meters: float
    violated: bool
    source: str = "baseline_bathymetry"
    available: bool = True


class SeaIceConstraint(BaseModel):
    model_config = {"protected_namespaces": ()}
    value_percent: Optional[float] = None
    threshold_percent: float
    violated: bool
    source: str
    available: bool = True


class SeaStateConstraint(BaseModel):
    model_config = {"protected_namespaces": ()}
    value_meters: Optional[float] = None
    threshold_meters: float
    violated: bool
    source: str = "baseline_ocean"
    available: bool = True


class IcebergCoreConstraint(BaseModel):
    model_config = {"protected_namespaces": ()}
    risk_score: Optional[float] = None
    threshold_risk: float
    nearest_distance_km: Optional[float] = None
    nearest_iceberg_id: Optional[str] = None
    violated: bool
    source: str
    available: bool = True


class ConstraintBreakdown(BaseModel):
    model_config = {"protected_namespaces": ()}
    land: LandConstraint
    ice_shelf: IceShelfConstraint
    bathymetry: BathymetryConstraint
    sea_ice: SeaIceConstraint
    sea_state: SeaStateConstraint
    iceberg_core: IcebergCoreConstraint


class SoftFactorSummary(BaseModel):
    """
    Soft factors that penalize route choices in A*, but do NOT independently trigger NO-GO.
    """
    model_config = {"protected_namespaces": ()}
    total_risk_score: float
    dominant_risk_factor: str
    weather_risk: float
    current_risk: float
    uncertainty_risk: float


class SafetyEvaluation(BaseModel):
    """
    Complete safety evaluation for a single spatiotemporal cell.
    """
    model_config = {"protected_namespaces": ()}

    cell_id: str
    row: int = Field(..., ge=0, le=17)
    column: int = Field(..., ge=0, le=25)
    latitude: float
    longitude: float
    horizon_hours: float
    timestamp: str

    traversable: bool = Field(..., description="True if navigable; False if NO-GO or NOT_CLEARED")
    status: SafetyStatus = Field(..., description="TRAVERSABLE, NO_GO, or NOT_CLEARED")
    no_go_reasons: List[str] = Field(default_factory=list, description="Machine-readable codes for all triggered constraints")
    human_explanation: str = Field(..., description="Clear diagnostic summary for navigator")

    constraints: ConstraintBreakdown
    soft_factors: SoftFactorSummary
    provenance: Dict[str, Any] = Field(default_factory=dict)


class SafetyGridResponse(BaseModel):
    """
    Full 468-cell safety evaluation grid.
    """
    model_config = {"protected_namespaces": ()}

    reference_timestamp: str
    valid_timestamp: str
    horizon_hours: float
    grid_rows: int = REFERENCE_GRID_ROWS
    grid_columns: int = REFERENCE_GRID_COLS
    total_cells: int = REFERENCE_TOTAL_CELLS

    traversable_cell_count: int
    no_go_cell_count: int
    not_cleared_cell_count: int
    reason_distribution: Dict[str, int]

    config_used: SafetyConstraintConfig
    cells: List[SafetyEvaluation]
    metadata: Dict[str, Any] = Field(default_factory=dict)


# --- Core Safety Evaluation Engine ---

class SafetyConstraintEngine:
    """
    Evaluates physical hard safety constraints and data availability policies.
    """

    def __init__(self, config: Optional[SafetyConstraintConfig] = None):
        self.config = config or DEFAULT_SAFETY_CONFIG

    def evaluate_cell_safety(
        self,
        row: int,
        column: int,
        latitude: float,
        longitude: float,
        horizon_hours: float,
        timestamp: str,
        # Environmental inputs (can be provided directly or extracted from FusedRiskCell)
        is_land: Optional[bool] = None,
        is_ice_shelf: Optional[bool] = None,
        water_depth_meters: Optional[float] = None,
        sic_percent: Optional[float] = None,
        sic_source: str = "convlstm_model",
        sic_available: bool = True,
        wave_height_meters: Optional[float] = None,
        wave_source: str = "baseline",
        wave_available: bool = True,
        iceberg_risk: Optional[float] = None,
        iceberg_source: str = "gru_model",
        iceberg_available: bool = True,
        nearest_iceberg_id: Optional[str] = None,
        nearest_iceberg_dist_km: Optional[float] = None,
        # Soft factors
        total_risk: float = 0.0,
        dominant_factor: str = "None",
        weather_risk: float = 0.0,
        current_risk: float = 0.0,
        uncertainty_risk: float = 0.0,
        # Custom config overrides
        config_override: Optional[SafetyConstraintConfig] = None
    ) -> SafetyEvaluation:
        """
        Evaluates safety constraints for an individual cell coordinate and horizon.
        """
        cfg = config_override or self.config
        cell_id = f"safety_{row}_{column}_{int(horizon_hours)}h"

        no_go_reasons: List[str] = []
        explanation_clauses: List[str] = []
        is_insufficient_data = False

        # 1. LAND CONSTRAINT
        land_avail = is_land is not None
        land_violated = bool(is_land) if land_avail else False
        if land_violated:
            no_go_reasons.append("LAND")
            explanation_clauses.append("Continental Landmass barrier")
        land_c = LandConstraint(is_land=land_violated, violated=land_violated, available=land_avail)

        # 2. ICE SHELF CONSTRAINT
        shelf_avail = is_ice_shelf is not None
        shelf_violated = bool(is_ice_shelf) if shelf_avail else False
        if shelf_violated:
            no_go_reasons.append("ICE_SHELF")
            explanation_clauses.append("Permanent Ice Shelf Barrier")
        shelf_c = IceShelfConstraint(is_ice_shelf=shelf_violated, violated=shelf_violated, available=shelf_avail)

        # 3. BATHYMETRY DEPTH CONSTRAINT (Missing depth != infinite depth!)
        bathymetry_avail = water_depth_meters is not None
        bathymetry_violated = False
        if not bathymetry_avail:
            is_insufficient_data = True
            no_go_reasons.append("MISSING_BATHYMETRY_DATA")
            explanation_clauses.append("Bathymetry depth data missing/unverified")
        else:
            required_depth = cfg.required_water_depth_meters
            if water_depth_meters < required_depth:
                bathymetry_violated = True
                no_go_reasons.append("INSUFFICIENT_DEPTH")
                explanation_clauses.append(f"Under-clearance: depth {water_depth_meters:.1f}m < required {required_depth:.1f}m")

        bathy_c = BathymetryConstraint(
            water_depth_meters=water_depth_meters,
            required_depth_meters=cfg.required_water_depth_meters,
            violated=bathymetry_violated,
            available=bathymetry_avail
        )

        # 4. SEA ICE CONCENTRATION CONSTRAINT (Missing SIC != 0% ice!)
        sic_avail = (sic_percent is not None) and sic_available
        sic_violated = False
        if not sic_avail:
            is_insufficient_data = True
            no_go_reasons.append("MISSING_SIC_DATA")
            explanation_clauses.append("Sea-ice observation/forecast missing")
        else:
            if sic_percent > cfg.safe_sic_threshold_percent:
                sic_violated = True
                no_go_reasons.append("EXCESSIVE_SEA_ICE")
                explanation_clauses.append(f"SIC {sic_percent:.1f}% exceeds vessel limit {cfg.safe_sic_threshold_percent:.1f}%")

        sic_c = SeaIceConstraint(
            value_percent=sic_percent,
            threshold_percent=cfg.safe_sic_threshold_percent,
            violated=sic_violated,
            source=sic_source,
            available=sic_avail
        )

        # 5. SEA STATE / WAVE HEIGHT CONSTRAINT (Missing wave != calm sea!)
        wave_avail = (wave_height_meters is not None) and wave_available
        wave_violated = False
        if not wave_avail:
            is_insufficient_data = True
            no_go_reasons.append("MISSING_WAVE_DATA")
            explanation_clauses.append("Sea state / wave height data missing")
        else:
            severe_limit = cfg.severe_wave_limit_meters
            if wave_height_meters > severe_limit:
                wave_violated = True
                no_go_reasons.append("SEVERE_SEA_STATE")
                explanation_clauses.append(f"Wave height {wave_height_meters:.1f}m exceeds severe limit {severe_limit:.1f}m")

        wave_c = SeaStateConstraint(
            value_meters=wave_height_meters,
            threshold_meters=cfg.severe_wave_limit_meters,
            violated=wave_violated,
            source=wave_source,
            available=wave_avail
        )

        # 6. ICEBERG CORE HAZARD CONSTRAINT (Missing iceberg != safe ocean!)
        berg_avail = (iceberg_risk is not None) and iceberg_available
        berg_violated = False
        if not berg_avail:
            is_insufficient_data = True
            no_go_reasons.append("MISSING_ICEBERG_DATA")
            explanation_clauses.append("Iceberg tracking/forecast data missing")
        else:
            if iceberg_risk >= cfg.iceberg_core_risk_threshold:
                berg_violated = True
                no_go_reasons.append("ICEBERG_CORE_INTRUSION")
                dist_str = f" at {nearest_iceberg_dist_km:.1f}km" if nearest_iceberg_dist_km is not None else ""
                explanation_clauses.append(f"Direct intersection with iceberg core hazard ({iceberg_risk:.1f} >= {cfg.iceberg_core_risk_threshold:.1f}{dist_str})")

        berg_c = IcebergCoreConstraint(
            risk_score=iceberg_risk,
            threshold_risk=cfg.iceberg_core_risk_threshold,
            nearest_distance_km=nearest_iceberg_dist_km,
            nearest_iceberg_id=nearest_iceberg_id,
            violated=berg_violated,
            source=iceberg_source,
            available=berg_avail
        )

        # Status & Traversability Determination
        # A cell is TRAVERSABLE iff no hard constraint is violated AND all critical data is present
        has_hard_violation = (
            land_violated or shelf_violated or bathymetry_violated or
            sic_violated or wave_violated or berg_violated
        )

        if has_hard_violation:
            status: SafetyStatus = "NO_GO"
            traversable = False
        elif is_insufficient_data:
            status = "NOT_CLEARED"
            traversable = False
            no_go_reasons.insert(0, "NOT_CLEARED_INSUFFICIENT_DATA")
        else:
            status = "TRAVERSABLE"
            traversable = True

        # Human-Readable Explanation
        if traversable:
            explanation = f"TRAVERSABLE (Total Risk: {total_risk:.1f}). All physical safety boundaries satisfied."
            if total_risk >= 60.0:
                explanation += f" CAUTION: Soft factor '{dominant_factor}' elevated, but no hard constraint violated."
        elif status == "NO_GO":
            reasons_joined = "; ".join(explanation_clauses)
            explanation = f"NO-GO: {reasons_joined}. Navigation prohibited."
        else:
            reasons_joined = "; ".join(explanation_clauses)
            explanation = f"NOT CLEARED: Insufficient surveillance data ({reasons_joined}). Vessel transit prohibited pending sensor validation."

        constraints = ConstraintBreakdown(
            land=land_c,
            ice_shelf=shelf_c,
            bathymetry=bathy_c,
            sea_ice=sic_c,
            sea_state=wave_c,
            iceberg_core=berg_c
        )

        soft_factors = SoftFactorSummary(
            total_risk_score=total_risk,
            dominant_risk_factor=dominant_factor,
            weather_risk=weather_risk,
            current_risk=current_risk,
            uncertainty_risk=uncertainty_risk
        )

        provenance = {
            "sea_ice_source": sic_source,
            "wave_source": wave_source,
            "iceberg_source": iceberg_source,
            "bathymetry_source": "baseline_bathymetry",
            "geography_source": "baseline_geography"
        }

        return SafetyEvaluation(
            cell_id=cell_id,
            row=row,
            column=column,
            latitude=latitude,
            longitude=longitude,
            horizon_hours=horizon_hours,
            timestamp=timestamp,
            traversable=traversable,
            status=status,
            no_go_reasons=no_go_reasons,
            human_explanation=explanation,
            constraints=constraints,
            soft_factors=soft_factors,
            provenance=provenance
        )

    def evaluate_fused_cell(
        self,
        fused_cell: FusedRiskCell,
        config_override: Optional[SafetyConstraintConfig] = None
    ) -> SafetyEvaluation:
        """
        Evaluates safety constraints using an already calculated Phase 3 FusedRiskCell.
        """
        cfg = config_override or self.config
        lat = fused_cell.latitude
        lon = fused_cell.longitude
        h = fused_cell.horizon_hours

        # Re-derive physical values from baseline environment
        base_env = calculate_baseline_environment(lat, lon, h)

        # Determine effective SIC value
        sic_val = base_env["sic_percent"]
        sic_avail = True
        sic_source = fused_cell.provenance.sea_ice_source

        # Sea state wave height
        wave_val = base_env["wave_height_meters"]

        # Iceberg risk from fused cell
        berg_risk = fused_cell.breakdown.iceberg_risk
        berg_source = fused_cell.provenance.iceberg_source
        berg_id = fused_cell.provenance.nearest_iceberg_id
        berg_dist = fused_cell.provenance.nearest_iceberg_distance_km

        return self.evaluate_cell_safety(
            row=fused_cell.row,
            column=fused_cell.column,
            latitude=lat,
            longitude=lon,
            horizon_hours=h,
            timestamp=fused_cell.timestamp,
            is_land=base_env["is_land"],
            is_ice_shelf=base_env["is_ice_shelf"],
            water_depth_meters=base_env["water_depth_meters"],
            sic_percent=sic_val,
            sic_source=sic_source,
            sic_available=sic_avail,
            wave_height_meters=wave_val,
            wave_source="baseline",
            wave_available=True,
            iceberg_risk=berg_risk,
            iceberg_source=berg_source,
            iceberg_available=True,
            nearest_iceberg_id=berg_id,
            nearest_iceberg_dist_km=berg_dist,
            total_risk=fused_cell.total_risk,
            dominant_factor=fused_cell.dominant_risk_factor,
            weather_risk=fused_cell.breakdown.weather_risk,
            current_risk=fused_cell.breakdown.current_risk,
            uncertainty_risk=fused_cell.breakdown.uncertainty_risk,
            config_override=cfg
        )

    def evaluate_fused_grid(
        self,
        fused_grid: FusedRiskGridResponse,
        config_override: Optional[SafetyConstraintConfig] = None
    ) -> SafetyGridResponse:
        """
        Evaluates safety constraints across the full 468 cells of a FusedRiskGridResponse.
        """
        cfg = config_override or self.config
        evaluations: List[SafetyEvaluation] = []
        traversable_cnt = 0
        no_go_cnt = 0
        not_cleared_cnt = 0
        reason_dist: Dict[str, int] = {}

        for fc in fused_grid.cells:
            ev = self.evaluate_fused_cell(fc, config_override=cfg)
            evaluations.append(ev)

            if ev.status == "TRAVERSABLE":
                traversable_cnt += 1
            elif ev.status == "NO_GO":
                no_go_cnt += 1
            else:
                not_cleared_cnt += 1

            for r in ev.no_go_reasons:
                reason_dist[r] = reason_dist.get(r, 0) + 1

        return SafetyGridResponse(
            reference_timestamp=fused_grid.reference_timestamp,
            valid_timestamp=fused_grid.valid_timestamp,
            horizon_hours=fused_grid.horizon_hours,
            grid_rows=fused_grid.grid_rows,
            grid_columns=fused_grid.grid_columns,
            total_cells=fused_grid.total_cells,
            traversable_cell_count=traversable_cnt,
            no_go_cell_count=no_go_cnt,
            not_cleared_cell_count=not_cleared_cnt,
            reason_distribution=reason_dist,
            config_used=cfg,
            cells=evaluations,
            metadata={
                "phase": "PHASE_4_SAFETY_CONSTRAINT_LAYER",
                "evaluated_cells": len(evaluations)
            }
        )

    def evaluate_grid_for_horizon(
        self,
        horizon_hours: float = 6.0,
        reference_timestamp: Optional[str] = None,
        config_override: Optional[SafetyConstraintConfig] = None
    ) -> SafetyGridResponse:
        """
        Convenience pipeline: triggers Phase 3 Risk Fusion Grid generation for a given horizon,
        then evaluates safety constraints across all 468 cells.
        """
        import datetime
        ref_ts = reference_timestamp or datetime.datetime.now(datetime.timezone.utc).isoformat()
        cfg = config_override or self.config

        # Map safety config to vessel parameters for risk fusion
        vessel = VesselRiskParameters(
            draft_meters=cfg.vessel_draft_meters,
            safety_depth_margin_meters=cfg.under_keel_safety_margin_meters,
            safe_sic_threshold_percent=cfg.safe_sic_threshold_percent,
            iceberg_safety_buffer_km=cfg.iceberg_safety_buffer_km,
            max_safe_wave_height_meters=cfg.max_safe_wave_height_meters
        )

        fused_grid = risk_fusion_engine.fuse_from_raw_models(
            reference_timestamp=ref_ts,
            horizon_hours=horizon_hours,
            vessel=vessel
        )
        return self.evaluate_fused_grid(fused_grid, config_override=cfg)


# Global singleton instance
safety_constraint_engine = SafetyConstraintEngine()

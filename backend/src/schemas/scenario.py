"""
POLARIS: What-If Scenario Simulation & Decision Sensitivity Schemas (Phase 7).
Pydantic contracts for counterfactual environmental perturbations, baseline vs. scenario
comparisons, dynamic decision explanations, and parameter sensitivity sweeps.
"""

from enum import Enum
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel, Field

try:
    from src.schemas.multi_objective import (
        RouteOptimizationRequest,
        RouteOptimizationResponse,
        RouteCandidate,
        OptimizationWeights,
        FuelProxyParameters,
    )
except ImportError:
    from schemas.multi_objective import (
        RouteOptimizationRequest,
        RouteOptimizationResponse,
        RouteCandidate,
        OptimizationWeights,
        FuelProxyParameters,
    )


class ScenarioType(str, Enum):
    """Supported What-If counterfactual scenario types."""
    ICEBERG_DRIFT = "ICEBERG_DRIFT"
    SEA_ICE_INCREASE = "SEA_ICE_INCREASE"
    WEATHER_DETERIORATION = "WEATHER_DETERIORATION"
    ICEBERG_CLEARANCE = "ICEBERG_CLEARANCE"
    SAFETY_PRIORITY_CHANGE = "SAFETY_PRIORITY_CHANGE"
    EFFICIENCY_PRIORITY_CHANGE = "EFFICIENCY_PRIORITY_CHANGE"


class ScenarioParameters(BaseModel):
    """
    Configurable perturbation parameters for What-If scenario simulation.
    All parameters are optional and have sensible physical defaults.
    """
    model_config = {"protected_namespaces": ()}

    # Iceberg perturbation parameters
    iceberg_id: Optional[str] = Field(None, description="Target iceberg identifier (e.g., 'A23A', 'B-22') or nearest")
    iceberg_delta_lat: float = Field(0.0, description="Latitude shift in degrees (+ North, - South)")
    iceberg_delta_lon: float = Field(0.0, description="Longitude shift in degrees (+ East, - West)")
    iceberg_shift_km: float = Field(0.0, description="Radial distance shift in kilometers toward/away from corridor")
    uncertainty_multiplier: float = Field(1.0, ge=0.5, le=3.0, description="Scale factor on iceberg error radius")

    # Sea-ice perturbation parameters
    sic_increase_percent: float = Field(0.0, ge=-50.0, le=50.0, description="Additive change in sea-ice concentration percentage")
    sic_region_min_lat: Optional[float] = Field(None, description="Southern latitude boundary of affected zone")
    sic_region_max_lat: Optional[float] = Field(None, description="Northern latitude boundary of affected zone")
    sic_region_min_lon: Optional[float] = Field(None, description="Western longitude boundary of affected zone")
    sic_region_max_lon: Optional[float] = Field(None, description="Eastern longitude boundary of affected zone")

    # Weather perturbation parameters
    weather_risk_delta: float = Field(0.0, ge=-1.0, le=1.0, description="Additive delta applied to direct Weather MLP risk score [0, 1]")

    # Objective priority parameters
    weights_override: Optional[OptimizationWeights] = Field(None, description="Alternative objective weights for priority sensitivity")


class ScenarioComparison(BaseModel):
    """
    Rigorous mathematical differential comparison between Baseline and Scenario optimal recommendations.
    Every metric is calculated dynamically from runtime optimizer outputs.
    """
    model_config = {"protected_namespaces": ()}

    route_changed: bool = Field(..., description="True if the spatial cell sequence of the recommended route changed")
    recommendation_changed: bool = Field(..., description="True if a different profile candidate was selected as optimal")
    safety_status_changed: bool = Field(..., description="True if overall route feasibility changed")

    baseline_recommended_id: str
    scenario_recommended_id: str
    baseline_profile: str
    scenario_profile: str

    # Distance metrics
    baseline_distance_nm: float
    scenario_distance_nm: float
    distance_diff_nm: float
    distance_diff_percent: float

    baseline_distance_km: float
    scenario_distance_km: float
    distance_diff_km: float

    # Transit time metrics
    baseline_transit_hours: float
    scenario_transit_hours: float
    transit_time_diff_hours: float
    transit_time_diff_percent: float

    # Risk metrics
    baseline_average_risk: float
    scenario_average_risk: float
    average_risk_diff: float

    baseline_max_risk: float
    scenario_max_risk: float
    max_risk_diff: float

    baseline_weighted_risk_exposure: float
    scenario_weighted_risk_exposure: float
    weighted_risk_exposure_diff: float
    risk_exposure_change_percent: float

    # Iceberg clearance metrics
    baseline_iceberg_clearance_km: Optional[float] = None
    scenario_iceberg_clearance_km: Optional[float] = None
    iceberg_clearance_diff_km: Optional[float] = None

    # Sea-Ice metrics
    baseline_max_sic_percent: float
    scenario_max_sic_percent: float
    max_sic_diff_percent: float

    # Fuel-Use Proxy metrics
    baseline_fuel_proxy: float
    scenario_fuel_proxy: float
    fuel_proxy_diff: float
    fuel_proxy_diff_percent: float

    # Safety constraint cells differential
    newly_blocked_cells: List[Tuple[int, int]] = Field(default_factory=list, description="Cells that transitioned from traversable to NO-GO")
    newly_cleared_cells: List[Tuple[int, int]] = Field(default_factory=list, description="Cells that transitioned from NO-GO to traversable")


class ScenarioSimulateRequest(BaseModel):
    """
    Request model for counterfactual What-If scenario simulation.
    """
    model_config = {"protected_namespaces": ()}

    start_latitude: float = Field(..., ge=-90.0, le=90.0)
    start_longitude: float = Field(..., ge=-180.0, le=180.0)
    destination_latitude: float = Field(..., ge=-90.0, le=90.0)
    destination_longitude: float = Field(..., ge=-180.0, le=180.0)
    reference_timestamp: Optional[str] = None
    departure_delay_hours: float = Field(0.0, ge=0.0)
    nominal_speed_knots: float = Field(10.0, gt=0.0)
    allow_diagonal_moves: bool = Field(True)
    max_search_depth_steps: int = Field(50, ge=5, le=200)

    scenario_type: ScenarioType = Field(..., description="Counterfactual perturbation type")
    parameters: ScenarioParameters = Field(default_factory=ScenarioParameters)
    baseline_weights: Optional[OptimizationWeights] = None
    fuel_params: Optional[FuelProxyParameters] = None


class ScenarioSimulateResponse(BaseModel):
    """
    Complete response containing baseline optimization, perturbed scenario optimization,
    rigorous differential comparison, and dynamic runtime decision explanations.
    """
    model_config = {"protected_namespaces": ()}

    success: bool
    status_message: str
    scenario_type: ScenarioType
    parameters: ScenarioParameters

    baseline_optimization: RouteOptimizationResponse
    scenario_optimization: RouteOptimizationResponse

    comparison: Optional[ScenarioComparison] = None
    dynamic_decision_explanation: str = ""
    operational_recommendation: str = ""

    diagnostics: Dict[str, Any] = Field(default_factory=dict)


class SensitivityPoint(BaseModel):
    """Single evaluated step in a decision sensitivity parameter sweep."""
    model_config = {"protected_namespaces": ()}

    step_index: int
    parameter_value: float
    parameter_label: str
    recommended_route_id: str
    recommended_profile: str
    total_distance_nm: float
    total_transit_hours: float
    weighted_risk_exposure: float
    iceberg_clearance_km: Optional[float] = None
    max_sic_percent: float
    fuel_proxy: float
    route_changed_from_baseline: bool
    safety_status: str


class SensitivitySweepRequest(BaseModel):
    """Request to evaluate multiple incremental perturbation levels to discover decision boundaries."""
    model_config = {"protected_namespaces": ()}

    start_latitude: float = Field(..., ge=-90.0, le=90.0)
    start_longitude: float = Field(..., ge=-180.0, le=180.0)
    destination_latitude: float = Field(..., ge=-90.0, le=90.0)
    destination_longitude: float = Field(..., ge=-180.0, le=180.0)
    reference_timestamp: Optional[str] = None
    nominal_speed_knots: float = Field(10.0, gt=0.0)

    sweep_type: ScenarioType = Field(..., description="ICEBERG_DRIFT, SEA_ICE_INCREASE, or WEATHER_DETERIORATION")
    parameter_values: List[float] = Field(default_factory=list, description="Custom sweep steps, or empty for automatic defaults")


class SensitivitySweepResponse(BaseModel):
    """Response containing sweep progression, inflection points, and decision boundary analysis."""
    model_config = {"protected_namespaces": ()}

    success: bool
    sweep_type: ScenarioType
    parameter_name: str
    parameter_unit: str
    baseline_point: SensitivityPoint
    sweep_points: List[SensitivityPoint]
    inflection_points_found: int = 0
    decision_boundary_explanation: str = ""
    diagnostics: Dict[str, Any] = Field(default_factory=dict)

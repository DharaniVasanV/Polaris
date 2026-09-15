"""
POLARIS: Multi-Objective Route Optimization Schemas (Phase 6).
Pydantic contracts for multi-objective candidate generation, route metrics,
fuel-use proxy, Pareto dominance, and dynamic recommendation.
"""

from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field

try:
    from src.schemas.route import TimeAwareWaypoint, AStarSearchDiagnostics
except ImportError:
    from schemas.route import TimeAwareWaypoint, AStarSearchDiagnostics


ObjectiveProfile = Literal[
    "SAFETY_FIRST",
    "BALANCED",
    "EFFICIENCY_FIRST",
    "DIVERSE_ALTERNATIVE"
]


class OptimizationWeights(BaseModel):
    """
    Configurable weights for multi-objective decision ranking.
    Weights sum to 1.0.
    """
    model_config = {"protected_namespaces": ()}

    risk_weight: float = Field(0.40, ge=0.0, le=1.0, description="Weight on weighted risk exposure")
    distance_weight: float = Field(0.25, ge=0.0, le=1.0, description="Weight on transit distance")
    time_weight: float = Field(0.20, ge=0.0, le=1.0, description="Weight on transit time (hours)")
    fuel_weight: float = Field(0.15, ge=0.0, le=1.0, description="Weight on fuel-use proxy")


class FuelProxyParameters(BaseModel):
    """
    Configurable parameters for the prototype fuel-use proxy.
    NOTE: This is a decision-support heuristic index, NOT certified naval propulsion telemetry.
    Formula:
        fuel_proxy = base_rate * transit_hours * (1.0 + (avg_sic/100) * sic_factor + (avg_wave/10) * wave_factor)
    """
    model_config = {"protected_namespaces": ()}

    base_fuel_rate: float = Field(1.0, gt=0.0, description="Baseline fuel rate index per transit hour")
    sic_penalty_factor: float = Field(0.60, ge=0.0, description="Multiplicative penalty per unit sea-ice concentration fraction")
    wave_penalty_factor: float = Field(0.40, ge=0.0, description="Multiplicative penalty per 10m wave height")


class TradeOffComparison(BaseModel):
    """
    Relative trade-off metrics compared to the lowest-distance candidate.
    """
    model_config = {"protected_namespaces": ()}

    compared_with_route_id: str
    distance_diff_km: float = 0.0
    distance_diff_nm: float = 0.0
    distance_diff_percent: float = 0.0
    time_diff_hours: float = 0.0
    risk_reduction_percent: float = 0.0
    fuel_proxy_diff: float = 0.0


class RouteCandidate(BaseModel):
    """
    A single generated feasible route candidate with comprehensive metrics.
    """
    model_config = {"protected_namespaces": ()}

    route_id: str
    profile: ObjectiveProfile
    title: str
    description: str
    color: str
    status: Literal["RECOMMENDED", "AVAILABLE", "REJECTED", "APPROVED_BY_HUMAN"]
    waypoints: List[TimeAwareWaypoint] = Field(default_factory=list)

    # Physical Navigation Metrics
    total_distance_km: float = 0.0
    total_distance_nm: float = 0.0
    total_transit_hours: float = 0.0
    eta_utc: str

    # Environmental Risk Metrics
    average_risk: float = 0.0
    max_risk: float = 0.0
    weighted_risk_exposure: float = Field(0.0, description="Sum of segment_distance * (segment_risk / 100)")
    min_iceberg_clearance_km: Optional[float] = None
    max_sic_percent: float = 0.0
    average_sic_percent: float = 0.0
    no_go_cell_count: int = 0
    no_go_exposure: float = 0.0

    # Decision-Support Heuristic Indicators
    fuel_use_proxy: float = Field(0.0, description="Prototype fuel-use index (not certified consumption)")
    safety_status: Literal["TRAVERSABLE", "NO_GO", "NOT_CLEARED"] = "TRAVERSABLE"
    dominant_risk: str = "Sea Ice"
    objective_cost: float = 0.0
    decision_score: float = 0.0
    is_pareto_efficient: bool = True
    is_feasible: bool = True

    # Comparative Explanations
    tradeoff_vs_shortest: Optional[TradeOffComparison] = None
    dynamic_explanation: str = ""


class RouteOptimizationRequest(BaseModel):
    """
    Input parameters for multi-objective route generation.
    """
    model_config = {"protected_namespaces": ()}

    start_latitude: float = Field(..., ge=-90.0, le=90.0, description="Departure latitude")
    start_longitude: float = Field(..., ge=-180.0, le=180.0, description="Departure longitude")
    destination_latitude: float = Field(..., ge=-90.0, le=90.0, description="Destination latitude")
    destination_longitude: float = Field(..., ge=-180.0, le=180.0, description="Destination longitude")
    reference_timestamp: Optional[str] = Field(None, description="Departure timestamp ISO UTC")
    departure_delay_hours: float = Field(0.0, ge=0.0, description="Departure time offset in hours")
    nominal_speed_knots: float = Field(10.0, gt=0.0, description="Cruising speed in knots")
    allow_diagonal_moves: bool = Field(True, description="Enable 8-connected grid movement")
    max_search_depth_steps: int = Field(50, ge=5, le=200, description="Maximum graph search depth")
    weights: Optional[OptimizationWeights] = None
    fuel_params: Optional[FuelProxyParameters] = None


class RouteOptimizationResponse(BaseModel):
    """
    Complete response containing candidate routes deck, Pareto set, and dynamic recommendation.
    """
    model_config = {"protected_namespaces": ()}

    success: bool
    status_message: str
    departure_utc: str
    start_latitude: float
    start_longitude: float
    destination_latitude: float
    destination_longitude: float
    total_candidates: int = 0
    feasible_candidates: int = 0
    candidates: List[RouteCandidate] = Field(default_factory=list)
    pareto_candidate_ids: List[str] = Field(default_factory=list)
    recommended_route_id: Optional[str] = None
    recommendation_reason: str = ""
    optimization_config: Dict[str, Any] = Field(default_factory=dict)
    diagnostics: Dict[str, Any] = Field(default_factory=dict)

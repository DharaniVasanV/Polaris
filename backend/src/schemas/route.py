"""
POLARIS: Route & Pathfinding Schemas (Phase 5).
Pydantic contracts for Time-Aware A* pathfinding requests, responses,
waypoints, and search diagnostics.
"""

from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field


class RoutePoint(BaseModel):
    model_config = {"protected_namespaces": ()}

    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)


class TimeAwareWaypoint(BaseModel):
    model_config = {"protected_namespaces": ()}

    step_index: int = Field(..., ge=0)
    row: int = Field(..., ge=0, le=17)
    column: int = Field(..., ge=0, le=25)
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    horizon_hours: float = Field(..., ge=0.0)
    estimated_arrival_utc: str
    segment_distance_km: float = Field(..., ge=0.0)
    cumulative_distance_km: float = Field(..., ge=0.0)
    cumulative_distance_nm: float = Field(..., ge=0.0)
    segment_risk: float = Field(..., ge=0.0, le=100.0)
    risk_category: Literal["SAFE", "MODERATE", "HIGH", "CRITICAL"]
    dominant_risk_factor: str
    is_traversable: bool
    safety_status: Literal["TRAVERSABLE", "NO_GO", "NOT_CLEARED"]
    sic_percent: float = Field(0.0, ge=0.0, le=100.0)
    wave_height_meters: float = Field(0.0, ge=0.0)
    iceberg_risk: float = Field(0.0, ge=0.0, le=100.0)
    nearest_iceberg_id: Optional[str] = None
    nearest_iceberg_dist_km: Optional[float] = None


class AStarSearchDiagnostics(BaseModel):
    model_config = {"protected_namespaces": ()}

    algorithm: str = "Time-Aware A* (Spatiotemporal Graph Search)"
    nodes_expanded: int = Field(..., ge=0)
    nodes_generated: int = Field(..., ge=0)
    closed_set_size: int = Field(..., ge=0)
    open_list_peak_size: int = Field(..., ge=0)
    execution_time_ms: float = Field(..., ge=0.0)
    optimal_path_found: bool = True
    heuristic_type: str = "Admissible Geodesic Great-Circle Haversine Distance"
    risk_penalty_weight_lambda: float = Field(..., ge=0.0)


class AStarRouteRequest(BaseModel):
    model_config = {"protected_namespaces": ()}

    start_latitude: float = Field(..., ge=-90.0, le=90.0, description="Start latitude in decimal degrees")
    start_longitude: float = Field(..., ge=-180.0, le=180.0, description="Start longitude in decimal degrees")
    destination_latitude: float = Field(..., ge=-90.0, le=90.0, description="Destination latitude in decimal degrees")
    destination_longitude: float = Field(..., ge=-180.0, le=180.0, description="Destination longitude in decimal degrees")
    reference_timestamp: Optional[str] = Field(None, description="Departure time in ISO UTC format")
    departure_delay_hours: float = Field(0.0, ge=0.0, description="Departure time offset in hours")
    nominal_speed_knots: float = Field(10.0, gt=0.0, description="Vessel cruising speed in knots")
    risk_penalty_lambda: float = Field(2.0, ge=0.0, description="Soft risk penalty weight multiplier in cost function")
    allow_diagonal_moves: bool = Field(True, description="Enable 8-connected grid search (orthogonal + diagonal)")
    max_search_depth_steps: int = Field(50, ge=5, le=200, description="Maximum graph search depth limit")


class AStarRouteResponse(BaseModel):
    model_config = {"protected_namespaces": ()}

    success: bool
    status_message: str
    departure_utc: str
    arrival_utc: Optional[str] = None
    total_waypoints: int = 0
    total_distance_km: float = 0.0
    total_distance_nm: float = 0.0
    total_transit_hours: float = 0.0
    average_risk: float = 0.0
    max_risk: float = 0.0
    max_sic_percent: float = 0.0
    min_iceberg_clearance_km: Optional[float] = None
    waypoints: List[TimeAwareWaypoint] = Field(default_factory=list)
    diagnostics: Optional[AStarSearchDiagnostics] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

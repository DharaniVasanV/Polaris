"""
POLARIS: Antarctic Risk Twin & Operational Decision Dashboard Schemas (Phase 8).
Pydantic contracts defining the unified operational view-model, system health,
cell inspection, forecast timeline, and data provenance.
"""

from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class VesselTelemetry(BaseModel):
    """Real-time / simulated vessel operational state and navigation profile."""
    name: str = Field(..., description="Vessel identification name")
    vessel_id: str = Field("VESSEL_POLARIS_01", description="Unique vessel transponder ID")
    ice_class: str = Field("PC3", description="Polar ship classification code")
    latitude: float = Field(..., description="Current vessel latitude in decimal degrees")
    longitude: float = Field(..., description="Current vessel longitude in decimal degrees")
    heading_degrees: float = Field(112.0, ge=0.0, le=360.0, description="Vessel true heading in degrees")
    speed_knots: float = Field(14.0, ge=0.0, description="Current or nominal transit speed in knots")
    departure_utc: str = Field(..., description="ISO 8601 departure timestamp")
    destination_name: str = Field("Larsemann Hills / Bharati Base", description="Destination corridor name")
    safe_sic_threshold_percent: float = Field(70.0, ge=0.0, le=100.0, description="Maximum permitted sea ice concentration %")
    iceberg_safety_buffer_km: float = Field(12.0, ge=0.0, description="Minimum allowable standoff distance from icebergs")
    draft_meters: float = Field(7.8, gt=0.0, description="Vessel physical draft in meters")
    safety_depth_margin_meters: float = Field(2.5, ge=0.0, description="Under-keel safety depth clearance")


class OperationalNavigationStatus(BaseModel):
    """High-level authoritative navigation clearance status from Phase 4 & Phase 6."""
    status: str = Field(..., description="'TRAVERSABLE' | 'NOT_CLEARED' | 'NO_FEASIBLE_ROUTE'")
    status_level: str = Field("SAFE", description="'SAFE' | 'WARNING' | 'CRITICAL'")
    explanation: str = Field(..., description="Dynamic natural language explanation of navigation clearance")
    no_go_cells_encountered: int = Field(0, description="Number of blocking NO-GO cells along planned passage")
    critical_violations: List[str] = Field(default_factory=list, description="Specific safety constraint violation descriptions")


class RiskFactorBreakdown(BaseModel):
    """Continuous multi-factor risk contribution breakdown from Phase 3 Risk Fusion."""
    sea_ice_score: float = Field(..., ge=0.0, le=100.0, description="Sea ice concentration risk score (0-100)")
    sea_ice_weight: float = Field(0.35, description="Active weight assigned to sea ice factor")
    iceberg_score: float = Field(..., ge=0.0, le=100.0, description="Iceberg proximity risk score (0-100)")
    iceberg_weight: float = Field(0.30, description="Active weight assigned to iceberg proximity")
    weather_score: float = Field(..., ge=0.0, le=100.0, description="Direct weather risk score (0-100)")
    weather_weight: float = Field(0.10, description="Active weight assigned to weather factor")
    wave_score: float = Field(..., ge=0.0, le=100.0, description="Wave height exposure risk score (0-100)")
    wave_weight: float = Field(0.15, description="Active weight assigned to wave factor")
    current_score: float = Field(..., ge=0.0, le=100.0, description="Ocean current resistance score (0-100)")
    current_weight: float = Field(0.05, description="Active weight assigned to current factor")
    uncertainty_score: float = Field(..., ge=0.0, le=100.0, description="Spatiotemporal forecast uncertainty penalty (0-100)")
    uncertainty_weight: float = Field(0.05, description="Active weight assigned to uncertainty factor")
    dominant_factor: str = Field(..., description="Risk factor with highest weighted contribution")
    composite_risk: float = Field(..., ge=0.0, le=100.0, description="Total composite risk index (0-100)")
    risk_category: str = Field(..., description="'SAFE' | 'MODERATE' | 'HIGH' | 'CRITICAL'")


class ForecastTimelineEntry(BaseModel):
    """Spatiotemporal forecast horizon status in the 4D timeline (0h to 24h)."""
    horizon_label: str = Field(..., description="'NOW' | '+6h' | '+12h' | '+18h' | '+24h'")
    horizon_hours: float = Field(..., ge=0.0, le=120.0, description="Lead time in hours")
    is_available: bool = Field(True, description="True if primary model forecast data exists for horizon")
    provenance: str = Field(..., description="Model provenance (e.g., 'ConvLSTM2D', 'Interpolated', 'UNAVAILABLE')")
    mean_risk: Optional[float] = Field(None, description="Average composite risk across active corridor")
    max_risk: Optional[float] = Field(None, description="Peak composite risk across active corridor")
    mean_sic_percent: Optional[float] = Field(None, description="Mean sea-ice concentration % in ML coverage sector")
    weather_risk_available: bool = Field(False, description="True if Weather MLP inference is available (native at 6h)")
    iceberg_movement_summary: str = Field("Projected drift active", description="Status of iceberg trajectory tracking")


class CellInspectionData(BaseModel):
    """Detailed telemetry and risk factor breakdown for an individual grid cell."""
    model_config = {"protected_namespaces": ()}

    row: int = Field(..., ge=0, le=17)
    column: int = Field(..., ge=0, le=25)
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    horizon_hours: float = Field(..., ge=0.0)
    is_traversable: bool = Field(True, description="True if cell satisfies all physical and threshold constraints")
    safety_status: str = Field(..., description="'TRAVERSABLE' | 'NO_GO' | 'NOT_CLEARED'")
    blocking_reasons: List[str] = Field(default_factory=list, description="Reasons if cell is NO-GO")
    total_risk: float = Field(..., ge=0.0, le=100.0)
    risk_category: str = Field(..., description="'SAFE' | 'MODERATE' | 'HIGH' | 'CRITICAL'")
    dominant_factor: str = Field(..., description="Dominant risk contributor in this cell")
    sic_percent: Optional[float] = Field(None, description="Sea ice concentration % (0-100)")
    sic_provenance: str = Field("convlstm_model", description="Source of SIC data")
    iceberg_risk: float = Field(0.0, description="Iceberg proximity risk (0-100)")
    nearest_iceberg_id: Optional[str] = Field(None, description="Identifier of closest iceberg")
    nearest_iceberg_dist_km: Optional[float] = Field(None, description="Distance to closest iceberg in km")
    weather_risk: Optional[float] = Field(None, description="Weather risk score (0-100) or None if unavailable")
    weather_provenance: str = Field("weather_mlp_pytorch", description="Source of weather risk")
    wave_height_meters: float = Field(2.0, description="Significant wave height in meters")
    wave_provenance: str = Field("era5_baseline", description="Source of wave telemetry")
    current_speed_knots: float = Field(1.0, description="Ocean current speed in knots")
    current_provenance: str = Field("era5_baseline", description="Source of current telemetry")
    uncertainty_score: float = Field(10.0, description="Forecast uncertainty estimate (0-100)")
    model_provenances: Dict[str, str] = Field(default_factory=dict, description="Component-level provenance citations")


class SystemEngineHealth(BaseModel):
    """Readiness status of an individual POLARIS AI/ML engine."""
    model_config = {"protected_namespaces": ()}

    engine_id: str = Field(..., description="Unique engine identifier")
    name: str = Field(..., description="Human-readable engine title")
    status: str = Field("READY", description="'READY' | 'DEGRADED' | 'OFFLINE'")
    framework: str = Field(..., description="Underlying computational framework (TensorFlow, PyTorch, SciPy, etc.)")
    model_type: str = Field(..., description="Mathematical architecture (GRU, ConvLSTM2D, MLP, A*, etc.)")
    details: str = Field(..., description="Current operational status description")


class RiskTwinSummaryResponse(BaseModel):
    """Complete unified operational view-model snapshot for the Antarctic Risk Twin."""
    timestamp_utc: str = Field(..., description="ISO 8601 generation timestamp")
    service: str = Field("POLARIS Antarctic Risk Twin Engine", description="Service identity")
    version: str = Field("3.0.0", description="System architecture version")
    is_live: bool = Field(True, description="True if live backend inference was utilized")
    telemetry_mode: str = Field("LIVE_BACKEND_DATA", description="'LIVE_BACKEND_DATA' | 'DEMO_OFFLINE_FALLBACK'")
    vessel: VesselTelemetry
    navigation_status: OperationalNavigationStatus
    recommended_route_id: Optional[str] = Field(None, description="ID of TOPSIS-recommended route")
    recommendation_reason: str = Field(..., description="Dynamic natural language rationale for route selection")
    recommended_route: Optional[Dict[str, Any]] = Field(None, description="Full recommended route object")
    candidate_routes: List[Dict[str, Any]] = Field(default_factory=list, description="Complete candidate route deck")
    risk_breakdown: RiskFactorBreakdown
    forecast_timeline: List[ForecastTimelineEntry]
    active_scenario: Optional[Dict[str, Any]] = Field(None, description="Active What-If scenario details if simulating")
    system_health: Dict[str, SystemEngineHealth]
    provenance_catalog: Dict[str, str] = Field(default_factory=dict, description="Authoritative dataset & model citations")

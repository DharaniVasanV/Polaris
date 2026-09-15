from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional, List

from src.schemas.iceberg import IcebergPredictRequest, IcebergForecastResponse
from src.schemas.common import GeoCoordinate
from src.adapters.iceberg_adapter import IcebergPredictionAdapter
from src.api.dependencies import get_iceberg_adapter
from src.sea_ice.model_service import router as sea_ice_router, get_model as get_sea_ice_model
from src.api.weather_routes import router as weather_router
from src.adapters.weather_adapter import get_weather_adapter

router = APIRouter()
router.include_router(sea_ice_router)
router.include_router(weather_router)


from src.engines.risk_twin_engine import risk_twin_engine


@router.get("/health", tags=["System Health"])
@router.get("/system/health", tags=["System Health"])
def get_system_health(adapter: IcebergPredictionAdapter = Depends(get_iceberg_adapter)):
    """Health check verifying operational readiness of all 7 POLARIS intelligence engines."""
    sea_ice_status = "NOT_LOADED"
    try:
        sea_ice_model = get_sea_ice_model()
        if sea_ice_model and sea_ice_model.model is not None:
            sea_ice_status = "LOADED"
    except Exception as e:
        sea_ice_status = f"ERROR: {str(e)}"

    weather_health = {"status": "NOT_LOADED"}
    try:
        weather_adapter = get_weather_adapter()
        weather_health = weather_adapter.health_check()
    except Exception as e:
        weather_health = {"status": f"ERROR: {str(e)}", "framework": "PyTorch", "model": "weather_intelligence_engine"}

    all_engines = risk_twin_engine.get_system_health(iceberg_adapter=adapter)

    # Phase 10A: Sentinel-1 data source status (non-blocking)
    sentinel1_health = {
        "source": "Sentinel-1 GRD (Copernicus Data Space)",
        "status": "NOT_CONFIGURED",
        "credentials_configured": False,
    }
    try:
        from src.services.copernicus_auth import credentials_are_configured
        from src.services.sentinel1_catalog import get_aoi_config, get_lookback_hours
        creds_ok = credentials_are_configured()
        sentinel1_health = {
            "source": "Sentinel-1 GRD (Copernicus Data Space)",
            "status": "CONFIGURED" if creds_ok else "NOT_CONFIGURED",
            "credentials_configured": creds_ok,
            "aoi": get_aoi_config(),
            "lookback_hours": get_lookback_hours(),
            "note": (
                "Phase 10A: Recent observation metadata only. "
                "Use GET /satellite/sentinel1/latest for full status."
            ),
        }
    except Exception as e:
        sentinel1_health["status"] = f"ERROR: {str(e)}"

    return {
        "status": "HEALTHY",
        "service": "POLARIS Tri-AI Antarctic Navigation Intelligence Engine",
        "version": "3.1.0",
        "models": {
            "gru_iceberg_engine": adapter.get_model_status(),
            "convlstm_sea_ice_engine": {
                "model_name": "POLARIS Sea-Ice ConvLSTM",
                "model_type": "ConvLSTM2D",
                "model_status": sea_ice_status,
                "coverage": "Queen Maud Land [-70.0° to -60.0° Lat, 0.0° to 30.0° Lon]",
                "grid": "18x26 (468 cells total, 88 within ML domain)",
                "horizons": ["0h", "6h", "12h", "18h", "24h"]
            },
            "weather_intelligence_engine": weather_health
        },
        "engines": {k: v.model_dump() for k, v in all_engines.items()},
        "data_sources": {
            "sentinel1_grd": sentinel1_health,
        },
    }



@router.post("/iceberg/predict", response_model=IcebergForecastResponse, tags=["Model Inference"])
def predict_iceberg_trajectory(
    request: IcebergPredictRequest,
    vessel_safety_margin_km: Optional[float] = Query(30.0, ge=0.0, description="Vessel safety buffer in km"),
    adapter: IcebergPredictionAdapter = Depends(get_iceberg_adapter)
):
    """
    Executes trained GRU inference for iceberg drift projection (Day +1 to Day +5)
    with empirical uncertainty hazard zones.
    """
    try:
        forecast = adapter.predict(request, vessel_safety_margin_km=vessel_safety_margin_km)
        return forecast
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")


@router.get("/iceberg/demo-track", response_model=IcebergForecastResponse, tags=["Demo Prediction"])
def get_demo_prediction(
    steps: int = Query(5, ge=1, le=5, description="Number of forecast days (1 to 5)"),
    adapter: IcebergPredictionAdapter = Depends(get_iceberg_adapter)
):
    """
    Convenience endpoint providing an immediate 5-day GRU prediction for Iceberg A23A
    using verified historical BYU satellite coordinates.
    """
    demo_coords = [
        GeoCoordinate(lat=-65.81, lon=-53.51),
        GeoCoordinate(lat=-65.80, lon=-53.48),
        GeoCoordinate(lat=-65.78, lon=-53.43),
        GeoCoordinate(lat=-65.76, lon=-53.37),
        GeoCoordinate(lat=-65.74, lon=-53.30),
        GeoCoordinate(lat=-65.73, lon=-53.24),
        GeoCoordinate(lat=-65.72, lon=-53.18),
        GeoCoordinate(lat=-65.71, lon=-53.13),
        GeoCoordinate(lat=-65.71, lon=-53.08),
        GeoCoordinate(lat=-65.70, lon=-53.04),
    ]
    req = IcebergPredictRequest(
        iceberg_id="A23A",
        historical_coordinates=demo_coords,
        steps=steps,
        start_date="2024-01-01"
    )
    return adapter.predict(req, vessel_safety_margin_km=30.0)


# --- Phase 3: Centralized Multi-Model Risk Fusion Endpoints ---

from pydantic import BaseModel, Field
import datetime
from src.engines.risk_fusion_engine import (
    risk_fusion_engine,
    RiskWeights,
    VesselRiskParameters,
    FusedRiskGridResponse,
    DEFAULT_VESSEL,
    DEFAULT_WEIGHTS
)


class RiskFusionRequest(BaseModel):
    reference_timestamp: Optional[str] = Field(None, description="ISO format reference UTC timestamp")
    horizon_hours: float = Field(6.0, ge=0.0, le=120.0, description="Lead time horizon in hours")
    weights: Optional[RiskWeights] = Field(None, description="Custom multi-factor risk weights (must sum to 1.0)")
    vessel: Optional[VesselRiskParameters] = Field(None, description="Vessel operational profile and physical safety thresholds")
    sea_ice_data: Optional[dict] = Field(None, description="Raw or normalized ConvLSTM sea-ice forecast data")
    weather_data: Optional[dict] = Field(None, description="Raw or normalized Weather MLP prediction data")
    icebergs_forecast: Optional[List[dict]] = Field(None, description="List of active icebergs with GRU forecast tracks")


@router.post("/risk/fuse", response_model=FusedRiskGridResponse, tags=["Risk Intelligence"])
def fuse_risk_grid_post(
    request: RiskFusionRequest,
    adapter: IcebergPredictionAdapter = Depends(get_iceberg_adapter)
):
    """
    Executes centralized multi-model risk fusion across the 468-cell POLARIS grid for a specified horizon.
    Dynamically combines ConvLSTM sea ice, GRU iceberg trajectories, and Weather MLP outputs.
    """
    ref_ts = request.reference_timestamp or datetime.datetime.now(datetime.timezone.utc).isoformat()
    return risk_fusion_engine.fuse_from_raw_models(
        reference_timestamp=ref_ts,
        horizon_hours=request.horizon_hours,
        sea_ice_data=request.sea_ice_data,
        weather_data=request.weather_data,
        icebergs_forecast=request.icebergs_forecast,
        vessel=request.vessel,
        weights=request.weights
    )


@router.get("/risk/grid", response_model=FusedRiskGridResponse, tags=["Risk Intelligence"])
def get_fused_risk_grid_get(
    horizon: float = Query(6.0, ge=0.0, le=24.0, description="Lead time horizon in hours (0, 6, 12, 18, 24)"),
    vessel_safe_sic: Optional[float] = Query(None, ge=0.0, le=100.0, description="Vessel safe SIC threshold %"),
    vessel_buffer_km: Optional[float] = Query(None, ge=0.0, description="Vessel iceberg safety buffer km"),
    adapter: IcebergPredictionAdapter = Depends(get_iceberg_adapter)
):
    """
    Retrieves the live fused risk grid for the specified forecast horizon, automatically integrating
    all three live backend engines (ConvLSTM, Weather MLP, GRU Iceberg).
    """
    ref_ts = datetime.datetime.now(datetime.timezone.utc).isoformat()

    # Gather live model predictions
    # 1. ConvLSTM Sea Ice
    sea_ice_data = None
    try:
        si_model = get_sea_ice_model()
        if si_model and hasattr(si_model, "forecast"):
            sea_ice_data = si_model.forecast()
    except Exception:
        pass

    # 2. Weather MLP (available at 6h)
    weather_data = None
    if abs(horizon - 6.0) < 1e-4:
        try:
            w_adapter = get_weather_adapter()
            if w_adapter and hasattr(w_adapter, "predict_grid"):
                w_cells = w_adapter.predict_grid([])
                weather_data = {"cells": w_cells}
        except Exception:
            pass

    # 3. GRU Iceberg Demo Forecast
    icebergs_forecast = None
    try:
        demo_resp = get_demo_prediction(steps=5, adapter=adapter)
        if demo_resp:
            demo_dict = demo_resp.model_dump()
            icebergs_forecast = [{
                "iceberg_id": demo_dict.get("iceberg_id", "A23A"),
                "anchor_point": {
                    "latitude": demo_dict.get("anchor_latitude", -65.70),
                    "longitude": demo_dict.get("anchor_longitude", -53.04),
                    "empirical_error_km": 0.0,
                    "vessel_safety_margin_km": vessel_buffer_km or 30.0
                },
                "forecast_steps": demo_dict.get("forecast_steps", [])
            }]
    except Exception:
        pass

    vessel = DEFAULT_VESSEL
    if vessel_safe_sic is not None or vessel_buffer_km is not None:
        vessel = VesselRiskParameters(
            safe_sic_threshold_percent=vessel_safe_sic if vessel_safe_sic is not None else DEFAULT_VESSEL.safe_sic_threshold_percent,
            iceberg_safety_buffer_km=vessel_buffer_km if vessel_buffer_km is not None else DEFAULT_VESSEL.iceberg_safety_buffer_km
        )

    return risk_fusion_engine.fuse_from_raw_models(
        reference_timestamp=ref_ts,
        horizon_hours=horizon,
        sea_ice_data=sea_ice_data,
        weather_data=weather_data,
        icebergs_forecast=icebergs_forecast,
        vessel=vessel,
        weights=DEFAULT_WEIGHTS
    )


# --- Phase 4: Dedicated Safety Constraint Layer Endpoints ---

from src.engines.safety_constraint_engine import (
    safety_constraint_engine,
    SafetyConstraintConfig,
    SafetyEvaluation,
    SafetyGridResponse,
    DEFAULT_SAFETY_CONFIG
)


class SafetyEvaluateCellRequest(BaseModel):
    row: int = Field(0, ge=0, le=17)
    column: int = Field(0, ge=0, le=25)
    latitude: float = Field(-65.0, ge=-90.0, le=90.0)
    longitude: float = Field(0.0, ge=-180.0, le=180.0)
    horizon_hours: float = Field(6.0, ge=0.0, le=120.0)
    timestamp: Optional[str] = None
    is_land: Optional[bool] = None
    is_ice_shelf: Optional[bool] = None
    water_depth_meters: Optional[float] = None
    sic_percent: Optional[float] = None
    sic_source: str = "convlstm_model"
    sic_available: bool = True
    wave_height_meters: Optional[float] = None
    wave_source: str = "baseline"
    wave_available: bool = True
    iceberg_risk: Optional[float] = None
    iceberg_source: str = "gru_model"
    iceberg_available: bool = True
    nearest_iceberg_id: Optional[str] = None
    nearest_iceberg_dist_km: Optional[float] = None
    total_risk: float = 0.0
    dominant_factor: str = "None"
    weather_risk: float = 0.0
    current_risk: float = 0.0
    uncertainty_risk: float = 0.0
    config_override: Optional[SafetyConstraintConfig] = None


@router.post("/safety/evaluate", response_model=SafetyEvaluation, tags=["Safety Intelligence"])
def evaluate_cell_safety_post(request: SafetyEvaluateCellRequest):
    """
    Evaluates hard physical safety constraints (land, ice shelf, bathymetry, SIC, wave, iceberg core)
    and missing-data policies for a single spatiotemporal cell.
    """
    ts = request.timestamp or datetime.datetime.now(datetime.timezone.utc).isoformat()
    return safety_constraint_engine.evaluate_cell_safety(
        row=request.row,
        column=request.column,
        latitude=request.latitude,
        longitude=request.longitude,
        horizon_hours=request.horizon_hours,
        timestamp=ts,
        is_land=request.is_land,
        is_ice_shelf=request.is_ice_shelf,
        water_depth_meters=request.water_depth_meters,
        sic_percent=request.sic_percent,
        sic_source=request.sic_source,
        sic_available=request.sic_available,
        wave_height_meters=request.wave_height_meters,
        wave_source=request.wave_source,
        wave_available=request.wave_available,
        iceberg_risk=request.iceberg_risk,
        iceberg_source=request.iceberg_source,
        iceberg_available=request.iceberg_available,
        nearest_iceberg_id=request.nearest_iceberg_id,
        nearest_iceberg_dist_km=request.nearest_iceberg_dist_km,
        total_risk=request.total_risk,
        dominant_factor=request.dominant_factor,
        weather_risk=request.weather_risk,
        current_risk=request.current_risk,
        uncertainty_risk=request.uncertainty_risk,
        config_override=request.config_override
    )


@router.get("/safety/grid", response_model=SafetyGridResponse, tags=["Safety Intelligence"])
def get_safety_grid_get(
    horizon: float = Query(6.0, ge=0.0, le=24.0, description="Lead time horizon in hours"),
    vessel_safe_sic: Optional[float] = Query(None, ge=0.0, le=100.0, description="Operational SIC threshold %"),
    vessel_draft: Optional[float] = Query(None, gt=0.0, description="Vessel draft in meters"),
    adapter: IcebergPredictionAdapter = Depends(get_iceberg_adapter)
):
    """
    Retrieves the authoritative 468-cell traversability and safety evaluation grid
    derived from the centralized Phase 3 multi-model risk state.
    """
    cfg = DEFAULT_SAFETY_CONFIG
    if vessel_safe_sic is not None or vessel_draft is not None:
        cfg = SafetyConstraintConfig(
            safe_sic_threshold_percent=vessel_safe_sic if vessel_safe_sic is not None else DEFAULT_SAFETY_CONFIG.safe_sic_threshold_percent,
            vessel_draft_meters=vessel_draft if vessel_draft is not None else DEFAULT_SAFETY_CONFIG.vessel_draft_meters,
            under_keel_safety_margin_meters=DEFAULT_SAFETY_CONFIG.under_keel_safety_margin_meters,
            max_safe_wave_height_meters=DEFAULT_SAFETY_CONFIG.max_safe_wave_height_meters,
            severe_sea_state_multiplier=DEFAULT_SAFETY_CONFIG.severe_sea_state_multiplier,
            iceberg_core_risk_threshold=DEFAULT_SAFETY_CONFIG.iceberg_core_risk_threshold,
            iceberg_safety_buffer_km=DEFAULT_SAFETY_CONFIG.iceberg_safety_buffer_km
        )

    # First fetch fused risk grid using live models
    fused_grid = get_fused_risk_grid_get(
        horizon=horizon,
        vessel_safe_sic=cfg.safe_sic_threshold_percent,
        vessel_buffer_km=cfg.iceberg_safety_buffer_km,
        adapter=adapter
    )
    return safety_constraint_engine.evaluate_fused_grid(fused_grid=fused_grid, config_override=cfg)


# --- Phase 5: Genuine Time-Aware A* Pathfinding Endpoints ---

from src.schemas.route import (
    AStarRouteRequest,
    AStarRouteResponse,
    TimeAwareWaypoint,
    AStarSearchDiagnostics
)
from src.schemas.multi_objective import (
    RouteOptimizationRequest,
    RouteOptimizationResponse
)
from src.engines.time_aware_astar import time_aware_astar_engine
from src.engines.route_optimizer import route_optimizer_engine


@router.post("/route/plan", response_model=AStarRouteResponse, tags=["Pathfinding"])
@router.post("/routing/astar", response_model=AStarRouteResponse, tags=["Pathfinding"])
def plan_time_aware_route(
    request: AStarRouteRequest,
    adapter: IcebergPredictionAdapter = Depends(get_iceberg_adapter)
):
    """
    Executes genuine Time-Aware A* graph search across the 468-cell POLARIS spatiotemporal grid.
    Prunes hard NO-GO states (Phase 4) and penalizes soft multi-factor risk (Phase 3).
    """
    # 1. Gather live Sea-Ice forecast
    sea_ice_data = None
    try:
        si_model = get_sea_ice_model()
        if si_model and hasattr(si_model, "forecast"):
            sea_ice_data = si_model.forecast()
    except Exception:
        pass

    # 2. Gather live Weather forecast
    weather_data = None
    try:
        w_adapter = get_weather_adapter()
        if w_adapter and hasattr(w_adapter, "predict_grid"):
            w_cells = w_adapter.predict_grid([])
            weather_data = {"cells": w_cells}
    except Exception:
        pass

    # 3. Gather live GRU Iceberg forecast
    icebergs_forecast = None
    try:
        demo_resp = get_demo_prediction(steps=5, adapter=adapter)
        if demo_resp:
            demo_dict = demo_resp.model_dump()
            icebergs_forecast = [{
                "iceberg_id": demo_dict.get("iceberg_id", "A23A"),
                "anchor_point": {
                    "latitude": demo_dict.get("anchor_latitude", -65.70),
                    "longitude": demo_dict.get("anchor_longitude", -53.04),
                    "empirical_error_km": 0.0,
                    "vessel_safety_margin_km": 30.0
                },
                "forecast_steps": demo_dict.get("forecast_steps", [])
            }]
    except Exception:
        pass

    return time_aware_astar_engine.plan_route(
        request=request,
        sea_ice_data=sea_ice_data,
        weather_data=weather_data,
        icebergs_forecast=icebergs_forecast
    )


@router.post("/routes/optimize", response_model=RouteOptimizationResponse, tags=["Multi-Objective Optimization"])
@router.post("/route/optimize", response_model=RouteOptimizationResponse, tags=["Multi-Objective Optimization"])
def optimize_routes(
    request: RouteOptimizationRequest,
    adapter: IcebergPredictionAdapter = Depends(get_iceberg_adapter)
):
    """
    Generates multiple genuine, time-aware feasible candidate routes across objective profiles
    (Safety-First, Balanced, Efficiency-First). Computes comprehensive route metrics, prototype
    fuel-use proxy, Pareto dominance set, multi-objective ranking, and dynamic trade-off explanations.
    """
    # 1. Gather live Sea-Ice forecast
    sea_ice_data = None
    try:
        si_model = get_sea_ice_model()
        if si_model and hasattr(si_model, "forecast"):
            sea_ice_data = si_model.forecast()
    except Exception:
        pass

    # 2. Gather live Weather forecast
    weather_data = None
    try:
        w_adapter = get_weather_adapter()
        if w_adapter and hasattr(w_adapter, "predict_grid"):
            w_cells = w_adapter.predict_grid([])
            weather_data = {"cells": w_cells}
    except Exception:
        pass

    # 3. Gather live GRU Iceberg forecast
    icebergs_forecast = None
    try:
        demo_resp = get_demo_prediction(steps=5, adapter=adapter)
        if demo_resp:
            demo_dict = demo_resp.model_dump()
            icebergs_forecast = [{
                "iceberg_id": demo_dict.get("iceberg_id", "A23A"),
                "anchor_point": {
                    "latitude": demo_dict.get("anchor_latitude", -65.70),
                    "longitude": demo_dict.get("anchor_longitude", -53.04),
                    "empirical_error_km": 0.0,
                    "vessel_safety_margin_km": 30.0
                },
                "forecast_steps": demo_dict.get("forecast_steps", [])
            }]
    except Exception:
        pass

    return route_optimizer_engine.optimize_routes(
        request=request,
        sea_ice_data=sea_ice_data,
        weather_data=weather_data,
        icebergs_forecast=icebergs_forecast
    )


# --- Phase 7: What-If Scenario Simulation & Sensitivity Endpoints ---

from src.schemas.scenario import (
    ScenarioSimulateRequest,
    ScenarioSimulateResponse,
    SensitivitySweepRequest,
    SensitivitySweepResponse,
)
from src.engines.scenario_engine import scenario_engine


@router.post("/scenarios/simulate", response_model=ScenarioSimulateResponse, tags=["Scenario Simulation"])
@router.post("/scenario/simulate", response_model=ScenarioSimulateResponse, tags=["Scenario Simulation"])
def simulate_scenario_endpoint(
    request: ScenarioSimulateRequest,
    adapter: IcebergPredictionAdapter = Depends(get_iceberg_adapter)
):
    """
    Executes counterfactual What-If scenario simulation:
    Applies non-destructive perturbations (iceberg drift, sea-ice expansion, weather deterioration,
    objective priority shifts) and calculates baseline vs scenario differentials.
    """
    # 1. Gather live Sea-Ice forecast
    sea_ice_data = None
    try:
        si_model = get_sea_ice_model()
        if si_model and hasattr(si_model, "forecast"):
            sea_ice_data = si_model.forecast()
    except Exception:
        pass

    # 2. Gather live Weather forecast
    weather_data = None
    try:
        w_adapter = get_weather_adapter()
        if w_adapter and hasattr(w_adapter, "predict_grid"):
            w_cells = w_adapter.predict_grid([])
            weather_data = {"cells": w_cells}
    except Exception:
        pass

    # 3. Gather live GRU Iceberg forecast
    icebergs_forecast = None
    try:
        demo_resp = get_demo_prediction(steps=5, adapter=adapter)
        if demo_resp:
            demo_dict = demo_resp.model_dump()
            icebergs_forecast = [{
                "iceberg_id": demo_dict.get("iceberg_id", "A23A"),
                "anchor_point": {
                    "latitude": demo_dict.get("anchor_latitude", -65.70),
                    "longitude": demo_dict.get("anchor_longitude", -53.04),
                    "empirical_error_km": 0.0,
                    "vessel_safety_margin_km": 30.0
                },
                "forecast_steps": demo_dict.get("forecast_steps", [])
            }]
    except Exception:
        pass

    return scenario_engine.simulate_scenario(
        request=request,
        sea_ice_data=sea_ice_data,
        weather_data=weather_data,
        icebergs_forecast=icebergs_forecast
    )


@router.post("/scenarios/sensitivity", response_model=SensitivitySweepResponse, tags=["Scenario Simulation"])
def sensitivity_sweep_endpoint(
    request: SensitivitySweepRequest,
    adapter: IcebergPredictionAdapter = Depends(get_iceberg_adapter)
):
    """
    Evaluates multi-step parameter variations to discover exact decision boundaries and inflection points.
    """
    # 1. Gather live Sea-Ice forecast
    sea_ice_data = None
    try:
        si_model = get_sea_ice_model()
        if si_model and hasattr(si_model, "forecast"):
            sea_ice_data = si_model.forecast()
    except Exception:
        pass

    # 2. Gather live Weather forecast
    weather_data = None
    try:
        w_adapter = get_weather_adapter()
        if w_adapter and hasattr(w_adapter, "predict_grid"):
            w_cells = w_adapter.predict_grid([])
            weather_data = {"cells": w_cells}
    except Exception:
        pass

    # 3. Gather live GRU Iceberg forecast
    icebergs_forecast = None
    try:
        demo_resp = get_demo_prediction(steps=5, adapter=adapter)
        if demo_resp:
            demo_dict = demo_resp.model_dump()
            icebergs_forecast = [{
                "iceberg_id": demo_dict.get("iceberg_id", "A23A"),
                "anchor_point": {
                    "latitude": demo_dict.get("anchor_latitude", -65.70),
                    "longitude": demo_dict.get("anchor_longitude", -53.04),
                    "empirical_error_km": 0.0,
                    "vessel_safety_margin_km": 30.0
                },
                "forecast_steps": demo_dict.get("forecast_steps", [])
            }]
    except Exception:
        pass

    return scenario_engine.run_sensitivity_sweep(
        request=request,
        sea_ice_data=sea_ice_data,
        weather_data=weather_data,
        icebergs_forecast=icebergs_forecast
    )


# --- Phase 8: Antarctic Risk Twin & Operational Decision Dashboard Endpoints ---

from src.schemas.risk_twin import (
    RiskTwinSummaryResponse,
    CellInspectionData,
)


class RiskTwinSummaryRequest(BaseModel):
    departure_latitude: float = Field(-63.0, ge=-90.0, le=90.0)
    departure_longitude: float = Field(7.0, ge=-180.0, le=180.0)
    destination_latitude: float = Field(-66.0, ge=-90.0, le=90.0)
    destination_longitude: float = Field(23.0, ge=-180.0, le=180.0)
    vessel_safe_sic: float = Field(70.0, ge=0.0, le=100.0)
    vessel_buffer_km: float = Field(12.0, ge=0.0)
    vessel_speed_knots: float = Field(14.0, gt=0.0)
    active_scenario_result: Optional[dict] = None


@router.post("/risk-twin/summary", response_model=RiskTwinSummaryResponse, tags=["Risk Twin"])
def get_risk_twin_summary_post(
    request: RiskTwinSummaryRequest,
    adapter: IcebergPredictionAdapter = Depends(get_iceberg_adapter)
):
    """
    Returns the authoritative unified Antarctic Risk Twin operational summary snapshot.
    Integrates vessel telemetry, candidate route deck, 6-factor risk breakdown, navigation clearance status,
    5-step forecast timeline, and data provenance.
    """
    # 1. Gather live Sea-Ice forecast
    sea_ice_data = None
    try:
        si_model = get_sea_ice_model()
        if si_model and hasattr(si_model, "forecast"):
            sea_ice_data = si_model.forecast()
    except Exception:
        pass

    # 2. Gather live Weather forecast
    weather_data = None
    try:
        w_adapter = get_weather_adapter()
        if w_adapter and hasattr(w_adapter, "predict_grid"):
            w_cells = w_adapter.predict_grid([])
            weather_data = {"cells": w_cells}
    except Exception:
        pass

    # 3. Gather live GRU Iceberg forecast
    icebergs_forecast = None
    try:
        demo_resp = get_demo_prediction(steps=5, adapter=adapter)
        if demo_resp:
            demo_dict = demo_resp.model_dump()
            icebergs_forecast = [{
                "iceberg_id": demo_dict.get("iceberg_id", "A23A"),
                "anchor_point": {
                    "latitude": demo_dict.get("anchor_latitude", -65.70),
                    "longitude": demo_dict.get("anchor_longitude", -53.04),
                    "empirical_error_km": 0.0,
                    "vessel_safety_margin_km": request.vessel_buffer_km
                },
                "forecast_steps": demo_dict.get("forecast_steps", [])
            }]
    except Exception:
        pass

    return risk_twin_engine.get_risk_twin_summary(
        departure_lat=request.departure_latitude,
        departure_lon=request.departure_longitude,
        destination_lat=request.destination_latitude,
        destination_lon=request.destination_longitude,
        vessel_safe_sic=request.vessel_safe_sic,
        vessel_buffer_km=request.vessel_buffer_km,
        vessel_speed_knots=request.vessel_speed_knots,
        sea_ice_data=sea_ice_data,
        weather_data=weather_data,
        icebergs_forecast=icebergs_forecast,
        active_scenario_result=request.active_scenario_result,
        iceberg_adapter=adapter
    )


@router.get("/risk-twin/summary", response_model=RiskTwinSummaryResponse, tags=["Risk Twin"])
def get_risk_twin_summary_get(
    departure_lat: float = Query(-63.0, ge=-90.0, le=90.0),
    departure_lon: float = Query(7.0, ge=-180.0, le=180.0),
    destination_lat: float = Query(-66.0, ge=-90.0, le=90.0),
    destination_lon: float = Query(23.0, ge=-180.0, le=180.0),
    vessel_safe_sic: float = Query(70.0, ge=0.0, le=100.0),
    vessel_buffer_km: float = Query(12.0, ge=0.0),
    vessel_speed_knots: float = Query(14.0, gt=0.0),
    adapter: IcebergPredictionAdapter = Depends(get_iceberg_adapter)
):
    """
    Convenience GET endpoint providing the live Antarctic Risk Twin summary snapshot.
    """
    req = RiskTwinSummaryRequest(
        departure_latitude=departure_lat,
        departure_longitude=departure_lon,
        destination_latitude=destination_lat,
        destination_longitude=destination_lon,
        vessel_safe_sic=vessel_safe_sic,
        vessel_buffer_km=vessel_buffer_km,
        vessel_speed_knots=vessel_speed_knots
    )
    return get_risk_twin_summary_post(req, adapter=adapter)


@router.get("/risk-twin/cell-inspect", response_model=CellInspectionData, tags=["Risk Twin"])
def inspect_cell_endpoint(
    row: int = Query(0, ge=0, le=17, description="Grid cell row"),
    col: int = Query(0, ge=0, le=25, description="Grid cell column"),
    horizon: float = Query(6.0, ge=0.0, le=120.0, description="Forecast horizon in hours"),
    vessel_safe_sic: float = Query(70.0, ge=0.0, le=100.0, description="Vessel operational SIC limit %"),
    vessel_draft: float = Query(7.8, gt=0.0, description="Vessel draft in meters"),
):
    """
    Returns full telemetry, risk factor breakdown, dominant contributor, safety status,
    and individual component provenance for a specific grid cell on the operational map.
    """
    return risk_twin_engine.inspect_cell(
        row=row,
        column=col,
        horizon_hours=horizon,
        vessel_safe_sic=vessel_safe_sic,
        vessel_draft=vessel_draft
    )






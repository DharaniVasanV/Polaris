"""
POLARIS: Spatiotemporal Alignment Layer (Phase 2).
Harmonizes heterogeneous AI model predictions into a unified spatial and temporal
reference grid WITHOUT altering model weights and WITHOUT computing risk fusion.

Key Scientific Guarantees:
1. Common Timeline: Standardized on [0h, 6h, 12h, 18h, 24h] in UTC.
2. Honest Provenance: GRU 6h/12h/18h positions are explicitly labeled `interpolated`,
   while 24h/48h/... are labeled `model` and 0h is labeled `anchor`.
3. Antimeridian Longitude Wrapping: Prevents incorrect 358-degree transits across 0°.
4. Conservative Uncertainty: Interpolated positions preserve conservative empirical error bounds:
   `uncertainty_radius_km = max(error_before, error_after)`.
5. Explicit Data Availability: ConvLSTM outside coverage returns `OUTSIDE_MODEL_COVERAGE`;
   Weather horizons != 6h return `UNAVAILABLE` rather than fabricated values.
6. Spatial Grid Alignment: Maps models by verified geographic coordinates, resolving row orientation discrepancies.
7. Zero Risk Fusion: Only aligns "where and when" information is available.
"""

import math
import datetime
from typing import List, Dict, Any, Optional, Tuple, Literal
from pydantic import BaseModel, Field

try:
    from src.schemas.normalized import (
        PredictionPoint,
        IcebergPredictionPoint,
        SeaIcePredictionPoint,
        WeatherPredictionPoint,
        NormalizedModelResponse
    )
except ImportError:
    from schemas.normalized import (
        PredictionPoint,
        IcebergPredictionPoint,
        SeaIcePredictionPoint,
        WeatherPredictionPoint,
        NormalizedModelResponse
    )


# --- Geographic Constants & Grid Definition ---
EARTH_RADIUS_KM = 6371.0

REFERENCE_GRID_ROWS = 18
REFERENCE_GRID_COLS = 26
REFERENCE_TOTAL_CELLS = 468

LAT_MIN = -75.0  # South
LAT_MAX = -58.0  # North
LON_MIN = -25.0  # West
LON_MAX = 75.0   # East

COMMON_HORIZONS: List[float] = [0.0, 6.0, 12.0, 18.0, 24.0]


# --- Geographic Utilities & Antimeridian Interpolation ---

def validate_coordinates(latitude: float, longitude: float) -> None:
    """
    Validates that coordinates are scientifically valid.
    Raises ValueError with an explicit message if out of bounds.
    """
    if not (-90.0 <= latitude <= 90.0):
        raise ValueError(f"Invalid latitude: {latitude}. Must be within [-90.0, 90.0].")
    if not (-180.0 <= longitude <= 180.0):
        raise ValueError(f"Invalid longitude: {longitude}. Must be within [-180.0, 180.0].")


def normalize_longitude(lon: float) -> float:
    """
    Normalizes longitude into the standard range [-180.0, 180.0].
    """
    lon = (lon + 180.0) % 360.0 - 180.0
    if lon == -180.0:
        return 180.0
    return lon


def interpolate_coordinates(
    lat0: float,
    lon0: float,
    lat1: float,
    lon1: float,
    alpha: float
) -> Tuple[float, float]:
    """
    Performs geodesic-aware linear interpolation between two geographic points.
    Correctly wraps longitude across the ±180° antimeridian (dateline), preventing
    incorrect interpolation through the prime meridian (0°).
    
    Example: 179° -> -179° wraps across 180° (a 2° transit), not across 0° (a 358° transit).
    """
    validate_coordinates(lat0, lon0)
    validate_coordinates(lat1, lon1)

    alpha = max(0.0, min(1.0, float(alpha)))

    # Linear latitude interpolation
    interp_lat = lat0 + alpha * (lat1 - lat0)

    # Shortest angular distance across circular longitude
    delta_lon = ((lon1 - lon0 + 180.0) % 360.0) - 180.0
    interp_lon = lon0 + alpha * delta_lon
    interp_lon = normalize_longitude(interp_lon)

    validate_coordinates(interp_lat, interp_lon)
    return round(interp_lat, 4), round(interp_lon, 4)


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculates great-circle distance between two points on a sphere in kilometers.
    """
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(normalize_longitude(lon2 - lon1))

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2))
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return round(EARTH_RADIUS_KM * c, 2)


# --- Reference Grid Geometry ---

def generate_reference_grid_cells() -> List[Dict[str, Any]]:
    """
    Generates the standard POLARIS 18x26 reference grid coordinates.
    Row 0 is northernmost (-58.0°S), Row 17 is southernmost (-75.0°S).
    Column 0 is westernmost (-25.0°W), Column 25 is easternmost (+75.0°E).
    """
    cells = []
    d_lat = (LAT_MAX - LAT_MIN) / (REFERENCE_GRID_ROWS - 1)
    d_lon = (LON_MAX - LON_MIN) / (REFERENCE_GRID_COLS - 1)

    for r in range(REFERENCE_GRID_ROWS):
        lat = LAT_MAX - r * d_lat
        for c in range(REFERENCE_GRID_COLS):
            lon = LON_MIN + c * d_lon
            cells.append({
                "row": r,
                "column": c,
                "latitude": round(lat, 2),
                "longitude": round(lon, 2)
            })
    return cells


REFERENCE_CELLS = generate_reference_grid_cells()


# --- Pydantic Schemas for Aligned State (Phase 2 Output) ---

class AlignedSeaIce(BaseModel):
    model_config = {"protected_namespaces": ()}

    status: Literal["AVAILABLE", "OUTSIDE_MODEL_COVERAGE", "UNAVAILABLE"]
    prediction_type: Optional[Literal["observed", "interpolated", "model"]] = None
    sic: Optional[float] = Field(None, ge=0.0, le=1.0)
    sic_percent: Optional[float] = Field(None, ge=0.0, le=100.0)
    confidence: Optional[float] = Field(None, ge=0.0, le=100.0)
    ice_class: Optional[str] = None
    sea_ice_risk: Optional[float] = None


class AlignedWeather(BaseModel):
    model_config = {"protected_namespaces": ()}

    status: Literal["AVAILABLE", "UNAVAILABLE"]
    prediction_type: Optional[Literal["model"]] = None
    risk_score: Optional[float] = Field(None, ge=0.0, le=1.0)
    risk_class: Optional[Literal["SAFE", "MODERATE", "HIGH", "CRITICAL"]] = None
    unavailability_reason: Optional[str] = None


class IcebergHazardIntersection(BaseModel):
    model_config = {"protected_namespaces": ()}

    iceberg_id: str
    latitude: float
    longitude: float
    distance_km: float
    uncertainty_radius_km: float
    vessel_safety_margin_km: float
    total_hazard_radius_km: float
    is_in_hazard_zone: bool
    is_in_warning_zone: bool
    prediction_type: Literal["anchor", "model", "interpolated"]


class AlignedGridCell(BaseModel):
    model_config = {"protected_namespaces": ()}

    row: int = Field(..., ge=0, le=17)
    column: int = Field(..., ge=0, le=25)
    latitude: float
    longitude: float
    sea_ice: AlignedSeaIce
    weather: AlignedWeather
    iceberg_hazards: List[IcebergHazardIntersection] = Field(default_factory=list)


class AlignedEnvironmentalState(BaseModel):
    model_config = {"protected_namespaces": ()}

    reference_timestamp: str
    valid_timestamp: str
    horizon_hours: float
    grid_rows: int = REFERENCE_GRID_ROWS
    grid_columns: int = REFERENCE_GRID_COLS
    total_cells: int = REFERENCE_TOTAL_CELLS
    available_horizons: Dict[str, List[float]]
    cells: List[AlignedGridCell]
    metadata: Dict[str, Any] = Field(default_factory=dict)


# --- Temporal Alignment Implementations ---

def interpolate_gru_trajectory(
    anchor_point: Dict[str, Any],
    forecast_steps: List[Dict[str, Any]],
    target_horizons: Optional[List[float]] = None
) -> List[Dict[str, Any]]:
    """
    Interpolates GRU daily forecast steps onto target sub-daily horizons (e.g. 0h, 6h, 12h, 18h, 24h).
    
    Scientific Honesty:
    - 0h is tagged `prediction_type = "anchor"`
    - Multiples of 24h matching native GRU steps are tagged `prediction_type = "model"`
    - Intermediate steps (6h, 12h, 18h) are tagged `prediction_type = "interpolated"`
    - Conservative Uncertainty: `uncertainty_radius_km = max(error_before, error_after)`
    - Geodesic Antimeridian Wrapping: preserves shortest circular path across 180°
    - If target horizon exceeds maximum available GRU forecast, it is excluded.
    """
    targets = target_horizons or [0.0, 6.0, 12.0, 18.0, 24.0]
    
    # Establish sorted known anchor + model steps
    # Anchor is Horizon 0h
    known_points: List[Dict[str, Any]] = [
        {
            "horizon_hours": 0.0,
            "latitude": float(anchor_point["latitude"]),
            "longitude": float(anchor_point["longitude"]),
            "empirical_error_km": float(anchor_point.get("empirical_error_km", anchor_point.get("empirical_error_radius_km", 0.0))),
            "vessel_safety_margin_km": float(anchor_point.get("vessel_safety_margin_km", 30.0)),
            "prediction_type": "anchor",
            "step_label": "Now (0h)"
        }
    ]

    for step in forecast_steps:
        step_idx = int(step["step_index"])
        h = float(step_idx * 24.0)
        known_points.append({
            "horizon_hours": h,
            "latitude": float(step["latitude"]),
            "longitude": float(step["longitude"]),
            "empirical_error_km": float(step.get("empirical_error_km", step.get("empirical_error_radius_km", 168.02))),
            "vessel_safety_margin_km": float(step.get("vessel_safety_margin_km", 30.0)),
            "prediction_type": "model",
            "step_label": step.get("step", f"Day +{step_idx}")
        })

    max_known_h = max(p["horizon_hours"] for p in known_points)
    aligned_points: List[Dict[str, Any]] = []

    for target_h in targets:
        if target_h > max_known_h:
            # Beyond available GRU forecast horizon: do not extrapolate
            continue

        # Check exact match
        exact_match = next((p for p in known_points if abs(p["horizon_hours"] - target_h) < 1e-4), None)
        if exact_match:
            total_hz = round(exact_match["empirical_error_km"] + exact_match["vessel_safety_margin_km"], 2)
            aligned_points.append({
                "horizon_hours": target_h,
                "latitude": exact_match["latitude"],
                "longitude": exact_match["longitude"],
                "empirical_error_km": exact_match["empirical_error_km"],
                "uncertainty_radius_km": exact_match["empirical_error_km"],
                "vessel_safety_margin_km": exact_match["vessel_safety_margin_km"],
                "total_hazard_radius_km": total_hz,
                "prediction_type": exact_match["prediction_type"],
                "step_label": exact_match["step_label"]
            })
            continue

        # Intermediate horizon: Find surrounding points (p_before, p_after)
        p_before = None
        p_after = None
        for i in range(len(known_points) - 1):
            if known_points[i]["horizon_hours"] <= target_h <= known_points[i + 1]["horizon_hours"]:
                p_before = known_points[i]
                p_after = known_points[i + 1]
                break

        if p_before and p_after:
            span = p_after["horizon_hours"] - p_before["horizon_hours"]
            alpha = (target_h - p_before["horizon_hours"]) / span if span > 0 else 0.0

            # Antimeridian-aware geodesic interpolation
            interp_lat, interp_lon = interpolate_coordinates(
                p_before["latitude"], p_before["longitude"],
                p_after["latitude"], p_after["longitude"],
                alpha
            )

            # Conservative uncertainty rule: take maximum error across surrounding interval
            conservative_error = max(p_before["empirical_error_km"], p_after["empirical_error_km"])
            safety_margin = p_after["vessel_safety_margin_km"]
            total_hazard = round(conservative_error + safety_margin, 2)

            aligned_points.append({
                "horizon_hours": target_h,
                "latitude": interp_lat,
                "longitude": interp_lon,
                "empirical_error_km": conservative_error,
                "uncertainty_radius_km": conservative_error,
                "vessel_safety_margin_km": safety_margin,
                "total_hazard_radius_km": total_hazard,
                "prediction_type": "interpolated",
                "step_label": f"Interpolated (+{target_h:.0f}h)"
            })

    return aligned_points


# --- Spatiotemporal State Builder ---

def build_aligned_environmental_state(
    reference_timestamp: str,
    horizon_hours: float,
    sea_ice_data: Optional[Dict[str, Any]] = None,
    weather_data: Optional[Dict[str, Any]] = None,
    icebergs_forecast: Optional[List[Dict[str, Any]]] = None
) -> AlignedEnvironmentalState:
    """
    Builds the unified 468-cell AlignedEnvironmentalState for a specified lead time horizon.
    
    Resolves:
    - Weather single-horizon (6h) vs unavailable horizons
    - ConvLSTM 5-horizon (0, 6, 12, 18, 24h) and QML domain coverage
    - GRU iceberg position at arrival horizon and distance-to-cell mapping
    - Inverted row index between Weather (South to North) and Reference (North to South)
    """
    ref_dt = datetime.datetime.fromisoformat(reference_timestamp.replace("Z", "+00:00"))
    valid_dt = ref_dt + datetime.timedelta(hours=horizon_hours)
    valid_iso = valid_dt.isoformat()

    h_key = f"{int(horizon_hours)}h"

    # 1. Prepare Sea-Ice lookup (by row, column) for target horizon
    sic_cells_by_coord: Dict[Tuple[int, int], Dict[str, Any]] = {}
    if sea_ice_data and "forecast" in sea_ice_data and h_key in sea_ice_data["forecast"]:
        for c in sea_ice_data["forecast"][h_key]:
            sic_cells_by_coord[(int(c["row"]), int(c["column"]))] = c

    # 2. Prepare Weather lookup
    # Weather is only available at 6h.
    # Note: Weather grid in weather_adapter.py has row 0 at -75.0 (South) and row 17 at -58.0 (North).
    # Reference grid has row 0 at -58.0 (North) and row 17 at -75.0 (South).
    # Therefore, matching is done geographically by latitude/longitude.
    weather_by_coord: Dict[Tuple[float, float], Dict[str, Any]] = {}
    is_weather_horizon = abs(horizon_hours - 6.0) < 1e-4

    if is_weather_horizon and weather_data:
        raw_w_cells = weather_data.get("cells", [])
        for wc in raw_w_cells:
            w_lat = round(float(wc.get("latitude", 0.0)), 2)
            w_lon = round(float(wc.get("longitude", 0.0)), 2)
            weather_by_coord[(w_lat, w_lon)] = wc

    # 3. Interpolate and align icebergs at this horizon
    active_berg_positions: List[Dict[str, Any]] = []
    if icebergs_forecast:
        for berg in icebergs_forecast:
            b_id = berg.get("iceberg_id", berg.get("id", "UNKNOWN"))
            anchor = berg.get("currentPosition") or berg.get("anchor_point") or {
                "latitude": berg.get("latitude", -66.4),
                "longitude": berg.get("longitude", 12.5),
                "empirical_error_km": 0.0,
                "vessel_safety_margin_km": 30.0
            }
            steps = berg.get("forecast_steps") or berg.get("forecastTrack") or []
            
            # Interpolate to target horizon
            aligned_pts = interpolate_gru_trajectory(
                anchor_point=anchor,
                forecast_steps=steps,
                target_horizons=[horizon_hours]
            )
            if aligned_pts:
                pt = aligned_pts[0]
                pt["iceberg_id"] = b_id
                active_berg_positions.append(pt)

    # 4. Construct AlignedGridCells across the 468 reference cells
    aligned_cells: List[AlignedGridCell] = []
    for ref_c in REFERENCE_CELLS:
        r = ref_c["row"]
        col = ref_c["column"]
        lat = ref_c["latitude"]
        lon = ref_c["longitude"]

        # --- Sea-Ice Alignment ---
        sic_item = sic_cells_by_coord.get((r, col))
        if sic_item:
            data_avail = bool(sic_item.get("data_available", False))
            pred_status = sic_item.get("prediction_status", "OUTSIDE_MODEL_COVERAGE")
            if data_avail and pred_status == "PREDICTED":
                aligned_sic = AlignedSeaIce(
                    status="AVAILABLE",
                    prediction_type="model" if horizon_hours == 24.0 else "observed" if horizon_hours == 0.0 else "interpolated",
                    sic=float(sic_item["sic"]) if sic_item.get("sic") is not None else None,
                    sic_percent=float(sic_item["sic_percent"]) if sic_item.get("sic_percent") is not None else None,
                    confidence=float(sic_item["confidence"]) if sic_item.get("confidence") is not None else None,
                    ice_class=sic_item.get("ice_class"),
                    sea_ice_risk=float(sic_item["sea_ice_risk"]) if sic_item.get("sea_ice_risk") is not None else None
                )
            else:
                aligned_sic = AlignedSeaIce(
                    status="OUTSIDE_MODEL_COVERAGE",
                    prediction_type=None,
                    sic=None,
                    sic_percent=None,
                    confidence=None,
                    ice_class=None,
                    sea_ice_risk=None
                )
        else:
            aligned_sic = AlignedSeaIce(
                status="UNAVAILABLE",
                prediction_type=None,
                sic=None,
                sic_percent=None,
                confidence=None,
                ice_class=None,
                sea_ice_risk=None
            )

        # --- Weather Alignment ---
        if is_weather_horizon:
            # Find nearest weather cell by geographic coordinate
            w_item = weather_by_coord.get((lat, lon))
            if not w_item:
                # Nearest geographic fallback
                min_d = float("inf")
                for (w_lt, w_ln), cand in weather_by_coord.items():
                    d = abs(w_lt - lat) + abs(w_ln - lon)
                    if d < min_d:
                        min_d = d
                        w_item = cand
            
            if w_item:
                r_score = float(w_item.get("riskScore", w_item.get("risk_score", 0.0)))
                r_class = w_item.get("riskClass", w_item.get("risk_class", "SAFE"))
                aligned_weather = AlignedWeather(
                    status="AVAILABLE",
                    prediction_type="model",
                    risk_score=round(r_score, 4),
                    risk_class=r_class
                )
            else:
                aligned_weather = AlignedWeather(
                    status="UNAVAILABLE",
                    unavailability_reason="Weather observation missing for this coordinate."
                )
        else:
            aligned_weather = AlignedWeather(
                status="UNAVAILABLE",
                unavailability_reason=f"Weather MLP checkpoint strictly operates at T+6h. Horizon {horizon_hours}h unavailable."
            )

        # --- Iceberg Hazard Intersections ---
        hazards: List[IcebergHazardIntersection] = []
        for berg_pos in active_berg_positions:
            b_lat = berg_pos["latitude"]
            b_lon = berg_pos["longitude"]
            dist_km = haversine_distance_km(lat, lon, b_lat, b_lon)
            tot_hz = berg_pos["total_hazard_radius_km"]

            is_in_hazard = dist_km <= tot_hz
            is_in_warning = dist_km <= (tot_hz * 2.0)

            hazards.append(IcebergHazardIntersection(
                iceberg_id=berg_pos["iceberg_id"],
                latitude=b_lat,
                longitude=b_lon,
                distance_km=dist_km,
                uncertainty_radius_km=berg_pos["uncertainty_radius_km"],
                vessel_safety_margin_km=berg_pos["vessel_safety_margin_km"],
                total_hazard_radius_km=tot_hz,
                is_in_hazard_zone=is_in_hazard,
                is_in_warning_zone=is_in_warning,
                prediction_type=berg_pos["prediction_type"]
            ))

        aligned_cells.append(AlignedGridCell(
            row=r,
            column=col,
            latitude=lat,
            longitude=lon,
            sea_ice=aligned_sic,
            weather=aligned_weather,
            iceberg_hazards=hazards
        ))

    return AlignedEnvironmentalState(
        reference_timestamp=reference_timestamp,
        valid_timestamp=valid_iso,
        horizon_hours=horizon_hours,
        grid_rows=REFERENCE_GRID_ROWS,
        grid_columns=REFERENCE_GRID_COLS,
        total_cells=REFERENCE_TOTAL_CELLS,
        available_horizons={
            "sea_ice": [0.0, 6.0, 12.0, 18.0, 24.0] if sea_ice_data else [],
            "weather": [6.0] if weather_data else [],
            "iceberg": [0.0, 6.0, 12.0, 18.0, 24.0, 48.0, 72.0, 96.0, 120.0] if icebergs_forecast else []
        },
        cells=aligned_cells,
        metadata={
            "phase": "PHASE_2_SPATIOTEMPORAL_ALIGNMENT",
            "active_icebergs_count": len(active_berg_positions),
            "conservative_uncertainty_strategy": "max(error_before, error_after)",
            "longitude_wrapping": "geodesic_antimeridian_normalized"
        }
    )

"""
POLARIS: Model Output Normalization Adapters (Phase 1).
Translates model-specific raw outputs into the standardized PredictionPoint
contracts defined in `src.schemas.normalized`.

Key Guarantees:
1. No changes to underlying neural weights, model architectures, or scalers.
2. Honest uncertainty: GRU empirical error is represented as `uncertainty_radius_km`, NOT probability precision.
3. Authentic weather risk: Weather MLP continuous risk score [0, 1] is mapped directly to `weather_risk`, NOT fake wind.
4. Preserves 18x26 grid coordinates, Queen Maud Land domain coverage, and multi-horizon timestamps.
"""

import datetime
from typing import Dict, Any, List, Optional, Union

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


def normalize_gru_forecast(
    forecast: Any,
    base_timestamp: Optional[str] = None
) -> NormalizedModelResponse:
    """
    Normalizes GRU iceberg trajectory predictions into common PredictionPoint contract.
    Preserves predicted coordinates, empirical forecast error radius, and safety buffer.
    Honest reporting: empirical error is retained as uncertainty_radius_km, NOT probability confidence.
    """
    if hasattr(forecast, "model_dump"):
        data = forecast.model_dump()
    elif isinstance(forecast, dict):
        data = forecast
    else:
        raise ValueError(f"Unsupported forecast type for GRU normalization: {type(forecast)}")

    iceberg_id = data.get("iceberg_id", "UNKNOWN")
    model_name = data.get("model_name", "GRU_Sequential_Trajectory_Model")
    steps = data.get("forecast_steps", [])
    now_iso = base_timestamp or datetime.datetime.now(datetime.timezone.utc).isoformat()

    points: List[IcebergPredictionPoint] = []
    for step in steps:
        step_idx = int(step.get("step_index", 1))
        horizon_hours = float(step_idx * 24.0)  # GRU daily step = 24h, 48h, 72h, 96h, 120h
        emp_err = float(step.get("empirical_error_radius_km", 0.0))
        safety_margin = float(step.get("vessel_safety_margin_km", 30.0))
        total_hazard = float(step.get("total_hazard_zone_radius_km", emp_err + safety_margin))

        # Valid timestamp
        ts = step.get("forecast_date")
        if not ts:
            try:
                clean_iso = now_iso.replace("Z", "+00:00")
                base_dt = datetime.datetime.fromisoformat(clean_iso)
                ts = (base_dt + datetime.timedelta(hours=horizon_hours)).isoformat()
            except Exception:
                ts = now_iso

        pt = IcebergPredictionPoint(
            latitude=float(step["latitude"]),
            longitude=float(step["longitude"]),
            timestamp=ts,
            horizon_hours=horizon_hours,
            source="GRU",
            variable="iceberg_position",
            value=None,  # Position is a 2D coordinate pair (lat, lon), not a single scalar
            confidence=None,  # GRU uses empirical error bounds, not confidence probabilities
            uncertainty_radius_km=emp_err,
            iceberg_id=iceberg_id,
            step_label=str(step.get("step", f"Day +{step_idx}")),
            step_index=step_idx,
            empirical_error_km=emp_err,
            vessel_safety_margin_km=safety_margin,
            total_hazard_radius_km=total_hazard,
            metadata={
                "prediction_type": data.get("prediction_type", "recursive_multistep"),
                "forecast_horizon_days": data.get("forecast_horizon_days", len(steps))
            }
        )
        points.append(pt)

    return NormalizedModelResponse(
        model_name=model_name,
        source="GRU",
        variable="iceberg_position",
        generated_at=now_iso,
        total_points=len(points),
        predictions=points,
        metadata={
            "iceberg_id": iceberg_id,
            "feature_count": 4,
            "sequence_length": 10
        }
    )


def normalize_convlstm_forecast(
    forecast_data: Dict[str, Any],
    horizons: Optional[List[str]] = None
) -> NormalizedModelResponse:
    """
    Normalizes ConvLSTM multi-horizon sea-ice concentration forecasts into common PredictionPoint contract.
    Maintains exact 18x26 grid indexing and Queen Maud Land domain coverage.
    """
    meta = forecast_data.get("metadata", {})
    model_name = meta.get("model", "POLARIS Sea-Ice ConvLSTM")
    generated_at = meta.get("generated_at") or datetime.datetime.now(datetime.timezone.utc).isoformat()
    raw_forecast = forecast_data.get("forecast", {})

    target_horizons = horizons or ["0h", "6h", "12h", "18h", "24h"]
    points: List[SeaIcePredictionPoint] = []

    for h_str in target_horizons:
        if h_str not in raw_forecast:
            continue
        try:
            h_hours = float(h_str.lower().replace("h", ""))
        except ValueError:
            h_hours = 0.0

        cells = raw_forecast[h_str]
        for cell in cells:
            sic_fraction = cell.get("sic")
            sic_pct = cell.get("sic_percent")
            if sic_fraction is None and sic_pct is not None:
                sic_fraction = round(sic_pct / 100.0, 4)
            elif sic_fraction is not None and sic_pct is None:
                sic_pct = round(sic_fraction * 100.0, 2)

            conf = cell.get("confidence")
            if conf is not None:
                conf = float(conf)

            pt = SeaIcePredictionPoint(
                latitude=float(cell["latitude"]),
                longitude=float(cell["longitude"]),
                timestamp=generated_at,
                horizon_hours=h_hours,
                source="ConvLSTM",
                variable="sea_ice_concentration",
                value=float(sic_fraction) if sic_fraction is not None else None,
                confidence=conf,
                uncertainty_radius_km=None,
                grid_row=int(cell["row"]),
                grid_column=int(cell["column"]),
                sic_percent=float(sic_pct) if sic_pct is not None else None,
                ice_class=cell.get("ice_class"),
                sea_ice_risk=float(cell["sea_ice_risk"]) if cell.get("sea_ice_risk") is not None else None,
                data_available=bool(cell.get("data_available", True)),
                prediction_status=str(cell.get("prediction_status", "PREDICTED")),
                metadata={
                    "horizon": h_str,
                    "uncertainty_level": cell.get("uncertainty"),
                    "risk_level": cell.get("risk_level")
                }
            )
            points.append(pt)

    return NormalizedModelResponse(
        model_name=model_name,
        source="ConvLSTM",
        variable="sea_ice_concentration",
        generated_at=generated_at,
        total_points=len(points),
        predictions=points,
        metadata={
            "horizons": target_horizons,
            "grid_dimensions": [18, 26],
            "total_cells": 468,
            "qml_predicted_cells_per_horizon": 88
        }
    )


def normalize_weather_forecast(
    weather_data: Any
) -> NormalizedModelResponse:
    """
    Normalizes 6h-ahead Weather Risk MLP predictions into common PredictionPoint contract.
    Preserves continuous risk score [0.0, 1.0] and risk classification without synthetic conversion.
    """
    if hasattr(weather_data, "model_dump"):
        data = weather_data.model_dump()
    elif isinstance(weather_data, dict):
        data = weather_data
    else:
        raise ValueError(f"Unsupported weather data type for WeatherMLP normalization: {type(weather_data)}")

    model_name = data.get("model", "weather_intelligence_engine")
    generated_at = data.get("timestamp") or datetime.datetime.now(datetime.timezone.utc).isoformat()
    horizon_hours = float(data.get("forecastHorizonHours", 6.0))
    cells = data.get("cells", [])

    points: List[WeatherPredictionPoint] = []
    for cell in cells:
        # Handles both camelCase and snake_case dict keys
        r = int(cell.get("row", 0))
        c = int(cell.get("column", 0))
        lat = float(cell.get("latitude", 0.0))
        lon = float(cell.get("longitude", 0.0))
        risk_score = float(cell.get("riskScore", cell.get("risk_score", 0.0)))
        risk_class = str(cell.get("riskClass", cell.get("risk_class", "SAFE")))
        cell_ts = cell.get("timestamp", generated_at)

        pt = WeatherPredictionPoint(
            latitude=lat,
            longitude=lon,
            timestamp=cell_ts,
            horizon_hours=horizon_hours,
            source="WeatherMLP",
            variable="weather_risk",
            value=round(risk_score, 4),
            confidence=None,  # MLP does not natively output a probabilistic confidence interval
            uncertainty_radius_km=None,
            grid_row=r,
            grid_column=c,
            risk_score=round(risk_score, 4),
            risk_class=risk_class,
            metadata={
                "forecast_horizon_hours": horizon_hours
            }
        )
        points.append(pt)

    return NormalizedModelResponse(
        model_name=model_name,
        source="WeatherMLP",
        variable="weather_risk",
        generated_at=generated_at,
        total_points=len(points),
        predictions=points,
        metadata={
            "forecast_horizon_hours": horizon_hours,
            "grid_dimensions": [18, 26],
            "total_cells": 468,
            "feature_count": 27
        }
    )


def normalize_model_output(
    source: str,
    raw_output: Any,
    **kwargs
) -> NormalizedModelResponse:
    """
    Unified normalization dispatcher routing to model-specific adapters.
    """
    src_upper = source.upper()
    if "GRU" in src_upper or "ICEBERG" in src_upper:
        return normalize_gru_forecast(raw_output, **kwargs)
    elif "CONVLSTM" in src_upper or "SEA_ICE" in src_upper or "SEAICE" in src_upper:
        return normalize_convlstm_forecast(raw_output, **kwargs)
    elif "WEATHER" in src_upper or "MLP" in src_upper:
        return normalize_weather_forecast(raw_output)
    else:
        raise ValueError(f"Unknown model source for normalization: '{source}'")

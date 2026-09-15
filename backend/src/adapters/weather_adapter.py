"""
POLARIS Weather Intelligence Adapter.
Adapts the frozen Antarctic Weather Risk PyTorch model into the unified
POLARIS environmental decision-support backend architecture.
"""

import os
import sys
import logging
from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd
from scipy.interpolate import griddata

try:
    from src.adapters.base import BaseEnvironmentalAdapter
except ImportError:
    try:
        from adapters.base import BaseEnvironmentalAdapter
    except ImportError:
        from abc import ABC, abstractmethod
        class BaseEnvironmentalAdapter(ABC):
            """Fallback interface when POLARIS base adapter is not in python path."""
            @abstractmethod
            def health_check(self) -> Dict[str, Any]:
                pass

            @abstractmethod
            def predict_point(self, observation: Dict[str, Any]) -> Dict[str, Any]:
                pass

            @abstractmethod
            def predict_grid(self, observations: List[Dict[str, Any]], timestamp: Optional[str] = None) -> List[Dict[str, Any]]:
                pass

try:
    from src.weather.weather_model import get_weather_model, WeatherModelService
    from src.weather.weather_postprocessing import clamp_risk_score, classify_risk
    from src.weather.feature_engineering import calculate_derived_weather, extract_temporal_features
except ImportError:
    from weather.weather_model import get_weather_model, WeatherModelService
    from weather.weather_postprocessing import clamp_risk_score, classify_risk
    from weather.feature_engineering import calculate_derived_weather, extract_temporal_features


logger = logging.getLogger(__name__)

# POLARIS 18 x 26 Environmental Grid Constants
POLARIS_GRID_ROWS = 18
POLARIS_GRID_COLS = 26
POLARIS_TOTAL_CELLS = 468

POLARIS_LAT_MIN = -75.0
POLARIS_LAT_MAX = -58.0
POLARIS_LON_MIN = -25.0
POLARIS_LON_MAX = 75.0

POLARIS_LATS = np.linspace(POLARIS_LAT_MIN, POLARIS_LAT_MAX, POLARIS_GRID_ROWS)
POLARIS_LONS = np.linspace(POLARIS_LON_MIN, POLARIS_LON_MAX, POLARIS_GRID_COLS)

def _safe_float(val, default=0.0):
    if val is None:
        return float(default)
    try:
        return float(val)
    except (ValueError, TypeError):
        return float(default)

class WeatherAdapter(BaseEnvironmentalAdapter):
    """
    Drop-in adapter for the POLARIS unified FastAPI backend.
    Preserves exact 27-feature order, strict 6h temporal semantics,
    and 18 x 26 grid projection.
    """
    def __init__(self, model_service: Optional[WeatherModelService] = None):
        self.service = model_service or get_weather_model()
        self.forecast_horizon_hours = 6
        self.model_name = "weather_intelligence_engine"

        # Pre-build coordinate lookups for 468 cells
        self.grid_cells_metadata = []
        for r_idx, lat in enumerate(POLARIS_LATS):
            for c_idx, lon in enumerate(POLARIS_LONS):
                self.grid_cells_metadata.append({
                    "row": r_idx,
                    "column": c_idx,
                    "latitude": round(float(lat), 2),
                    "longitude": round(float(lon), 2)
                })

    def validate_domain(self, lat: float, lon: float) -> bool:
        """
        Validates coordinate against the trained Antarctic domain:
        Lat: [-75.0, -58.0], Lon: [-25.0, 75.0].
        """
        return (POLARIS_LAT_MIN <= lat <= POLARIS_LAT_MAX) and (POLARIS_LON_MIN <= lon <= POLARIS_LON_MAX)

    def _build_feature_vector(self, obs: Dict[str, Any]) -> np.ndarray:
        """
        Extracts and assembles the exact 27-feature vector in frozen model order:
        [lat, lon, u10, v10, ws, wd, gust, gr, temp_c, mslp, precip,
         p_ch3, p_ch6, hour, doy, mon, sinh, cosh,
         ws_lag1, ws_lag3, ws_lag6, gust_lag1, gust_lag3, gust_lag6,
         p_lag1, p_lag3, p_lag6]
        """
        lat = _safe_float(obs.get("latitude"), -65.0)
        lon = _safe_float(obs.get("longitude"), 0.0)
        ts_str = obs.get("timestamp") or "2020-04-01T00:00:00"
        ts = pd.to_datetime(ts_str)

        u10 = _safe_float(obs.get("u10"), 0.0)
        v10 = _safe_float(obs.get("v10"), 0.0)
        default_gust = np.sqrt(u10**2 + v10**2) * 1.3
        fg10 = _safe_float(obs.get("wind_gust", obs.get("fg10")), default_gust)
        t2m = _safe_float(obs.get("temperature", obs.get("t2m")), 268.15)
        msl = _safe_float(obs.get("mslp", obs.get("msl")), 99000.0)
        tp = _safe_float(obs.get("precipitation", obs.get("tp")), 0.0)

        # Unit conversions matching training
        t2m_k = t2m + 273.15 if t2m < 150.0 else t2m
        msl_pa = msl * 100.0 if msl < 2000.0 else msl
        tp_m = tp / 1000.0 if (0.1 < tp < 500.0) else tp

        derived = calculate_derived_weather(u10, v10, fg10, t2m_k, msl_pa, tp_m)
        temp_feat = extract_temporal_features([ts])

        ws = float(derived["wind_speed"])
        wd = float(derived["wind_direction"])
        gr = float(derived["gust_ratio"])
        tc = float(derived["temperature_c"])
        phpa = float(derived["mslp_hpa"])
        pmm = float(derived["precipitation_mm"])

        # Pressure changes
        p_ch3 = _safe_float(obs.get("pressure_change_3h"), 0.0)
        p_ch6 = _safe_float(obs.get("pressure_change_6h"), 0.0)

        # Historical lags (with documented cold-start fallback)
        ws_lag1 = _safe_float(obs.get("wind_speed_lag_1h"), ws)
        ws_lag3 = _safe_float(obs.get("wind_speed_lag_3h"), ws)
        ws_lag6 = _safe_float(obs.get("wind_speed_lag_6h"), ws)

        g_lag1 = _safe_float(obs.get("wind_gust_lag_1h"), fg10)
        g_lag3 = _safe_float(obs.get("wind_gust_lag_3h"), fg10)
        g_lag6 = _safe_float(obs.get("wind_gust_lag_6h"), fg10)

        p_lag1 = _safe_float(obs.get("pressure_lag_1h"), phpa)
        p_lag3 = _safe_float(obs.get("pressure_lag_3h"), phpa)
        p_lag6 = _safe_float(obs.get("pressure_lag_6h"), phpa)

        return np.array([
            lat, lon, u10, v10, ws, wd, fg10, gr, tc, phpa, pmm,
            p_ch3, p_ch6,
            temp_feat["hour"][0], temp_feat["day_of_year"][0], temp_feat["month"][0],
            temp_feat["sin_hour"][0], temp_feat["cos_hour"][0],
            ws_lag1, ws_lag3, ws_lag6,
            g_lag1, g_lag3, g_lag6,
            p_lag1, p_lag3, p_lag6
        ], dtype=np.float32)

    def health_check(self) -> Dict[str, Any]:
        """Returns standard POLARIS health check payload."""
        meta = self.service.get_metadata()
        return {
            "model": self.model_name,
            "status": meta["status"],
            "framework": meta["framework"],
            "forecast_horizon_hours": self.forecast_horizon_hours,
            "grid_cells": POLARIS_TOTAL_CELLS
        }

    def predict_point(self, observation: Dict[str, Any]) -> Dict[str, Any]:
        """
        Inference for a single point observation.
        Predicts 6-hour-ahead weather risk score and class.
        """
        lat = _safe_float(observation.get("latitude"), -65.0)
        lon = _safe_float(observation.get("longitude"), 0.0)

        if not self.validate_domain(lat, lon):
            logger.warning(
                f"Observation coordinates ({lat}, {lon}) are outside trained domain "
                f"([-75, -58], [-25, 75])."
            )

        ts_str = observation.get("timestamp") or "2020-04-01T00:00:00"
        ts = pd.to_datetime(ts_str)
        target_timestamp = (ts + pd.Timedelta(hours=self.forecast_horizon_hours)).isoformat()

        feat_vec = self._build_feature_vector(observation)
        raw_score = float(self.service.predict_features(feat_vec)[0])
        clamped_score = float(clamp_risk_score(raw_score))
        risk_class = str(classify_risk(clamped_score))

        return {
            "latitude": lat,
            "longitude": lon,
            "timestamp": target_timestamp,
            "riskScore": round(clamped_score, 4),
            "riskClass": risk_class,
            "forecastHorizonHours": self.forecast_horizon_hours,
            "modelName": self.model_name
        }

    def predict_grid(self, observations: List[Dict[str, Any]], timestamp: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Projects observation predictions onto the exact 18 x 26 = 468 cell POLARIS grid.
        Returns array of exactly 468 cells with row, column, lat, lon, riskScore, riskClass.
        """
        if not observations:
            # If no observations passed, generate baseline evaluation across 468 cells
            observations = [
                {
                    "latitude": cell["latitude"],
                    "longitude": cell["longitude"],
                    "timestamp": timestamp or "2020-04-01T00:00:00",
                    "u10": 5.0, "v10": 5.0, "wind_gust": 10.0,
                    "temperature": -5.0, "mslp": 995.0, "precipitation": 0.0
                }
                for cell in self.grid_cells_metadata
            ]

        # Batch predict input observations
        vectors = [self._build_feature_vector(obs) for obs in observations]
        batch_matrix = np.vstack(vectors)
        scores = self.service.predict_features(batch_matrix)
        clamped_scores = clamp_risk_score(scores)

        # Source coordinates
        src_lats = np.array([_safe_float(obs.get("latitude")) for obs in observations])
        src_lons = np.array([_safe_float(obs.get("longitude")) for obs in observations])

        # Target grid points (468 cells)
        target_lats = np.array([c["latitude"] for c in self.grid_cells_metadata])
        target_lons = np.array([c["longitude"] for c in self.grid_cells_metadata])

        # Interpolate onto POLARIS grid
        src_points = np.column_stack([src_lats, src_lons])
        target_points = np.column_stack([target_lats, target_lons])

        if len(src_points) >= 4:
            grid_scores = griddata(src_points, clamped_scores, target_points, method="nearest")
        else:
            # Fallback for few points: nearest Euclidean assignment
            dists = np.hypot(
                target_points[:, 0, None] - src_points[:, 0],
                target_points[:, 1, None] - src_points[:, 1]
            )
            nearest_idx = np.argmin(dists, axis=1)
            grid_scores = clamped_scores[nearest_idx]

        grid_scores = clamp_risk_score(grid_scores)
        grid_classes = classify_risk(grid_scores)

        ts_ref = timestamp or (observations[0].get("timestamp") if observations else "2020-04-01T00:00:00")
        target_ts = (pd.to_datetime(ts_ref) + pd.Timedelta(hours=self.forecast_horizon_hours)).isoformat()

        grid_output = []
        for i, meta in enumerate(self.grid_cells_metadata):
            s = float(grid_scores[i])
            grid_output.append({
                "row": meta["row"],
                "column": meta["column"],
                "latitude": meta["latitude"],
                "longitude": meta["longitude"],
                "riskScore": round(s, 4),
                "riskClass": str(grid_classes[i]),
                "timestamp": target_ts,
                "forecastHorizonHours": self.forecast_horizon_hours
            })

        return grid_output

    def predict_grid_normalized(self, observations: List[Dict[str, Any]], timestamp: Optional[str] = None) -> Any:
        """
        Projects weather prediction onto the 468-cell POLARIS grid and returns
        the normalized PredictionPoint collection adhering to the Phase 1 common contract.
        """
        grid_cells = self.predict_grid(observations, timestamp=timestamp)
        try:
            from src.adapters.normalization import normalize_weather_forecast
        except ImportError:
            from adapters.normalization import normalize_weather_forecast
        return normalize_weather_forecast({
            "model": self.model_name,
            "forecastHorizonHours": self.forecast_horizon_hours,
            "timestamp": timestamp or (grid_cells[0]["timestamp"] if grid_cells else "2020-04-01T06:00:00"),
            "cells": grid_cells
        })

    def get_model_status(self) -> Dict[str, Any]:
        """BasePredictionAdapter contract implementation."""
        return self.health_check()

    def predict(self, request: Any, **kwargs) -> Any:
        """BasePredictionAdapter contract implementation."""
        if isinstance(request, dict):
            return self.predict_point(request)
        elif hasattr(request, "model_dump"):
            return self.predict_point(request.model_dump())
        return self.predict_point(dict(request))


_weather_adapter_instance = None

def get_weather_adapter() -> WeatherAdapter:
    global _weather_adapter_instance
    if _weather_adapter_instance is None:
        _weather_adapter_instance = WeatherAdapter()
    return _weather_adapter_instance

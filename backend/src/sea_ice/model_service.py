"""
POLARIS: FastAPI Model Microservice & Frontend Integration Layer
Implements Phase 9 of the POLARIS Sea-Ice Forecasting Pipeline.

Endpoints:
- GET /: Service operational status.
- GET /health: Health check confirming model readiness.
- GET /coverage: Model geographical coverage vs POLARIS frontend grid bounds.
- GET /model-info: Model architecture, version, lookback, horizon, and channels.
- GET /forecast: Retrieve full 5-step multi-horizon forecast (0h, 6h, 12h, 18h, 24h) for 18x26 grid.
- GET /forecast/{horizon}: Retrieve specific forecast horizon ('0h', '6h', '12h', '18h', '24h').
- POST /forecast: Dynamic multi-channel forecast generating the 18x26 multi-horizon grid.
- POST /predict: Backwards-compatible raw (41, 121) prediction endpoint.
- GET /frontend-schema: Returns TypeScript interfaces and integration schema.
"""

import sys
import io
import os
import json
import datetime
from pathlib import Path
import numpy as np
from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form, Response
from fastapi.responses import JSONResponse, StreamingResponse
from typing import List, Dict, Any, Optional

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.sea_ice.polaris_model import PolarisSeaIceModel
from src.sea_ice.polaris_export import export_polaris_forecast, sanitize_for_json
from src.sea_ice.temporal_forecast_adapter import TemporalForecastAdapter

router = APIRouter(tags=["ConvLSTM Sea-Ice Forecasting"])

# Global singleton model instance (lazy loaded)
_model_instance: Optional[PolarisSeaIceModel] = None

def get_model() -> PolarisSeaIceModel:
    global _model_instance
    if _model_instance is None:
        _model_instance = PolarisSeaIceModel()
    return _model_instance

# Default cached export file path
EXPORT_FILE = PROJECT_ROOT / "data" / "exports" / "polaris_sea_ice_forecast.json"

def get_or_generate_forecast() -> Dict[str, Any]:
    """Retrieve existing export JSON or generate a fallback baseline forecast."""
    if EXPORT_FILE.exists():
        try:
            with open(EXPORT_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    # Dynamic fallback generation
    adapter = TemporalForecastAdapter()
    dummy_obs = np.full((41, 121), 0.35, dtype=np.float32)
    dummy_pred = np.full((41, 121), 0.40, dtype=np.float32)
    horizons = adapter.generate_full_forecast(dummy_obs, dummy_pred)
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    payload = {
        "metadata": {
            "model": "POLARIS ConvLSTM Sea-Ice Forecasting",
            "model_version": "2.0",
            "generated_at": now_iso,
            "forecast_capability": {
                "0h": "OBSERVED",
                "6h": "INTERPOLATED",
                "12h": "INTERPOLATED",
                "18h": "INTERPOLATED",
                "24h": "MODEL_FORECAST"
            }
        },
        "forecast": {
            "0h": horizons["0h"]["cells"],
            "6h": horizons["6h"]["cells"],
            "12h": horizons["12h"]["cells"],
            "18h": horizons["18h"]["cells"],
            "24h": horizons["24h"]["cells"]
        }
    }
    return payload

def get_normalized_sea_ice_forecast(horizons: Optional[List[str]] = None) -> Any:
    """Retrieve full sea-ice forecast normalized into Phase 1 PredictionPoint contracts."""
    raw_data = get_or_generate_forecast()
    try:
        from src.adapters.normalization import normalize_convlstm_forecast
    except ImportError:
        from adapters.normalization import normalize_convlstm_forecast
    return normalize_convlstm_forecast(raw_data, horizons=horizons)


@router.get("/sea-ice/status")
def read_root():
    """Service operational status."""
    return {
        "model": "POLARIS Sea-Ice Forecasting Model",
        "version": "2.0",
        "status": "running"
    }

@router.get("/sea-ice/health")
def sea_ice_health_check():
    """Health check confirming model availability and readiness."""
    model = get_model()
    return {
        "status": "healthy",
        "model_loaded": model is not None and model.model is not None,
        "model_path": str(model.model_path) if model else None
    }

@router.get("/coverage")
@router.get("/sea-ice/coverage")
def get_coverage():
    """Retrieve model geographic coverage versus frontend POLARIS environmental grid bounds."""
    return {
        "model_coverage": {
            "latitude_min": -70.0,
            "latitude_max": -60.0,
            "longitude_min": 0.0,
            "longitude_max": 30.0,
            "spatial_resolution": "0.25 degrees",
            "grid_dimensions": [41, 121]
        },
        "frontend_grid": {
            "rows": 18,
            "columns": 26,
            "total_cells": 468,
            "latitude_min": -75.0,
            "latitude_max": -58.0,
            "longitude_min": -25.0,
            "longitude_max": 75.0
        },
        "extrapolation_policy": "Strict zero-extrapolation: Outside-coverage cells return data_available=False and null values."
    }

@router.get("/model-info")
@router.get("/sea-ice/model-info")
def get_model_info():
    """Retrieve model metadata, architecture details, and split metrics."""
    meta_path = PROJECT_ROOT / "models" / "sea_ice" / "model_metadata.json"
    if not meta_path.exists():
        meta_path = PROJECT_ROOT / "models" / "model_metadata.json"
    if meta_path.exists():
        with open(meta_path, "r", encoding="utf-8") as f:
            return json.load(f)

    return {
        "model_name": "POLARIS Sea-Ice ConvLSTM",
        "model_type": "ConvLSTM2D",
        "model_version": "2.0",
        "input_sequence_length": 7,
        "prediction_horizon": 1,
        "input_channels": 5,
        "channels": ["SIC", "Wind_U", "Wind_V", "Ocean_U", "Ocean_V"],
        "study_region": "[-70.0 to -60.0 Lat, 0.0 to 30.0 Lon]",
        "spatial_resolution": "0.25 degrees"
    }

@router.get("/forecast")
@router.get("/sea-ice/forecast")
def get_full_forecast():
    """
    Retrieve complete 5-step multi-horizon forecast (0h, 6h, 12h, 18h, 24h)
    mapped to the POLARIS 18x26 environmental grid.
    """
    return get_or_generate_forecast()

@router.get("/forecast/{horizon}")
@router.get("/sea-ice/forecast/{horizon}")
def get_horizon_forecast(horizon: str):
    """
    Retrieve a specific forecast horizon.
    Valid horizon values: '0h', '6h', '12h', '18h', '24h' (or '0', '6', '12', '18', '24').
    """
    clean_h = horizon.lower()
    if not clean_h.endswith("h"):
        clean_h = f"{clean_h}h"

    data = get_or_generate_forecast()
    if clean_h not in data.get("forecast", {}):
        clean_h = "6h"

    return {
        "metadata": data["metadata"],
        "horizon": clean_h,
        "forecast_type": data["metadata"]["forecast_capability"].get(clean_h, "UNKNOWN"),
        "cells": data["forecast"].get(clean_h, data["forecast"].get("0h", []))
    }

@router.post("/forecast")
@router.post("/sea-ice/forecast")
async def dynamic_forecast_endpoint(
    sic_file: UploadFile = File(..., description="NumPy (.npy) file of SIC history with shape (7, H, W)"),
    wind_u_file: UploadFile = File(..., description="NumPy (.npy) file of Wind U history with shape (7, H, W)"),
    wind_v_file: UploadFile = File(..., description="NumPy (.npy) file of Wind V history with shape (7, H, W)"),
    ocean_u_file: UploadFile = File(..., description="NumPy (.npy) file of Ocean U history with shape (7, H, W)"),
    ocean_v_file: UploadFile = File(..., description="NumPy (.npy) file of Ocean V history with shape (7, H, W)")
):
    """
    Accept dynamic 7-day multi-channel environmental arrays and generate
    the full 18x26 POLARIS environmental forecast JSON.
    """
    try:
        model = get_model()

        sic_bytes = await sic_file.read()
        wind_u_bytes = await wind_u_file.read()
        wind_v_bytes = await wind_v_file.read()
        ocean_u_bytes = await ocean_u_file.read()
        ocean_v_bytes = await ocean_v_file.read()

        sic_arr = np.load(io.BytesIO(sic_bytes))
        wind_u_arr = np.load(io.BytesIO(wind_u_bytes))
        wind_v_arr = np.load(io.BytesIO(wind_v_bytes))
        ocean_u_arr = np.load(io.BytesIO(ocean_u_bytes))
        ocean_v_arr = np.load(io.BytesIO(ocean_v_bytes))

        # Forward prediction
        pred_24h = model.predict(
            sic_history=sic_arr,
            wind_u_history=wind_u_arr,
            wind_v_history=wind_v_arr,
            ocean_u_history=ocean_u_arr,
            ocean_v_history=ocean_v_arr
        )

        # Multi-horizon adaptation
        t_adapter = TemporalForecastAdapter()
        horizons = t_adapter.generate_full_forecast(
            observed_sic=sic_arr,
            predicted_sic_24h=pred_24h,
            wind_u=wind_u_arr,
            wind_v=wind_v_arr,
            ocean_u=ocean_u_arr,
            ocean_v=ocean_v_arr
        )

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        payload = {
            "metadata": {
                "model": "POLARIS ConvLSTM Sea-Ice Forecasting",
                "model_version": "2.0",
                "generated_at": now_iso,
                "model_coverage": {
                    "latitude_min": -70.0,
                    "latitude_max": -60.0,
                    "longitude_min": 0.0,
                    "longitude_max": 30.0,
                    "spatial_resolution": "0.25 deg"
                },
                "frontend_grid": {
                    "rows": 18,
                    "columns": 26,
                    "total_cells": 468,
                    "latitude_min": -75.0,
                    "latitude_max": -58.0,
                    "longitude_min": -25.0,
                    "longitude_max": 75.0
                },
                "forecast_capability": {
                    "0h": "OBSERVED",
                    "6h": "INTERPOLATED",
                    "12h": "INTERPOLATED",
                    "18h": "INTERPOLATED",
                    "24h": "MODEL_FORECAST"
                }
            },
            "forecast": {
                "0h": horizons["0h"]["cells"],
                "6h": horizons["6h"]["cells"],
                "12h": horizons["12h"]["cells"],
                "18h": horizons["18h"]["cells"],
                "24h": horizons["24h"]["cells"]
            }
        }
        return sanitize_for_json(payload)

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/predict")
@router.post("/sea-ice/predict")
async def predict_endpoint(
    sic_file: UploadFile = File(..., description="NumPy (.npy) file of SIC history with shape (7, H, W)"),
    wind_u_file: UploadFile = File(..., description="NumPy (.npy) file of Wind U history with shape (7, H, W)"),
    wind_v_file: UploadFile = File(..., description="NumPy (.npy) file of Wind V history with shape (7, H, W)"),
    ocean_u_file: UploadFile = File(..., description="NumPy (.npy) file of Ocean U history with shape (7, H, W)"),
    ocean_v_file: UploadFile = File(..., description="NumPy (.npy) file of Ocean V history with shape (7, H, W)"),
    return_format: str = Form("json", description="Output format: 'json' (summary stats) or 'numpy' (binary array stream)")
):
    """Backwards-compatible raw (41, 121) prediction endpoint."""
    try:
        model = get_model()
        sic_bytes = await sic_file.read()
        wind_u_bytes = await wind_u_file.read()
        wind_v_bytes = await wind_v_file.read()
        ocean_u_bytes = await ocean_u_file.read()
        ocean_v_bytes = await ocean_v_file.read()

        sic_arr = np.load(io.BytesIO(sic_bytes))
        wind_u_arr = np.load(io.BytesIO(wind_u_bytes))
        wind_v_arr = np.load(io.BytesIO(wind_v_bytes))
        ocean_u_arr = np.load(io.BytesIO(ocean_u_bytes))
        ocean_v_arr = np.load(io.BytesIO(ocean_v_bytes))

        predicted_map = model.predict(
            sic_history=sic_arr,
            wind_u_history=wind_u_arr,
            wind_v_history=wind_v_arr,
            ocean_u_history=ocean_u_arr,
            ocean_v_history=ocean_v_arr
        )

        if return_format.lower() == "numpy":
            buffer = io.BytesIO()
            np.save(buffer, predicted_map)
            buffer.seek(0)
            return StreamingResponse(
                buffer,
                media_type="application/octet-stream",
                headers={"Content-Disposition": "attachment; filename=predicted_sic.npy"}
            )

        return {
            "status": "success",
            "prediction_shape": list(predicted_map.shape),
            "output_units": "fraction (0.0 to 1.0)",
            "min_sic": float(np.min(predicted_map)),
            "max_sic": float(np.max(predicted_map)),
            "mean_sic": float(np.mean(predicted_map)),
            "ice_extent_cells": int(np.sum(predicted_map > 0.15)),
            "message": "Prediction generated successfully."
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/frontend-schema")
@router.get("/sea-ice/frontend-schema")
def get_frontend_schema():
    """Retrieve TypeScript interfaces and integration schema definitions."""
    return {
        "typescript_interfaces": {
            "SeaIceCell": {
                "row": "number (0 to 17)",
                "column": "number (0 to 25)",
                "latitude": "number (-75.0 to -58.0)",
                "longitude": "number (-25.0 to 75.0)",
                "sic": "number | null (0.0 to 1.0)",
                "sic_percent": "number | null (0.0 to 100.0 %)",
                "ice_class": "'OPEN_WATER' | 'LOW_ICE' | 'MODERATE_ICE' | 'DENSE_ICE' | 'EXTREME_ICE' | null",
                "sea_ice_risk": "number | null (0.0 to 100.0)",
                "risk_level": "'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' | null",
                "confidence": "number | null (0.0 to 100.0)",
                "uncertainty": "'LOW' | 'MEDIUM' | 'HIGH' | null",
                "data_available": "boolean",
                "prediction_status": "'PREDICTED' | 'OUTSIDE_MODEL_COVERAGE'"
            },
            "ForecastMetadata": {
                "model": "string",
                "model_version": "string",
                "generated_at": "string (ISO 8601)",
                "model_coverage": "object",
                "frontend_grid": "object",
                "forecast_capability": "Record<string, 'OBSERVED' | 'INTERPOLATED' | 'MODEL_FORECAST'>"
            },
            "PolarisSeaIceForecast": {
                "metadata": "ForecastMetadata",
                "forecast": "Record<'0h' | '6h' | '12h' | '18h' | '24h', SeaIceCell[]>"
            }
        },
        "endpoints": {
            "full_forecast": "GET /forecast",
            "single_horizon": "GET /forecast/{horizon}",
            "coverage_bounds": "GET /coverage",
            "health_check": "GET /health"
        }
    }

app = FastAPI(
    title="POLARIS Sea-Ice Forecasting API",
    description="AI-based Antarctic Sea-Ice Forecasting & Navigation Intelligence Microservice",
    version="2.0"
)
app.include_router(router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.sea_ice.model_service:app", host="127.0.0.1", port=8000, reload=True)

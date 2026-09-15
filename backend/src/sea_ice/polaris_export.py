"""
POLARIS: Frontend JSON Exporter Module
Implements Phase 8 of the POLARIS ML-to-Frontend Integration Layer.

Generates complete, TypeScript-compatible JSON files in `data/exports/`
for direct ingestion by the POLARIS React application.
"""

import os
import sys
from pathlib import Path
from typing import Dict, Any, Optional, Union
import json
import datetime
import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.sea_ice.polaris_model import PolarisSeaIceModel
from src.sea_ice.temporal_forecast_adapter import TemporalForecastAdapter

DEFAULT_EXPORT_PATH = PROJECT_ROOT / "data" / "exports" / "polaris_sea_ice_forecast.json"

def sanitize_for_json(obj: Any) -> Any:
    """Recursively convert numpy types and guard against NaN/inf for valid JSON."""
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_for_json(v) for v in obj]
    elif isinstance(obj, (np.floating, float)):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return float(obj)
    elif isinstance(obj, (np.integer, int)):
        return int(obj)
    elif isinstance(obj, (np.bool_, bool)):
        return bool(obj)
    elif isinstance(obj, np.ndarray):
        return sanitize_for_json(obj.tolist())
    return obj

def export_polaris_forecast(
    sic_history: np.ndarray,
    wind_u_history: np.ndarray,
    wind_v_history: np.ndarray,
    ocean_u_history: np.ndarray,
    ocean_v_history: np.ndarray,
    output_filepath: Optional[Union[str, Path]] = None,
    model: Optional[PolarisSeaIceModel] = None
) -> Dict[str, Any]:
    """
    Run end-to-end multi-horizon forecast and export frontend-ready JSON.
    """
    if model is None:
        model = PolarisSeaIceModel()

    # 1. Forward inference for 24h horizon
    predicted_sic_24h = model.predict(
        sic_history=sic_history,
        wind_u_history=wind_u_history,
        wind_v_history=wind_v_history,
        ocean_u_history=ocean_u_history,
        ocean_v_history=ocean_v_history
    )

    # 2. Multi-horizon temporal and spatial grid adaptation
    temporal_adapter = TemporalForecastAdapter()
    forecast_horizons = temporal_adapter.generate_full_forecast(
        observed_sic=sic_history,
        predicted_sic_24h=predicted_sic_24h,
        wind_u=wind_u_history,
        wind_v=wind_v_history,
        ocean_u=ocean_u_history,
        ocean_v=ocean_v_history
    )

    # 3. Assemble JSON payload matching POLARIS TypeScript contract
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    export_payload = {
        "metadata": {
            "model": "POLARIS ConvLSTM Sea-Ice Forecasting",
            "model_version": "1.0",
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
            "0h": forecast_horizons["0h"]["cells"],
            "6h": forecast_horizons["6h"]["cells"],
            "12h": forecast_horizons["12h"]["cells"],
            "18h": forecast_horizons["18h"]["cells"],
            "24h": forecast_horizons["24h"]["cells"]
        }
    }

    # Strict JSON sanitization (no NaNs or infinities)
    clean_payload = sanitize_for_json(export_payload)

    # 4. Save to destination
    dest_path = Path(output_filepath) if output_filepath else DEFAULT_EXPORT_PATH
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    with open(dest_path, "w", encoding="utf-8") as f:
        json.dump(clean_payload, f, indent=2)

    print(f"POLARIS sea-ice forecast exported successfully to {dest_path}")
    return clean_payload

def main():
    print("=" * 70)
    print("POLARIS: STANDALONE JSON EXPORT RUNNER")
    print("=" * 70)

    # Load 7-day test arrays from sample_data
    sample_dir = "sample_data"
    sic_file = os.path.join(sample_dir, "sic_history.npy")
    if not os.path.exists(sic_file):
        print("Sample data not found. Preparing sample data...")
        from scripts.prepare_sample_data import main as prep_main
        prep_main()

    sic_h = np.load(os.path.join(sample_dir, "sic_history.npy"))
    w_u_h = np.load(os.path.join(sample_dir, "wind_u_history.npy"))
    w_v_h = np.load(os.path.join(sample_dir, "wind_v_history.npy"))
    o_u_h = np.load(os.path.join(sample_dir, "ocean_u_history.npy"))
    o_v_h = np.load(os.path.join(sample_dir, "ocean_v_history.npy"))

    out_file = "data/exports/polaris_sea_ice_forecast.json"
    export_polaris_forecast(
        sic_history=sic_h,
        wind_u_history=w_u_h,
        wind_v_history=w_v_h,
        ocean_u_history=o_u_h,
        ocean_v_history=o_v_h,
        output_filepath=out_file
    )

if __name__ == "__main__":
    main()

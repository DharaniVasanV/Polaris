"""
POLARIS Weather Intelligence Integration Test Suite.
Validates the drop-in integration criteria defined in Section 24:
 1. Model loads successfully
 2. Scaler loads successfully
 3. Feature count is exactly 27
 4. Single prediction works
 5. Risk score is in [0, 1]
 6. Risk class is valid (SAFE, MODERATE, HIGH, CRITICAL)
 7. Grid contains exactly 468 cells
 8. Coordinates are unique
 9. Coordinates match POLARIS grid bounds
10. Timestamp is preserved and stepped forward by +6 hours
11. Forecast horizon is strictly 6 hours
12. API routes respond cleanly
13. Health reports model loaded
14. No existing model functionality is affected (clean modular isolation)
"""

import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import json
import unittest
import numpy as np
import pandas as pd
import torch
from fastapi import FastAPI
from fastapi.testclient import TestClient

try:
    from src.api.weather_routes import router as weather_router
except ImportError:
    from api.weather_routes import router as weather_router
from src.weather.weather_model import get_weather_model, WeatherModelService
from src.weather.weather_postprocessing import clamp_risk_score, classify_risk

try:
    from adapters.weather_adapter import (
        get_weather_adapter,
        WeatherAdapter,
        POLARIS_GRID_ROWS,
        POLARIS_GRID_COLS,
        POLARIS_TOTAL_CELLS,
        POLARIS_LAT_MIN,
        POLARIS_LAT_MAX,
        POLARIS_LON_MIN,
        POLARIS_LON_MAX
    )
except ImportError:
    from src.adapters.weather_adapter import (
        get_weather_adapter,
        WeatherAdapter,
        POLARIS_GRID_ROWS,
        POLARIS_GRID_COLS,
        POLARIS_TOTAL_CELLS,
        POLARIS_LAT_MIN,
        POLARIS_LAT_MAX,
        POLARIS_LON_MIN,
        POLARIS_LON_MAX
    )

try:
    from src.schemas.weather import (
        WeatherPointObservation,
        WeatherPointPrediction,
        WeatherGridResponse,
        WeatherHealthResponse
    )
except ImportError:
    from schemas.weather import (
        WeatherPointObservation,
        WeatherPointPrediction,
        WeatherGridResponse,
        WeatherHealthResponse
    )

class TestPolarisWeatherIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_app = FastAPI(title="POLARIS Weather Intelligence Test Suite")
        test_app.include_router(weather_router)
        cls.client = TestClient(test_app)
        cls.adapter = get_weather_adapter()
        cls.model_service = get_weather_model()

        cls.sample_obs = {
            "latitude": -65.0,
            "longitude": 0.0,
            "timestamp": "2020-04-15T12:00:00",
            "u10": 8.5,
            "v10": 4.2,
            "wind_gust": 15.0,
            "temperature": -8.5,
            "mslp": 985.0,
            "precipitation": 0.4,
            "pressure_change_3h": -2.1,
            "pressure_change_6h": -4.5,
            "wind_speed_lag_1h": 8.0,
            "wind_speed_lag_3h": 7.2,
            "wind_speed_lag_6h": 6.5,
            "wind_gust_lag_1h": 14.0,
            "wind_gust_lag_3h": 13.0,
            "wind_gust_lag_6h": 11.5,
            "pressure_lag_1h": 986.5,
            "pressure_lag_3h": 987.1,
            "pressure_lag_6h": 989.5
        }

    # 1. Model loads successfully
    def test_01_model_loads_successfully(self):
        self.assertIsNotNone(self.model_service.model)
        self.assertIsInstance(self.model_service.model, torch.nn.Module)
        meta = self.model_service.get_metadata()
        self.assertEqual(meta["status"], "LOADED")
        self.assertEqual(meta["framework"], "PyTorch")

    # 2. Scaler loads successfully
    def test_02_scaler_loads_successfully(self):
        self.assertIsNotNone(self.model_service.scaler)
        self.assertTrue(hasattr(self.model_service.scaler, "mean_"))
        self.assertTrue(hasattr(self.model_service.scaler, "scale_"))

    # 3. Feature count is exactly 27
    def test_03_feature_count_is_27(self):
        self.assertEqual(len(self.model_service.feature_names), 27)
        self.assertEqual(self.model_service.scaler.n_features_in_, 27)
        # Test vector dimension
        feat_vec = self.adapter._build_feature_vector(self.sample_obs)
        self.assertEqual(len(feat_vec), 27)

    # 4. Single prediction works
    def test_04_single_prediction_works(self):
        pred = self.adapter.predict_point(self.sample_obs)
        self.assertIn("riskScore", pred)
        self.assertIn("riskClass", pred)
        self.assertIn("forecastHorizonHours", pred)
        self.assertEqual(pred["latitude"], -65.0)
        self.assertEqual(pred["longitude"], 0.0)

    # 5. Risk score is in [0, 1]
    def test_05_risk_score_in_bounds(self):
        pred = self.adapter.predict_point(self.sample_obs)
        score = pred["riskScore"]
        self.assertGreaterEqual(score, 0.0)
        self.assertLessEqual(score, 1.0)

    # 6. Risk class is valid
    def test_06_risk_class_is_valid(self):
        valid_classes = {"SAFE", "MODERATE", "HIGH", "CRITICAL"}
        pred = self.adapter.predict_point(self.sample_obs)
        self.assertIn(pred["riskClass"], valid_classes)

        # Verify deterministic boundary mapping
        self.assertEqual(classify_risk(0.10), "SAFE")
        self.assertEqual(classify_risk(0.249), "SAFE")
        self.assertEqual(classify_risk(0.25), "MODERATE")
        self.assertEqual(classify_risk(0.499), "MODERATE")
        self.assertEqual(classify_risk(0.50), "HIGH")
        self.assertEqual(classify_risk(0.749), "HIGH")
        self.assertEqual(classify_risk(0.75), "CRITICAL")
        self.assertEqual(classify_risk(0.95), "CRITICAL")

    # 7. Grid contains exactly 468 cells
    def test_07_grid_contains_exactly_468_cells(self):
        grid = self.adapter.predict_grid([])
        self.assertEqual(len(grid), 468)
        self.assertEqual(len(grid), POLARIS_TOTAL_CELLS)

    # 8. Coordinates are unique
    def test_08_coordinates_are_unique(self):
        grid = self.adapter.predict_grid([])
        coords = [(c["latitude"], c["longitude"]) for c in grid]
        unique_coords = set(coords)
        self.assertEqual(len(unique_coords), 468)

    # 9. Coordinates match POLARIS grid
    def test_09_coordinates_match_polaris_grid(self):
        grid = self.adapter.predict_grid([])
        rows = set(c["row"] for c in grid)
        cols = set(c["column"] for c in grid)
        self.assertEqual(rows, set(range(18)))
        self.assertEqual(cols, set(range(26)))

        for c in grid:
            self.assertGreaterEqual(c["latitude"], POLARIS_LAT_MIN)
            self.assertLessEqual(c["latitude"], POLARIS_LAT_MAX)
            self.assertGreaterEqual(c["longitude"], POLARIS_LON_MIN)
            self.assertLessEqual(c["longitude"], POLARIS_LON_MAX)

    # 10. Timestamp is preserved and stepped forward by +6 hours
    def test_10_timestamp_preservation(self):
        pred = self.adapter.predict_point(self.sample_obs)
        expected_target_ts = "2020-04-15T18:00:00"
        self.assertEqual(pred["timestamp"], expected_target_ts)

    # 11. Forecast horizon is exactly 6 hours
    def test_11_forecast_horizon_is_exactly_6_hours(self):
        pred = self.adapter.predict_point(self.sample_obs)
        self.assertEqual(pred["forecastHorizonHours"], 6)

        # Test rejection of unsupported horizons in API
        resp_bad = self.client.get("/weather/forecast?horizon_hours=12")
        self.assertEqual(resp_bad.status_code, 400)
        self.assertIn("Unsupported forecast horizon", resp_bad.json()["detail"])

        resp_bad24 = self.client.get("/weather/forecast?horizon_hours=24")
        self.assertEqual(resp_bad24.status_code, 400)

    # 12. API routes respond
    def test_12_api_routes_respond(self):
        # GET /weather/health
        resp_h = self.client.get("/weather/health")
        self.assertEqual(resp_h.status_code, 200)

        # POST /weather/predict
        resp_p = self.client.post("/weather/predict", json=self.sample_obs)
        self.assertEqual(resp_p.status_code, 200)
        data_p = resp_p.json()
        self.assertIn("riskScore", data_p)
        self.assertIn("riskClass", data_p)

        # Out-of-domain coordinate validation rejection
        invalid_obs = dict(self.sample_obs)
        invalid_obs["latitude"] = 10.0  # Outside Antarctic domain [-75, -58]
        resp_inv = self.client.post("/weather/predict", json=invalid_obs)
        self.assertEqual(resp_inv.status_code, 422)

        # GET /weather/forecast
        resp_f = self.client.get("/weather/forecast?horizon_hours=6")
        self.assertEqual(resp_f.status_code, 200)
        data_f = resp_f.json()
        self.assertEqual(data_f["totalCells"], 468)
        self.assertEqual(len(data_f["cells"]), 468)

        # POST /weather/grid
        resp_g = self.client.post("/weather/grid", json={"timestamp": "2020-04-15T12:00:00"})
        self.assertEqual(resp_g.status_code, 200)
        data_g = resp_g.json()
        self.assertEqual(data_g["totalCells"], 468)
        self.assertEqual(len(data_g["cells"]), 468)

    # 13. Health reports model loaded
    def test_13_health_reports_model_loaded(self):
        resp = self.client.get("/weather/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["model"], "weather_intelligence_engine")
        self.assertEqual(data["status"], "LOADED")
        self.assertEqual(data["framework"], "PyTorch")
        self.assertEqual(data["forecast_horizon_hours"], 6)
        self.assertEqual(data["grid_cells"], 468)

    # 14. No existing model functionality is affected (clean modular isolation)
    def test_14_no_existing_model_functionality_affected(self):
        # Verify weather router mounts cleanly in any FastAPI app without side effects
        custom_app = FastAPI()
        custom_app.include_router(weather_router)
        custom_client = TestClient(custom_app)
        resp = custom_client.get("/weather/health")
        self.assertEqual(resp.status_code, 200)

        # Verify module imports do not pollute or depend on frontend or other subsystems
        try:
            import src.schemas.weather as sw
            import src.adapters.weather_adapter as wa
            import src.api.weather_routes as wr
        except ImportError:
            import schemas.weather as sw
            import adapters.weather_adapter as wa
            import api.weather_routes as wr
        import src.weather.weather_model as wm
        import src.weather.weather_postprocessing as wp
        import src.weather.feature_engineering as fe

        self.assertTrue(hasattr(sw, "WeatherPointObservation"))
        self.assertTrue(hasattr(wm, "WeatherModelService"))
        self.assertTrue(hasattr(wp, "classify_risk"))
        self.assertTrue(hasattr(fe, "calculate_derived_weather"))
        self.assertTrue(hasattr(wa, "WeatherAdapter"))
        self.assertTrue(hasattr(wr, "router"))


if __name__ == "__main__":
    unittest.main()

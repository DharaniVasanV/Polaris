"""
POLARIS: Phase 1 Common Model Output Contracts Test Suite.
Validates:
1. GRU output normalization: coordinates, 24h horizons, empirical error preserved, confidence is None.
2. ConvLSTM output normalization: 18x26 grid, multi-horizon (0h-24h), SIC, confidence, domain coverage preserved.
3. Weather MLP output normalization: 18x26 grid, 6h horizon, continuous risk score [0, 1], risk class preserved.
4. Safe handling of edge cases and invalid inputs.
5. Model adapter integration with predict_normalized.
"""

import os
import sys
import unittest
import numpy as np

# Ensure backend directory is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

from src.schemas.common import GeoCoordinate
from src.schemas.iceberg import IcebergPredictRequest
from src.schemas.normalized import (
    PredictionPoint,
    IcebergPredictionPoint,
    SeaIcePredictionPoint,
    WeatherPredictionPoint,
    NormalizedModelResponse
)
from src.adapters.iceberg_adapter import IcebergPredictionAdapter
from src.adapters.weather_adapter import get_weather_adapter
from src.sea_ice.model_service import get_or_generate_forecast, get_normalized_sea_ice_forecast
from src.adapters.normalization import (
    normalize_gru_forecast,
    normalize_convlstm_forecast,
    normalize_weather_forecast,
    normalize_model_output
)


class TestModelOutputContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.iceberg_adapter = IcebergPredictionAdapter()
        cls.weather_adapter = get_weather_adapter()

        # 10 verified historical BYU coordinates for Iceberg A23A
        cls.demo_coords = [
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

    # --- 1. GRU Normalization Contract ---
    def test_01_gru_output_normalization(self):
        req = IcebergPredictRequest(
            iceberg_id="A23A",
            historical_coordinates=self.demo_coords,
            steps=5,
            start_date="2024-01-01"
        )
        norm_resp = self.iceberg_adapter.predict_normalized(req, vessel_safety_margin_km=30.0)

        self.assertIsInstance(norm_resp, NormalizedModelResponse)
        self.assertEqual(norm_resp.source, "GRU")
        self.assertEqual(norm_resp.variable, "iceberg_position")
        self.assertEqual(norm_resp.total_points, 5)
        self.assertEqual(len(norm_resp.predictions), 5)

        expected_horizons = [24.0, 48.0, 72.0, 96.0, 120.0]
        for idx, pt in enumerate(norm_resp.predictions):
            self.assertIsInstance(pt, IcebergPredictionPoint)
            self.assertEqual(pt.iceberg_id, "A23A")
            self.assertIsInstance(pt.latitude, float)
            self.assertIsInstance(pt.longitude, float)
            self.assertTrue(-90.0 <= pt.latitude <= 0.0, f"Lat out of range: {pt.latitude}")
            self.assertTrue(-180.0 <= pt.longitude <= 180.0, f"Lon out of range: {pt.longitude}")

            # Verify horizon calculation: Day N = N * 24 hours
            self.assertEqual(pt.horizon_hours, expected_horizons[idx])
            self.assertEqual(pt.step_index, idx + 1)

            # Verify honest uncertainty preservation
            self.assertGreater(pt.empirical_error_km, 0.0)
            self.assertEqual(pt.uncertainty_radius_km, pt.empirical_error_km)
            self.assertEqual(pt.vessel_safety_margin_km, 30.0)
            self.assertAlmostEqual(
                pt.total_hazard_radius_km,
                pt.empirical_error_km + pt.vessel_safety_margin_km,
                places=2
            )

            # Confirm no fake probability confidence score was invented
            self.assertIsNone(pt.confidence)
            self.assertIsNone(pt.value)

    # --- 2. ConvLSTM Normalization Contract ---
    def test_02_convlstm_output_normalization(self):
        raw_forecast = get_or_generate_forecast()
        norm_resp = normalize_convlstm_forecast(raw_forecast)

        self.assertIsInstance(norm_resp, NormalizedModelResponse)
        self.assertEqual(norm_resp.source, "ConvLSTM")
        self.assertEqual(norm_resp.variable, "sea_ice_concentration")

        # 5 horizons * 468 cells = 2340 points
        self.assertEqual(norm_resp.total_points, 5 * 468)
        self.assertEqual(len(norm_resp.predictions), 2340)

        # Check a predicted point within Queen Maud Land
        predicted_points = [p for p in norm_resp.predictions if p.prediction_status == "PREDICTED"]
        self.assertGreater(len(predicted_points), 0)

        for pt in predicted_points[:20]:
            self.assertIsInstance(pt, SeaIcePredictionPoint)
            self.assertTrue(-75.0 <= pt.latitude <= -58.0)
            self.assertTrue(-25.0 <= pt.longitude <= 75.0)
            self.assertTrue(0 <= pt.grid_row <= 17)
            self.assertTrue(0 <= pt.grid_column <= 25)
            self.assertIn(pt.horizon_hours, [0.0, 6.0, 12.0, 18.0, 24.0])

            # Within QML, SIC must be valid fraction [0, 1] and percent [0, 100]
            self.assertIsNotNone(pt.value)
            self.assertTrue(0.0 <= pt.value <= 1.0)
            self.assertTrue(0.0 <= pt.sic_percent <= 100.0)
            self.assertIsNotNone(pt.confidence)
            self.assertTrue(0.0 <= pt.confidence <= 100.0)

        # Check outside-coverage points
        outside_points = [p for p in norm_resp.predictions if p.prediction_status == "OUTSIDE_MODEL_COVERAGE"]
        self.assertGreater(len(outside_points), 0)
        for pt in outside_points[:10]:
            self.assertFalse(pt.data_available)
            self.assertIsNone(pt.value)

    # --- 3. Weather MLP Normalization Contract ---
    def test_03_weather_output_normalization(self):
        norm_resp = self.weather_adapter.predict_grid_normalized([])

        self.assertIsInstance(norm_resp, NormalizedModelResponse)
        self.assertEqual(norm_resp.source, "WeatherMLP")
        self.assertEqual(norm_resp.variable, "weather_risk")
        self.assertEqual(norm_resp.total_points, 468)
        self.assertEqual(len(norm_resp.predictions), 468)

        for pt in norm_resp.predictions:
            self.assertIsInstance(pt, WeatherPredictionPoint)
            self.assertTrue(-75.0 <= pt.latitude <= -58.0)
            self.assertTrue(-25.0 <= pt.longitude <= 75.0)
            self.assertTrue(0 <= pt.grid_row <= 17)
            self.assertTrue(0 <= pt.grid_column <= 25)
            self.assertEqual(pt.horizon_hours, 6.0)

            # Continuous risk score in [0, 1]
            self.assertTrue(0.0 <= pt.risk_score <= 1.0)
            self.assertEqual(pt.value, pt.risk_score)
            self.assertIn(pt.risk_class, ["SAFE", "MODERATE", "HIGH", "CRITICAL"])
            # Confidence is None because MLP does not produce Bayesian confidence
            self.assertIsNone(pt.confidence)

    # --- 4. Dispatcher & Helper Tests ---
    def test_04_dispatcher_routing(self):
        # Dispatcher with Weather
        raw_weather = self.weather_adapter.predict_grid([])
        weather_payload = {
            "model": "weather_intelligence_engine",
            "forecastHorizonHours": 6,
            "timestamp": "2020-04-01T06:00:00",
            "cells": raw_weather
        }
        res_weather = normalize_model_output("WeatherMLP", weather_payload)
        self.assertEqual(res_weather.source, "WeatherMLP")
        self.assertEqual(res_weather.total_points, 468)

        # Unknown source raises ValueError
        with self.assertRaises(ValueError):
            normalize_model_output("NonExistentModel", {})

    # --- 5. Error Handling & Edge Cases ---
    def test_05_invalid_input_handling(self):
        # Invalid forecast type raises ValueError
        with self.assertRaises(ValueError):
            normalize_gru_forecast("not_a_valid_forecast_object")

        with self.assertRaises(ValueError):
            normalize_weather_forecast(12345)


if __name__ == "__main__":
    unittest.main()

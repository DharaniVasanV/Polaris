"""
POLARIS: Phase 2 Spatiotemporal Alignment Test Suite.
Validates:
1. GRU 6h interpolation.
2. GRU 12h interpolation.
3. GRU 18h interpolation.
4. GRU 24h remains actual model output.
5. GRU 48h+ recursive prediction remains unchanged and no extrapolation beyond horizon.
6. Antimeridian interpolation (179° -> -179° wraps through ±180°, not 0°).
7. Invalid latitude rejected with ValueError.
8. Invalid longitude rejected with ValueError.
9. GRU uncertainty preserved honestly.
10. Interpolated uncertainty follows documented conservative rule: max(error_before, error_after).
11. ConvLSTM native horizons remain unchanged.
12. Weather only exposes 6h.
13. No fabricated Weather 0h/12h/18h/24h values.
14. Grid coordinate alignment and orientation verified.
15. Iceberg-to-grid distance mapping works.
16. Outside-model-coverage cells remain explicitly unavailable.
17. Common aligned environmental state validates correctly.
"""

import os
import sys
import unittest
import numpy as np

# Ensure backend directory is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

from src.engines.spatiotemporal_alignment import (
    validate_coordinates,
    normalize_longitude,
    interpolate_coordinates,
    haversine_distance_km,
    interpolate_gru_trajectory,
    build_aligned_environmental_state,
    generate_reference_grid_cells,
    AlignedEnvironmentalState,
    REFERENCE_GRID_ROWS,
    REFERENCE_GRID_COLS,
    REFERENCE_TOTAL_CELLS,
    LAT_MIN,
    LAT_MAX,
    LON_MIN,
    LON_MAX
)
from src.sea_ice.model_service import get_or_generate_forecast
from src.adapters.weather_adapter import get_weather_adapter


class TestSpatiotemporalAlignment(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.anchor = {
            "latitude": -66.4,
            "longitude": 12.5,
            "empirical_error_km": 0.0,
            "vessel_safety_margin_km": 30.0
        }
        cls.forecast_steps = [
            {"step_index": 1, "step": "Day +1", "latitude": -66.0, "longitude": 14.5, "empirical_error_km": 168.02, "vessel_safety_margin_km": 30.0},
            {"step_index": 2, "step": "Day +2", "latitude": -65.6, "longitude": 16.5, "empirical_error_km": 605.24, "vessel_safety_margin_km": 30.0},
            {"step_index": 3, "step": "Day +3", "latitude": -65.2, "longitude": 18.5, "empirical_error_km": 1607.21, "vessel_safety_margin_km": 30.0},
            {"step_index": 4, "step": "Day +4", "latitude": -64.8, "longitude": 20.5, "empirical_error_km": 2158.06, "vessel_safety_margin_km": 30.0},
            {"step_index": 5, "step": "Day +5", "latitude": -64.4, "longitude": 22.5, "empirical_error_km": 2371.12, "vessel_safety_margin_km": 30.0},
        ]
        cls.sea_ice_data = get_or_generate_forecast()
        cls.weather_adapter = get_weather_adapter()
        raw_weather = cls.weather_adapter.predict_grid([])
        cls.weather_data = {
            "model": "weather_intelligence_engine",
            "forecastHorizonHours": 6,
            "timestamp": "2020-04-01T06:00:00",
            "cells": raw_weather
        }

    # --- 1, 2, 3: GRU Interpolation at 6h, 12h, 18h ---
    def test_01_gru_6h_interpolation(self):
        pts = interpolate_gru_trajectory(self.anchor, self.forecast_steps, target_horizons=[6.0])
        self.assertEqual(len(pts), 1)
        pt = pts[0]
        self.assertEqual(pt["horizon_hours"], 6.0)
        self.assertEqual(pt["prediction_type"], "interpolated")

        # alpha = 6/24 = 0.25: lat = -66.4 + 0.25*(0.4) = -66.3, lon = 12.5 + 0.25*(2.0) = 13.0
        self.assertAlmostEqual(pt["latitude"], -66.3, places=2)
        self.assertAlmostEqual(pt["longitude"], 13.0, places=2)

    def test_02_gru_12h_interpolation(self):
        pts = interpolate_gru_trajectory(self.anchor, self.forecast_steps, target_horizons=[12.0])
        self.assertEqual(len(pts), 1)
        pt = pts[0]
        self.assertEqual(pt["horizon_hours"], 12.0)
        self.assertEqual(pt["prediction_type"], "interpolated")

        # alpha = 12/24 = 0.5: lat = -66.2, lon = 13.5
        self.assertAlmostEqual(pt["latitude"], -66.2, places=2)
        self.assertAlmostEqual(pt["longitude"], 13.5, places=2)

    def test_03_gru_18h_interpolation(self):
        pts = interpolate_gru_trajectory(self.anchor, self.forecast_steps, target_horizons=[18.0])
        self.assertEqual(len(pts), 1)
        pt = pts[0]
        self.assertEqual(pt["horizon_hours"], 18.0)
        self.assertEqual(pt["prediction_type"], "interpolated")

        # alpha = 18/24 = 0.75: lat = -66.1, lon = 14.0
        self.assertAlmostEqual(pt["latitude"], -66.1, places=2)
        self.assertAlmostEqual(pt["longitude"], 14.0, places=2)

    # --- 4: GRU 24h remains actual model output ---
    def test_04_gru_24h_remains_model_output(self):
        pts = interpolate_gru_trajectory(self.anchor, self.forecast_steps, target_horizons=[24.0])
        self.assertEqual(len(pts), 1)
        pt = pts[0]
        self.assertEqual(pt["horizon_hours"], 24.0)
        self.assertEqual(pt["prediction_type"], "model")
        self.assertAlmostEqual(pt["latitude"], -66.0, places=3)
        self.assertAlmostEqual(pt["longitude"], 14.5, places=3)
        self.assertEqual(pt["empirical_error_km"], 168.02)

    # --- 5: Longer horizons (48h+) preserved, no extrapolation beyond available ---
    def test_05_gru_longer_horizons_and_no_extrapolation(self):
        pts = interpolate_gru_trajectory(self.anchor, self.forecast_steps, target_horizons=[48.0, 72.0, 96.0, 120.0, 144.0])
        # 144h is beyond the 120h GRU max forecast, so only 4 points returned
        self.assertEqual(len(pts), 4)
        for pt in pts:
            self.assertEqual(pt["prediction_type"], "model")
            self.assertIn(pt["horizon_hours"], [48.0, 72.0, 96.0, 120.0])

    # --- 6: Antimeridian interpolation (179° -> -179°) ---
    def test_06_antimeridian_interpolation(self):
        # Point A at 179°E, Point B at -179°W (181°E). Shortest delta is +2.0° across 180° dateline
        # At alpha = 0.5, should be exactly 180.0° (or -180.0°).
        interp_lat, interp_lon = interpolate_coordinates(-65.0, 179.0, -65.0, -179.0, alpha=0.5)
        self.assertAlmostEqual(interp_lat, -65.0, places=2)
        self.assertEqual(abs(interp_lon), 180.0)

        # At alpha = 0.25: should be 179.5°
        _, lon_25 = interpolate_coordinates(-65.0, 179.0, -65.0, -179.0, alpha=0.25)
        self.assertAlmostEqual(lon_25, 179.5, places=2)

        # At alpha = 0.75: should be -179.5°
        _, lon_75 = interpolate_coordinates(-65.0, 179.0, -65.0, -179.0, alpha=0.75)
        self.assertAlmostEqual(lon_75, -179.5, places=2)

        # Proves it did NOT interpolate across 0° (which would have yielded 0.0 at alpha=0.5)
        self.assertNotAlmostEqual(abs(interp_lon), 0.0, delta=10.0)

    # --- 7 & 8: Latitude / Longitude validation ---
    def test_07_invalid_latitude_rejected(self):
        with self.assertRaises(ValueError):
            validate_coordinates(95.0, 0.0)
        with self.assertRaises(ValueError):
            validate_coordinates(-90.1, 0.0)

    def test_08_invalid_longitude_rejected(self):
        with self.assertRaises(ValueError):
            validate_coordinates(-65.0, 185.0)
        with self.assertRaises(ValueError):
            validate_coordinates(-65.0, -180.1)

    # --- 9 & 10: Uncertainty preservation and conservative rule ---
    def test_09_gru_uncertainty_preserved(self):
        pts = interpolate_gru_trajectory(self.anchor, self.forecast_steps, target_horizons=[0.0, 24.0])
        self.assertEqual(pts[0]["empirical_error_km"], 0.0)
        self.assertEqual(pts[1]["empirical_error_km"], 168.02)
        self.assertEqual(pts[1]["vessel_safety_margin_km"], 30.0)
        self.assertEqual(pts[1]["total_hazard_radius_km"], 198.02)

    def test_10_interpolated_uncertainty_conservative_rule(self):
        # For 6h (between 0h error=0 and 24h error=168.02), conservative error must be max(0, 168.02) = 168.02 km
        pts = interpolate_gru_trajectory(self.anchor, self.forecast_steps, target_horizons=[6.0, 12.0, 18.0])
        for pt in pts:
            self.assertEqual(pt["empirical_error_km"], 168.02)
            self.assertEqual(pt["uncertainty_radius_km"], 168.02)
            self.assertEqual(pt["total_hazard_radius_km"], 198.02)

    # --- 11: ConvLSTM native horizons remain unchanged ---
    def test_11_convlstm_native_horizons_preserved(self):
        state_0h = build_aligned_environmental_state("2024-01-01T00:00:00Z", 0.0, sea_ice_data=self.sea_ice_data)
        state_6h = build_aligned_environmental_state("2024-01-01T00:00:00Z", 6.0, sea_ice_data=self.sea_ice_data)
        state_24h = build_aligned_environmental_state("2024-01-01T00:00:00Z", 24.0, sea_ice_data=self.sea_ice_data)

        self.assertEqual(len(state_0h.cells), REFERENCE_TOTAL_CELLS)
        self.assertEqual(len(state_6h.cells), REFERENCE_TOTAL_CELLS)
        self.assertEqual(len(state_24h.cells), REFERENCE_TOTAL_CELLS)

    # --- 12 & 13: Weather availability strictly at 6h, no fake values at other horizons ---
    def test_12_weather_only_exposes_6h(self):
        state_6h = build_aligned_environmental_state(
            "2024-01-01T00:00:00Z", 6.0, weather_data=self.weather_data
        )
        available_weather_cells = [c for c in state_6h.cells if c.weather.status == "AVAILABLE"]
        self.assertEqual(len(available_weather_cells), REFERENCE_TOTAL_CELLS)
        for c in available_weather_cells:
            self.assertEqual(c.weather.prediction_type, "model")
            self.assertIsNotNone(c.weather.risk_score)
            self.assertTrue(0.0 <= c.weather.risk_score <= 1.0)
            self.assertIn(c.weather.risk_class, ["SAFE", "MODERATE", "HIGH", "CRITICAL"])

    def test_13_no_fabricated_weather_at_other_horizons(self):
        for h in [0.0, 12.0, 18.0, 24.0]:
            state = build_aligned_environmental_state(
                "2024-01-01T00:00:00Z", h, weather_data=self.weather_data
            )
            for c in state.cells:
                self.assertEqual(c.weather.status, "UNAVAILABLE")
                self.assertIsNone(c.weather.risk_score)
                self.assertIsNone(c.weather.risk_class)
                self.assertIn(f"Horizon {h}h unavailable", c.weather.unavailability_reason)

    # --- 14: Grid coordinate alignment verified ---
    def test_14_grid_coordinate_alignment(self):
        cells = generate_reference_grid_cells()
        self.assertEqual(len(cells), REFERENCE_TOTAL_CELLS)
        for c in cells:
            self.assertTrue(0 <= c["row"] <= 17)
            self.assertTrue(0 <= c["column"] <= 25)
            self.assertTrue(LAT_MIN <= c["latitude"] <= LAT_MAX)
            self.assertTrue(LON_MIN <= c["longitude"] <= LON_MAX)

        # Row 0 is North (-58.0°S), Row 17 is South (-75.0°S)
        self.assertEqual(cells[0]["latitude"], -58.0)
        self.assertEqual(cells[-1]["latitude"], -75.0)

    # --- 15: Iceberg-to-grid distance mapping ---
    def test_15_iceberg_to_grid_distance_mapping(self):
        bergs = [{
            "id": "B-22",
            "currentPosition": {"latitude": -66.4, "longitude": 12.5, "empirical_error_km": 0.0, "vessel_safety_margin_km": 30.0},
            "forecast_steps": self.forecast_steps
        }]
        state = build_aligned_environmental_state(
            "2024-01-01T00:00:00Z", 24.0, icebergs_forecast=bergs
        )
        has_hazard = False
        has_warning = False
        for c in state.cells:
            self.assertEqual(len(c.iceberg_hazards), 1)
            hz = c.iceberg_hazards[0]
            self.assertEqual(hz.iceberg_id, "B-22")
            self.assertGreaterEqual(hz.distance_km, 0.0)
            if hz.is_in_hazard_zone:
                has_hazard = True
            if hz.is_in_warning_zone:
                has_warning = True

        self.assertTrue(has_hazard, "At least one cell should be within iceberg hazard zone")
        self.assertTrue(has_warning, "At least one cell should be within warning zone")

    # --- 16: Outside-model-coverage cells remain explicitly unavailable ---
    def test_16_outside_coverage_cells_explicitly_unavailable(self):
        state = build_aligned_environmental_state(
            "2024-01-01T00:00:00Z", 0.0, sea_ice_data=self.sea_ice_data
        )
        outside_cells = [c for c in state.cells if c.sea_ice.status == "OUTSIDE_MODEL_COVERAGE"]
        available_cells = [c for c in state.cells if c.sea_ice.status == "AVAILABLE"]
        self.assertGreater(len(outside_cells), 0)
        self.assertEqual(len(available_cells), 88)
        self.assertEqual(len(outside_cells) + len(available_cells), REFERENCE_TOTAL_CELLS)

        for c in outside_cells:
            self.assertIsNone(c.sea_ice.sic)
            self.assertIsNone(c.sea_ice.sic_percent)

    # --- 17: Common aligned state validates correctly ---
    def test_17_common_aligned_state_validation(self):
        state = build_aligned_environmental_state(
            reference_timestamp="2024-01-01T00:00:00Z",
            horizon_hours=6.0,
            sea_ice_data=self.sea_ice_data,
            weather_data=self.weather_data,
            icebergs_forecast=[{
                "id": "A23A",
                "currentPosition": {"latitude": -65.81, "longitude": -53.51},
                "forecast_steps": self.forecast_steps
            }]
        )
        self.assertIsInstance(state, AlignedEnvironmentalState)
        self.assertEqual(state.horizon_hours, 6.0)
        self.assertEqual(state.total_cells, REFERENCE_TOTAL_CELLS)
        self.assertEqual(len(state.cells), REFERENCE_TOTAL_CELLS)


if __name__ == "__main__":
    unittest.main()

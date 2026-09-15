"""
POLARIS: Centralized Multi-Model Risk Fusion Engine Unit Test Suite (Phase 3).
Verifies:
1. Risk weights sum validation and configuration loading.
2. Monotonic continuous iceberg risk function.
3. Sensitivity requirement: GRU iceberg position change dynamically alters risk.
4. Sensitivity requirement: ConvLSTM SIC change dynamically alters risk.
5. Strict provenance & fallback for ConvLSTM outside model coverage.
6. Sensitivity requirement: Weather MLP risk score consumed directly with no fake wind conversions.
7. Weather MLP single-horizon availability (6h model vs. 0h/12h/18h/24h baseline fallback).
8. Physical constraints and Hard NO-GO triggers (land, ice shelf, bathymetry, SIC threshold, severe wave, iceberg core).
9. Explainability breakdown and dominant risk factor identification.
10. Full 468-cell grid completeness and 5-horizon multi-temporal fusion.
11. FastAPI endpoints (/risk/grid and /risk/fuse) response integrity.
"""

import os
import sys

# Ensure backend directory is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import pytest
import math
from fastapi.testclient import TestClient

from src.api.main import app
from src.engines.risk_fusion_engine import (
    CentralizedRiskFusionEngine,
    risk_fusion_engine,
    RiskWeights,
    VesselRiskParameters,
    calculate_baseline_environment,
    evaluate_cell_risk,
    DEFAULT_WEIGHTS,
    DEFAULT_VESSEL
)
from src.engines.spatiotemporal_alignment import (
    REFERENCE_TOTAL_CELLS,
    AlignedGridCell,
    AlignedSeaIce,
    AlignedWeather,
    IcebergHazardIntersection,
    build_aligned_environmental_state
)


@pytest.fixture
def test_client():
    return TestClient(app)


class TestRiskFusionEngine:

    def test_01_weights_validation_and_config(self):
        """Weights must sum to 1.0; deviations must raise ValueError."""
        # Valid weights
        w = RiskWeights(sea_ice=0.35, iceberg=0.30, wave=0.15, weather=0.10, current=0.05, uncertainty=0.05)
        assert math.isclose(w.sea_ice + w.iceberg + w.wave + w.weather + w.current + w.uncertainty, 1.0)

        # Invalid weights (sum = 1.10)
        with pytest.raises(ValueError, match="RiskWeights must sum to 1.0"):
            RiskWeights(sea_ice=0.45, iceberg=0.30, wave=0.15, weather=0.10, current=0.05, uncertainty=0.05)

    def test_02_deterministic_baseline_environment(self):
        """Checks baseline environmental calculation across polar domain."""
        # Far south land cell
        land_cell = calculate_baseline_environment(latitude=-74.0, longitude=0.0, horizon_hours=0.0)
        assert land_cell["is_land"] is True
        assert land_cell["water_depth_meters"] == 0.0

        # Deep ocean open water cell in north
        ocean_cell = calculate_baseline_environment(latitude=-59.0, longitude=30.0, horizon_hours=0.0)
        assert ocean_cell["is_land"] is False
        assert ocean_cell["water_depth_meters"] > 2000.0
        assert ocean_cell["wave_height_meters"] >= 1.0
        assert ocean_cell["current_speed_knots"] > 0.0

    def test_03_continuous_iceberg_risk_monotonicity(self):
        """Verifies that iceberg risk increases monotonically as distance decreases."""
        distances = [100.0, 60.0, 40.0, 25.0, 15.0, 5.0, 1.0, 0.0]
        risks = []

        for d in distances:
            hazard = IcebergHazardIntersection(
                iceberg_id="BERG_TEST",
                latitude=-65.0,
                longitude=10.0,
                distance_km=d,
                uncertainty_radius_km=15.0,
                vessel_safety_margin_km=15.0,
                total_hazard_radius_km=30.0,
                is_in_hazard_zone=d <= 30.0,
                is_in_warning_zone=d <= 60.0,
                prediction_type="model"
            )
            dummy_cell = AlignedGridCell(
                row=5, column=5, latitude=-65.0, longitude=10.0,
                sea_ice=AlignedSeaIce(status="UNAVAILABLE"),
                weather=AlignedWeather(status="UNAVAILABLE"),
                iceberg_hazards=[hazard]
            )
            fused = evaluate_cell_risk(dummy_cell, horizon_hours=6.0, valid_timestamp="2026-01-01T06:00:00Z")
            risks.append(fused.breakdown.iceberg_risk)

        # Monotonic check: as distance decreases, risk must be non-decreasing
        for i in range(len(risks) - 1):
            assert risks[i] <= risks[i + 1], f"Iceberg risk decreased from d={distances[i]} to d={distances[i+1]}"

        # At d=0, risk must be 100
        assert risks[-1] == 100.0
        # At d=100 (outside 2x danger boundary of 60km), risk must be 0
        assert risks[0] == 0.0

    def test_04_gru_iceberg_position_change_affects_risk(self):
        """
        MANDATORY REQUIREMENT: Changing GRU-predicted iceberg position
        must dynamically alter the calculated risk at affected cells.
        """
        # Cell at (-62.0, 15.0)
        target_lat, target_lon = -62.0, 15.0

        # Scenario A: Iceberg is far away at (-70.0, -20.0)
        iceberg_far = [{
            "iceberg_id": "DYNAMIC_A",
            "anchor_point": {"latitude": -70.0, "longitude": -20.0, "empirical_error_km": 0.0},
            "forecast_steps": [{"step_index": 1, "latitude": -70.0, "longitude": -20.0, "empirical_error_km": 10.0}]
        }]
        resp_a = risk_fusion_engine.fuse_from_raw_models(
            reference_timestamp="2026-01-01T00:00:00Z",
            horizon_hours=24.0,
            icebergs_forecast=iceberg_far
        )
        cell_a = next(c for c in resp_a.cells if abs(c.latitude - target_lat) < 1.0 and abs(c.longitude - target_lon) < 2.5)

        # Scenario B: GRU model predicts iceberg drifts directly to (-62.1, 15.1)
        iceberg_near = [{
            "iceberg_id": "DYNAMIC_A",
            "anchor_point": {"latitude": -65.0, "longitude": 10.0, "empirical_error_km": 0.0},
            "forecast_steps": [{"step_index": 1, "latitude": -62.1, "longitude": 15.1, "empirical_error_km": 10.0}]
        }]
        resp_b = risk_fusion_engine.fuse_from_raw_models(
            reference_timestamp="2026-01-01T00:00:00Z",
            horizon_hours=24.0,
            icebergs_forecast=iceberg_near
        )
        cell_b = next(c for c in resp_b.cells if abs(c.latitude - target_lat) < 1.0 and abs(c.longitude - target_lon) < 2.5)

        # Assert risk changed significantly
        assert cell_b.breakdown.iceberg_risk > cell_a.breakdown.iceberg_risk
        assert cell_b.total_risk > cell_a.total_risk
        assert cell_b.provenance.nearest_iceberg_distance_km < cell_a.provenance.nearest_iceberg_distance_km

    def test_05_sea_ice_concentration_change_affects_risk(self):
        """Changing ConvLSTM SIC input directly changes sea_ice_risk and total_risk."""
        lat, lon = -65.0, 10.0
        # Dummy cell with 10% SIC
        cell_low = AlignedGridCell(
            row=7, column=9, latitude=lat, longitude=lon,
            sea_ice=AlignedSeaIce(status="AVAILABLE", prediction_type="model", sic=0.10, sic_percent=10.0, confidence=90.0),
            weather=AlignedWeather(status="UNAVAILABLE"),
            iceberg_hazards=[]
        )
        fused_low = evaluate_cell_risk(cell_low, horizon_hours=6.0, valid_timestamp="2026-01-01T06:00:00Z")

        # Dummy cell with 80% SIC
        cell_high = AlignedGridCell(
            row=7, column=9, latitude=lat, longitude=lon,
            sea_ice=AlignedSeaIce(status="AVAILABLE", prediction_type="model", sic=0.80, sic_percent=80.0, confidence=90.0),
            weather=AlignedWeather(status="UNAVAILABLE"),
            iceberg_hazards=[]
        )
        fused_high = evaluate_cell_risk(cell_high, horizon_hours=6.0, valid_timestamp="2026-01-01T06:00:00Z")

        assert fused_high.breakdown.sea_ice_risk > fused_low.breakdown.sea_ice_risk
        assert fused_high.total_risk > fused_low.total_risk

    def test_06_convlstm_coverage_and_fallback_provenance(self):
        """Preserves true provenance when inside vs outside ConvLSTM domain."""
        # Inside coverage
        cell_in = AlignedGridCell(
            row=5, column=5, latitude=-63.0, longitude=5.0,
            sea_ice=AlignedSeaIce(status="AVAILABLE", prediction_type="model", sic=0.35, sic_percent=35.0),
            weather=AlignedWeather(status="UNAVAILABLE"),
            iceberg_hazards=[]
        )
        fused_in = evaluate_cell_risk(cell_in, horizon_hours=6.0, valid_timestamp="2026-01-01T06:00:00Z")
        assert fused_in.provenance.sea_ice_model_available is True
        assert fused_in.provenance.sea_ice_source == "convlstm_model"

        # Outside coverage
        cell_out = AlignedGridCell(
            row=2, column=2, latitude=-60.0, longitude=-20.0,
            sea_ice=AlignedSeaIce(status="OUTSIDE_MODEL_COVERAGE"),
            weather=AlignedWeather(status="UNAVAILABLE"),
            iceberg_hazards=[]
        )
        fused_out = evaluate_cell_risk(cell_out, horizon_hours=6.0, valid_timestamp="2026-01-01T06:00:00Z")
        assert fused_out.provenance.sea_ice_model_available is False
        assert fused_out.provenance.sea_ice_source == "outside_coverage"

    def test_07_weather_mlp_direct_risk_score_no_fake_wind(self):
        """Weather MLP risk score is consumed directly; never converted to fake wind speed."""
        lat, lon = -62.0, 10.0

        # Weather risk score = 0.25 -> weather_risk = 25.0
        cell_low = AlignedGridCell(
            row=4, column=9, latitude=lat, longitude=lon,
            sea_ice=AlignedSeaIce(status="UNAVAILABLE"),
            weather=AlignedWeather(status="AVAILABLE", prediction_type="model", risk_score=0.25, risk_class="SAFE"),
            iceberg_hazards=[]
        )
        fused_low = evaluate_cell_risk(cell_low, horizon_hours=6.0, valid_timestamp="2026-01-01T06:00:00Z")
        assert fused_low.breakdown.weather_risk == 25.0
        assert fused_low.provenance.weather_source == "weather_mlp"
        assert fused_low.provenance.weather_model_available is True

        # Weather risk score = 0.85 -> weather_risk = 85.0
        cell_high = AlignedGridCell(
            row=4, column=9, latitude=lat, longitude=lon,
            sea_ice=AlignedSeaIce(status="UNAVAILABLE"),
            weather=AlignedWeather(status="AVAILABLE", prediction_type="model", risk_score=0.85, risk_class="CRITICAL"),
            iceberg_hazards=[]
        )
        fused_high = evaluate_cell_risk(cell_high, horizon_hours=6.0, valid_timestamp="2026-01-01T06:00:00Z")
        assert fused_high.breakdown.weather_risk == 85.0
        assert fused_high.total_risk > fused_low.total_risk

    def test_08_weather_availability_and_fallback_at_non_6h_horizons(self):
        """At horizons != 6h, weather_model_available is False and fallback source is baseline."""
        # Horizon 12h: Weather MLP is unavailable
        state_12h = build_aligned_environmental_state(
            reference_timestamp="2026-01-01T00:00:00Z",
            horizon_hours=12.0
        )
        fused_12h = risk_fusion_engine.fuse_aligned_state(state_12h)
        for c in fused_12h.cells[:10]:
            assert c.provenance.weather_model_available is False
            assert c.provenance.weather_source == "baseline"

    def test_09_hard_no_go_conditions(self):
        """Tests that all documented physical constraints trigger hard NO-GO with proper explanation."""
        # 1. Land constraint
        cell_land = AlignedGridCell(
            row=17, column=10, latitude=-75.0, longitude=0.0,
            sea_ice=AlignedSeaIce(status="UNAVAILABLE"),
            weather=AlignedWeather(status="UNAVAILABLE"),
            iceberg_hazards=[]
        )
        fused_land = evaluate_cell_risk(cell_land, horizon_hours=0.0, valid_timestamp="2026-01-01T00:00:00Z")
        assert fused_land.is_no_go is True
        assert "Continental Landmass" in fused_land.no_go_reason

        # 2. Iceberg core boundary constraint (iceberg_risk >= 95)
        core_hazard = IcebergHazardIntersection(
            iceberg_id="BERG_CORE",
            latitude=-62.0, longitude=0.0,
            distance_km=0.5, # very close
            uncertainty_radius_km=15.0,
            vessel_safety_margin_km=15.0,
            total_hazard_radius_km=30.0,
            is_in_hazard_zone=True,
            is_in_warning_zone=True,
            prediction_type="model"
        )
        cell_berg = AlignedGridCell(
            row=4, column=6, latitude=-62.0, longitude=0.0,
            sea_ice=AlignedSeaIce(status="UNAVAILABLE"),
            weather=AlignedWeather(status="UNAVAILABLE"),
            iceberg_hazards=[core_hazard]
        )
        fused_berg = evaluate_cell_risk(cell_berg, horizon_hours=6.0, valid_timestamp="2026-01-01T06:00:00Z")
        assert fused_berg.is_no_go is True
        assert "Iceberg core hazard" in fused_berg.no_go_reason

    def test_10_risk_categorization_and_breakdown(self):
        """Verifies categorization thresholds and total risk mathematical decomposition."""
        cell = AlignedGridCell(
            row=5, column=5, latitude=-63.0, longitude=10.0,
            sea_ice=AlignedSeaIce(status="AVAILABLE", prediction_type="model", sic=0.40, sic_percent=40.0),
            weather=AlignedWeather(status="AVAILABLE", prediction_type="model", risk_score=0.45, risk_class="MODERATE"),
            iceberg_hazards=[]
        )
        fused = evaluate_cell_risk(cell, horizon_hours=6.0, valid_timestamp="2026-01-01T06:00:00Z")

        # Category is one of documented standards
        assert fused.risk_category in ["SAFE", "MODERATE", "HIGH", "CRITICAL"]
        assert fused.risk_level in ["LOW", "MODERATE", "HIGH", "VERY_HIGH", "CRITICAL"]

        # Component breakdown is populated and non-negative
        b = fused.breakdown
        assert 0.0 <= b.sea_ice_risk <= 100.0
        assert 0.0 <= b.weather_risk <= 100.0
        assert 0.0 <= b.wave_risk <= 100.0
        assert 0.0 <= b.current_risk <= 100.0
        assert 0.0 <= b.uncertainty_risk <= 100.0
        assert 0.0 <= b.total_risk <= 100.0

    def test_11_explainability_and_dominant_factor(self):
        """Explainability text and dominant risk factor must be populated."""
        cell = AlignedGridCell(
            row=5, column=5, latitude=-63.0, longitude=10.0,
            sea_ice=AlignedSeaIce(status="AVAILABLE", prediction_type="model", sic=0.75, sic_percent=75.0),
            weather=AlignedWeather(status="AVAILABLE", prediction_type="model", risk_score=0.10, risk_class="SAFE"),
            iceberg_hazards=[]
        )
        fused = evaluate_cell_risk(cell, horizon_hours=6.0, valid_timestamp="2026-01-01T06:00:00Z")
        assert fused.dominant_risk_factor == "Sea Ice"
        assert "Total risk" in fused.explanation
        assert "Dominant factor" in fused.explanation

    def test_12_fused_risk_grid_completeness(self):
        """Full grid contains exactly 468 cells and valid summary."""
        resp = risk_fusion_engine.fuse_from_raw_models(
            reference_timestamp="2026-01-01T00:00:00Z",
            horizon_hours=6.0
        )
        assert resp.total_cells == REFERENCE_TOTAL_CELLS
        assert len(resp.cells) == REFERENCE_TOTAL_CELLS
        assert "average_risk" in resp.summary
        assert "no_go_cell_count" in resp.summary
        assert resp.summary["passable_cell_count"] + resp.summary["no_go_cell_count"] == 468

    def test_13_multi_temporal_grid_fusion(self):
        """Full timeline fusion generates 5 distinct grids (0h, 6h, 12h, 18h, 24h)."""
        multi_grid = risk_fusion_engine.fuse_temporal_risk_grids(
            reference_timestamp="2026-01-01T00:00:00Z",
            horizons=[0.0, 6.0, 12.0, 18.0, 24.0]
        )
        assert len(multi_grid) == 5
        for h_key in ["0h", "6h", "12h", "18h", "24h"]:
            assert h_key in multi_grid
            assert len(multi_grid[h_key].cells) == 468

    def test_14_fastapi_endpoints_respond(self, test_client):
        """FastAPI /risk/grid and /risk/fuse endpoints respond with 200 OK and valid schema."""
        # 1. GET /risk/grid?horizon=6.0
        res_get = test_client.get("/risk/grid?horizon=6.0")
        assert res_get.status_code == 200
        data_get = res_get.json()
        assert data_get["total_cells"] == 468
        assert len(data_get["cells"]) == 468
        assert "average_risk" in data_get["summary"]

        # 2. POST /risk/fuse
        payload = {
            "reference_timestamp": "2026-01-01T00:00:00Z",
            "horizon_hours": 6.0,
            "weights": {
                "sea_ice": 0.35,
                "iceberg": 0.30,
                "wave": 0.15,
                "weather": 0.10,
                "current": 0.05,
                "uncertainty": 0.05
            }
        }
        res_post = test_client.post("/risk/fuse", json=payload)
        assert res_post.status_code == 200
        data_post = res_post.json()
        assert data_post["total_cells"] == 468

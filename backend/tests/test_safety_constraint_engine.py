"""
POLARIS: Safety Constraint Engine Unit Test Suite (Phase 4).
Verifies:
1. Land -> NO-GO (LAND)
2. Ice shelf -> NO-GO (ICE_SHELF)
3. Insufficient bathymetry -> NO-GO (INSUFFICIENT_DEPTH)
4. Excessive SIC -> NO-GO (EXCESSIVE_SEA_ICE)
5. Severe sea state -> NO-GO (SEVERE_SEA_STATE)
6. Iceberg core intrusion -> NO-GO (ICEBERG_CORE_INTRUSION)
7. Multiple simultaneous violations return ALL reasons
8. Safe cell -> TRAVERSABLE
9. High soft risk alone does NOT automatically become NO-GO
10. Missing SIC does not become zero (MISSING_SIC_DATA -> NOT_CLEARED)
11. Missing bathymetry does not become unlimited depth (MISSING_BATHYMETRY_DATA -> NOT_CLEARED)
12. Missing iceberg data does not become zero risk (MISSING_ICEBERG_DATA -> NOT_CLEARED)
13. Missing wave data does not become calm seas (MISSING_WAVE_DATA -> NOT_CLEARED)
14. Provenance is preserved across all constraint checks
15. Threshold configuration is respected dynamically
16. Boundary conditions are deterministic and exact
17. Phase 3 dynamic sensitivity remains preserved
18. FastAPI endpoints (/safety/evaluate and /safety/grid) respond with 200 OK
"""

import os
import sys

# Ensure backend directory is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import pytest
from fastapi.testclient import TestClient

from src.api.main import app
from src.engines.safety_constraint_engine import (
    SafetyConstraintEngine,
    safety_constraint_engine,
    SafetyConstraintConfig,
    SafetyEvaluation,
    SafetyGridResponse,
    DEFAULT_SAFETY_CONFIG
)
from src.engines.risk_fusion_engine import risk_fusion_engine


@pytest.fixture
def test_client():
    return TestClient(app)


class TestSafetyConstraintEngine:

    def test_01_land_triggers_no_go(self):
        """Continental landmass must trigger NO-GO with machine-readable reason code LAND."""
        ev = safety_constraint_engine.evaluate_cell_safety(
            row=17, column=10, latitude=-75.0, longitude=0.0, horizon_hours=0.0, timestamp="2026-01-01T00:00:00Z",
            is_land=True, is_ice_shelf=False, water_depth_meters=0.0,
            sic_percent=0.0, wave_height_meters=1.0, iceberg_risk=0.0
        )
        assert ev.traversable is False
        assert ev.status == "NO_GO"
        assert "LAND" in ev.no_go_reasons
        assert ev.constraints.land.violated is True

    def test_02_ice_shelf_triggers_no_go(self):
        """Permanent ice shelf must trigger NO-GO with reason code ICE_SHELF."""
        ev = safety_constraint_engine.evaluate_cell_safety(
            row=14, column=12, latitude=-70.0, longitude=10.0, horizon_hours=0.0, timestamp="2026-01-01T00:00:00Z",
            is_land=False, is_ice_shelf=True, water_depth_meters=150.0,
            sic_percent=20.0, wave_height_meters=1.5, iceberg_risk=0.0
        )
        assert ev.traversable is False
        assert ev.status == "NO_GO"
        assert "ICE_SHELF" in ev.no_go_reasons
        assert ev.constraints.ice_shelf.violated is True

    def test_03_insufficient_bathymetry_triggers_no_go(self):
        """Under-clearance (depth < draft + safety margin) must trigger INSUFFICIENT_DEPTH."""
        # Vessel draft 7.8m + safety margin 2.5m = 10.3m
        # Depth = 8.0m -> under-clearance
        ev = safety_constraint_engine.evaluate_cell_safety(
            row=10, column=10, latitude=-66.0, longitude=5.0, horizon_hours=0.0, timestamp="2026-01-01T00:00:00Z",
            is_land=False, is_ice_shelf=False, water_depth_meters=8.0,
            sic_percent=10.0, wave_height_meters=1.5, iceberg_risk=0.0
        )
        assert ev.traversable is False
        assert ev.status == "NO_GO"
        assert "INSUFFICIENT_DEPTH" in ev.no_go_reasons
        assert ev.constraints.bathymetry.violated is True

    def test_04_excessive_sic_triggers_no_go(self):
        """SIC exceeding vessel threshold (e.g. 75% > 70%) must trigger EXCESSIVE_SEA_ICE."""
        ev = safety_constraint_engine.evaluate_cell_safety(
            row=8, column=10, latitude=-64.0, longitude=10.0, horizon_hours=0.0, timestamp="2026-01-01T00:00:00Z",
            is_land=False, is_ice_shelf=False, water_depth_meters=3000.0,
            sic_percent=78.5, wave_height_meters=2.0, iceberg_risk=0.0
        )
        assert ev.traversable is False
        assert ev.status == "NO_GO"
        assert "EXCESSIVE_SEA_ICE" in ev.no_go_reasons
        assert ev.constraints.sea_ice.violated is True

    def test_05_severe_sea_state_triggers_no_go(self):
        """Significant wave height exceeding survivability limit (4.0m * 1.3 = 5.2m) triggers SEVERE_SEA_STATE."""
        ev = safety_constraint_engine.evaluate_cell_safety(
            row=2, column=5, latitude=-59.0, longitude=-10.0, horizon_hours=0.0, timestamp="2026-01-01T00:00:00Z",
            is_land=False, is_ice_shelf=False, water_depth_meters=3500.0,
            sic_percent=0.0, wave_height_meters=5.8, iceberg_risk=0.0
        )
        assert ev.traversable is False
        assert ev.status == "NO_GO"
        assert "SEVERE_SEA_STATE" in ev.no_go_reasons
        assert ev.constraints.sea_state.violated is True

    def test_06_iceberg_core_intrusion_triggers_no_go(self):
        """Iceberg risk score >= 95.0 (core boundary collision) triggers ICEBERG_CORE_INTRUSION."""
        ev = safety_constraint_engine.evaluate_cell_safety(
            row=6, column=8, latitude=-62.5, longitude=12.0, horizon_hours=6.0, timestamp="2026-01-01T06:00:00Z",
            is_land=False, is_ice_shelf=False, water_depth_meters=3200.0,
            sic_percent=15.0, wave_height_meters=2.0, iceberg_risk=98.5,
            nearest_iceberg_id="BERG_CORE", nearest_iceberg_dist_km=0.8
        )
        assert ev.traversable is False
        assert ev.status == "NO_GO"
        assert "ICEBERG_CORE_INTRUSION" in ev.no_go_reasons
        assert ev.constraints.iceberg_core.violated is True

    def test_07_multiple_simultaneous_violations_return_all_reasons(self):
        """When multiple physical constraints are breached simultaneously, ALL reasons are returned."""
        ev = safety_constraint_engine.evaluate_cell_safety(
            row=12, column=5, latitude=-68.0, longitude=0.0, horizon_hours=0.0, timestamp="2026-01-01T00:00:00Z",
            is_land=False, is_ice_shelf=False,
            water_depth_meters=6.5,     # Breaches depth (<10.3m)
            sic_percent=85.0,           # Breaches SIC (>70%)
            wave_height_meters=6.2,     # Breaches wave (>5.2m)
            iceberg_risk=97.0           # Breaches iceberg (>=95)
        )
        assert ev.traversable is False
        assert ev.status == "NO_GO"
        assert "INSUFFICIENT_DEPTH" in ev.no_go_reasons
        assert "EXCESSIVE_SEA_ICE" in ev.no_go_reasons
        assert "SEVERE_SEA_STATE" in ev.no_go_reasons
        assert "ICEBERG_CORE_INTRUSION" in ev.no_go_reasons
        assert len(ev.no_go_reasons) == 4

    def test_08_safe_cell_is_traversable(self):
        """When all hard constraints are satisfied, cell is TRAVERSABLE with no_go_reasons empty."""
        ev = safety_constraint_engine.evaluate_cell_safety(
            row=5, column=10, latitude=-62.0, longitude=15.0, horizon_hours=6.0, timestamp="2026-01-01T06:00:00Z",
            is_land=False, is_ice_shelf=False, water_depth_meters=3400.0,
            sic_percent=35.0, wave_height_meters=2.5, iceberg_risk=20.0,
            total_risk=28.5
        )
        assert ev.traversable is True
        assert ev.status == "TRAVERSABLE"
        assert len(ev.no_go_reasons) == 0
        assert "TRAVERSABLE" in ev.human_explanation

    def test_09_high_soft_risk_alone_does_not_become_no_go(self):
        """
        CRITICAL ARCHITECTURAL GUARANTEE:
        A high soft risk score (e.g. TotalRisk = 82) alone does NOT trigger NO-GO
        unless an explicit hard constraint is breached.
        """
        ev = safety_constraint_engine.evaluate_cell_safety(
            row=4, column=12, latitude=-61.0, longitude=20.0, horizon_hours=18.0, timestamp="2026-01-01T18:00:00Z",
            is_land=False, is_ice_shelf=False, water_depth_meters=3800.0,
            sic_percent=65.0,           # Elevated, but <= safe threshold of 70%
            wave_height_meters=4.8,     # High, but <= severe limit of 5.2m
            iceberg_risk=80.0,          # High caution, but < core hazard threshold of 95
            total_risk=82.5,            # HIGH soft combined risk
            dominant_factor="Sea Ice",
            weather_risk=75.0,
            current_risk=50.0,
            uncertainty_risk=27.5
        )
        # MUST remain TRAVERSABLE for A* algorithm to consider under high cost penalty!
        assert ev.traversable is True
        assert ev.status == "TRAVERSABLE"
        assert len(ev.no_go_reasons) == 0
        assert "CAUTION" in ev.human_explanation

    def test_10_missing_sic_does_not_become_zero(self):
        """Missing SIC data must NOT be silently treated as 0% ice. Must yield NOT_CLEARED."""
        ev = safety_constraint_engine.evaluate_cell_safety(
            row=5, column=5, latitude=-63.0, longitude=5.0, horizon_hours=6.0, timestamp="2026-01-01T06:00:00Z",
            is_land=False, is_ice_shelf=False, water_depth_meters=3000.0,
            sic_percent=None, sic_available=False,
            wave_height_meters=2.0, iceberg_risk=0.0
        )
        assert ev.traversable is False
        assert ev.status == "NOT_CLEARED"
        assert "MISSING_SIC_DATA" in ev.no_go_reasons
        assert "NOT_CLEARED_INSUFFICIENT_DATA" in ev.no_go_reasons

    def test_11_missing_bathymetry_does_not_become_unlimited_depth(self):
        """Missing bathymetry depth must NOT be assumed deep water. Must yield NOT_CLEARED."""
        ev = safety_constraint_engine.evaluate_cell_safety(
            row=5, column=5, latitude=-63.0, longitude=5.0, horizon_hours=6.0, timestamp="2026-01-01T06:00:00Z",
            is_land=False, is_ice_shelf=False,
            water_depth_meters=None,
            sic_percent=20.0, wave_height_meters=2.0, iceberg_risk=0.0
        )
        assert ev.traversable is False
        assert ev.status == "NOT_CLEARED"
        assert "MISSING_BATHYMETRY_DATA" in ev.no_go_reasons

    def test_12_missing_iceberg_data_does_not_become_zero_risk(self):
        """Missing iceberg tracking data must NOT be assumed ice-free ocean. Must yield NOT_CLEARED."""
        ev = safety_constraint_engine.evaluate_cell_safety(
            row=5, column=5, latitude=-63.0, longitude=5.0, horizon_hours=6.0, timestamp="2026-01-01T06:00:00Z",
            is_land=False, is_ice_shelf=False, water_depth_meters=3000.0,
            sic_percent=20.0, wave_height_meters=2.0,
            iceberg_risk=None, iceberg_available=False
        )
        assert ev.traversable is False
        assert ev.status == "NOT_CLEARED"
        assert "MISSING_ICEBERG_DATA" in ev.no_go_reasons

    def test_13_missing_wave_data_does_not_become_calm_seas(self):
        """Missing sea state / wave observations must NOT be assumed calm seas. Must yield NOT_CLEARED."""
        ev = safety_constraint_engine.evaluate_cell_safety(
            row=5, column=5, latitude=-63.0, longitude=5.0, horizon_hours=6.0, timestamp="2026-01-01T06:00:00Z",
            is_land=False, is_ice_shelf=False, water_depth_meters=3000.0,
            sic_percent=20.0,
            wave_height_meters=None, wave_available=False,
            iceberg_risk=0.0
        )
        assert ev.traversable is False
        assert ev.status == "NOT_CLEARED"
        assert "MISSING_WAVE_DATA" in ev.no_go_reasons

    def test_14_provenance_is_preserved(self):
        """Validates that provenance sources are preserved for each constraint check."""
        ev = safety_constraint_engine.evaluate_cell_safety(
            row=5, column=5, latitude=-63.0, longitude=5.0, horizon_hours=6.0, timestamp="2026-01-01T06:00:00Z",
            is_land=False, is_ice_shelf=False, water_depth_meters=2500.0,
            sic_percent=30.0, sic_source="convlstm_model",
            wave_height_meters=2.5, wave_source="baseline",
            iceberg_risk=15.0, iceberg_source="gru_model"
        )
        assert ev.constraints.sea_ice.source == "convlstm_model"
        assert ev.constraints.sea_state.source == "baseline"
        assert ev.constraints.iceberg_core.source == "gru_model"
        assert ev.provenance["sea_ice_source"] == "convlstm_model"

    def test_15_threshold_configuration_is_respected(self):
        """Custom safety thresholds dynamically change traversability."""
        # Default threshold is 70% SIC -> 60% SIC is traversable
        ev_default = safety_constraint_engine.evaluate_cell_safety(
            row=5, column=5, latitude=-63.0, longitude=5.0, horizon_hours=0.0, timestamp="2026-01-01T00:00:00Z",
            is_land=False, is_ice_shelf=False, water_depth_meters=3000.0,
            sic_percent=60.0, wave_height_meters=2.0, iceberg_risk=0.0
        )
        assert ev_default.traversable is True

        # Custom stricter config: safe SIC threshold = 50%
        strict_config = SafetyConstraintConfig(safe_sic_threshold_percent=50.0)
        ev_strict = safety_constraint_engine.evaluate_cell_safety(
            row=5, column=5, latitude=-63.0, longitude=5.0, horizon_hours=0.0, timestamp="2026-01-01T00:00:00Z",
            is_land=False, is_ice_shelf=False, water_depth_meters=3000.0,
            sic_percent=60.0, wave_height_meters=2.0, iceberg_risk=0.0,
            config_override=strict_config
        )
        assert ev_strict.traversable is False
        assert "EXCESSIVE_SEA_ICE" in ev_strict.no_go_reasons

    def test_16_boundary_conditions_are_deterministic(self):
        """Exact threshold boundary conditions operate deterministically."""
        # 1. SIC: 70.0% is <= 70.0% threshold (Traversable), 70.1% is NO-GO
        ev_at_threshold = safety_constraint_engine.evaluate_cell_safety(
            row=5, column=5, latitude=-63.0, longitude=5.0, horizon_hours=0.0, timestamp="2026-01-01T00:00:00Z",
            is_land=False, is_ice_shelf=False, water_depth_meters=3000.0,
            sic_percent=70.0, wave_height_meters=2.0, iceberg_risk=0.0
        )
        assert ev_at_threshold.traversable is True

        ev_over_threshold = safety_constraint_engine.evaluate_cell_safety(
            row=5, column=5, latitude=-63.0, longitude=5.0, horizon_hours=0.0, timestamp="2026-01-01T00:00:00Z",
            is_land=False, is_ice_shelf=False, water_depth_meters=3000.0,
            sic_percent=70.1, wave_height_meters=2.0, iceberg_risk=0.0
        )
        assert ev_over_threshold.traversable is False
        assert "EXCESSIVE_SEA_ICE" in ev_over_threshold.no_go_reasons

        # 2. Depth: required is 7.8 + 2.5 = 10.3m. Exactly 10.3m is Traversable, 10.2m is NO-GO
        ev_depth_exact = safety_constraint_engine.evaluate_cell_safety(
            row=5, column=5, latitude=-63.0, longitude=5.0, horizon_hours=0.0, timestamp="2026-01-01T00:00:00Z",
            is_land=False, is_ice_shelf=False, water_depth_meters=10.3,
            sic_percent=20.0, wave_height_meters=2.0, iceberg_risk=0.0
        )
        assert ev_depth_exact.traversable is True

        ev_depth_under = safety_constraint_engine.evaluate_cell_safety(
            row=5, column=5, latitude=-63.0, longitude=5.0, horizon_hours=0.0, timestamp="2026-01-01T00:00:00Z",
            is_land=False, is_ice_shelf=False, water_depth_meters=10.2,
            sic_percent=20.0, wave_height_meters=2.0, iceberg_risk=0.0
        )
        assert ev_depth_under.traversable is False
        assert "INSUFFICIENT_DEPTH" in ev_depth_under.no_go_reasons

    def test_17_phase_3_sensitivity_remains_active(self):
        """Verifies that shifting GRU iceberg position alters iceberg core intrusion detection."""
        target_lat, target_lon = -62.0, 15.0

        # Iceberg far away: cell is traversable
        iceberg_far = [{
            "iceberg_id": "BERG_FAR",
            "anchor_point": {"latitude": -70.0, "longitude": -20.0, "empirical_error_km": 0.0},
            "forecast_steps": [{"step_index": 1, "latitude": -70.0, "longitude": -20.0, "empirical_error_km": 10.0}]
        }]
        grid_far = risk_fusion_engine.fuse_from_raw_models(
            reference_timestamp="2026-01-01T00:00:00Z",
            horizon_hours=24.0,
            icebergs_forecast=iceberg_far
        )
        fused_cell_far = next(c for c in grid_far.cells if abs(c.latitude - target_lat) < 1.0 and abs(c.longitude - target_lon) < 2.5)
        safety_far = safety_constraint_engine.evaluate_fused_cell(fused_cell_far)
        assert safety_far.constraints.iceberg_core.violated is False

        # Iceberg moves right onto the cell: iceberg risk >= 95 -> NO-GO
        iceberg_close = [{
            "iceberg_id": "BERG_CLOSE",
            "anchor_point": {"latitude": -65.0, "longitude": 10.0, "empirical_error_km": 0.0},
            "forecast_steps": [{"step_index": 1, "latitude": target_lat, "longitude": target_lon, "empirical_error_km": 5.0}]
        }]
        grid_close = risk_fusion_engine.fuse_from_raw_models(
            reference_timestamp="2026-01-01T00:00:00Z",
            horizon_hours=24.0,
            icebergs_forecast=iceberg_close
        )
        fused_cell_close = next(c for c in grid_close.cells if abs(c.latitude - target_lat) < 1.0 and abs(c.longitude - target_lon) < 2.5)
        safety_close = safety_constraint_engine.evaluate_fused_cell(fused_cell_close)
        assert safety_close.traversable is False
        assert safety_close.constraints.iceberg_core.violated is True
        assert "ICEBERG_CORE_INTRUSION" in safety_close.no_go_reasons

    def test_18_fastapi_endpoints_respond(self, test_client):
        """FastAPI /safety/evaluate and /safety/grid endpoints respond with 200 OK and valid schema."""
        # 1. POST /safety/evaluate
        cell_req = {
            "row": 5,
            "column": 10,
            "latitude": -62.0,
            "longitude": 15.0,
            "horizon_hours": 6.0,
            "is_land": False,
            "is_ice_shelf": False,
            "water_depth_meters": 3200.0,
            "sic_percent": 30.0,
            "wave_height_meters": 2.0,
            "iceberg_risk": 10.0
        }
        res_post = test_client.post("/safety/evaluate", json=cell_req)
        assert res_post.status_code == 200
        data_post = res_post.json()
        assert data_post["traversable"] is True
        assert data_post["status"] == "TRAVERSABLE"
        assert len(data_post["no_go_reasons"]) == 0

        # 2. GET /safety/grid?horizon=6.0
        res_get = test_client.get("/safety/grid?horizon=6.0")
        assert res_get.status_code == 200
        data_get = res_get.json()
        assert data_get["total_cells"] == 468
        assert len(data_get["cells"]) == 468
        assert "traversable_cell_count" in data_get
        assert "no_go_cell_count" in data_get
        assert (data_get["traversable_cell_count"] + data_get["no_go_cell_count"] + data_get["not_cleared_cell_count"]) == 468

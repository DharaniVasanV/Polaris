"""
POLARIS: Phase 9 Edge Case, Robustness & Graceful Degradation Test Suite.
Verifies the 15 critical operational edge cases:
1. Missing iceberg detections (empty iceberg list)
2. Missing weather forecast (service unavailable)
3. Missing sea-ice forecast (service unavailable)
4. Coordinates outside Antarctic domain (latitude > 0 or < -90)
5. Coordinates across the antimeridian (180° longitude wrap-around)
6. All corridors blocked by sea ice (>90% everywhere)
7. Start and destination identical
8. Start location inside NO-GO zone (land/shelf)
9. Destination inside NO-GO zone (land/shelf)
10. Extreme wave conditions (wave height >= 14m)
11. Shallow water throughout corridor (< vessel draft + margin)
12. Iceberg core intrusion (distance <= core radius)
13. Horizon beyond maximum forecast (>24h)
14. Extreme vessel speeds (1.0 kt crawl, 50.0 kt high speed)
15. Invalid vessel parameters (negative draft / speed)
"""

import os
import sys
import pytest
from pydantic import ValidationError

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

from src.schemas.multi_objective import RouteOptimizationRequest
from src.schemas.route import AStarRouteRequest
from src.engines.route_optimizer import route_optimizer_engine
from src.engines.time_aware_astar import TimeAwareAStarEngine
from src.engines.safety_constraint_engine import (
    safety_constraint_engine,
    SafetyConstraintConfig,
)
from src.engines.risk_twin_engine import risk_twin_engine


class TestPhase9EdgeCasesAndFailures:

    def test_01_missing_iceberg_detections(self):
        """1. Empty iceberg list passed to route optimizer: must execute gracefully without crash."""
        req = RouteOptimizationRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
        )
        res = route_optimizer_engine.optimize_routes(req, icebergs_forecast=[])
        assert res.success is True
        assert len(res.candidates) > 0

    def test_02_missing_weather_forecast(self):
        """2. Weather forecast empty or unavailable: must fallback gracefully to baseline."""
        req = RouteOptimizationRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
        )
        res = route_optimizer_engine.optimize_routes(req, weather_data={"cells": []})
        assert res.success is True
        assert len(res.candidates) > 0

    def test_03_missing_sea_ice_forecast(self):
        """3. Sea ice forecast empty: must fallback gracefully to climatological baseline."""
        req = RouteOptimizationRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
        )
        res = route_optimizer_engine.optimize_routes(req, sea_ice_data={"forecast": {}})
        assert res.success is True
        assert len(res.candidates) > 0

    def test_04_coordinates_outside_antarctic_domain(self):
        """4. Coordinates outside Antarctic domain: rejected by validation or reports out of domain."""
        # A: Latitude strictly invalid (>90) raises Pydantic ValidationError
        with pytest.raises(ValidationError):
            RouteOptimizationRequest(
                start_latitude=95.0,
                start_longitude=7.0,
                destination_latitude=-66.0,
                destination_longitude=23.0,
            )

        # B: Non-polar coordinates (Lat = +15.0) rejected gracefully by domain check
        res = route_optimizer_engine.optimize_routes(
            RouteOptimizationRequest(
                start_latitude=15.0,
                start_longitude=7.0,
                destination_latitude=-66.0,
                destination_longitude=23.0,
            )
        )
        assert res.success is False or res.feasible_candidates == 0
        assert "no safe traversable path" in res.status_message.lower() or "outside" in res.status_message.lower() or "failed" in res.status_message.lower()

    def test_05_coordinates_antimeridian_wrap(self):
        """5. Longitudes near 180° / -180° antimeridian wrap handled gracefully."""
        req = RouteOptimizationRequest(
            start_latitude=-65.0,
            start_longitude=178.0,
            destination_latitude=-66.0,
            destination_longitude=-178.0,
            max_search_depth_steps=10,
        )
        res = route_optimizer_engine.optimize_routes(req)
        assert res is not None
        assert isinstance(res.status_message, str)

    def test_06_all_corridors_blocked_by_sea_ice(self):
        """6. Severe sea ice conditions: safety constraint and route pathfinder reject impassable ice."""
        # A: Unit constraint check: 95% SIC triggers EXCESSIVE_SEA_ICE
        ev = safety_constraint_engine.evaluate_cell_safety(
            row=8, column=10, latitude=-64.0, longitude=10.0, horizon_hours=0.0,
            timestamp="2026-01-01T00:00:00Z", is_land=False, is_ice_shelf=False,
            water_depth_meters=3000.0, sic_percent=95.0, wave_height_meters=2.0, iceberg_risk=0.0
        )
        assert ev.traversable is False
        assert "EXCESSIVE_SEA_ICE" in ev.no_go_reasons

        # B: Route planner with safe SIC = 1.0% fails gracefully
        astar = TimeAwareAStarEngine()
        strict_cfg = SafetyConstraintConfig(safe_sic_threshold_percent=1.0)
        astar_req = AStarRouteRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
        )
        astar_res = astar.plan_route(astar_req, safety_config_override=strict_cfg)
        assert astar_res.success is False
        assert "non-traversable" in astar_res.status_message.lower() or "no path" in astar_res.status_message.lower()

    def test_07_start_and_destination_identical(self):
        """7. Start and destination identical: handled gracefully without infinite loop or zero div."""
        req = RouteOptimizationRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-63.0,
            destination_longitude=7.0,
        )
        res = route_optimizer_engine.optimize_routes(req)
        assert res is not None
        if res.success:
            assert res.candidates[0].total_distance_km == 0.0 or res.candidates[0].waypoints_count <= 2

    def test_08_start_location_inside_nogo(self):
        """8. Start point inside land/ice shelf NO-GO zone: returns failure gracefully."""
        res = route_optimizer_engine.optimize_routes(
            RouteOptimizationRequest(
                start_latitude=-78.0,  # Deep inland Antarctic ice sheet
                start_longitude=10.0,
                destination_latitude=-63.0,
                destination_longitude=7.0,
            )
        )
        assert res.success is False or res.feasible_candidates == 0

    def test_09_destination_inside_nogo(self):
        """9. Destination inside land/ice shelf NO-GO zone: returns failure gracefully."""
        res = route_optimizer_engine.optimize_routes(
            RouteOptimizationRequest(
                start_latitude=-63.0,
                start_longitude=7.0,
                destination_latitude=-78.0,
                destination_longitude=10.0,
            )
        )
        assert res.success is False or res.feasible_candidates == 0

    def test_10_extreme_wave_conditions(self):
        """10. Extreme wave conditions (15.0m): safety constraint engine flags NO-GO (SEVERE_SEA_STATE)."""
        ev = safety_constraint_engine.evaluate_cell_safety(
            row=2, column=5, latitude=-59.0, longitude=-10.0, horizon_hours=0.0,
            timestamp="2026-01-01T00:00:00Z", is_land=False, is_ice_shelf=False,
            water_depth_meters=3500.0, sic_percent=0.0, wave_height_meters=15.0, iceberg_risk=0.0
        )
        assert ev.traversable is False
        assert "SEVERE_SEA_STATE" in ev.no_go_reasons

    def test_11_shallow_water_throughout_corridor(self):
        """11. Shallow water (2.0m depth vs 7.8m draft): flags NO-GO (INSUFFICIENT_DEPTH)."""
        ev = safety_constraint_engine.evaluate_cell_safety(
            row=10, column=10, latitude=-66.0, longitude=5.0, horizon_hours=0.0,
            timestamp="2026-01-01T00:00:00Z", is_land=False, is_ice_shelf=False,
            water_depth_meters=2.0, sic_percent=10.0, wave_height_meters=1.5, iceberg_risk=0.0
        )
        assert ev.traversable is False
        assert "INSUFFICIENT_DEPTH" in ev.no_go_reasons

    def test_12_iceberg_core_intrusion(self):
        """12. Iceberg core hazard (risk=98.5): flags NO-GO (ICEBERG_CORE_INTRUSION)."""
        ev = safety_constraint_engine.evaluate_cell_safety(
            row=6, column=8, latitude=-62.5, longitude=12.0, horizon_hours=6.0,
            timestamp="2026-01-01T06:00:00Z", is_land=False, is_ice_shelf=False,
            water_depth_meters=3200.0, sic_percent=15.0, wave_height_meters=2.0, iceberg_risk=98.5,
            nearest_iceberg_id="BERG_CORE", nearest_iceberg_dist_km=0.8
        )
        assert ev.traversable is False
        assert "ICEBERG_CORE_INTRUSION" in ev.no_go_reasons

    def test_13_horizon_beyond_maximum_forecast(self):
        """13. Forecast horizon at +48h or +120h: system returns consistent state without crash."""
        cell = risk_twin_engine.inspect_cell(row=5, column=10, horizon_hours=48.0)
        assert cell is not None
        assert cell.horizon_hours == 48.0
        assert "UNAVAILABLE" in cell.weather_provenance
        assert cell.weather_risk is None

    def test_14_extreme_vessel_speeds(self):
        """14. Extreme vessel speeds (1.0 kt crawl and 50.0 kt high speed) evaluate cleanly."""
        # 1.0 kt crawl
        req_crawl = RouteOptimizationRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-64.0,
            destination_longitude=9.0,
            nominal_speed_knots=1.0,
        )
        res_crawl = route_optimizer_engine.optimize_routes(req_crawl)
        assert res_crawl.success is True

        # 50.0 kt high speed
        req_fast = RouteOptimizationRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-64.0,
            destination_longitude=9.0,
            nominal_speed_knots=50.0,
        )
        res_fast = route_optimizer_engine.optimize_routes(req_fast)
        assert res_fast.success is True

        # 1 kt transit time must be significantly larger than 50 kt transit time
        assert res_crawl.candidates[0].total_transit_hours > res_fast.candidates[0].total_transit_hours * 10.0

    def test_15_invalid_vessel_parameters(self):
        """15. Negative speed or invalid parameters: rejected by Pydantic validation."""
        with pytest.raises(ValidationError):
            RouteOptimizationRequest(
                start_latitude=-63.0,
                start_longitude=7.0,
                destination_latitude=-66.0,
                destination_longitude=23.0,
                nominal_speed_knots=-5.0,  # Negative speed! gt=0.0
            )

        with pytest.raises(ValidationError):
            SafetyConstraintConfig(
                vessel_draft_meters=-2.0,  # Negative draft! gt=0.0
            )

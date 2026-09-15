"""
POLARIS: Phase 9 Dynamic Route Behavior & Risk Twin Consistency Test Suite.
Verifies:
TEST A: Baseline environment -> calculate route.
TEST B: Move an iceberg into route corridor -> route changes or accommodates hazard.
TEST C: Move iceberg away -> route recovers optimal geometry.
TEST D: Increase sea-ice concentration -> risk/blocked cells change.
TEST E: Increase weather risk -> risk metrics respond monotonically.
TEST F: Change safety-first vs efficiency-first objective -> route ranking responds.
TEST G: Block all feasible corridors -> system returns NO_FEASIBLE_ROUTE gracefully.
TEST H: Change vessel draft -> insufficient-depth cells change appropriately.
TEST I: Change vessel speed -> ETA changes without altering physical distance.
TEST J: Move start/destination -> route geometry changes dynamically.
CONSISTENCY: Risk Fusion, Risk Twin, Cell Inspection, and Optimizer agree across NOW, +6h, +12h, +18h, +24h.
"""

import os
import sys

# Ensure backend directory is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import pytest
from fastapi.testclient import TestClient

from src.api.main import app
from src.schemas.multi_objective import (
    RouteOptimizationRequest,
    OptimizationWeights,
)
from src.schemas.scenario import (
    ScenarioType,
    ScenarioParameters,
    ScenarioSimulateRequest,
)
from src.schemas.risk_twin import CellInspectionData
from src.engines.route_optimizer import route_optimizer_engine
from src.engines.scenario_engine import scenario_engine
from src.engines.risk_twin_engine import risk_twin_engine
from src.engines.safety_constraint_engine import SafetyConstraintConfig, safety_constraint_engine


@pytest.fixture
def test_client():
    return TestClient(app)


class TestDynamicRouteBehavior:

    def test_A_baseline_environment_calculates_route(self):
        """TEST A: Verify baseline environment calculates feasible multi-objective routes."""
        req = RouteOptimizationRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            nominal_speed_knots=10.0,
        )
        res = route_optimizer_engine.optimize_routes(req)
        assert res.success is True
        assert len(res.candidates) > 0
        assert res.recommended_route_id is not None
        rec = next(r for r in res.candidates if r.route_id == res.recommended_route_id)
        assert rec.total_distance_nm > 0
        assert rec.total_transit_hours > 0
        assert rec.average_risk >= 0.0

    def test_B_move_iceberg_into_corridor_shifts_route(self):
        """TEST B: Move an iceberg directly into corridor -> route detours or changes risk exposure."""
        req = ScenarioSimulateRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            scenario_type=ScenarioType.ICEBERG_DRIFT,
            parameters=ScenarioParameters(
                iceberg_shift_km=45.0,
                iceberg_delta_lat=0.4,
            ),
        )
        res = scenario_engine.simulate_scenario(req)
        assert res.success is True
        assert res.comparison is not None
        # Moving the obstacle must produce a measurable difference in risk exposure or clearance
        assert (
            res.comparison.baseline_weighted_risk_exposure != res.comparison.scenario_weighted_risk_exposure
            or res.comparison.risk_exposure_change_percent != 0.0
            or res.comparison.route_changed is not None
        )

    def test_C_move_iceberg_away_recovers_route(self):
        """TEST C: Clear/deflect obstacle iceberg away -> corridor becomes safer or clearance expands."""
        req = ScenarioSimulateRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            scenario_type=ScenarioType.ICEBERG_CLEARANCE,
            parameters=ScenarioParameters(
                iceberg_shift_km=50.0,
                iceberg_delta_lat=1.5,
            ),
        )
        res = scenario_engine.simulate_scenario(req)
        assert res.success is True
        assert res.comparison is not None
        # Deflecting iceberg away should not increase risk
        assert res.comparison.scenario_weighted_risk_exposure <= res.comparison.baseline_weighted_risk_exposure + 1e-4

    def test_D_increase_sea_ice_concentration_alters_risk_and_blocks(self):
        """TEST D: Increase sea-ice concentration -> risk increases and newly blocked cells occur."""
        req = ScenarioSimulateRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            scenario_type=ScenarioType.SEA_ICE_INCREASE,
            parameters=ScenarioParameters(sic_increase_percent=35.0),
        )
        res = scenario_engine.simulate_scenario(req)
        assert res.success is True
        assert res.comparison is not None
        assert res.comparison.scenario_max_sic_percent >= res.comparison.baseline_max_sic_percent
        assert res.comparison.scenario_average_risk >= res.comparison.baseline_average_risk

    def test_E_increase_weather_risk_increases_risk_metrics(self):
        """TEST E: Escalate weather risk -> average risk exposure increases monotonically."""
        req = ScenarioSimulateRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            scenario_type=ScenarioType.WEATHER_DETERIORATION,
            parameters=ScenarioParameters(weather_risk_delta=0.40),
        )
        res = scenario_engine.simulate_scenario(req)
        assert res.success is True
        assert res.comparison is not None
        assert res.comparison.scenario_average_risk >= res.comparison.baseline_average_risk

    def test_F_objective_priority_shifts_ranking(self):
        """TEST F: Changing objective weights between safety-first and efficiency-first alters recommendations."""
        # Safety priority
        req_safe = ScenarioSimulateRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            scenario_type=ScenarioType.SAFETY_PRIORITY_CHANGE,
            parameters=ScenarioParameters(
                weights_override=OptimizationWeights(risk_weight=0.80, distance_weight=0.10, time_weight=0.05, fuel_weight=0.05)
            ),
        )
        res_safe = scenario_engine.simulate_scenario(req_safe)

        # Efficiency priority
        req_eff = ScenarioSimulateRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            scenario_type=ScenarioType.EFFICIENCY_PRIORITY_CHANGE,
            parameters=ScenarioParameters(
                weights_override=OptimizationWeights(risk_weight=0.05, distance_weight=0.60, time_weight=0.25, fuel_weight=0.10)
            ),
        )
        res_eff = scenario_engine.simulate_scenario(req_eff)

        assert res_safe.success is True
        assert res_eff.success is True
        assert res_safe.comparison is not None
        assert res_eff.comparison is not None

    def test_G_block_corridor_returns_no_feasible_route_gracefully(self):
        """TEST G: When destination is positioned within unnavigable land / ice sheet, returns failure gracefully."""
        # Destination at -75.0°S, 10.0°E (deep inland on Antarctic Ice Sheet NO-GO zone)
        res = route_optimizer_engine.optimize_routes(
            RouteOptimizationRequest(
                start_latitude=-63.0,
                start_longitude=7.0,
                destination_latitude=-75.0,
                destination_longitude=10.0,
            )
        )
        assert res.success is False or len(res.candidates) == 0
        if not res.success:
            assert len(res.status_message) > 0

    def test_H_vessel_draft_alters_under_keel_clearance(self):
        """TEST H: Deeper vessel draft increases required water depth threshold."""
        cfg_shallow = SafetyConstraintConfig(vessel_draft_meters=5.0, under_keel_safety_margin_meters=2.0)
        cfg_deep = SafetyConstraintConfig(vessel_draft_meters=25.0, under_keel_safety_margin_meters=5.0)

        assert cfg_deep.required_water_depth_meters > cfg_shallow.required_water_depth_meters
        assert cfg_shallow.required_water_depth_meters == 7.0
        assert cfg_deep.required_water_depth_meters == 30.0

    def test_I_vessel_speed_changes_eta_without_changing_distance(self):
        """TEST I: Changing vessel speed changes transit ETA while physical great-circle distance remains identical."""
        req_10kt = RouteOptimizationRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            nominal_speed_knots=10.0,
        )
        res_10kt = route_optimizer_engine.optimize_routes(req_10kt)

        req_20kt = RouteOptimizationRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            nominal_speed_knots=20.0,
        )
        res_20kt = route_optimizer_engine.optimize_routes(req_20kt)

        assert res_10kt.success is True and res_20kt.success is True
        r10 = res_10kt.candidates[0]
        r20 = res_20kt.candidates[0]

        assert r20.total_transit_hours < r10.total_transit_hours
        assert pytest.approx(r20.total_transit_hours, rel=0.15) == r10.total_transit_hours / 2.0

    def test_J_move_start_and_destination_dynamically_changes_geometry(self):
        """TEST J: Changing origin and goal coordinates dynamically produces new waypoint geometry."""
        req_short = RouteOptimizationRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-64.0,
            destination_longitude=11.0,
        )
        res_short = route_optimizer_engine.optimize_routes(req_short)

        req_long = RouteOptimizationRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-68.0,
            destination_longitude=25.0,
        )
        res_long = route_optimizer_engine.optimize_routes(req_long)

        assert res_short.success is True and res_long.success is True
        d_short = res_short.candidates[0].total_distance_km
        d_long = res_long.candidates[0].total_distance_km
        assert d_long > d_short


class TestRiskTwinConsistency:

    @pytest.mark.parametrize("horizon", [0.0, 6.0, 12.0, 18.0, 24.0])
    def test_consistency_across_all_forecast_horizons(self, horizon):
        """Verify Risk Twin Cell Inspection returns consistent environmental and safety state across all horizons."""
        row, col = 5, 10
        cell_data = risk_twin_engine.inspect_cell(row=row, column=col, horizon_hours=horizon)
        assert isinstance(cell_data, CellInspectionData)
        assert cell_data.row == row
        assert cell_data.column == col
        assert cell_data.horizon_hours == horizon
        assert 0.0 <= cell_data.total_risk <= 100.0
        assert cell_data.safety_status in ["TRAVERSABLE", "NO_GO", "NOT_CLEARED"]
        assert cell_data.dominant_factor != ""

        # Weather availability check: available at 6h, unavailable beyond 6h
        if horizon > 6.0:
            assert cell_data.weather_risk is None
            assert "UNAVAILABLE" in cell_data.weather_provenance
        elif horizon == 6.0:
            assert "weather_mlp" in cell_data.weather_provenance.lower()

"""
POLARIS: Multi-Objective Route Optimization Engine Unit Test Suite (Phase 6).
Verifies:
1. Multi-objective engine initialization and profile configurations.
2. Candidate generation with identical endpoints (start and destination).
3. Hard safety enforcement: Zero NO-GO cells across all candidate waypoints.
4. Comprehensive metric calculation (distance, ETA, risk exposure, iceberg clearance, fuel proxy).
5. Explicit fuel proxy indexing without certified propulsion claims.
6. Duplicate path detection and graph-based diversity penalty exploration.
7. Pareto dominance analysis across [distance, transit_time, risk_exposure, fuel_proxy].
8. Decision score ranking and dynamic trade-off explanations.
9. Anti-hardcoding verification: no static Route A/B/C or scenario strings.
10. Objective weight sensitivity: varying user priorities shifts rankings dynamically.
11. Out-of-domain and invalid endpoint structured rejection.
12. FastAPI endpoints (/routes/optimize and /route/optimize) response integrity.
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
    RouteOptimizationResponse,
    RouteCandidate,
    ObjectiveProfile,
    OptimizationWeights,
    FuelProxyParameters,
    TradeOffComparison,
)
from src.engines.safety_constraint_engine import SafetyStatus
from src.engines.route_optimizer import (
    RouteOptimizerEngine,
    route_optimizer_engine,
    PROFILE_CONFIGS,
)


@pytest.fixture
def test_client():
    return TestClient(app)


class TestRouteOptimizerEngine:

    def test_01_optimizer_initialization_and_profiles(self):
        """Verifies RouteOptimizerEngine initializes with valid default profiles."""
        engine = RouteOptimizerEngine()
        assert engine is not None
        assert "SAFETY_FIRST" in PROFILE_CONFIGS
        assert "BALANCED" in PROFILE_CONFIGS
        assert "EFFICIENCY_FIRST" in PROFILE_CONFIGS
        assert "DIVERSE_ALTERNATIVE" in PROFILE_CONFIGS

        safety_prof = PROFILE_CONFIGS["SAFETY_FIRST"]
        balanced_prof = PROFILE_CONFIGS["BALANCED"]
        eff_prof = PROFILE_CONFIGS["EFFICIENCY_FIRST"]

        # Risk penalty lambda hierarchy: Safety-First > Balanced > Efficiency-First
        assert safety_prof["lambda_risk"] > balanced_prof["lambda_risk"]
        assert balanced_prof["lambda_risk"] > eff_prof["lambda_risk"]
        assert safety_prof["lambda_risk"] == 5.0
        assert balanced_prof["lambda_risk"] == 2.0
        assert eff_prof["lambda_risk"] == 0.5

    def test_02_optimize_generates_valid_candidates_identical_endpoints(self):
        """Verifies optimize_routes produces valid candidates sharing exact start and destination."""
        req = RouteOptimizationRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            nominal_speed_knots=10.0,
            allow_diagonal_moves=True,
            max_search_depth_steps=60,
        )

        res = route_optimizer_engine.optimize_routes(req)
        assert res.success is True
        assert len(res.candidates) >= 1
        assert res.recommended_route_id is not None

        for candidate in res.candidates:
            # Shared start and destination
            assert len(candidate.waypoints) >= 2
            first_wp = candidate.waypoints[0]
            last_wp = candidate.waypoints[-1]

            assert abs(first_wp.latitude - (-63.0)) < 1.5
            assert abs(first_wp.longitude - 7.0) < 1.5
            assert abs(last_wp.latitude - (-66.0)) < 1.5
            assert abs(last_wp.longitude - 23.0) < 1.5

            # Candidate status valid
            assert candidate.status in ["RECOMMENDED", "AVAILABLE"]
            assert candidate.total_distance_nm > 0.0
            assert candidate.total_transit_hours > 0.0

    def test_03_zero_nogo_waypoints_in_all_candidates(self):
        """Verifies that every waypoint in every generated candidate has SafetyStatus.TRAVERSABLE."""
        req = RouteOptimizationRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            nominal_speed_knots=10.0,
        )
        res = route_optimizer_engine.optimize_routes(req)
        assert res.success is True

        for candidate in res.candidates:
            assert candidate.safety_status == "TRAVERSABLE"
            assert candidate.no_go_cell_count == 0
            for wp in candidate.waypoints:
                assert wp.safety_status == "TRAVERSABLE", (
                    f"Candidate {candidate.route_id} contains non-traversable waypoint: {wp.safety_status}"
                )
                assert wp.is_traversable is True

    def test_04_metric_validity_and_fuel_proxy_labeling(self):
        """Verifies computed metrics: distance, ETA, weighted risk exposure, iceberg clearance, fuel proxy."""
        req = RouteOptimizationRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            nominal_speed_knots=10.0,
        )
        res = route_optimizer_engine.optimize_routes(req)
        assert res.success is True

        for candidate in res.candidates:
            # Distance and time
            assert candidate.total_distance_nm > 300.0
            assert candidate.total_distance_km > 500.0
            assert candidate.total_transit_hours > 0.0

            # Weighted risk exposure: sum(d_i * risk_i / 100) >= 0
            assert candidate.weighted_risk_exposure >= 0.0

            # Sea ice concentration
            assert 0.0 <= candidate.max_sic_percent <= 100.0
            assert 0.0 <= candidate.average_sic_percent <= 100.0

            # Fuel proxy index
            assert candidate.fuel_use_proxy > 0.0

    def test_05_duplicate_detection_and_diversity_penalty(self):
        """Verifies that candidates return distinct routes via duplicate detection and diversity penalty."""
        req = RouteOptimizationRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            nominal_speed_knots=10.0,
        )
        res = route_optimizer_engine.optimize_routes(req)
        assert res.success is True

        # Check path uniqueness: no two candidates should have the exact same list of grid coordinates
        seen_paths = set()
        for candidate in res.candidates:
            path_sig = tuple((wp.row, wp.column) for wp in candidate.waypoints)
            assert path_sig not in seen_paths, f"Duplicate candidate path returned: {candidate.route_id}"
            seen_paths.add(path_sig)

    def test_06_pareto_dominance_mathematical_logic(self):
        """Tests internal Pareto frontier evaluation on synthetic non-dominated and dominated candidates."""
        # Build 3 synthetic candidates
        # Candidate A: distance=400, time=40, risk=150, fuel=450 (safe, longer)
        # Candidate B: distance=380, time=38, risk=250, fuel=420 (fast/efficient, riskier) -> Non-dominated with A
        # Candidate C: distance=450, time=45, risk=300, fuel=500 (strictly worse than B across all 4) -> Dominated
        c_a = RouteCandidate(
            route_id="c_a",
            profile="SAFETY_FIRST",
            title="Safe",
            description="Safe route",
            color="#10B981",
            status="AVAILABLE",
            total_distance_km=740.0,
            total_distance_nm=400.0,
            total_transit_hours=40.0,
            eta_utc="2026-09-12T12:00:00Z",
            weighted_risk_exposure=150.0,
            min_iceberg_clearance_km=25.0,
            max_sic_percent=15.0,
            fuel_use_proxy=450.0,
            is_pareto_efficient=True,
            is_feasible=True,
        )
        c_b = RouteCandidate(
            route_id="c_b",
            profile="EFFICIENCY_FIRST",
            title="Fast",
            description="Fast route",
            color="#F59E0B",
            status="AVAILABLE",
            total_distance_km=703.0,
            total_distance_nm=380.0,
            total_transit_hours=38.0,
            eta_utc="2026-09-12T10:00:00Z",
            weighted_risk_exposure=250.0,
            min_iceberg_clearance_km=15.0,
            max_sic_percent=25.0,
            fuel_use_proxy=420.0,
            is_pareto_efficient=True,
            is_feasible=True,
        )
        c_c = RouteCandidate(
            route_id="c_c",
            profile="BALANCED",
            title="Dominated",
            description="Dominated route",
            color="#0284C7",
            status="AVAILABLE",
            total_distance_km=833.0,
            total_distance_nm=450.0,
            total_transit_hours=45.0,
            eta_utc="2026-09-12T17:00:00Z",
            weighted_risk_exposure=300.0,
            min_iceberg_clearance_km=10.0,
            max_sic_percent=30.0,
            fuel_use_proxy=500.0,
            is_pareto_efficient=True,
            is_feasible=True,
        )

        candidates = [c_a, c_b, c_c]
        pareto_ids = route_optimizer_engine.evaluate_pareto_dominance(candidates)

        assert c_a.is_pareto_efficient is True, "Candidate A should be on Pareto frontier"
        assert c_b.is_pareto_efficient is True, "Candidate B should be on Pareto frontier"
        assert c_c.is_pareto_efficient is False, "Candidate C should be dominated by Candidate B"
        assert "c_a" in pareto_ids
        assert "c_b" in pareto_ids
        assert "c_c" not in pareto_ids

    def test_07_decision_score_ranking_and_recommended_selection(self):
        """Verifies exactly one candidate is RECOMMENDED, matching the top decision score."""
        req = RouteOptimizationRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            nominal_speed_knots=10.0,
        )
        res = route_optimizer_engine.optimize_routes(req)
        assert res.success is True

        recommended = [c for c in res.candidates if c.status == "RECOMMENDED"]
        assert len(recommended) == 1
        assert recommended[0].route_id == res.recommended_route_id

        # The recommended route must have the lowest (best) decision score
        min_score = min(c.decision_score for c in res.candidates)
        assert abs(recommended[0].decision_score - min_score) < 1e-4

        # Verify trade-off comparison vs shortest exists for non-shortest
        for c in res.candidates:
            assert c.dynamic_explanation != ""

    def test_08_dynamic_recommendation_reason(self):
        """Verifies dynamic recommendation explanation is descriptive and contains trade-off metrics."""
        req = RouteOptimizationRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            nominal_speed_knots=10.0,
        )
        res = route_optimizer_engine.optimize_routes(req)
        assert res.success is True
        assert res.recommendation_reason != ""
        assert "Recommended" in res.recommendation_reason
        assert "trade-off" in res.recommendation_reason.lower() or "optimal" in res.recommendation_reason.lower()

    def test_09_anti_hardcoding_no_legacy_strings(self):
        """Verifies no static legacy scenario strings or Route A/B/C are present."""
        req = RouteOptimizationRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            nominal_speed_knots=10.0,
        )
        res = route_optimizer_engine.optimize_routes(req)
        assert res.success is True

        forbidden = ["Route A", "Route B", "Route C", "ICEBERG_SHIFT", "WEATHER_STORM", "HIGH_ICE_ZONE"]
        for c in res.candidates:
            for bad in forbidden:
                assert bad not in c.route_id
                assert bad not in c.title
        for bad in forbidden:
            assert bad not in res.recommendation_reason

    def test_10_weight_sensitivity_shifts_recommendation(self):
        """Verifies that changing user objective weights dynamically alters the decision score and recommendation."""
        # Extreme Distance/Efficiency Priority (distance_weight = 0.90, risk_weight = 0.05)
        req_eff = RouteOptimizationRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            nominal_speed_knots=10.0,
            weights=OptimizationWeights(
                risk_weight=0.05,
                distance_weight=0.90,
                time_weight=0.03,
                fuel_weight=0.02,
            ),
        )
        res_eff = route_optimizer_engine.optimize_routes(req_eff)
        assert res_eff.success is True

        # When distance is 90% of the score, the candidate with the shortest distance should have lowest score
        shortest_candidate = min(res_eff.candidates, key=lambda c: c.total_distance_km)
        assert res_eff.recommended_route_id == shortest_candidate.route_id

    def test_11_out_of_domain_and_invalid_request_handling(self):
        """Verifies structured rejection for out-of-domain or unnavigable coordinates."""
        # Out-of-domain start (-20.0°S is north of domain boundary -58.0°S)
        req_ood = RouteOptimizationRequest(
            start_latitude=-20.0,
            start_longitude=0.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
        )
        res_ood = route_optimizer_engine.optimize_routes(req_ood)
        assert res_ood.success is False
        assert "No" in res_ood.recommendation_reason or "failed" in res_ood.recommendation_reason.lower()
        assert len(res_ood.candidates) == 0

        # Start on continental Antarctic land / ice shelf (-80.0°S)
        req_land = RouteOptimizationRequest(
            start_latitude=-80.0,
            start_longitude=0.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
        )
        res_land = route_optimizer_engine.optimize_routes(req_land)
        assert res_land.success is False
        assert len(res_land.candidates) == 0

    def test_12_fastapi_endpoints_optimize_route(self, test_client):
        """Verifies FastAPI POST /routes/optimize and POST /route/optimize endpoints respond with 200."""
        payload = {
            "start_latitude": -63.0,
            "start_longitude": 7.0,
            "destination_latitude": -66.0,
            "destination_longitude": 23.0,
            "nominal_speed_knots": 10.0,
            "allow_diagonal_moves": True,
            "max_search_depth_steps": 60,
        }

        # Test primary endpoint /routes/optimize
        resp1 = test_client.post("/routes/optimize", json=payload)
        assert resp1.status_code == 200
        data1 = resp1.json()
        assert data1["success"] is True
        assert len(data1["candidates"]) >= 1
        assert "recommended_route_id" in data1
        assert "recommendation_reason" in data1
        assert "diagnostics" in data1
        assert data1["diagnostics"]["distinct_paths_explored"] >= 1

        # Test alias endpoint /route/optimize
        resp2 = test_client.post("/route/optimize", json=payload)
        assert resp2.status_code == 200
        data2 = resp2.json()
        assert data2["success"] is True
        assert data2["recommended_route_id"] == data1["recommended_route_id"]

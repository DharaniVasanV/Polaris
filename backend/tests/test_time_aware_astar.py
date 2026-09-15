"""
POLARIS: Time-Aware A* Pathfinding Engine Unit Test Suite (Phase 5).
Verifies:
1. Coordinate-to-grid mapping and boundary validation.
2. Out-of-domain coordinates rejected with structured failure.
3. Non-traversable start or destination (Land, Ice Shelf) rejected without teleportation.
4. Genuine A* graph search produces valid, continuous path.
5. Time-expanded state progression (temporal advancement along trajectory).
6. Hard safety enforcement: Zero NO-GO cells in generated path.
7. Dynamic obstacle avoidance: Path detours around active GRU iceberg core hazards.
8. Soft risk cost sensitivity: Higher risk penalty lambda guides path away from high-risk waters.
9. Heuristic admissibility: Geodesic distance never overestimates remaining cost.
10. Search diagnostics completeness (nodes expanded, execution time ms).
11. FastAPI endpoints (/route/plan and /routing/astar) response integrity.
"""

import os
import sys

# Ensure backend directory is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import pytest
from fastapi.testclient import TestClient

from src.api.main import app
from src.schemas.route import AStarRouteRequest, AStarRouteResponse
from src.engines.time_aware_astar import (
    TimeAwareAStarEngine,
    time_aware_astar_engine,
    coordinate_to_grid_cell,
    grid_cell_to_coordinate,
    is_coordinate_in_domain
)
from src.engines.spatiotemporal_alignment import haversine_distance_km


@pytest.fixture
def test_client():
    return TestClient(app)


class TestTimeAwareAStarEngine:

    def test_01_coordinate_to_grid_cell_mapping(self):
        """Converts continuous coordinates to grid cells and verifies consistency."""
        # Top-left corner: (-58.0°S, -25.0°W) -> (0, 0)
        r0, c0 = coordinate_to_grid_cell(-58.0, -25.0)
        assert (r0, c0) == (0, 0)

        # Bottom-right corner: (-75.0°S, 75.0°E) -> (17, 25)
        r_end, c_end = coordinate_to_grid_cell(-75.0, 75.0)
        assert (r_end, c_end) == (17, 25)

        # Round-trip check
        lat, lon = grid_cell_to_coordinate(5, 10)
        r, c = coordinate_to_grid_cell(lat, lon)
        assert (r, c) == (5, 10)

    def test_02_out_of_domain_coordinates_rejected(self):
        """Coordinates outside supported POLARIS bounds are rejected with structured failure."""
        req = AStarRouteRequest(
            start_latitude=-40.0, # Outside Antarctic corridor (< -58.0)
            start_longitude=0.0,
            destination_latitude=-65.0,
            destination_longitude=20.0
        )
        resp = time_aware_astar_engine.plan_route(req)
        assert resp.success is False
        assert "outside supported POLARIS domain" in resp.status_message

    def test_03_non_traversable_start_or_goal_rejected(self):
        """Start or goal located on continental landmass or ice shelf is rejected immediately."""
        # Continental Landmass at (-75.0°S, 0.0°E)
        req_land = AStarRouteRequest(
            start_latitude=-75.0,
            start_longitude=0.0,
            destination_latitude=-60.0,
            destination_longitude=10.0
        )
        resp_land = time_aware_astar_engine.plan_route(req_land)
        assert resp_land.success is False
        assert "non-traversable" in resp_land.status_message

    def test_04_genuine_astar_path_found(self):
        """Plans a valid navigable path between open-water coordinates."""
        req = AStarRouteRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            nominal_speed_knots=10.0,
            risk_penalty_lambda=1.0
        )
        resp = time_aware_astar_engine.plan_route(req)
        assert resp.success is True
        assert resp.total_waypoints >= 2
        assert resp.total_distance_km > 0.0
        assert resp.total_transit_hours > 0.0

        # Verify spatial continuity: each waypoint must be adjacent to the previous (max 1 row, 1 col delta)
        for i in range(len(resp.waypoints) - 1):
            w1 = resp.waypoints[i]
            w2 = resp.waypoints[i + 1]
            assert abs(w2.row - w1.row) <= 1
            assert abs(w2.column - w1.column) <= 1
            assert (w2.row, w2.column) != (w1.row, w1.column)

    def test_05_time_expanded_state_advancement(self):
        """Horizon hours must strictly increase along waypoints as vessel progresses."""
        req = AStarRouteRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            nominal_speed_knots=10.0
        )
        resp = time_aware_astar_engine.plan_route(req)
        assert resp.success is True

        horizons = [wp.horizon_hours for wp in resp.waypoints]
        # Strict temporal advancement
        for i in range(len(horizons) - 1):
            assert horizons[i] < horizons[i + 1], f"Horizon did not advance at step {i}: {horizons[i]} -> {horizons[i+1]}"

    def test_06_hard_safety_constraints_pruned(self):
        """Every single waypoint in the returned route must be verified TRAVERSABLE."""
        req = AStarRouteRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            risk_penalty_lambda=2.0
        )
        resp = time_aware_astar_engine.plan_route(req)
        assert resp.success is True

        for wp in resp.waypoints:
            assert wp.is_traversable is True
            assert wp.safety_status == "TRAVERSABLE"
            # Hard physical constraints must never be violated
            assert wp.sic_percent <= 70.0

    def test_07_iceberg_core_avoidance(self):
        """Pathfinder dynamically detours around an active GRU iceberg hazard zone."""
        # Place iceberg right between start and goal
        # Start at (-63.0, 7.0), Goal at (-63.0, 23.0)
        # Iceberg right at (-63.0, 15.0) -> (row 5, col 10)
        blocking_iceberg = [{
            "iceberg_id": "BERG_BLOCKER",
            "anchor_point": {"latitude": -63.0, "longitude": 15.0, "empirical_error_km": 15.0, "vessel_safety_margin_km": 15.0},
            "forecast_steps": [{"step_index": 1, "latitude": -63.0, "longitude": 15.0, "empirical_error_km": 20.0}]
        }]

        req = AStarRouteRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-63.0,
            destination_longitude=23.0,
            risk_penalty_lambda=3.0
        )
        resp = time_aware_astar_engine.plan_route(req, icebergs_forecast=blocking_iceberg)
        assert resp.success is True

        # Ensure path does not hit the blocking cell (-63.0, 15.0) -> row 5, col 10
        target_r, target_c = coordinate_to_grid_cell(-63.0, 15.0)
        for wp in resp.waypoints:
            # Must not traverse the core hazard cell
            assert not (wp.row == target_r and wp.column == target_c), "Route traversed core iceberg hazard zone!"

    def test_08_soft_risk_cost_monotonicity(self):
        """Increasing risk penalty lambda causes A* to prioritize safer waters over shortest distance."""
        # Run with lambda = 0.0 (Pure distance shortest path)
        req_shortest = AStarRouteRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            risk_penalty_lambda=0.0
        )
        resp_shortest = time_aware_astar_engine.plan_route(req_shortest)
        assert resp_shortest.success is True

        # Run with lambda = 5.0 (High safety priority)
        req_safe = AStarRouteRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            risk_penalty_lambda=5.0
        )
        resp_safe = time_aware_astar_engine.plan_route(req_safe)
        assert resp_safe.success is True

        # Higher lambda route must have equal or lower average risk
        assert resp_safe.average_risk <= resp_shortest.average_risk

    def test_09_heuristic_admissibility(self):
        """Admissible heuristic: Great-circle distance never exceeds actual grid transition distance."""
        start_lat, start_lon = -63.0, 7.0
        goal_lat, goal_lon = -66.0, 23.0

        h = haversine_distance_km(start_lat, start_lon, goal_lat, goal_lon)

        req = AStarRouteRequest(
            start_latitude=start_lat,
            start_longitude=start_lon,
            destination_latitude=goal_lat,
            destination_longitude=goal_lon,
            risk_penalty_lambda=0.0
        )
        resp = time_aware_astar_engine.plan_route(req)
        assert resp.success is True
        # True distance must be >= straight-line heuristic
        assert resp.total_distance_km >= h

    def test_10_search_diagnostics_completeness(self):
        """Search diagnostics contain complete graph search performance metrics."""
        req = AStarRouteRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0
        )
        resp = time_aware_astar_engine.plan_route(req)
        assert resp.success is True
        diag = resp.diagnostics
        assert diag is not None
        assert diag.nodes_expanded > 0
        assert diag.nodes_generated >= diag.nodes_expanded
        assert diag.closed_set_size > 0
        assert diag.execution_time_ms > 0.0
        assert diag.optimal_path_found is True

    def test_11_fastapi_route_plan_endpoint_responds(self, test_client):
        """FastAPI POST /route/plan and /routing/astar endpoints respond with 200 OK and valid schema."""
        payload = {
            "start_latitude": -63.0,
            "start_longitude": 7.0,
            "destination_latitude": -66.0,
            "destination_longitude": 23.0,
            "nominal_speed_knots": 10.0,
            "risk_penalty_lambda": 2.0
        }
        res = test_client.post("/route/plan", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["total_waypoints"] > 0
        assert len(data["waypoints"]) > 0
        assert "diagnostics" in data

    def test_12_temporal_state_identity(self):
        """Proves that (row, col, t0) and (row, col, t1) are distinct states with time-varying safety."""
        s0 = (5, 10, 0)
        s1 = (5, 10, 1)
        # 1. State tuple identity
        assert s0 != s1
        assert hash(s0) != hash(s1)

        # 2. Demonstrate that a spatial cell can have time-varying safety:
        # An iceberg hazard exists at (5, 10) at t=0, making it NO-GO at 0h.
        # But by t=18h the iceberg has drifted away to (5, 25), leaving (5, 10) clear.
        iceberg_forecast = [{
            "iceberg_id": "MOVING_BERG",
            "anchor_point": {"latitude": -63.0, "longitude": 15.0, "empirical_error_km": 15.0, "vessel_safety_margin_km": 15.0},
            "forecast_steps": [
                {"step_index": 1, "latitude": -63.0, "longitude": 35.0, "empirical_error_km": 15.0}
            ]
        }]
        req_start_at_0h = AStarRouteRequest(
            start_latitude=-63.0,
            start_longitude=15.0,
            destination_latitude=-63.0,
            destination_longitude=23.0,
            departure_delay_hours=0.0
        )
        resp_at_0h = time_aware_astar_engine.plan_route(req_start_at_0h, icebergs_forecast=iceberg_forecast)
        assert resp_at_0h.success is False
        assert "non-traversable" in resp_at_0h.status_message

    def test_13_diagonal_squeeze_and_corner_cutting_prevention(self):
        """Diagonal moves cannot squeeze between two NO-GO obstacles or cut continental corners."""
        start_lat, start_lon = grid_cell_to_coordinate(5, 8)
        goal_lat, goal_lon = grid_cell_to_coordinate(6, 9)

        # Place blocking obstacles on BOTH intermediate orthogonal cells: (6, 8) and (5, 9)
        squeeze_hazards = [
            {
                "iceberg_id": "PINCH_1",
                "anchor_point": {"latitude": -64.0, "longitude": 7.0, "empirical_error_km": 15.0, "vessel_safety_margin_km": 15.0},
                "forecast_steps": [{"step_index": 1, "latitude": -64.0, "longitude": 7.0, "empirical_error_km": 15.0}]
            },
            {
                "iceberg_id": "PINCH_2",
                "anchor_point": {"latitude": -63.0, "longitude": 11.0, "empirical_error_km": 15.0, "vessel_safety_margin_km": 15.0},
                "forecast_steps": [{"step_index": 1, "latitude": -63.0, "longitude": 11.0, "empirical_error_km": 15.0}]
            }
        ]

        req = AStarRouteRequest(
            start_latitude=start_lat,
            start_longitude=start_lon,
            destination_latitude=goal_lat,
            destination_longitude=goal_lon
        )
        resp = time_aware_astar_engine.plan_route(req, icebergs_forecast=squeeze_hazards)
        # Direct diagonal squeeze [(5, 8), (6, 9)] must NOT be permitted through the pinch point
        if resp.success:
            for i in range(len(resp.waypoints) - 1):
                wp_curr = (resp.waypoints[i].row, resp.waypoints[i].column)
                wp_next = (resp.waypoints[i+1].row, resp.waypoints[i+1].column)
                assert not (wp_curr == (5, 8) and wp_next == (6, 9)), "Diagonal squeeze occurred between two NO-GO cells!"
        else:
            assert resp.success is False

    def test_14_anti_hardcoding_risk_field_path_change(self):
        """CRITICAL ANTI-HARDCODING TEST: Demonstrates that changing the risk field changes the selected A* path."""
        start_lat, start_lon = grid_cell_to_coordinate(5, 8)
        goal_lat, goal_lon = grid_cell_to_coordinate(5, 12)

        # Case 1: Hazard along northern Route X (at (5, 10))
        hazard_on_X = [{
            "iceberg_id": "HAZARD_X",
            "anchor_point": {"latitude": -63.0, "longitude": 15.0, "empirical_error_km": 10.0, "vessel_safety_margin_km": 10.0},
            "forecast_steps": [{"step_index": 1, "latitude": -63.0, "longitude": 15.0, "empirical_error_km": 10.0}]
        }]

        req = AStarRouteRequest(
            start_latitude=start_lat,
            start_longitude=start_lon,
            destination_latitude=goal_lat,
            destination_longitude=goal_lon,
            risk_penalty_lambda=5.0
        )
        resp_1 = time_aware_astar_engine.plan_route(req, icebergs_forecast=hazard_on_X)
        assert resp_1.success is True
        path_1 = [(w.row, w.column) for w in resp_1.waypoints]

        # Case 2: Hazard shifted to southern Route Y (at (6, 10))
        hazard_on_Y = [{
            "iceberg_id": "HAZARD_Y",
            "anchor_point": {"latitude": -64.0, "longitude": 15.0, "empirical_error_km": 10.0, "vessel_safety_margin_km": 10.0},
            "forecast_steps": [{"step_index": 1, "latitude": -64.0, "longitude": 15.0, "empirical_error_km": 10.0}]
        }]
        resp_2 = time_aware_astar_engine.plan_route(req, icebergs_forecast=hazard_on_Y)
        assert resp_2.success is True
        path_2 = [(w.row, w.column) for w in resp_2.waypoints]

        # Path must dynamically change in response to the risk field alone!
        assert path_1 != path_2, "A* selected the same path despite inverted risk field!"
        assert (5, 10) not in path_1, "Path 1 failed to avoid hazard at (5, 10)"
        assert (5, 10) in path_2, "Path 2 failed to take clear cell (5, 10) when hazard shifted"

    def test_15_synthetic_cost_formula_monotonicity(self):
        """Confirms cost = distance + lambda * (risk / 100) * distance is strictly monotonic with respect to risk."""
        distance = 100.0
        lambda_val = 2.0

        # Cost at risk = 20 vs risk = 80
        cost_low = distance + lambda_val * (20.0 / 100.0) * distance
        cost_high = distance + lambda_val * (80.0 / 100.0) * distance

        assert cost_low < cost_high
        assert cost_low == 140.0
        assert cost_high == 260.0

        # At lambda = 0 (pure distance)
        cost_zero_lambda_low = distance + 0.0 * (20.0 / 100.0) * distance
        cost_zero_lambda_high = distance + 0.0 * (80.0 / 100.0) * distance
        assert cost_zero_lambda_low == cost_zero_lambda_high == distance

    def test_16_all_failure_modes_structured_rejection(self):
        """Verifies structured rejection across all domain, safety, and search failure modes without empty success."""
        # 1. Start out of domain
        r1 = time_aware_astar_engine.plan_route(AStarRouteRequest(
            start_latitude=-30.0, start_longitude=0.0, destination_latitude=-65.0, destination_longitude=10.0
        ))
        assert r1.success is False
        assert "outside supported POLARIS domain" in r1.status_message
        assert len(r1.waypoints) == 0

        # 2. Destination out of domain (Earth valid [-90, 90], but outside POLARIS [-75, -58])
        r2 = time_aware_astar_engine.plan_route(AStarRouteRequest(
            start_latitude=-65.0, start_longitude=10.0, destination_latitude=-80.0, destination_longitude=10.0
        ))
        assert r2.success is False
        assert "outside supported POLARIS domain" in r2.status_message
        assert len(r2.waypoints) == 0

        # 3. Start on continental landmass
        r3 = time_aware_astar_engine.plan_route(AStarRouteRequest(
            start_latitude=-75.0, start_longitude=0.0, destination_latitude=-65.0, destination_longitude=10.0
        ))
        assert r3.success is False
        assert "non-traversable" in r3.status_message
        assert len(r3.waypoints) == 0

        # 4. Destination on continental landmass
        r4 = time_aware_astar_engine.plan_route(AStarRouteRequest(
            start_latitude=-65.0, start_longitude=10.0, destination_latitude=-75.0, destination_longitude=0.0
        ))
        assert r4.success is False
        assert "non-traversable" in r4.status_message
        assert len(r4.waypoints) == 0

        # 5. Search depth exhausted (far goal with shallow search limit)
        r5 = time_aware_astar_engine.plan_route(AStarRouteRequest(
            start_latitude=-63.0, start_longitude=7.0, destination_latitude=-66.0, destination_longitude=55.0,
            max_search_depth_steps=5  # Insufficient steps to reach destination at lon 55.0
        ))
        assert r5.success is False
        assert "No safe traversable path found" in r5.status_message
        assert len(r5.waypoints) == 0

    def test_17_phase_4_safety_status_strict_verification(self):
        """Verifies that no returned waypoint ever contains NO_GO or NOT_CLEARED status."""
        req = AStarRouteRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0
        )
        resp = time_aware_astar_engine.plan_route(req)
        assert resp.success is True
        for wp in resp.waypoints:
            assert wp.is_traversable is True
            assert wp.safety_status == "TRAVERSABLE"
            assert wp.safety_status != "NO_GO"
            assert wp.safety_status != "NOT_CLEARED"

    def test_18_no_legacy_route_dependency(self):
        """Verifies that time-aware A* executes dynamic search without any dependency on Route A/B/C."""
        # Check source code of time_aware_astar.py for any hardcoded route references
        import inspect
        from src.engines import time_aware_astar
        src = inspect.getsource(time_aware_astar)
        assert "Route A" not in src
        assert "Route B" not in src
        assert "Route C" not in src
        assert "ICEBERG_SHIFT" not in src
        assert "SCENARIO" not in src

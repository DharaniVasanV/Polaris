"""
POLARIS: Genuine Time-Aware A* Pathfinding Engine (Phase 5).
Implements spatiotemporal heuristic graph search over the 468-cell POLARIS grid:
    State = (row, column, time_index)
where the same geographic coordinate at different lead time horizons constitutes
independent search states with time-evolving environmental hazards.

Core Guarantees:
1. Genuine Graph Search: Uses heapq priority queue, admissible geodesic heuristic,
   open list / closed set tracking, and parent pointer path reconstruction.
2. Hard Safety Enforcement: Consumes Phase 4 SafetyConstraintEngine. Any node with
   traversable=False (Land, Ice Shelf, Shallow Depth, Excessive SIC, Severe Wave, Iceberg Core)
   is strictly pruned from expansion.
3. Soft Risk Cost Function: Consumes Phase 3 total risk as a monotonic soft penalty:
   cost(u, v) = distance_km + lambda * (risk / 100.0) * distance_km
4. Admissible Heuristic: Great-circle Haversine distance to goal ensures optimality
   without overestimating future cost.
5. No Hardcoded Routes: Paths emerge dynamically from spatiotemporal conditions.
"""

import time
import math
import heapq
import datetime
from typing import Dict, Any, List, Optional, Tuple, Set
from pydantic import BaseModel

try:
    from src.schemas.route import (
        AStarRouteRequest,
        AStarRouteResponse,
        TimeAwareWaypoint,
        AStarSearchDiagnostics
    )
    from src.engines.spatiotemporal_alignment import (
        REFERENCE_GRID_ROWS,
        REFERENCE_GRID_COLS,
        REFERENCE_TOTAL_CELLS,
        LAT_MIN,
        LAT_MAX,
        LON_MIN,
        LON_MAX,
        COMMON_HORIZONS,
        haversine_distance_km
    )
    from src.engines.risk_fusion_engine import (
        risk_fusion_engine,
        calculate_baseline_environment,
        VesselRiskParameters
    )
    from src.engines.safety_constraint_engine import (
        safety_constraint_engine,
        SafetyConstraintConfig,
        DEFAULT_SAFETY_CONFIG
    )
except ImportError:
    from schemas.route import (
        AStarRouteRequest,
        AStarRouteResponse,
        TimeAwareWaypoint,
        AStarSearchDiagnostics
    )
    from engines.spatiotemporal_alignment import (
        REFERENCE_GRID_ROWS,
        REFERENCE_GRID_COLS,
        REFERENCE_TOTAL_CELLS,
        LAT_MIN,
        LAT_MAX,
        LON_MIN,
        LON_MAX,
        COMMON_HORIZONS,
        haversine_distance_km
    )
    from engines.risk_fusion_engine import (
        risk_fusion_engine,
        calculate_baseline_environment,
        VesselRiskParameters
    )
    from engines.safety_constraint_engine import (
        safety_constraint_engine,
        SafetyConstraintConfig,
        DEFAULT_SAFETY_CONFIG
    )


# Grid coordinate lookup precomputations
D_LAT = (LAT_MAX - LAT_MIN) / (REFERENCE_GRID_ROWS - 1)  # ( -58 - -75 ) / 17 = 1.0 deg
D_LON = (LON_MAX - LON_MIN) / (REFERENCE_GRID_COLS - 1)  # ( 75 - -25 ) / 25 = 4.0 deg

HORIZON_LEVELS: List[float] = [0.0, 6.0, 12.0, 18.0, 24.0]


def grid_cell_to_coordinate(row: int, col: int) -> Tuple[float, float]:
    """Converts (row, column) to geographic (latitude, longitude)."""
    lat = LAT_MAX - row * D_LAT
    lon = LON_MIN + col * D_LON
    return round(lat, 4), round(lon, 4)


def coordinate_to_grid_cell(latitude: float, longitude: float) -> Tuple[int, int]:
    """Maps continuous geographic coordinates to the nearest reference grid cell."""
    lat = max(LAT_MIN, min(LAT_MAX, float(latitude)))
    lon = max(LON_MIN, min(LON_MAX, float(longitude)))

    row = int(round((LAT_MAX - lat) / D_LAT))
    col = int(round((lon - LON_MIN) / D_LON))

    row = max(0, min(REFERENCE_GRID_ROWS - 1, row))
    col = max(0, min(REFERENCE_GRID_COLS - 1, col))
    return row, col


def is_coordinate_in_domain(latitude: float, longitude: float) -> bool:
    """Checks if coordinates fall within supported POLARIS Antarctic demonstration bounds."""
    lat_ok = (LAT_MIN <= latitude <= LAT_MAX)
    lon_ok = (LON_MIN <= longitude <= LON_MAX)
    return lat_ok and lon_ok


class TimeAwareAStarEngine:
    """
    Genuine Time-Aware A* pathfinder navigating dynamic spatiotemporal ice & weather grids.
    """

    def __init__(self, safety_config: Optional[SafetyConstraintConfig] = None):
        self.safety_config = safety_config or DEFAULT_SAFETY_CONFIG

    def plan_route(
        self,
        request: AStarRouteRequest,
        sea_ice_data: Optional[Dict[str, Any]] = None,
        weather_data: Optional[Dict[str, Any]] = None,
        icebergs_forecast: Optional[List[Dict[str, Any]]] = None,
        safety_config_override: Optional[SafetyConstraintConfig] = None,
        cell_cost_penalties: Optional[Dict[Tuple[int, int], float]] = None
    ) -> AStarRouteResponse:
        """
        Plans an optimal safe path from start to destination across the dynamic spatiotemporal graph.
        """
        start_time_perf = time.perf_counter()
        cfg = safety_config_override or self.safety_config

        # 1. Coordinate Domain Validation
        if not is_coordinate_in_domain(request.start_latitude, request.start_longitude):
            return AStarRouteResponse(
                success=False,
                status_message=(
                    f"Start coordinate ({request.start_latitude}, {request.start_longitude}) "
                    f"is outside supported POLARIS domain (Lat [{LAT_MIN}, {LAT_MAX}], Lon [{LON_MIN}, {LON_MAX}])."
                ),
                departure_utc=request.reference_timestamp or datetime.datetime.now(datetime.timezone.utc).isoformat()
            )

        if not is_coordinate_in_domain(request.destination_latitude, request.destination_longitude):
            return AStarRouteResponse(
                success=False,
                status_message=(
                    f"Destination coordinate ({request.destination_latitude}, {request.destination_longitude}) "
                    f"is outside supported POLARIS domain (Lat [{LAT_MIN}, {LAT_MAX}], Lon [{LON_MIN}, {LON_MAX}])."
                ),
                departure_utc=request.reference_timestamp or datetime.datetime.now(datetime.timezone.utc).isoformat()
            )

        # 2. Map coordinates to grid cells
        start_row, start_col = coordinate_to_grid_cell(request.start_latitude, request.start_longitude)
        goal_row, goal_col = coordinate_to_grid_cell(request.destination_latitude, request.destination_longitude)

        start_lat, start_lon = grid_cell_to_coordinate(start_row, start_col)
        goal_lat, goal_lon = grid_cell_to_coordinate(goal_row, goal_col)

        ref_ts_str = request.reference_timestamp or datetime.datetime.now(datetime.timezone.utc).isoformat()
        ref_dt = datetime.datetime.fromisoformat(ref_ts_str.replace("Z", "+00:00"))
        departure_dt = ref_dt + datetime.timedelta(hours=request.departure_delay_hours)
        departure_iso = departure_dt.isoformat()

        # 3. Pre-flight safety check on start and goal
        # Precompute fused grids for horizons [0h, 6h, 12h, 18h, 24h] to optimize search speed
        fused_grids_by_horizon: Dict[float, Any] = {}
        for h in HORIZON_LEVELS:
            vessel_params = VesselRiskParameters(
                draft_meters=cfg.vessel_draft_meters,
                safety_depth_margin_meters=cfg.under_keel_safety_margin_meters,
                safe_sic_threshold_percent=cfg.safe_sic_threshold_percent,
                iceberg_safety_buffer_km=cfg.iceberg_safety_buffer_km,
                max_safe_wave_height_meters=cfg.max_safe_wave_height_meters
            )
            fused_grids_by_horizon[h] = risk_fusion_engine.fuse_from_raw_models(
                reference_timestamp=departure_iso,
                horizon_hours=h,
                sea_ice_data=sea_ice_data,
                weather_data=weather_data,
                icebergs_forecast=icebergs_forecast,
                vessel=vessel_params
            )

        # Pre-index fused cells for O(1) fast coordinate lookup
        fused_cells_lookup: Dict[float, Dict[Tuple[int, int], Any]] = {}
        for h, grid in fused_grids_by_horizon.items():
            fused_cells_lookup[h] = {(fc.row, fc.column): fc for fc in grid.cells}

        # Helper to lookup cell risk & safety using symmetric nearest forecast bracket
        def get_cell_fused_risk(r: int, c: int, h: float):
            # Symmetric nearest-bracket mapping: [0h, 6h, 12h, 18h, 24h]
            # h in [0.0, 3.0] -> 0h; (3.0, 9.0] -> 6h; (9.0, 15.0] -> 12h; (15.0, 21.0] -> 18h; >= 21.0 -> 24h
            clamped_h = min(24.0, max(0.0, round(h / 6.0) * 6.0))
            return fused_cells_lookup[clamped_h][(r, c)]

        # Validate departure cell safety at 0h
        start_fused = get_cell_fused_risk(start_row, start_col, 0.0)
        start_safety = safety_constraint_engine.evaluate_fused_cell(start_fused, config_override=cfg)
        if not start_safety.traversable:
            return AStarRouteResponse(
                success=False,
                status_message=f"Departure cell ({start_row}, {start_col}) is non-traversable: {start_safety.human_explanation}",
                departure_utc=departure_iso
            )

        # Validate goal cell safety
        goal_fused = get_cell_fused_risk(goal_row, goal_col, 24.0)
        goal_safety = safety_constraint_engine.evaluate_fused_cell(goal_fused, config_override=cfg)
        if not goal_safety.traversable:
            return AStarRouteResponse(
                success=False,
                status_message=f"Destination cell ({goal_row}, {goal_col}) is non-traversable: {goal_safety.human_explanation}",
                departure_utc=departure_iso
            )

        # 4. Initialize Time-Aware A* Graph Search
        # State representation: (row, col, time_index)
        start_state = (start_row, start_col, 0)
        
        # Priority queue entries: (f_score, tie_breaker_counter, state, current_horizon, current_distance_km)
        counter = 0
        open_set: List[Tuple[float, int, Tuple[int, int, int], float, float]] = []

        # Heuristic calculation: Haversine distance to goal in km
        h_start = haversine_distance_km(start_lat, start_lon, goal_lat, goal_lon)
        heapq.heappush(open_set, (h_start, counter, start_state, 0.0, 0.0))

        # Tracking structures
        g_scores: Dict[Tuple[int, int, int], float] = {start_state: 0.0}
        came_from: Dict[Tuple[int, int, int], Dict[str, Any]] = {}
        closed_set: Set[Tuple[int, int, int]] = set()

        nodes_expanded = 0
        nodes_generated = 1
        open_peak = 1

        # Movement offsets: 8-connected or 4-connected
        if request.allow_diagonal_moves:
            directions = [
                (-1, 0), (1, 0), (0, -1), (0, 1),      # Orthogonal: N, S, W, E
                (-1, -1), (-1, 1), (1, -1), (1, 1)     # Diagonal: NW, NE, SW, SE
            ]
        else:
            directions = [(-1, 0), (1, 0), (0, -1), (0, 1)]

        goal_reached_state: Optional[Tuple[int, int, int]] = None

        while open_set:
            if len(open_set) > open_peak:
                open_peak = len(open_set)

            f_curr, _, current_state, curr_horizon, curr_dist_km = heapq.heappop(open_set)
            curr_r, curr_c, curr_t_idx = current_state

            if current_state in closed_set:
                continue
            closed_set.add(current_state)
            nodes_expanded += 1

            # Check if destination reached
            if curr_r == goal_row and curr_c == goal_col:
                goal_reached_state = current_state
                break

            # Search depth safety guard
            if curr_t_idx >= request.max_search_depth_steps:
                continue

            curr_lat, curr_lon = grid_cell_to_coordinate(curr_r, curr_c)

            # Expand spatial neighbors
            for dr, dc in directions:
                nr = curr_r + dr
                nc = curr_c + dc

                # Boundary check
                if not (0 <= nr < REFERENCE_GRID_ROWS and 0 <= nc < REFERENCE_GRID_COLS):
                    continue

                neighbor_lat, neighbor_lon = grid_cell_to_coordinate(nr, nc)
                segment_dist_km = haversine_distance_km(curr_lat, curr_lon, neighbor_lat, neighbor_lon)
                segment_dist_nm = segment_dist_km / 1.852

                # Temporal progression: advance time slice based on vessel transit duration
                transit_step_hours = segment_dist_nm / max(1.0, request.nominal_speed_knots)
                next_horizon = curr_horizon + transit_step_hours
                next_t_idx = curr_t_idx + 1
                neighbor_state = (nr, nc, next_t_idx)

                if neighbor_state in closed_set:
                    continue

                # HARD SAFETY ENFORCEMENT (Phase 4): Query safety constraint engine
                neighbor_fused = get_cell_fused_risk(nr, nc, next_horizon)
                neighbor_safety = safety_constraint_engine.evaluate_fused_cell(neighbor_fused, config_override=cfg)

                if not neighbor_safety.traversable:
                    # Prune unsafe / non-traversable state
                    continue

                # CORNER CUTTING & DIAGONAL SQUEEZE VALIDATION (Phase 5 Verification):
                # When moving diagonally, verify intermediate orthogonal neighbors to prevent:
                # 1. Squeezing through an impassable diagonal pinch point between two NO-GO obstacles.
                # 2. Clipping the corner of a continental landmass or permanent ice shelf.
                if dr != 0 and dc != 0:
                    ortho1_fused = get_cell_fused_risk(curr_r + dr, curr_c, next_horizon)
                    ortho1_safety = safety_constraint_engine.evaluate_fused_cell(ortho1_fused, config_override=cfg)

                    ortho2_fused = get_cell_fused_risk(curr_r, curr_c + dc, next_horizon)
                    ortho2_safety = safety_constraint_engine.evaluate_fused_cell(ortho2_fused, config_override=cfg)

                    # A. Diagonal squeeze: cannot pass between two non-traversable cells
                    if (not ortho1_safety.traversable) and (not ortho2_safety.traversable):
                        continue

                    # B. Hard barrier clipping: cannot clip across continental land or ice shelf corner
                    if ortho1_safety.constraints.land.violated or ortho2_safety.constraints.land.violated:
                        continue
                    if ortho1_safety.constraints.ice_shelf.violated or ortho2_safety.constraints.ice_shelf.violated:
                        continue

                # SOFT RISK COST FUNCTION (Phase 3):
                # cost = movement_distance + lambda * (cell_risk / 100.0) * movement_distance
                cell_risk = neighbor_fused.total_risk
                risk_penalty = request.risk_penalty_lambda * (cell_risk / 100.0) * segment_dist_km
                transition_cost = segment_dist_km + risk_penalty
                if cell_cost_penalties and (nr, nc) in cell_cost_penalties:
                    transition_cost += cell_cost_penalties[(nr, nc)] * segment_dist_km

                tentative_g = g_scores[current_state] + transition_cost

                if tentative_g < g_scores.get(neighbor_state, float("inf")):
                    # Found better path to neighbor_state
                    g_scores[neighbor_state] = tentative_g
                    h_score = haversine_distance_km(neighbor_lat, neighbor_lon, goal_lat, goal_lon)
                    f_score = tentative_g + h_score

                    came_from[neighbor_state] = {
                        "parent_state": current_state,
                        "segment_distance_km": segment_dist_km,
                        "segment_distance_nm": segment_dist_nm,
                        "horizon_hours": next_horizon,
                        "fused_risk": neighbor_fused,
                        "safety": neighbor_safety
                    }

                    counter += 1
                    nodes_generated += 1
                    heapq.heappush(open_set, (f_score, counter, neighbor_state, next_horizon, curr_dist_km + segment_dist_km))

        # 5. Path Reconstruction
        if goal_reached_state is None:
            exec_time = (time.perf_counter() - start_time_perf) * 1000.0
            return AStarRouteResponse(
                success=False,
                status_message="No safe traversable path found between start and destination respecting polar constraints.",
                departure_utc=departure_iso,
                diagnostics=AStarSearchDiagnostics(
                    nodes_expanded=nodes_expanded,
                    nodes_generated=nodes_generated,
                    closed_set_size=len(closed_set),
                    open_list_peak_size=open_peak,
                    execution_time_ms=round(exec_time, 2),
                    optimal_path_found=False,
                    risk_penalty_weight_lambda=request.risk_penalty_lambda
                )
            )

        # Reconstruct path backwards from goal
        path_states: List[Tuple[int, int, int]] = []
        curr = goal_reached_state
        while curr in came_from:
            path_states.append(curr)
            curr = came_from[curr]["parent_state"]
        path_states.append(start_state)
        path_states.reverse()

        # Build detailed waypoints
        waypoints: List[TimeAwareWaypoint] = []
        cum_dist_km = 0.0
        cum_dist_nm = 0.0
        sum_risk = 0.0
        max_risk = 0.0
        max_sic = 0.0
        min_berg_clearance = float("inf")

        # Step 0: Departure waypoint
        start_fused_0 = get_cell_fused_risk(start_row, start_col, 0.0)
        base_env_0 = calculate_baseline_environment(start_lat, start_lon, 0.0)
        w0 = TimeAwareWaypoint(
            step_index=0,
            row=start_row,
            column=start_col,
            latitude=start_lat,
            longitude=start_lon,
            horizon_hours=0.0,
            estimated_arrival_utc=departure_iso,
            segment_distance_km=0.0,
            cumulative_distance_km=0.0,
            cumulative_distance_nm=0.0,
            segment_risk=start_fused_0.total_risk,
            risk_category=start_fused_0.risk_category,
            dominant_risk_factor=start_fused_0.dominant_risk_factor,
            is_traversable=True,
            safety_status="TRAVERSABLE",
            sic_percent=round(base_env_0["sic_percent"], 1),
            wave_height_meters=round(base_env_0["wave_height_meters"], 2),
            iceberg_risk=float(start_fused_0.breakdown.iceberg_risk),
            nearest_iceberg_id=start_fused_0.provenance.nearest_iceberg_id,
            nearest_iceberg_dist_km=start_fused_0.provenance.nearest_iceberg_distance_km
        )
        waypoints.append(w0)
        sum_risk += w0.segment_risk
        max_risk = max(max_risk, w0.segment_risk)
        if w0.nearest_iceberg_dist_km:
            min_berg_clearance = min(min_berg_clearance, w0.nearest_iceberg_dist_km)

        # Subsequent steps
        for step_idx in range(1, len(path_states)):
            st = path_states[step_idx]
            edge_info = came_from[st]
            r, c, _ = st
            lat, lon = grid_cell_to_coordinate(r, c)

            seg_km = edge_info["segment_distance_km"]
            seg_nm = edge_info["segment_distance_nm"]
            h_hours = edge_info["horizon_hours"]
            fused = edge_info["fused_risk"]
            safety = edge_info["safety"]

            cum_dist_km += seg_km
            cum_dist_nm += seg_nm
            sum_risk += fused.total_risk
            max_risk = max(max_risk, fused.total_risk)

            # SIC at arrival
            base_env = calculate_baseline_environment(lat, lon, h_hours)
            sic_val = base_env["sic_percent"]
            max_sic = max(max_sic, sic_val)

            berg_dist = fused.provenance.nearest_iceberg_distance_km
            if berg_dist is not None and berg_dist < min_berg_clearance:
                min_berg_clearance = berg_dist

            step_dt = departure_dt + datetime.timedelta(hours=h_hours)

            wp = TimeAwareWaypoint(
                step_index=step_idx,
                row=r,
                column=c,
                latitude=lat,
                longitude=lon,
                horizon_hours=round(h_hours, 1),
                estimated_arrival_utc=step_dt.isoformat(),
                segment_distance_km=round(seg_km, 2),
                cumulative_distance_km=round(cum_dist_km, 2),
                cumulative_distance_nm=round(cum_dist_nm, 2),
                segment_risk=fused.total_risk,
                risk_category=fused.risk_category,
                dominant_risk_factor=fused.dominant_risk_factor,
                is_traversable=safety.traversable,
                safety_status=safety.status,
                sic_percent=round(sic_val, 1),
                wave_height_meters=round(base_env["wave_height_meters"], 2),
                iceberg_risk=fused.breakdown.iceberg_risk,
                nearest_iceberg_id=fused.provenance.nearest_iceberg_id,
                nearest_iceberg_dist_km=berg_dist
            )
            waypoints.append(wp)

        exec_time = (time.perf_counter() - start_time_perf) * 1000.0
        total_transit_hours = waypoints[-1].horizon_hours
        avg_risk = round(sum_risk / len(waypoints), 1)

        diagnostics = AStarSearchDiagnostics(
            nodes_expanded=nodes_expanded,
            nodes_generated=nodes_generated,
            closed_set_size=len(closed_set),
            open_list_peak_size=open_peak,
            execution_time_ms=round(exec_time, 2),
            optimal_path_found=True,
            risk_penalty_weight_lambda=request.risk_penalty_lambda
        )

        return AStarRouteResponse(
            success=True,
            status_message=f"Optimal Time-Aware A* route found across {len(waypoints)} waypoints.",
            departure_utc=departure_iso,
            arrival_utc=waypoints[-1].estimated_arrival_utc,
            total_waypoints=len(waypoints),
            total_distance_km=round(cum_dist_km, 2),
            total_distance_nm=round(cum_dist_nm, 2),
            total_transit_hours=round(total_transit_hours, 1),
            average_risk=avg_risk,
            max_risk=round(max_risk, 1),
            max_sic_percent=round(max_sic, 1),
            min_iceberg_clearance_km=round(min_berg_clearance, 1) if min_berg_clearance < float("inf") else None,
            waypoints=waypoints,
            diagnostics=diagnostics,
            metadata={
                "phase": "PHASE_5_GENUINE_TIME_AWARE_ASTAR",
                "vessel_cruising_speed_knots": request.nominal_speed_knots,
                "start_coordinate": (request.start_latitude, request.start_longitude),
                "goal_coordinate": (request.destination_latitude, request.destination_longitude),
                "start_grid_cell": (start_row, start_col),
                "goal_grid_cell": (goal_row, goal_col)
            }
        )


# Global singleton instance
time_aware_astar_engine = TimeAwareAStarEngine()

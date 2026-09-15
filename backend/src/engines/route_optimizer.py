"""
POLARIS: Multi-Objective Route Optimization & Dynamic Ranking Engine (Phase 6).
Generates multiple distinct feasible candidate routes across objective profiles:
    - SAFETY-FIRST (high risk avoidance)
    - BALANCED (equilibrated risk vs. transit efficiency)
    - EFFICIENCY-FIRST (distance/time minimization)
    - DIVERSE-ALTERNATIVE (explores alternative navigable corridors when duplicates occur)

Computes complete route metrics, prototype fuel-use proxy, Pareto dominance set,
multi-objective decision scores, and dynamically generated trade-off explanations.
"""

import time
import math
import datetime
from typing import Dict, Any, List, Optional, Tuple, Set

try:
    from src.schemas.route import AStarRouteRequest, AStarRouteResponse, TimeAwareWaypoint
    from src.schemas.multi_objective import (
        ObjectiveProfile,
        OptimizationWeights,
        FuelProxyParameters,
        TradeOffComparison,
        RouteCandidate,
        RouteOptimizationRequest,
        RouteOptimizationResponse
    )
    from src.engines.time_aware_astar import TimeAwareAStarEngine, time_aware_astar_engine
    from src.engines.spatiotemporal_alignment import haversine_distance_km
except ImportError:
    from schemas.route import AStarRouteRequest, AStarRouteResponse, TimeAwareWaypoint
    from schemas.multi_objective import (
        ObjectiveProfile,
        OptimizationWeights,
        FuelProxyParameters,
        TradeOffComparison,
        RouteCandidate,
        RouteOptimizationRequest,
        RouteOptimizationResponse
    )
    from engines.time_aware_astar import TimeAwareAStarEngine, time_aware_astar_engine
    from engines.spatiotemporal_alignment import haversine_distance_km


# Default Profile Configurations (lambda_risk, title, description, display_color)
PROFILE_CONFIGS: Dict[ObjectiveProfile, Dict[str, Any]] = {
    "SAFETY_FIRST": {
        "lambda_risk": 5.0,
        "title": "Safety-First Route",
        "description": "Maximized environmental risk avoidance and conservative iceberg standoff buffers.",
        "color": "#10B981"  # Emerald
    },
    "BALANCED": {
        "lambda_risk": 2.0,
        "title": "Balanced Route",
        "description": "Equilibrated multi-objective trade-off balancing transit distance against dynamic ice and weather hazards.",
        "color": "#0284C7"  # Sky Blue
    },
    "EFFICIENCY_FIRST": {
        "lambda_risk": 0.5,
        "title": "Efficiency-First Route",
        "description": "Distance and transit time minimization while strictly satisfying all hard physical safety constraints.",
        "color": "#F59E0B"  # Amber
    },
    "DIVERSE_ALTERNATIVE": {
        "lambda_risk": 2.5,
        "title": "Alternative Passage",
        "description": "Geographically distinct navigational passage discovered through controlled corridor exploration.",
        "color": "#8B5CF6"  # Purple
    }
}

DEFAULT_WEIGHTS = OptimizationWeights()
DEFAULT_FUEL_PARAMS = FuelProxyParameters()


class RouteOptimizerEngine:
    """
    Multi-objective route optimizer generating, evaluating, ranking, and explaining
    multiple genuine time-aware A* route candidates across polar waters.
    """

    def __init__(
        self,
        astar_engine: Optional[TimeAwareAStarEngine] = None,
        default_weights: Optional[OptimizationWeights] = None,
        default_fuel_params: Optional[FuelProxyParameters] = None
    ):
        self.astar = astar_engine or time_aware_astar_engine
        self.default_weights = default_weights or DEFAULT_WEIGHTS
        self.default_fuel_params = default_fuel_params or DEFAULT_FUEL_PARAMS

    def optimize_routes(
        self,
        request: RouteOptimizationRequest,
        sea_ice_data: Optional[Dict[str, Any]] = None,
        weather_data: Optional[Dict[str, Any]] = None,
        icebergs_forecast: Optional[List[Dict[str, Any]]] = None
    ) -> RouteOptimizationResponse:
        """
        Executes multi-objective route generation and ranking.
        """
        start_time_perf = time.perf_counter()
        weights = request.weights or self.default_weights
        fuel_params = request.fuel_params or self.default_fuel_params

        ref_ts_str = request.reference_timestamp or datetime.datetime.now(datetime.timezone.utc).isoformat()
        ref_dt = datetime.datetime.fromisoformat(ref_ts_str.replace("Z", "+00:00"))
        departure_dt = ref_dt + datetime.timedelta(hours=request.departure_delay_hours)
        departure_iso = departure_dt.isoformat()

        # Profiles to attempt
        target_profiles: List[ObjectiveProfile] = ["SAFETY_FIRST", "BALANCED", "EFFICIENCY_FIRST"]
        candidates_raw: List[Tuple[ObjectiveProfile, AStarRouteResponse]] = []
        seen_path_keys: Set[Tuple[Tuple[int, int], ...]] = set()

        # Step 1: Generate primary candidates across objective profiles
        for prof in target_profiles:
            cfg = PROFILE_CONFIGS[prof]
            astar_req = AStarRouteRequest(
                start_latitude=request.start_latitude,
                start_longitude=request.start_longitude,
                destination_latitude=request.destination_latitude,
                destination_longitude=request.destination_longitude,
                reference_timestamp=departure_iso,
                departure_delay_hours=0.0,
                nominal_speed_knots=request.nominal_speed_knots,
                risk_penalty_lambda=cfg["lambda_risk"],
                allow_diagonal_moves=request.allow_diagonal_moves,
                max_search_depth_steps=request.max_search_depth_steps
            )

            resp = self.astar.plan_route(
                request=astar_req,
                sea_ice_data=sea_ice_data,
                weather_data=weather_data,
                icebergs_forecast=icebergs_forecast
            )

            if not resp.success:
                continue

            path_key = tuple((wp.row, wp.column) for wp in resp.waypoints)
            if path_key not in seen_path_keys:
                seen_path_keys.add(path_key)
                candidates_raw.append((prof, resp))

        # Step 2: Handle duplicate paths using controlled graph-based diversity penalties
        # If fewer than 3 candidates were found and at least one candidate succeeded:
        if len(candidates_raw) < 3 and len(candidates_raw) >= 1:
            # Gather all intermediate cells used by already selected paths
            intermediate_cells: Set[Tuple[int, int]] = set()
            for _, r_resp in candidates_raw:
                if len(r_resp.waypoints) > 2:
                    for wp in r_resp.waypoints[1:-1]:
                        intermediate_cells.add((wp.row, wp.column))

            # Diversity penalties: nudge A* away from already chosen path
            diversity_penalties = {cell: 2.0 for cell in intermediate_cells}

            diversity_req = AStarRouteRequest(
                start_latitude=request.start_latitude,
                start_longitude=request.start_longitude,
                destination_latitude=request.destination_latitude,
                destination_longitude=request.destination_longitude,
                reference_timestamp=departure_iso,
                departure_delay_hours=0.0,
                nominal_speed_knots=request.nominal_speed_knots,
                risk_penalty_lambda=PROFILE_CONFIGS["DIVERSE_ALTERNATIVE"]["lambda_risk"],
                allow_diagonal_moves=request.allow_diagonal_moves,
                max_search_depth_steps=request.max_search_depth_steps
            )

            alt_resp = self.astar.plan_route(
                request=diversity_req,
                sea_ice_data=sea_ice_data,
                weather_data=weather_data,
                icebergs_forecast=icebergs_forecast,
                cell_cost_penalties=diversity_penalties
            )

            if alt_resp.success:
                alt_path_key = tuple((wp.row, wp.column) for wp in alt_resp.waypoints)
                if alt_path_key not in seen_path_keys:
                    seen_path_keys.add(alt_path_key)
                    candidates_raw.append(("DIVERSE_ALTERNATIVE", alt_resp))

        # If zero candidates succeeded:
        if not candidates_raw:
            exec_time = (time.perf_counter() - start_time_perf) * 1000.0
            return RouteOptimizationResponse(
                success=False,
                status_message="No safe traversable path found between start and destination respecting polar constraints.",
                departure_utc=departure_iso,
                start_latitude=request.start_latitude,
                start_longitude=request.start_longitude,
                destination_latitude=request.destination_latitude,
                destination_longitude=request.destination_longitude,
                total_candidates=0,
                feasible_candidates=0,
                candidates=[],
                pareto_candidate_ids=[],
                recommended_route_id=None,
                recommendation_reason="No feasible route satisfies polar safety constraints.",
                diagnostics={"execution_time_ms": round(exec_time, 2)}
            )

        # Step 3: Compute complete route metrics for each candidate
        candidates: List[RouteCandidate] = []
        for idx, (prof, r_resp) in enumerate(candidates_raw):
            route_id = f"route_{prof.lower()}_{idx+1}"
            cfg = PROFILE_CONFIGS.get(prof, PROFILE_CONFIGS["BALANCED"])
            wps = r_resp.waypoints

            tot_dist_km = r_resp.total_distance_km
            tot_dist_nm = r_resp.total_distance_nm
            transit_hours = r_resp.total_transit_hours
            eta_dt = departure_dt + datetime.timedelta(hours=transit_hours)

            # Risk calculations
            risks = [w.segment_risk for w in wps]
            avg_risk = round(sum(risks) / max(1, len(risks)), 1)
            max_r = round(max(risks), 1) if risks else 0.0

            # Weighted risk exposure: Sum(segment_distance_km * (segment_risk / 100))
            weighted_risk_exposure = round(
                sum(w.segment_distance_km * (w.segment_risk / 100.0) for w in wps),
                2
            )

            # Minimum iceberg clearance
            iceberg_clearances = [w.nearest_iceberg_dist_km for w in wps if w.nearest_iceberg_dist_km is not None]
            min_berg_clearance = round(min(iceberg_clearances), 1) if iceberg_clearances else None

            # Sea ice concentration
            sics = [w.sic_percent for w in wps]
            max_sic = round(max(sics), 1) if sics else 0.0
            avg_sic = round(sum(sics) / max(1, len(sics)), 1) if sics else 0.0

            # NO-GO cell check (Hard constraint verification)
            no_go_cells = [w for w in wps if not w.is_traversable]
            no_go_count = len(no_go_cells)
            no_go_exposure = round(sum(w.segment_distance_km for w in no_go_cells), 2)
            is_feasible = (no_go_count == 0)

            # Dominant risk factor determination
            dominant_counts: Dict[str, int] = {}
            for w in wps:
                factor = w.dominant_risk_factor or "Sea Ice"
                dominant_counts[factor] = dominant_counts.get(factor, 0) + 1
            dominant_factor = max(dominant_counts.items(), key=lambda x: x[1])[0] if dominant_counts else "Sea Ice"

            # Prototype Fuel-Use Proxy (clearly labelled heuristic index)
            waves = [w.wave_height_meters for w in wps]
            avg_wave = sum(waves) / max(1, len(waves)) if waves else 2.0
            env_factor = 1.0 + (avg_sic / 100.0) * fuel_params.sic_penalty_factor + (avg_wave / 10.0) * fuel_params.wave_penalty_factor
            fuel_proxy = round(fuel_params.base_fuel_rate * transit_hours * env_factor, 1)

            candidate = RouteCandidate(
                route_id=route_id,
                profile=prof,
                title=cfg["title"],
                description=cfg["description"],
                color=cfg["color"],
                status="AVAILABLE",
                waypoints=wps,
                total_distance_km=tot_dist_km,
                total_distance_nm=tot_dist_nm,
                total_transit_hours=transit_hours,
                eta_utc=eta_dt.isoformat(),
                average_risk=avg_risk,
                max_risk=max_r,
                weighted_risk_exposure=weighted_risk_exposure,
                min_iceberg_clearance_km=min_berg_clearance,
                max_sic_percent=max_sic,
                average_sic_percent=avg_sic,
                no_go_cell_count=no_go_count,
                no_go_exposure=no_go_exposure,
                fuel_use_proxy=fuel_proxy,
                safety_status="TRAVERSABLE" if is_feasible else "NO_GO",
                dominant_risk=dominant_factor,
                objective_cost=tot_dist_km + cfg["lambda_risk"] * (avg_risk / 100.0) * tot_dist_km,
                decision_score=0.0,
                is_pareto_efficient=True,
                is_feasible=is_feasible,
                tradeoff_vs_shortest=None,
                dynamic_explanation=""
            )
            candidates.append(candidate)

        # Step 4: Pareto Dominance Analysis across [distance, transit_time, risk_exposure, fuel_proxy]
        feasible_candidates = [c for c in candidates if c.is_feasible]
        pareto_ids = self.evaluate_pareto_dominance(feasible_candidates)

        # Step 5: Multi-Objective Decision Score & Ranking
        if feasible_candidates:
            # Find normalization ranges across feasible candidates
            dists = [c.total_distance_km for c in feasible_candidates]
            times = [c.total_transit_hours for c in feasible_candidates]
            risks_exp = [c.weighted_risk_exposure for c in feasible_candidates]
            fuels = [c.fuel_use_proxy for c in feasible_candidates]

            d_min, d_max = min(dists), max(dists)
            t_min, t_max = min(times), max(times)
            r_min, r_max = min(risks_exp), max(risks_exp)
            f_min, f_max = min(fuels), max(fuels)

            def norm(val: float, mn: float, mx: float) -> float:
                return 0.0 if mx == mn else (val - mn) / (mx - mn)

            for c in feasible_candidates:
                d_norm = norm(c.total_distance_km, d_min, d_max)
                t_norm = norm(c.total_transit_hours, t_min, t_max)
                r_norm = norm(c.weighted_risk_exposure, r_min, r_max)
                f_norm = norm(c.fuel_use_proxy, f_min, f_max)

                # Lower decision score is superior
                score = (
                    weights.risk_weight * r_norm +
                    weights.distance_weight * d_norm +
                    weights.time_weight * t_norm +
                    weights.fuel_weight * f_norm
                )
                c.decision_score = round(score, 4)

            # Sort feasible candidates by decision_score ascending
            feasible_candidates.sort(key=lambda c: c.decision_score)
            best_candidate = feasible_candidates[0]
            best_candidate.status = "RECOMMENDED"
            recommended_id = best_candidate.route_id

            # Step 6: Trade-off comparisons vs. lowest-distance candidate
            shortest_candidate = min(feasible_candidates, key=lambda c: c.total_distance_km)
            for c in feasible_candidates:
                d_diff_km = round(c.total_distance_km - shortest_candidate.total_distance_km, 1)
                d_diff_nm = round(c.total_distance_nm - shortest_candidate.total_distance_nm, 1)
                d_diff_pct = round((d_diff_km / max(0.1, shortest_candidate.total_distance_km)) * 100.0, 1)
                t_diff = round(c.total_transit_hours - shortest_candidate.total_transit_hours, 1)
                f_diff = round(c.fuel_use_proxy - shortest_candidate.fuel_use_proxy, 1)

                r_diff_raw = shortest_candidate.weighted_risk_exposure - c.weighted_risk_exposure
                r_red_pct = round((r_diff_raw / max(0.01, shortest_candidate.weighted_risk_exposure)) * 100.0, 1)

                tradeoff = TradeOffComparison(
                    compared_with_route_id=shortest_candidate.route_id,
                    distance_diff_km=d_diff_km,
                    distance_diff_nm=d_diff_nm,
                    distance_diff_percent=d_diff_pct,
                    time_diff_hours=t_diff,
                    risk_reduction_percent=r_red_pct,
                    fuel_proxy_diff=f_diff
                )
                c.tradeoff_vs_shortest = tradeoff

                # Dynamic explanation generation
                if c.route_id == shortest_candidate.route_id:
                    c.dynamic_explanation = (
                        f"Direct shortest transit ({c.total_distance_nm:.1f} NM / {c.total_transit_hours:.1f}h). "
                        f"All hard safety constraints satisfied with an average risk score of {c.average_risk:.1f}."
                    )
                else:
                    if r_red_pct > 0.0:
                        c.dynamic_explanation = (
                            f"Reduces weighted risk exposure by {r_red_pct:.1f}% compared to the shortest route, "
                            f"requiring a {d_diff_nm:.1f} NM (+{d_diff_pct:.1f}%) distance trade-off."
                        )
                    else:
                        c.dynamic_explanation = (
                            f"Alternative passage with {c.total_distance_nm:.1f} NM distance "
                            f"and average risk {c.average_risk:.1f}."
                        )

            # Master recommendation explanation
            rec = best_candidate
            if rec.route_id == shortest_candidate.route_id:
                master_reason = (
                    f"Recommended as optimal route: minimizes transit distance ({rec.total_distance_nm:.1f} NM, "
                    f"{rec.total_transit_hours:.1f}h) while strictly satisfying all safety boundaries with an "
                    f"acceptable risk score of {rec.average_risk:.1f}."
                )
            else:
                rec_tradeoff = rec.tradeoff_vs_shortest
                r_red = rec_tradeoff.risk_reduction_percent if rec_tradeoff else 0.0
                d_pct = rec_tradeoff.distance_diff_percent if rec_tradeoff else 0.0
                master_reason = (
                    f"Recommended {rec.title}: achieves a {r_red:.1f}% reduction in weighted risk exposure "
                    f"compared to shortest route with only a {d_pct:.1f}% distance trade-off, "
                    f"optimal under current safety-efficiency objective weights."
                )
        else:
            recommended_id = None
            master_reason = "No candidate route satisfied all hard polar safety constraints."

        exec_time = (time.perf_counter() - start_time_perf) * 1000.0
        candidate_count_msg = (
            f"Generated {len(candidates)} distinct feasible routes."
            if len(candidates) >= 3
            else f"Only {len(candidates)} distinct feasible routes available under current safety constraints."
        )

        return RouteOptimizationResponse(
            success=True,
            status_message=f"{candidate_count_msg} Recommended: {recommended_id}.",
            departure_utc=departure_iso,
            start_latitude=request.start_latitude,
            start_longitude=request.start_longitude,
            destination_latitude=request.destination_latitude,
            destination_longitude=request.destination_longitude,
            total_candidates=len(candidates),
            feasible_candidates=len(feasible_candidates),
            candidates=candidates,
            pareto_candidate_ids=pareto_ids,
            recommended_route_id=recommended_id,
            recommendation_reason=master_reason,
            optimization_config={
                "weights": weights.model_dump(),
                "fuel_parameters": fuel_params.model_dump(),
                "nominal_speed_knots": request.nominal_speed_knots
            },
            diagnostics={
                "execution_time_ms": round(exec_time, 2),
                "distinct_paths_explored": len(seen_path_keys),
                "pareto_candidates_count": len(pareto_ids)
            }
        )

    def evaluate_pareto_dominance(self, candidates: List[RouteCandidate]) -> List[str]:
        """
        Evaluates Pareto efficiency across [distance, transit_time, risk_exposure, fuel_proxy].
        A candidate is dominated if another candidate is <= on all objectives and < on at least one.
        Updates candidate.is_pareto_efficient in-place and returns list of Pareto-efficient route_ids.
        """
        for c1 in candidates:
            is_dominated = False
            for c2 in candidates:
                if c1.route_id == c2.route_id:
                    continue
                c2_no_worse = (
                    c2.total_distance_km <= c1.total_distance_km and
                    c2.total_transit_hours <= c1.total_transit_hours and
                    c2.weighted_risk_exposure <= c1.weighted_risk_exposure and
                    c2.fuel_use_proxy <= c1.fuel_use_proxy
                )
                c2_strictly_better = (
                    c2.total_distance_km < c1.total_distance_km or
                    c2.total_transit_hours < c1.total_transit_hours or
                    c2.weighted_risk_exposure < c1.weighted_risk_exposure or
                    c2.fuel_use_proxy < c1.fuel_use_proxy
                )
                if c2_no_worse and c2_strictly_better:
                    is_dominated = True
                    break
            c1.is_pareto_efficient = not is_dominated

        return [c.route_id for c in candidates if c.is_pareto_efficient]


route_optimizer_engine = RouteOptimizerEngine()


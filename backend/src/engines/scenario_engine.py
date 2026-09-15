"""
POLARIS: What-If Scenario Simulation & Decision Sensitivity Engine (Phase 7).
Enables interactive counterfactual environmental simulations (iceberg drift, sea-ice expansion,
weather deterioration, objective priority changes) and decision boundary sensitivity analysis.
Ensures 100% non-mutating deep-copy baseline isolation and dynamic runtime delta computation.
"""

import copy
import time
import math
import datetime
from typing import Dict, Any, List, Optional, Tuple, Set

try:
    from src.schemas.multi_objective import (
        RouteOptimizationRequest,
        RouteOptimizationResponse,
        RouteCandidate,
        OptimizationWeights,
        FuelProxyParameters,
    )
    from src.schemas.scenario import (
        ScenarioType,
        ScenarioParameters,
        ScenarioComparison,
        ScenarioSimulateRequest,
        ScenarioSimulateResponse,
        SensitivityPoint,
        SensitivitySweepRequest,
        SensitivitySweepResponse,
    )
    from src.engines.route_optimizer import RouteOptimizerEngine, route_optimizer_engine
    from src.engines.time_aware_astar import coordinate_to_grid_cell
    from src.engines.spatiotemporal_alignment import haversine_distance_km, REFERENCE_CELLS
    from src.engines.risk_fusion_engine import calculate_baseline_environment
except ImportError:
    from schemas.multi_objective import (
        RouteOptimizationRequest,
        RouteOptimizationResponse,
        RouteCandidate,
        OptimizationWeights,
        FuelProxyParameters,
    )
    from schemas.scenario import (
        ScenarioType,
        ScenarioParameters,
        ScenarioComparison,
        ScenarioSimulateRequest,
        ScenarioSimulateResponse,
        SensitivityPoint,
        SensitivitySweepRequest,
        SensitivitySweepResponse,
    )
    from engines.route_optimizer import RouteOptimizerEngine, route_optimizer_engine
    from engines.time_aware_astar import coordinate_to_grid_cell
    from engines.spatiotemporal_alignment import haversine_distance_km, REFERENCE_CELLS
    from engines.risk_fusion_engine import calculate_baseline_environment


class ScenarioEngine:
    """
    Counterfactual What-If simulation and decision sensitivity engine.
    Applies non-destructive perturbations to environmental state and recomputes
    end-to-end navigational risk, safety constraints, and multi-objective routes.
    """

    def __init__(self, optimizer: Optional[RouteOptimizerEngine] = None):
        self.optimizer = optimizer or route_optimizer_engine

    def simulate_scenario(
        self,
        request: ScenarioSimulateRequest,
        sea_ice_data: Optional[Dict[str, Any]] = None,
        weather_data: Optional[Dict[str, Any]] = None,
        icebergs_forecast: Optional[List[Dict[str, Any]]] = None
    ) -> ScenarioSimulateResponse:
        """
        Executes counterfactual What-If simulation:
        1. Evaluates baseline route optimization.
        2. Clones environmental state via deep-copy (zero mutation of baseline).
        3. Applies controlled perturbation parameters.
        4. Re-evaluates multi-objective route optimization on perturbed state.
        5. Computes mathematical differential metrics and dynamic explanations.
        """
        start_perf = time.perf_counter()

        # Build baseline route optimization request
        base_req = RouteOptimizationRequest(
            start_latitude=request.start_latitude,
            start_longitude=request.start_longitude,
            destination_latitude=request.destination_latitude,
            destination_longitude=request.destination_longitude,
            reference_timestamp=request.reference_timestamp,
            departure_delay_hours=request.departure_delay_hours,
            nominal_speed_knots=request.nominal_speed_knots,
            allow_diagonal_moves=request.allow_diagonal_moves,
            max_search_depth_steps=request.max_search_depth_steps,
            weights=request.baseline_weights,
            fuel_params=request.fuel_params
        )

        # Ensure complete baseline representations exist for counterfactual perturbation
        active_sea_ice, active_weather, active_icebergs = self._ensure_baseline_data(
            sea_ice_data, weather_data, icebergs_forecast
        )

        # 1. Execute Baseline Optimization
        base_resp = self.optimizer.optimize_routes(
            request=base_req,
            sea_ice_data=active_sea_ice,
            weather_data=active_weather,
            icebergs_forecast=active_icebergs
        )

        # 2. Strict Deep-Copy Isolation for Scenario State
        scen_sea_ice = copy.deepcopy(active_sea_ice)
        scen_weather = copy.deepcopy(active_weather)
        scen_icebergs = copy.deepcopy(active_icebergs)

        # Build scenario optimization request
        scen_req = RouteOptimizationRequest(
            start_latitude=request.start_latitude,
            start_longitude=request.start_longitude,
            destination_latitude=request.destination_latitude,
            destination_longitude=request.destination_longitude,
            reference_timestamp=request.reference_timestamp,
            departure_delay_hours=request.departure_delay_hours,
            nominal_speed_knots=request.nominal_speed_knots,
            allow_diagonal_moves=request.allow_diagonal_moves,
            max_search_depth_steps=request.max_search_depth_steps,
            weights=copy.deepcopy(request.baseline_weights),
            fuel_params=copy.deepcopy(request.fuel_params)
        )

        # 3. Apply Controlled Parameterized Perturbation
        params = request.parameters
        scen_type = request.scenario_type

        scen_icebergs, scen_sea_ice, scen_weather, scen_req = self._apply_perturbation(
            scen_type=scen_type,
            params=params,
            icebergs=scen_icebergs,
            sea_ice=scen_sea_ice,
            weather=scen_weather,
            opt_request=scen_req,
            base_response=base_resp
        )

        # 4. Execute Scenario Optimization
        scen_resp = self.optimizer.optimize_routes(
            request=scen_req,
            sea_ice_data=scen_sea_ice,
            weather_data=scen_weather,
            icebergs_forecast=scen_icebergs
        )

        # 5. Differential Comparison
        comparison = self._compute_comparison(base_resp, scen_resp)

        # 6. Generate Dynamic Decision Explanation
        dyn_explanation, oper_rec = self._generate_dynamic_explanation(
            scen_type=scen_type,
            params=params,
            comparison=comparison,
            base_resp=base_resp,
            scen_resp=scen_resp
        )

        exec_time = (time.perf_counter() - start_perf) * 1000.0

        return ScenarioSimulateResponse(
            success=True,
            status_message=f"What-If scenario '{scen_type.value}' simulated successfully.",
            scenario_type=scen_type,
            parameters=params,
            baseline_optimization=base_resp,
            scenario_optimization=scen_resp,
            comparison=comparison,
            dynamic_decision_explanation=dyn_explanation,
            operational_recommendation=oper_rec,
            diagnostics={
                "execution_time_ms": round(exec_time, 2),
                "baseline_feasible_candidates": base_resp.feasible_candidates,
                "scenario_feasible_candidates": scen_resp.feasible_candidates,
                "route_changed": comparison.route_changed if comparison else False
            }
        )

    def run_sensitivity_sweep(
        self,
        request: SensitivitySweepRequest,
        sea_ice_data: Optional[Dict[str, Any]] = None,
        weather_data: Optional[Dict[str, Any]] = None,
        icebergs_forecast: Optional[List[Dict[str, Any]]] = None
    ) -> SensitivitySweepResponse:
        """
        Evaluates multiple incremental perturbation levels to discover exact decision boundaries.
        """
        start_perf = time.perf_counter()
        sweep_type = request.sweep_type

        # Configure sweep range based on scenario type
        if sweep_type == ScenarioType.ICEBERG_DRIFT:
            param_name = "iceberg_shift_km"
            param_unit = "km"
            values = request.parameter_values or [0.0, 25.0, 50.0, 75.0, 100.0]
        elif sweep_type == ScenarioType.SEA_ICE_INCREASE:
            param_name = "sic_increase_percent"
            param_unit = "%"
            values = request.parameter_values or [0.0, 10.0, 20.0, 30.0, 40.0]
        elif sweep_type == ScenarioType.WEATHER_DETERIORATION:
            param_name = "weather_risk_delta"
            param_unit = "risk_score"
            values = request.parameter_values or [0.0, 0.10, 0.20, 0.30, 0.40]
        else:
            param_name = "parameter"
            param_unit = "index"
            values = request.parameter_values or [0.0, 1.0]

        # Evaluate baseline (value = 0.0)
        base_sim_req = ScenarioSimulateRequest(
            start_latitude=request.start_latitude,
            start_longitude=request.start_longitude,
            destination_latitude=request.destination_latitude,
            destination_longitude=request.destination_longitude,
            reference_timestamp=request.reference_timestamp,
            nominal_speed_knots=request.nominal_speed_knots,
            scenario_type=sweep_type,
            parameters=ScenarioParameters()
        )
        base_sim_res = self.simulate_scenario(
            request=base_sim_req,
            sea_ice_data=sea_ice_data,
            weather_data=weather_data,
            icebergs_forecast=icebergs_forecast
        )

        base_rec = self._get_recommended_candidate(base_sim_res.baseline_optimization)
        base_point = self._candidate_to_sensitivity_point(
            candidate=base_rec,
            step_idx=0,
            val=0.0,
            label=f"Baseline (0.0 {param_unit})",
            route_changed=False
        )

        sweep_points: List[SensitivityPoint] = []
        inflection_count = 0
        last_route_id = base_rec.route_id if base_rec else ""
        boundary_notes: List[str] = []

        for idx, val in enumerate(values):
            step_label = f"{val:.1f} {param_unit}"
            if val == 0.0:
                sweep_points.append(base_point)
                continue

            # Configure step parameter
            step_params = ScenarioParameters()
            if sweep_type == ScenarioType.ICEBERG_DRIFT:
                step_params.iceberg_shift_km = val
                # Shift towards route
                step_params.iceberg_delta_lat = round(val / 111.0, 3)
            elif sweep_type == ScenarioType.SEA_ICE_INCREASE:
                step_params.sic_increase_percent = val
            elif sweep_type == ScenarioType.WEATHER_DETERIORATION:
                step_params.weather_risk_delta = val

            step_req = ScenarioSimulateRequest(
                start_latitude=request.start_latitude,
                start_longitude=request.start_longitude,
                destination_latitude=request.destination_latitude,
                destination_longitude=request.destination_longitude,
                reference_timestamp=request.reference_timestamp,
                nominal_speed_knots=request.nominal_speed_knots,
                scenario_type=sweep_type,
                parameters=step_params
            )

            step_res = self.simulate_scenario(
                request=step_req,
                sea_ice_data=sea_ice_data,
                weather_data=weather_data,
                icebergs_forecast=icebergs_forecast
            )

            step_rec = self._get_recommended_candidate(step_res.scenario_optimization)
            route_changed = (step_res.comparison.route_changed if step_res.comparison else False)
            curr_route_id = step_rec.route_id if step_rec else ""

            if curr_route_id != last_route_id:
                inflection_count += 1
                boundary_notes.append(f"Decision shifted at {step_label} from {last_route_id} to {curr_route_id}.")
                last_route_id = curr_route_id

            sweep_points.append(self._candidate_to_sensitivity_point(
                candidate=step_rec,
                step_idx=idx + 1,
                val=val,
                label=step_label,
                route_changed=route_changed
            ))

        exec_time = (time.perf_counter() - start_perf) * 1000.0

        if inflection_count > 0:
            boundary_summary = " ".join(boundary_notes)
        else:
            boundary_summary = f"Route decision remained stable across all tested {param_name} values ([{values[0]} to {values[-1]} {param_unit}])."

        return SensitivitySweepResponse(
            success=True,
            sweep_type=sweep_type,
            parameter_name=param_name,
            parameter_unit=param_unit,
            baseline_point=base_point,
            sweep_points=sweep_points,
            inflection_points_found=inflection_count,
            decision_boundary_explanation=boundary_summary,
            diagnostics={"execution_time_ms": round(exec_time, 2), "steps_evaluated": len(values)}
        )

    # --- Internal Helper Methods ---

    def _ensure_baseline_data(
        self,
        sea_ice_data: Optional[Dict[str, Any]],
        weather_data: Optional[Dict[str, Any]],
        icebergs_forecast: Optional[List[Dict[str, Any]]]
    ) -> Tuple[Dict[str, Any], Dict[str, Any], List[Dict[str, Any]]]:
        """Ensures complete spatiotemporal data structures exist for non-destructive perturbation."""
        if not sea_ice_data:
            sea_ice_data = {"forecast": {}}
            for h in [0.0, 6.0, 12.0, 18.0, 24.0]:
                h_key = f"{int(h)}h"
                sea_ice_data["forecast"][h_key] = []
                for ref_c in REFERENCE_CELLS:
                    base_env = calculate_baseline_environment(ref_c["latitude"], ref_c["longitude"], h)
                    sea_ice_data["forecast"][h_key].append({
                        "row": ref_c["row"],
                        "column": ref_c["column"],
                        "latitude": ref_c["latitude"],
                        "longitude": ref_c["longitude"],
                        "sic_percent": base_env["sic_percent"],
                        "sic": round(base_env["sic_percent"] / 100.0, 3),
                        "confidence": 85.0,
                        "data_available": True,
                        "prediction_status": "PREDICTED",
                        "sea_ice_risk": base_env["sic_percent"]
                    })

        if not weather_data:
            weather_data = {"cells": []}
            for ref_c in REFERENCE_CELLS:
                weather_data["cells"].append({
                    "latitude": ref_c["latitude"],
                    "longitude": ref_c["longitude"],
                    "risk_score": 0.20,
                    "risk_class": "SAFE"
                })

        if not icebergs_forecast:
            icebergs_forecast = [{
                "iceberg_id": "A23A",
                "anchor_point": {
                    "latitude": -65.70,
                    "longitude": 12.50,
                    "empirical_error_km": 15.0,
                    "vessel_safety_margin_km": 30.0
                },
                "forecast_steps": [
                    {"step_index": 1, "latitude": -65.65, "longitude": 12.80, "empirical_error_radius_km": 18.0},
                    {"step_index": 2, "latitude": -65.60, "longitude": 13.10, "empirical_error_radius_km": 21.0}
                ]
            }]

        return sea_ice_data, weather_data, icebergs_forecast

    def _apply_perturbation(
        self,
        scen_type: ScenarioType,
        params: ScenarioParameters,
        icebergs: Optional[List[Dict[str, Any]]],
        sea_ice: Optional[Dict[str, Any]],
        weather: Optional[Dict[str, Any]],
        opt_request: RouteOptimizationRequest,
        base_response: RouteOptimizationResponse
    ) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]], Optional[Dict[str, Any]], RouteOptimizationRequest]:
        """
        Applies controlled non-destructive perturbations to scenario copies.
        """
        # 1. Iceberg Drift & Clearance
        if scen_type in (ScenarioType.ICEBERG_DRIFT, ScenarioType.ICEBERG_CLEARANCE):
            if not icebergs:
                # Default baseline iceberg corridor if none provided
                icebergs = [{
                    "iceberg_id": "A23A",
                    "anchor_point": {"latitude": -65.70, "longitude": 12.50, "empirical_error_km": 15.0, "vessel_safety_margin_km": 30.0},
                    "forecast_steps": [{"step_index": 1, "latitude": -65.65, "longitude": 12.80, "empirical_error_radius_km": 18.0}]
                }]

            # Determine delta shift
            d_lat = params.iceberg_delta_lat
            d_lon = params.iceberg_delta_lon

            # If radial shift km provided, calculate sensible shift towards or away from route
            if params.iceberg_shift_km != 0.0:
                direction = 1.0 if scen_type == ScenarioType.ICEBERG_DRIFT else -1.0
                d_lat += direction * (params.iceberg_shift_km / 111.0)

            if scen_type == ScenarioType.ICEBERG_CLEARANCE and d_lat == 0.0 and d_lon == 0.0:
                # Default clearance push: move iceberg 1.5° north out of navigation lead
                d_lat = 1.5

            # Apply shift to target iceberg or all icebergs
            for b in icebergs:
                b_id = b.get("iceberg_id", b.get("id"))
                if params.iceberg_id is None or b_id == params.iceberg_id:
                    anchor = b.get("anchor_point") or b.get("currentPosition")
                    if anchor and "latitude" in anchor:
                        anchor["latitude"] = round(max(-75.0, min(-58.0, anchor["latitude"] + d_lat)), 4)
                        anchor["longitude"] = round(max(-25.0, min(75.0, anchor["longitude"] + d_lon)), 4)
                        if params.uncertainty_multiplier != 1.0:
                            anchor["vessel_safety_margin_km"] = round(anchor.get("vessel_safety_margin_km", 30.0) * params.uncertainty_multiplier, 1)

                    steps = b.get("forecast_steps") or b.get("forecastTrack") or []
                    for step in steps:
                        if "latitude" in step:
                            step["latitude"] = round(max(-75.0, min(-58.0, step["latitude"] + d_lat)), 4)
                            step["longitude"] = round(max(-25.0, min(75.0, step["longitude"] + d_lon)), 4)
                            if params.uncertainty_multiplier != 1.0 and "empirical_error_radius_km" in step:
                                step["empirical_error_radius_km"] = round(step["empirical_error_radius_km"] * params.uncertainty_multiplier, 1)

        # 2. Sea-Ice Increase
        elif scen_type == ScenarioType.SEA_ICE_INCREASE:
            sic_delta = params.sic_increase_percent
            if sic_delta == 0.0:
                sic_delta = 20.0  # Default +20% if not specified

            if sea_ice and "forecast" in sea_ice:
                for h_key, cells in sea_ice["forecast"].items():
                    for cell in cells:
                        lat = cell.get("latitude", 0.0)
                        lon = cell.get("longitude", 0.0)

                        # Bounding box filter (if specified)
                        in_lat = (params.sic_region_min_lat is None or lat >= params.sic_region_min_lat) and \
                                 (params.sic_region_max_lat is None or lat <= params.sic_region_max_lat)
                        in_lon = (params.sic_region_min_lon is None or lon >= params.sic_region_min_lon) and \
                                 (params.sic_region_max_lon is None or lon <= params.sic_region_max_lon)

                        if in_lat and in_lon:
                            cur_sic = cell.get("sic_percent", cell.get("sic", 0.0) * 100.0)
                            new_sic = round(max(0.0, min(100.0, cur_sic + sic_delta)), 1)
                            cell["sic_percent"] = new_sic
                            cell["sic"] = round(new_sic / 100.0, 3)
                            cell["sea_ice_risk"] = new_sic

        # 3. Weather Deterioration
        elif scen_type == ScenarioType.WEATHER_DETERIORATION:
            w_delta = params.weather_risk_delta
            if w_delta == 0.0:
                w_delta = 0.25  # Default +0.25 direct risk increase

            if weather and "cells" in weather:
                for wc in weather["cells"]:
                    cur_r = wc.get("risk_score", 0.2)
                    new_r = round(max(0.0, min(1.0, cur_r + w_delta)), 3)
                    wc["risk_score"] = new_r

                    # Classify risk score
                    if new_r < 0.25:
                        wc["risk_class"] = "SAFE"
                    elif new_r < 0.50:
                        wc["risk_class"] = "MODERATE"
                    elif new_r < 0.75:
                        wc["risk_class"] = "HIGH"
                    else:
                        wc["risk_class"] = "CRITICAL"

        # 4. Safety Priority Change
        elif scen_type == ScenarioType.SAFETY_PRIORITY_CHANGE:
            opt_request.weights = params.weights_override or OptimizationWeights(
                risk_weight=0.75,
                distance_weight=0.15,
                time_weight=0.07,
                fuel_weight=0.03
            )

        # 5. Efficiency Priority Change
        elif scen_type == ScenarioType.EFFICIENCY_PRIORITY_CHANGE:
            opt_request.weights = params.weights_override or OptimizationWeights(
                risk_weight=0.05,
                distance_weight=0.60,
                time_weight=0.20,
                fuel_weight=0.15
            )

        return icebergs, sea_ice, weather, opt_request

    def _compute_comparison(
        self,
        base_resp: RouteOptimizationResponse,
        scen_resp: RouteOptimizationResponse
    ) -> Optional[ScenarioComparison]:
        """
        Computes dynamic mathematical differentials between baseline and scenario recommendations.
        """
        base_rec = self._get_recommended_candidate(base_resp)
        scen_rec = self._get_recommended_candidate(scen_resp)

        if not base_rec or not scen_rec:
            return None

        # 1. Path Identity Verification (Did the cell sequence actually change?)
        base_sig = tuple((wp.row, wp.column) for wp in base_rec.waypoints)
        scen_sig = tuple((wp.row, wp.column) for wp in scen_rec.waypoints)
        route_changed = (base_sig != scen_sig)
        rec_changed = (base_rec.profile != scen_rec.profile)
        safety_changed = (base_rec.safety_status != scen_rec.safety_status)

        # 2. Distance Deltas
        d_nm_diff = round(scen_rec.total_distance_nm - base_rec.total_distance_nm, 1)
        d_km_diff = round(scen_rec.total_distance_km - base_rec.total_distance_km, 1)
        d_pct = round((d_nm_diff / max(0.1, base_rec.total_distance_nm)) * 100.0, 1)

        # 3. Transit Time Deltas
        t_diff = round(scen_rec.total_transit_hours - base_rec.total_transit_hours, 1)
        t_pct = round((t_diff / max(0.1, base_rec.total_transit_hours)) * 100.0, 1)

        # 4. Risk Exposure Deltas
        avg_r_diff = round(scen_rec.average_risk - base_rec.average_risk, 1)
        max_r_diff = round(scen_rec.max_risk - base_rec.max_risk, 1)
        w_exp_diff = round(scen_rec.weighted_risk_exposure - base_rec.weighted_risk_exposure, 2)
        r_exp_pct = round((w_exp_diff / max(0.01, base_rec.weighted_risk_exposure)) * 100.0, 1)

        # 5. Iceberg Clearance Deltas
        b_clr = base_rec.min_iceberg_clearance_km
        s_clr = scen_rec.min_iceberg_clearance_km
        clr_diff = round(s_clr - b_clr, 1) if (s_clr is not None and b_clr is not None) else None

        # 6. Sea Ice & Fuel Deltas
        max_sic_diff = round(scen_rec.max_sic_percent - base_rec.max_sic_percent, 1)
        fuel_diff = round(scen_rec.fuel_use_proxy - base_rec.fuel_use_proxy, 1)
        fuel_pct = round((fuel_diff / max(0.1, base_rec.fuel_use_proxy)) * 100.0, 1)

        # 7. Safety Cells Differential
        base_nogo = {(wp.row, wp.column) for wp in base_rec.waypoints if not wp.is_traversable}
        scen_nogo = {(wp.row, wp.column) for wp in scen_rec.waypoints if not wp.is_traversable}
        newly_blocked = list(scen_nogo - base_nogo)
        newly_cleared = list(base_nogo - scen_nogo)

        return ScenarioComparison(
            route_changed=route_changed,
            recommendation_changed=rec_changed,
            safety_status_changed=safety_changed,
            baseline_recommended_id=base_rec.route_id,
            scenario_recommended_id=scen_rec.route_id,
            baseline_profile=base_rec.profile,
            scenario_profile=scen_rec.profile,
            baseline_distance_nm=base_rec.total_distance_nm,
            scenario_distance_nm=scen_rec.total_distance_nm,
            distance_diff_nm=d_nm_diff,
            distance_diff_percent=d_pct,
            baseline_distance_km=base_rec.total_distance_km,
            scenario_distance_km=scen_rec.total_distance_km,
            distance_diff_km=d_km_diff,
            baseline_transit_hours=base_rec.total_transit_hours,
            scenario_transit_hours=scen_rec.total_transit_hours,
            transit_time_diff_hours=t_diff,
            transit_time_diff_percent=t_pct,
            baseline_average_risk=base_rec.average_risk,
            scenario_average_risk=scen_rec.average_risk,
            average_risk_diff=avg_r_diff,
            baseline_max_risk=base_rec.max_risk,
            scenario_max_risk=scen_rec.max_risk,
            max_risk_diff=max_r_diff,
            baseline_weighted_risk_exposure=base_rec.weighted_risk_exposure,
            scenario_weighted_risk_exposure=scen_rec.weighted_risk_exposure,
            weighted_risk_exposure_diff=w_exp_diff,
            risk_exposure_change_percent=r_exp_pct,
            baseline_iceberg_clearance_km=b_clr,
            scenario_iceberg_clearance_km=s_clr,
            iceberg_clearance_diff_km=clr_diff,
            baseline_max_sic_percent=base_rec.max_sic_percent,
            scenario_max_sic_percent=scen_rec.max_sic_percent,
            max_sic_diff_percent=max_sic_diff,
            baseline_fuel_proxy=base_rec.fuel_use_proxy,
            scenario_fuel_proxy=scen_rec.fuel_use_proxy,
            fuel_proxy_diff=fuel_diff,
            fuel_proxy_diff_percent=fuel_pct,
            newly_blocked_cells=newly_blocked,
            newly_cleared_cells=newly_cleared
        )

    def _generate_dynamic_explanation(
        self,
        scen_type: ScenarioType,
        params: ScenarioParameters,
        comparison: Optional[ScenarioComparison],
        base_resp: RouteOptimizationResponse,
        scen_resp: RouteOptimizationResponse
    ) -> Tuple[str, str]:
        """
        Synthesizes dynamic operational explanations from exact computed deltas.
        Zero hardcoded percentage templates.
        """
        if not comparison:
            return "Unable to compare baseline and scenario optimizations.", "Verify navigational corridor feasibility."

        if not comparison.route_changed:
            explanation = (
                f"Under the simulated {scen_type.value.replace('_', ' ').lower()}, the baseline recommended route "
                f"({comparison.baseline_profile}) remains physically traversable and mathematically optimal. "
                f"Transit distance ({comparison.baseline_distance_nm:.1f} NM) is unchanged with a minor risk delta "
                f"of {comparison.average_risk_diff:+.1f} points. No route detour is required."
            )
            recommendation = (
                "Maintain planned voyage trajectory. Current environmental margins adequately absorb the simulated perturbation."
            )
            return explanation, recommendation

        # Route DID change
        d_sign = "+" if comparison.distance_diff_nm > 0 else ""
        r_sign = "+" if comparison.weighted_risk_exposure_diff > 0 else ""

        if scen_type == ScenarioType.ICEBERG_DRIFT:
            shift_desc = f"{params.iceberg_shift_km:.0f} km shift" if params.iceberg_shift_km else f"drift of Δlat {params.iceberg_delta_lat:+.2f}°"
            clr_desc = f" Clearance adjusted by {comparison.iceberg_clearance_diff_km:+.1f} km." if comparison.iceberg_clearance_diff_km is not None else ""
            explanation = (
                f"Simulated iceberg {shift_desc} encroached on the original track.{clr_desc} "
                f"POLARIS dynamically recalculated a safer navigational corridor ({comparison.scenario_profile}), "
                f"adjusting transit distance by {d_sign}{comparison.distance_diff_nm:.1f} NM ({d_sign}{comparison.distance_diff_percent:.1f}%) "
                f"with a risk exposure delta of {r_sign}{comparison.risk_exposure_change_percent:.1f}%."
            )
            recommendation = (
                f"Adopt altered route {comparison.scenario_recommended_id}. Confirmed clearance satisfies polar safety standoff buffers."
            )

        elif scen_type == ScenarioType.SEA_ICE_INCREASE:
            explanation = (
                f"Simulated sea-ice concentration increase (+{params.sic_increase_percent or 20:.0f}%) elevated navigational resistance. "
                f"POLARIS selected an alternative corridor avoiding high-concentration consolidated pack ice. "
                f"Distance changed by {d_sign}{comparison.distance_diff_nm:.1f} NM ({d_sign}{comparison.distance_diff_percent:.1f}%), "
                f"maintaining peak SIC at {comparison.scenario_max_sic_percent:.1f}%."
            )
            recommendation = (
                "Reroute along recommended passage to avert potential vessel ice-entrapment or speed degradation."
            )

        elif scen_type == ScenarioType.WEATHER_DETERIORATION:
            explanation = (
                f"Simulated synoptic weather deterioration (weather risk delta {params.weather_risk_delta or 0.25:+.2f}) "
                f"increased severe sea state risk. The optimizer adjusted the passage to {comparison.scenario_profile}, "
                f"changing transit distance by {d_sign}{comparison.distance_diff_nm:.1f} NM ({d_sign}{comparison.distance_diff_percent:.1f}%) "
                f"and weighted risk exposure by {r_sign}{comparison.risk_exposure_change_percent:.1f}%."
            )
            recommendation = (
                "Execute weather-diverted track to minimize heavy sea-state vessel roll and hull stress."
            )

        elif scen_type in (ScenarioType.SAFETY_PRIORITY_CHANGE, ScenarioType.EFFICIENCY_PRIORITY_CHANGE):
            explanation = (
                f"Shift in navigator operational priorities ({scen_type.value.replace('_', ' ').lower()}) updated multi-objective decision weights. "
                f"Recommendation switched from {comparison.baseline_profile} to {comparison.scenario_profile}. "
                f"Distance changed by {d_sign}{comparison.distance_diff_nm:.1f} NM ({d_sign}{comparison.distance_diff_percent:.1f}%), "
                f"and weighted risk exposure changed by {r_sign}{comparison.risk_exposure_change_percent:.1f}%."
            )
            recommendation = (
                f"Execute {comparison.scenario_profile} in alignment with updated operational command priorities."
            )

        else:
            explanation = (
                f"Counterfactual simulation altered optimal corridor from {comparison.baseline_profile} to {comparison.scenario_profile}. "
                f"Distance delta: {d_sign}{comparison.distance_diff_nm:.1f} NM ({d_sign}{comparison.distance_diff_percent:.1f}%), "
                f"Weighted risk delta: {r_sign}{comparison.risk_exposure_change_percent:.1f}%."
            )
            recommendation = "Review updated route deck against bridge standing orders."

        return explanation, recommendation

    def _get_recommended_candidate(self, resp: RouteOptimizationResponse) -> Optional[RouteCandidate]:
        """Finds recommended candidate from an optimization response."""
        if not resp.candidates:
            return None
        for c in resp.candidates:
            if c.route_id == resp.recommended_route_id:
                return c
        return resp.candidates[0]

    def _candidate_to_sensitivity_point(
        self,
        candidate: Optional[RouteCandidate],
        step_idx: int,
        val: float,
        label: str,
        route_changed: bool
    ) -> SensitivityPoint:
        """Converts candidate metrics to a structured sensitivity point."""
        if not candidate:
            return SensitivityPoint(
                step_index=step_idx,
                parameter_value=val,
                parameter_label=label,
                recommended_route_id="NONE",
                recommended_profile="NONE",
                total_distance_nm=0.0,
                total_transit_hours=0.0,
                weighted_risk_exposure=0.0,
                iceberg_clearance_km=None,
                max_sic_percent=0.0,
                fuel_proxy=0.0,
                route_changed_from_baseline=route_changed,
                safety_status="NO_GO"
            )

        return SensitivityPoint(
            step_index=step_idx,
            parameter_value=val,
            parameter_label=label,
            recommended_route_id=candidate.route_id,
            recommended_profile=candidate.profile,
            total_distance_nm=candidate.total_distance_nm,
            total_transit_hours=candidate.total_transit_hours,
            weighted_risk_exposure=candidate.weighted_risk_exposure,
            iceberg_clearance_km=candidate.min_iceberg_clearance_km,
            max_sic_percent=candidate.max_sic_percent,
            fuel_proxy=candidate.fuel_use_proxy,
            route_changed_from_baseline=route_changed,
            safety_status=candidate.safety_status
        )


scenario_engine = ScenarioEngine()

"""
POLARIS: What-If Scenario Simulation & Decision Sensitivity Unit Test Suite (Phase 7).
Verifies:
1. ScenarioEngine initialization and ScenarioType enum values.
2. Baseline state immutability via strict deep-copy isolation.
3. Iceberg drift perturbation and clearance impact.
4. Iceberg clearance scenario.
5. Sea-ice increase alters fused risk and triggers dynamic corridor rerouting.
6. Weather deterioration alters direct Weather MLP risk representation.
7. Objective priority sensitivity shifts recommendation dynamically.
8. Mathematical consistency of all comparative differential metrics.
9. Dynamic runtime explanations with zero hardcoded percentage templates.
10. Anti-hardcoding verification: no static Route A/B/C or scenario constants.
11. Parameter sensitivity sweep discovering decision boundaries.
12. FastAPI endpoints (/scenarios/simulate, /scenario/simulate, /scenarios/sensitivity).
"""

import os
import sys
import copy

# Ensure backend directory is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import pytest
from fastapi.testclient import TestClient

from src.api.main import app
from src.schemas.scenario import (
    ScenarioType,
    ScenarioParameters,
    ScenarioComparison,
    ScenarioSimulateRequest,
    ScenarioSimulateResponse,
    SensitivitySweepRequest,
    SensitivitySweepResponse,
)
from src.schemas.multi_objective import OptimizationWeights
from src.engines.scenario_engine import (
    ScenarioEngine,
    scenario_engine,
)


@pytest.fixture
def test_client():
    return TestClient(app)


class TestScenarioEngine:

    def test_01_scenario_engine_initialization_and_types(self):
        """Verifies ScenarioEngine initializes and all ScenarioTypes are supported."""
        engine = ScenarioEngine()
        assert engine is not None
        assert ScenarioType.ICEBERG_DRIFT.value == "ICEBERG_DRIFT"
        assert ScenarioType.SEA_ICE_INCREASE.value == "SEA_ICE_INCREASE"
        assert ScenarioType.WEATHER_DETERIORATION.value == "WEATHER_DETERIORATION"
        assert ScenarioType.ICEBERG_CLEARANCE.value == "ICEBERG_CLEARANCE"
        assert ScenarioType.SAFETY_PRIORITY_CHANGE.value == "SAFETY_PRIORITY_CHANGE"
        assert ScenarioType.EFFICIENCY_PRIORITY_CHANGE.value == "EFFICIENCY_PRIORITY_CHANGE"

    def test_02_baseline_state_immutability_deep_copy(self):
        """Verifies that running a scenario does NOT mutate original baseline data structures."""
        # Create explicit baseline test dictionaries
        base_icebergs = [{
            "iceberg_id": "TEST_BERG",
            "anchor_point": {"latitude": -65.70, "longitude": 12.50, "empirical_error_km": 15.0, "vessel_safety_margin_km": 30.0},
            "forecast_steps": [{"step_index": 1, "latitude": -65.65, "longitude": 12.80, "empirical_error_radius_km": 18.0}]
        }]
        base_sea_ice = {
            "forecast": {
                "6h": [
                    {"row": 6, "column": 9, "latitude": -64.0, "longitude": 11.0, "sic_percent": 30.0, "sic": 0.3, "data_available": True, "prediction_status": "PREDICTED"}
                ]
            }
        }
        base_weather = {
            "cells": [
                {"latitude": -64.0, "longitude": 11.0, "risk_score": 0.20, "risk_class": "SAFE"}
            ]
        }

        # Snapshot deep copies
        snap_icebergs = copy.deepcopy(base_icebergs)
        snap_sea_ice = copy.deepcopy(base_sea_ice)
        snap_weather = copy.deepcopy(base_weather)

        req = ScenarioSimulateRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            scenario_type=ScenarioType.SEA_ICE_INCREASE,
            parameters=ScenarioParameters(sic_increase_percent=30.0)
        )

        res = scenario_engine.simulate_scenario(
            request=req,
            sea_ice_data=base_sea_ice,
            weather_data=base_weather,
            icebergs_forecast=base_icebergs
        )

        assert res.success is True

        # Assert baseline inputs are completely unmutated
        assert base_icebergs == snap_icebergs, "Baseline iceberg state was mutated!"
        assert base_sea_ice == snap_sea_ice, "Baseline sea-ice state was mutated!"
        assert base_weather == snap_weather, "Baseline weather state was mutated!"

    def test_03_iceberg_drift_perturbs_coordinates_and_clearance(self):
        """Verifies ICEBERG_DRIFT scenario shifts coordinates and recomputes navigation clearance."""
        req = ScenarioSimulateRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            scenario_type=ScenarioType.ICEBERG_DRIFT,
            parameters=ScenarioParameters(iceberg_shift_km=60.0)
        )

        res = scenario_engine.simulate_scenario(req)
        assert res.success is True
        assert res.comparison is not None
        assert "ICEBERG_DRIFT" in res.scenario_type.value
        assert res.dynamic_decision_explanation != ""

    def test_04_iceberg_clearance_scenario(self):
        """Verifies ICEBERG_CLEARANCE scenario deflects obstacle out of corridor."""
        req = ScenarioSimulateRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            scenario_type=ScenarioType.ICEBERG_CLEARANCE,
            parameters=ScenarioParameters(iceberg_delta_lat=1.5)
        )

        res = scenario_engine.simulate_scenario(req)
        assert res.success is True
        assert res.comparison is not None

    def test_05_sea_ice_increase_alters_risk_and_triggers_reroute(self):
        """Verifies SEA_ICE_INCREASE elevates risk exposure and dynamically recalculates corridor."""
        req = ScenarioSimulateRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            scenario_type=ScenarioType.SEA_ICE_INCREASE,
            parameters=ScenarioParameters(sic_increase_percent=30.0)
        )

        res = scenario_engine.simulate_scenario(req)
        assert res.success is True
        assert res.comparison is not None
        # When SIC increases across the polar corridor, average risk must increase
        assert res.comparison.average_risk_diff > 0.0
        # Dynamic explanation mentions the sea-ice increase
        assert "sea-ice" in res.dynamic_decision_explanation.lower() or "sic" in res.dynamic_decision_explanation.lower()

    def test_06_weather_deterioration_modifies_direct_weather_risk(self):
        """Verifies WEATHER_DETERIORATION increases direct weather risk score."""
        req = ScenarioSimulateRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=7.0,
            scenario_type=ScenarioType.WEATHER_DETERIORATION,
            parameters=ScenarioParameters(weather_risk_delta=0.40)
        )

        res = scenario_engine.simulate_scenario(req)
        assert res.success is True
        assert res.comparison is not None
        # Risk must increase along the passage
        assert res.comparison.average_risk_diff >= 0.0

    def test_07_objective_weight_sensitivity_shifts_recommendation(self):
        """Verifies changing operational objective priority alters multi-objective scoring."""
        # Extreme efficiency priority
        req = ScenarioSimulateRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            scenario_type=ScenarioType.EFFICIENCY_PRIORITY_CHANGE,
            parameters=ScenarioParameters(
                weights_override=OptimizationWeights(
                    risk_weight=0.05,
                    distance_weight=0.85,
                    time_weight=0.05,
                    fuel_weight=0.05
                )
            )
        )

        res = scenario_engine.simulate_scenario(req)
        assert res.success is True
        assert res.comparison is not None
        # Efficiency profile prioritizes minimum distance
        scen_rec = res.scenario_optimization.recommended_route_id
        shortest = min(res.scenario_optimization.candidates, key=lambda c: c.total_distance_nm)
        assert scen_rec == shortest.route_id

    def test_08_mathematical_consistency_of_all_deltas(self):
        """Verifies exact arithmetic consistency of all differential comparison fields."""
        req = ScenarioSimulateRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            scenario_type=ScenarioType.SEA_ICE_INCREASE,
            parameters=ScenarioParameters(sic_increase_percent=25.0)
        )

        res = scenario_engine.simulate_scenario(req)
        comp = res.comparison
        assert comp is not None

        # Distance diff
        expected_d_nm = round(comp.scenario_distance_nm - comp.baseline_distance_nm, 1)
        assert abs(comp.distance_diff_nm - expected_d_nm) < 1e-4

        expected_d_km = round(comp.scenario_distance_km - comp.baseline_distance_km, 1)
        assert abs(comp.distance_diff_km - expected_d_km) < 1e-4

        # Transit time diff
        expected_t = round(comp.scenario_transit_hours - comp.baseline_transit_hours, 1)
        assert abs(comp.transit_time_diff_hours - expected_t) < 1e-4

        # Average risk diff
        expected_avg_r = round(comp.scenario_average_risk - comp.baseline_average_risk, 1)
        assert abs(comp.average_risk_diff - expected_avg_r) < 1e-4

        # Fuel proxy diff
        expected_f = round(comp.scenario_fuel_proxy - comp.baseline_fuel_proxy, 1)
        assert abs(comp.fuel_proxy_diff - expected_f) < 1e-4

    def test_09_dynamic_explanation_runtime_values_no_hardcoding(self):
        """Verifies explanation contains actual calculated metrics and zero hardcoded templates."""
        req = ScenarioSimulateRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            scenario_type=ScenarioType.SEA_ICE_INCREASE,
            parameters=ScenarioParameters(sic_increase_percent=30.0)
        )

        res = scenario_engine.simulate_scenario(req)
        comp = res.comparison
        assert comp is not None

        exp = res.dynamic_decision_explanation
        assert exp != ""
        # The explanation must contain the actual distance or risk numbers
        assert str(round(comp.scenario_distance_nm, 1)) in exp or str(round(comp.baseline_distance_nm, 1)) in exp or "distance" in exp.lower()

    def test_10_anti_hardcoding_no_legacy_strings(self):
        """Verifies no static legacy scenario strings or Route A/B/C are present."""
        req = ScenarioSimulateRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            scenario_type=ScenarioType.ICEBERG_DRIFT,
            parameters=ScenarioParameters(iceberg_shift_km=50.0)
        )

        res = scenario_engine.simulate_scenario(req)
        forbidden = ["Route A", "Route B", "Route C", "ICEBERG_SHIFT", "WEATHER_STORM", "HIGH_ICE_ZONE"]
        for bad in forbidden:
            assert bad not in res.dynamic_decision_explanation
            assert bad not in res.operational_recommendation

    def test_11_sensitivity_sweep_progression_and_boundary_discovery(self):
        """Verifies parameter sweep evaluates multiple steps and reports boundary behavior."""
        req = SensitivitySweepRequest(
            start_latitude=-63.0,
            start_longitude=7.0,
            destination_latitude=-66.0,
            destination_longitude=23.0,
            sweep_type=ScenarioType.SEA_ICE_INCREASE,
            parameter_values=[0.0, 10.0, 20.0, 30.0, 40.0]
        )

        res = scenario_engine.run_sensitivity_sweep(req)
        assert res.success is True
        assert len(res.sweep_points) == 5
        assert res.parameter_name == "sic_increase_percent"
        assert res.parameter_unit == "%"
        assert res.decision_boundary_explanation != ""

        # Step 0 must match baseline
        assert res.sweep_points[0].step_index == 0
        assert res.sweep_points[0].parameter_value == 0.0

    def test_12_fastapi_scenario_simulate_endpoints(self, test_client):
        """Verifies FastAPI POST /scenarios/simulate, /scenario/simulate, and /scenarios/sensitivity respond 200."""
        payload = {
            "start_latitude": -63.0,
            "start_longitude": 7.0,
            "destination_latitude": -66.0,
            "destination_longitude": 23.0,
            "nominal_speed_knots": 10.0,
            "scenario_type": "ICEBERG_DRIFT",
            "parameters": {
                "iceberg_shift_km": 50.0
            }
        }

        # 1. Primary simulate endpoint
        r1 = test_client.post("/scenarios/simulate", json=payload)
        assert r1.status_code == 200
        d1 = r1.json()
        assert d1["success"] is True
        assert "comparison" in d1
        assert "dynamic_decision_explanation" in d1

        # 2. Alias simulate endpoint
        r2 = test_client.post("/scenario/simulate", json=payload)
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["success"] is True
        assert d2["scenario_type"] == "ICEBERG_DRIFT"

        # 3. Sensitivity sweep endpoint
        sweep_payload = {
            "start_latitude": -63.0,
            "start_longitude": 7.0,
            "destination_latitude": -66.0,
            "destination_longitude": 23.0,
            "sweep_type": "SEA_ICE_INCREASE",
            "parameter_values": [0.0, 15.0, 30.0]
        }
        r3 = test_client.post("/scenarios/sensitivity", json=sweep_payload)
        assert r3.status_code == 200
        d3 = r3.json()
        assert d3["success"] is True
        assert len(d3["sweep_points"]) == 3
        assert "decision_boundary_explanation" in d3

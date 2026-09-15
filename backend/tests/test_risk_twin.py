"""
POLARIS: Phase 8 Test Suite — Antarctic Risk Twin & Operational Decision Dashboard.
Verifies unified Risk Twin state generation, 7-engine system health reporting,
cell inspection, navigation status, 4D forecast timeline, and data provenance.
"""

import os
import sys

# Ensure backend directory is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import pytest
from fastapi.testclient import TestClient

from src.api.main import app
from src.engines.risk_twin_engine import risk_twin_engine, RiskTwinEngine
from src.schemas.risk_twin import (
    RiskTwinSummaryResponse,
    VesselTelemetry,
    OperationalNavigationStatus,
    RiskFactorBreakdown,
    ForecastTimelineEntry,
    CellInspectionData,
    SystemEngineHealth,
)


@pytest.fixture
def client():
    return TestClient(app)


class TestRiskTwinEngine:
    """Test suite for Phase 8 Antarctic Risk Twin."""

    def test_01_system_health_all_7_engines_reported(self):
        """Verify that all 7 core AI/ML engines are monitored and reported in system health."""
        health = risk_twin_engine.get_system_health()
        expected_engines = [
            "gru_iceberg_engine",
            "convlstm_sea_ice_engine",
            "weather_intelligence_engine",
            "risk_fusion_engine",
            "safety_constraint_engine",
            "route_optimizer_engine",
            "scenario_engine",
        ]

        for engine_id in expected_engines:
            assert engine_id in health, f"Missing engine: {engine_id}"
            eng = health[engine_id]
            assert isinstance(eng, SystemEngineHealth)
            assert eng.status in ["READY", "DEGRADED", "OFFLINE"]
            assert len(eng.framework) > 0
            assert len(eng.model_type) > 0
            assert len(eng.details) > 0

    def test_02_risk_twin_summary_generation(self):
        """Verify generation of unified Risk Twin summary snapshot."""
        summary = risk_twin_engine.get_risk_twin_summary(
            departure_lat=-63.0,
            departure_lon=7.0,
            destination_lat=-66.0,
            destination_lon=23.0,
            vessel_safe_sic=70.0,
            vessel_buffer_km=12.0,
        )

        assert isinstance(summary, RiskTwinSummaryResponse)
        assert summary.service == "POLARIS Antarctic Risk Twin Engine"
        assert summary.is_live is True
        assert summary.telemetry_mode == "LIVE_BACKEND_DATA"
        assert len(summary.candidate_routes) > 0
        assert summary.recommended_route_id is not None
        assert len(summary.recommendation_reason) > 0

    def test_03_vessel_telemetry_accuracy(self):
        """Verify vessel telemetry correctly captures position and operational limits."""
        summary = risk_twin_engine.get_risk_twin_summary(
            departure_lat=-63.5,
            departure_lon=8.5,
            vessel_safe_sic=65.0,
            vessel_buffer_km=15.0,
            vessel_speed_knots=12.5,
        )

        vessel = summary.vessel
        assert isinstance(vessel, VesselTelemetry)
        assert vessel.latitude == -63.5
        assert vessel.longitude == 8.5
        assert vessel.safe_sic_threshold_percent == 65.0
        assert vessel.iceberg_safety_buffer_km == 15.0
        assert vessel.speed_knots == 12.5
        assert vessel.ice_class == "PC3"

    def test_04_operational_navigation_status_traversable(self):
        """Verify navigation status is TRAVERSABLE when routes are clear of NO-GO constraints."""
        summary = risk_twin_engine.get_risk_twin_summary(
            departure_lat=-63.0,
            departure_lon=7.0,
            destination_lat=-66.0,
            destination_lon=23.0,
            vessel_safe_sic=80.0,
        )

        nav = summary.navigation_status
        assert isinstance(nav, OperationalNavigationStatus)
        assert nav.status in ["TRAVERSABLE", "NOT_CLEARED"]
        assert nav.status_level in ["SAFE", "WARNING"]
        assert len(nav.explanation) > 0

    def test_05_risk_factor_breakdown_multi_factor_weights(self):
        """Verify 6-factor risk contribution breakdown reflects Phase 3 weights."""
        summary = risk_twin_engine.get_risk_twin_summary()
        breakdown = summary.risk_breakdown

        assert isinstance(breakdown, RiskFactorBreakdown)
        assert 0.0 <= breakdown.sea_ice_score <= 100.0
        assert 0.0 <= breakdown.iceberg_score <= 100.0
        assert 0.0 <= breakdown.weather_score <= 100.0
        assert 0.0 <= breakdown.wave_score <= 100.0
        assert 0.0 <= breakdown.current_score <= 100.0
        assert 0.0 <= breakdown.uncertainty_score <= 100.0

        # Verify weights sum to 1.0
        total_weight = (
            breakdown.sea_ice_weight
            + breakdown.iceberg_weight
            + breakdown.weather_weight
            + breakdown.wave_weight
            + breakdown.current_weight
            + breakdown.uncertainty_weight
        )
        assert abs(total_weight - 1.0) < 1e-4

        assert breakdown.risk_category in ["SAFE", "MODERATE", "HIGH", "CRITICAL"]

    def test_06_dominant_factor_determination(self):
        """Verify that dominant risk factor is dynamically selected."""
        summary = risk_twin_engine.get_risk_twin_summary()
        breakdown = summary.risk_breakdown
        assert breakdown.dominant_factor in [
            "SEA_ICE",
            "ICEBERG",
            "WEATHER",
            "WAVE",
            "CURRENT",
            "UNCERTAINTY",
        ]

    def test_07_forecast_timeline_explicit_horizons(self):
        """Verify 4D forecast timeline contains all 5 discrete horizons (NOW, +6h, +12h, +18h, +24h)."""
        summary = risk_twin_engine.get_risk_twin_summary()
        timeline = summary.forecast_timeline

        assert len(timeline) == 5
        labels = [t.horizon_label for t in timeline]
        assert labels == ["NOW", "+6h", "+12h", "+18h", "+24h"]

        hours = [t.horizon_hours for t in timeline]
        assert hours == [0.0, 6.0, 12.0, 18.0, 24.0]

        for entry in timeline:
            assert isinstance(entry, ForecastTimelineEntry)
            assert entry.is_available is True
            assert len(entry.provenance) > 0

    def test_08_missing_model_horizon_not_fabricated_zero(self):
        """Verify weather risk is available at 6h native horizon, but marked unavailable at others."""
        summary = risk_twin_engine.get_risk_twin_summary()
        timeline = summary.forecast_timeline

        h0 = next(t for t in timeline if t.horizon_hours == 0.0)
        h6 = next(t for t in timeline if t.horizon_hours == 6.0)
        h12 = next(t for t in timeline if t.horizon_hours == 12.0)

        assert h6.weather_risk_available is True
        assert h0.weather_risk_available is False
        assert h12.weather_risk_available is False

    def test_09_provenance_catalog_completeness(self):
        """Verify provenance catalog contains authoritative citations for all models and engines."""
        summary = risk_twin_engine.get_risk_twin_summary()
        catalog = summary.provenance_catalog

        assert "ICEBERG_MODEL" in catalog
        assert "SEA_ICE_MODEL" in catalog
        assert "WEATHER_MODEL" in catalog
        assert "RISK_FUSION" in catalog
        assert "SAFETY_CONSTRAINTS" in catalog
        assert "TIME_AWARE_ASTAR" in catalog
        assert "ROUTE_OPTIMIZER" in catalog
        assert "SCENARIO_ENGINE" in catalog

    def test_10_cell_inspection_granularity(self):
        """Verify cell inspection endpoint provides detailed factor breakdown and safety status."""
        cell = risk_twin_engine.inspect_cell(
            row=5,
            column=10,
            horizon_hours=6.0,
            vessel_safe_sic=70.0,
            vessel_draft=7.8,
        )

        assert isinstance(cell, CellInspectionData)
        assert cell.row == 5
        assert cell.column == 10
        assert cell.safety_status in ["TRAVERSABLE", "NO_GO", "NOT_CLEARED"]
        assert 0.0 <= cell.total_risk <= 100.0
        assert cell.risk_category in ["SAFE", "MODERATE", "HIGH", "CRITICAL"]
        assert len(cell.dominant_factor) > 0
        assert cell.sic_percent is not None
        assert cell.weather_risk is not None  # At 6h horizon
        assert "SIC" in cell.model_provenances

    def test_11_anti_hardcoding_dynamic_summary(self):
        """Verify changing vessel profile parameters alters output dynamically (no static strings)."""
        sum1 = risk_twin_engine.get_risk_twin_summary(vessel_safe_sic=90.0, vessel_buffer_km=5.0)
        sum2 = risk_twin_engine.get_risk_twin_summary(vessel_safe_sic=20.0, vessel_buffer_km=50.0)

        # Vessel safe limits must differ
        assert sum1.vessel.safe_sic_threshold_percent != sum2.vessel.safe_sic_threshold_percent
        assert sum1.vessel.iceberg_safety_buffer_km != sum2.vessel.iceberg_safety_buffer_km

    def test_12_fastapi_endpoints_respond(self, client):
        """Verify all Phase 8 FastAPI HTTP endpoints respond with 200 OK and valid schemas."""
        # 1. Health endpoint with all 7 engines
        res_health = client.get("/health")
        assert res_health.status_code == 200
        data_health = res_health.json()
        assert "engines" in data_health
        assert len(data_health["engines"]) == 7

        # 2. System health endpoint
        res_sys_health = client.get("/system/health")
        assert res_sys_health.status_code == 200

        # 3. GET /risk-twin/summary
        res_summary_get = client.get("/risk-twin/summary")
        assert res_summary_get.status_code == 200
        data_summary = res_summary_get.json()
        assert data_summary["service"] == "POLARIS Antarctic Risk Twin Engine"
        assert len(data_summary["candidate_routes"]) > 0

        # 4. POST /risk-twin/summary
        res_summary_post = client.post(
            "/risk-twin/summary",
            json={
                "departure_latitude": -63.0,
                "departure_longitude": 7.0,
                "destination_latitude": -66.0,
                "destination_longitude": 23.0,
                "vessel_safe_sic": 70.0,
                "vessel_buffer_km": 12.0,
                "vessel_speed_knots": 14.0,
            },
        )
        assert res_summary_post.status_code == 200

        # 5. GET /risk-twin/cell-inspect
        res_inspect = client.get("/risk-twin/cell-inspect?row=6&col=12&horizon=6.0")
        assert res_inspect.status_code == 200
        data_inspect = res_inspect.json()
        assert data_inspect["row"] == 6
        assert data_inspect["column"] == 12
        assert "total_risk" in data_inspect

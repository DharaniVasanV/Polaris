"""
POLARIS Phase 10C — Sentinel-1 Coordinate-Driven Integration Test Suite.

Tests vessel position inputs, local bounding box calculations, spatial intersection checks,
haversine distance calculations, and FastAPI route coordinate query parameters.
All external Copernicus API calls are mocked.
"""

import os
import sys
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.services.sentinel1_catalog import (
    calculate_vessel_aoi,
    calculate_haversine_distance,
    check_spatial_intersection,
    search_latest_sentinel1_grd,
)
from src.schemas.sentinel1 import Sentinel1BBox
from src.api.sentinel1_routes import router as sentinel1_router

app = FastAPI()
app.include_router(sentinel1_router)


def _make_stac_feature_with_bbox(product_id="S1A_COORD_TEST",
                                min_lon=-5.0, min_lat=-65.0, max_lon=5.0, max_lat=-60.0):
    return {
        "id": product_id,
        "type": "Feature",
        "bbox": [min_lon, min_lat, max_lon, max_lat],
        "properties": {
            "datetime": "2026-09-16T12:00:00Z",
            "start_datetime": "2026-09-16T12:00:00Z",
            "end_datetime": "2026-09-16T12:05:00Z",
            "platform": "SENTINEL-1A",
            "instruments": ["SAR"],
            "sar:instrument_mode": "EW",
            "sar:polarizations": ["HH", "HV"],
        },
        "links": []
    }


class TestSentinel1CoordinateSearch(unittest.TestCase):

    def setUp(self):
        os.environ["COPERNICUS_CLIENT_ID"] = "test_id"
        os.environ["COPERNICUS_CLIENT_SECRET"] = "test_secret"
        self.client = TestClient(app)

    # 1. Local BBox Calculation
    def test_01_calculate_vessel_aoi_valid(self):
        aoi = calculate_vessel_aoi(-63.0, 0.0, radius_km=250.0)
        self.assertLess(aoi["min_lat"], -63.0)
        self.assertGreater(aoi["max_lat"], -63.0)
        self.assertLess(aoi["min_lon"], 0.0)
        self.assertGreater(aoi["max_lon"], 0.0)
        self.assertGreaterEqual(aoi["min_lat"], -90.0)
        self.assertLessEqual(aoi["max_lat"], 90.0)

    def test_02_calculate_vessel_aoi_invalid_coords(self):
        with self.assertRaises(ValueError):
            calculate_vessel_aoi(-95.0, 0.0, radius_km=250.0)
        with self.assertRaises(ValueError):
            calculate_vessel_aoi(-63.0, 200.0, radius_km=250.0)
        with self.assertRaises(ValueError):
            calculate_vessel_aoi(-63.0, 0.0, radius_km=-10.0)

    # 2. Haversine Distance
    def test_03_haversine_distance(self):
        dist = calculate_haversine_distance(-63.0, 0.0, -63.0, 1.0)
        # 1 degree of lon at -63° lat ≈ 50 km
        self.assertGreater(dist, 40.0)
        self.assertLess(dist, 60.0)

    # 3. Spatial Intersection Checks
    def test_04_spatial_intersection(self):
        aoi = {"min_lat": -65.0, "max_lat": -60.0, "min_lon": -5.0, "max_lon": 5.0}

        # Intersecting product
        prod1 = Sentinel1BBox(min_lat=-64.0, max_lat=-61.0, min_lon=-2.0, max_lon=2.0)
        intersects, status = check_spatial_intersection(aoi, prod1)
        self.assertTrue(intersects)
        self.assertIn(status, ["COVERED", "PARTIAL"])

        # Non-intersecting product
        prod2 = Sentinel1BBox(min_lat=-50.0, max_lat=-45.0, min_lon=20.0, max_lon=30.0)
        intersects2, status2 = check_spatial_intersection(aoi, prod2)
        self.assertFalse(intersects2)
        self.assertEqual(status2, "NOT_COVERED")

    # 4. Catalog Search with Vessel Coordinates
    @patch("src.services.sentinel1_catalog.requests")
    @patch("src.services.sentinel1_catalog.get_access_token", return_value="MOCK_TOKEN")
    def test_05_catalog_search_intersects(self, mock_token, mock_requests):
        feat = _make_stac_feature_with_bbox("S1A_INTERSECT", min_lon=-2.0, min_lat=-64.0, max_lon=2.0, max_lat=-62.0)
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"features": [feat]}
        mock_requests.post.return_value = mock_resp

        obs = search_latest_sentinel1_grd(vessel_lat=-63.0, vessel_lon=0.0, radius_km=250.0)
        self.assertIsNotNone(obs)
        self.assertEqual(obs.product_id, "S1A_INTERSECT")
        self.assertEqual(obs.search_center, {"latitude": -63.0, "longitude": 0.0})
        self.assertEqual(obs.search_radius_km, 250.0)
        self.assertTrue(obs.coverage_intersects)

    @patch("src.services.sentinel1_catalog.requests")
    @patch("src.services.sentinel1_catalog.get_access_token", return_value="MOCK_TOKEN")
    def test_06_catalog_search_rejects_non_intersecting(self, mock_token, mock_requests):
        # Product is far away from vessel
        feat = _make_stac_feature_with_bbox("S1A_FAR_AWAY", min_lon=40.0, min_lat=-50.0, max_lon=45.0, max_lat=-45.0)
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"features": [feat]}
        mock_requests.post.return_value = mock_resp

        obs = search_latest_sentinel1_grd(vessel_lat=-63.0, vessel_lon=0.0, radius_km=100.0)
        self.assertIsNone(obs)

    # 5. FastAPI Endpoints with Query Parameters
    @patch("src.api.sentinel1_routes.credentials_are_configured", return_value=True)
    @patch("src.api.sentinel1_routes.search_latest_sentinel1_grd")
    def test_07_api_endpoint_vessel_coords(self, mock_search, mock_cred):
        from src.schemas.sentinel1 import Sentinel1Observation
        obs = Sentinel1Observation(
            source="Sentinel-1",
            collection="sentinel-1-grd",
            product_id="S1A_LOCAL_001",
            acquisition_time="2026-09-16T12:00:00Z",
            provenance="RECENT",
            status="RECENT",
            retrieved_at="2026-09-16T12:05:00Z",
            search_center={"latitude": -63.0, "longitude": 0.0},
            search_radius_km=250.0,
            distance_to_search_center_km=12.5,
            coverage_intersects=True,
            coverage_status="PARTIAL",
        )
        mock_search.return_value = obs

        res = self.client.get("/satellite/sentinel1/latest?vessel_lat=-63.0&vessel_lon=0.0&radius_km=250")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "OK")
        self.assertEqual(data["observation"]["product_id"], "S1A_LOCAL_001")
        self.assertEqual(data["observation"]["search_center"], {"latitude": -63.0, "longitude": 0.0})

    @patch("src.api.sentinel1_routes.credentials_are_configured", return_value=True)
    @patch("src.api.sentinel1_routes.search_latest_sentinel1_grd", return_value=None)
    def test_08_api_endpoint_no_recent_coverage_status(self, mock_search, mock_cred):
        res = self.client.get("/satellite/sentinel1/latest?vessel_lat=-63.0&vessel_lon=0.0&radius_km=250")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "NO_RECENT_COVERAGE")
        self.assertIsNone(data["observation"])


if __name__ == "__main__":
    unittest.main()

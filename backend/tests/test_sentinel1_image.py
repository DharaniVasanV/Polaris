"""
Unit tests for POLARIS Phase 10B — Sentinel-1 SAR Image Integration with Resolution & Tile Grid Fix.
Tests all logic in src/services/sentinel1_image.py, src/schemas/sentinel1_image.py,
and Phase 10B FastAPI routes in src/api/sentinel1_routes.py.

Includes regression test reproducing the 4331.19 m/px Process API error and verifying the fix.
All external Copernicus network calls are mocked. No real HTTP calls are made.
"""

import os
import sys
import io
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient

from fastapi import FastAPI
from src.api.sentinel1_routes import router as sentinel1_router

app = FastAPI()
app.include_router(sentinel1_router)

from src.services.sentinel1_catalog import get_aoi_config
from src.services.sentinel1_image import (
    select_sentinel1_visual_band,
    _build_evalscript_single_channel,
    _build_process_request,
    _BoundedImageCache,
    _make_cache_key,
    get_sentinel1_sar_image,
    get_image_cache_size,
    invalidate_image_cache,
    calculate_aoi_dimensions_meters,
    calculate_pixel_size_meters,
    calculate_tile_grid,
    _request_sar_image_tile,
    COPERNICUS_MAX_PIXEL_SIZE_METERS,
    TARGET_RESOLUTION_M_PER_PX,
    Sentinel1ImageError,
    Sentinel1ImageNotAvailable,
    Sentinel1ResolutionError,
)
from src.schemas.sentinel1 import Sentinel1Observation, Sentinel1BBox
from src.schemas.sentinel1_image import Sentinel1ImageMetadata, Sentinel1ImageBBox, Sentinel1ImageStatusResponse
from src.services.copernicus_auth import CopernicusTokenError, CopernicusCredentialsMissingError, invalidate_token

import base64

# Standard 1x1 transparent PNG bytes for mock responses (base64 decoded for 100% reliability)
MOCK_PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


class TestSentinel1ImageService(unittest.TestCase):
    """Tests for sentinel1_image.py service functions, dynamic polarization, tile grid, and resolution fix."""

    def setUp(self):
        invalidate_image_cache()
        invalidate_token()
        os.environ["COPERNICUS_CLIENT_ID"] = "test_client_id_123"
        os.environ["COPERNICUS_CLIENT_SECRET"] = "test_client_secret_456"

    def tearDown(self):
        invalidate_image_cache()
        invalidate_token()

    def test_01_select_sentinel1_visual_band_hh_hv(self):
        band = select_sentinel1_visual_band("HH+HV")
        self.assertEqual(band, "HH")

    def test_02_select_sentinel1_visual_band_vv_vh(self):
        band = select_sentinel1_visual_band("VV+VH")
        self.assertEqual(band, "VV")

    def test_02b_select_sentinel1_visual_band_single_pols(self):
        self.assertEqual(select_sentinel1_visual_band("HH"), "HH")
        self.assertEqual(select_sentinel1_visual_band("HV"), "HV")
        self.assertEqual(select_sentinel1_visual_band("VV"), "VV")
        self.assertEqual(select_sentinel1_visual_band("VH"), "VH")
        self.assertEqual(select_sentinel1_visual_band(["HH", "HV"]), "HH")

    def test_02c_select_sentinel1_visual_band_missing_raises_error(self):
        with self.assertRaises(Sentinel1ImageError):
            select_sentinel1_visual_band(None)

        with self.assertRaises(Sentinel1ImageError):
            select_sentinel1_visual_band("")

        with self.assertRaises(Sentinel1ImageError):
            select_sentinel1_visual_band("UNKNOWN_POL")

    def test_02d_regression_reported_ew_1sdh_product_uses_hh_not_vv(self):
        """
        REGRESSION TEST FOR REPORTED ERROR:
        Product: S1D_EW_GRDM_1SDH_20260915T160334_20260915T160417_004590_0088CF_F79C_COG.SAFE
        Contains HH+HV dual-polarization (1SDH).
        Must select 'HH' and NOT request missing 'VV' band.
        """
        product_id = "S1D_EW_GRDM_1SDH_20260915T160334_20260915T160417_004590_0088CF_F79C_COG.SAFE"
        band = select_sentinel1_visual_band("HH+HV")
        self.assertEqual(band, "HH")
        self.assertNotEqual(band, "VV")

        script = _build_evalscript_single_channel(band)
        self.assertIn('bands: ["HH", "dataMask"]', script)
        self.assertNotIn('"VV"', script)

    def test_03_build_evalscript_single_channel_contains_band(self):
        script = _build_evalscript_single_channel("VV")
        self.assertIn('"VV"', script)
        self.assertIn('sampleType: "UINT8"', script)
        self.assertNotIn('sampleType: "FLOAT32"', script)

    def test_25_evalscript_uses_uint8_sample_type_for_png(self):
        """Verifies evalscript setup specifies sampleType: UINT8 and 0-255 integer scaling."""
        script = _build_evalscript_single_channel("VV")
        self.assertIn('sampleType: "UINT8"', script)
        self.assertNotIn('FLOAT32', script)
        # Verify 0-255 integer conversion math
        self.assertIn('Math.floor', script)

    def test_26_regression_reproduce_float32_png_error_and_verify_fix(self):
        """
        REGRESSION TEST:
        Reproduces the original error where Process API rejected 'FLOAT32' for 'image/png'.
        Verifies that _build_evalscript_single_channel strictly outputs UINT8,
        preventing HTTP 400 'Format image/png does not support sample type FLOAT32'.
        """
        script = _build_evalscript_single_channel("VV")
        req = _build_process_request(
            aoi=get_aoi_config(),
            acquisition_time="2026-09-15T12:00:00Z",
            polarization="VV",
            width=500,
            height=250,
            evalscript=script,
        )

        # Output format is PNG
        self.assertEqual(req["output"]["responses"][0]["format"]["type"], "image/png")
        # Evalscript MUST be UINT8, never FLOAT32
        self.assertNotIn('sampleType: "FLOAT32"', req["evalscript"])
        self.assertIn('sampleType: "UINT8"', req["evalscript"])

    def test_27_evalscript_high_contrast_contrast_stretch_and_gamma(self):
        """Verifies high-contrast SAR evalscript contains [-24 dB, 0 dB] clip and gamma power curve."""
        script = _build_evalscript_single_channel("HH")
        self.assertIn("dB + 24.0", script)
        self.assertIn("Math.pow(norm, 0.85)", script)
        self.assertIn('sampleType: "UINT8"', script)

    def test_04_build_process_request_structure(self):
        aoi = {"min_lon": -25.0, "min_lat": -75.0, "max_lon": 75.0, "max_lat": -58.0}
        req = _build_process_request(
            aoi=aoi,
            acquisition_time="2026-09-15T12:00:00Z",
            polarization="VV",
            width=1024,
            height=512,
            evalscript="//evalscript",
        )
        self.assertEqual(req["output"]["width"], 1024)
        self.assertEqual(req["output"]["height"], 512)
        self.assertEqual(req["input"]["bounds"]["bbox"], [-25.0, -75.0, 75.0, -58.0])

    def test_05_bounded_cache_hit_and_eviction(self):
        cache = _BoundedImageCache(ttl_minutes=60, max_entries=2)
        cache.set("key1", b"bytes1", {"meta": 1})
        cache.set("key2", b"bytes2", {"meta": 2})

        ret1 = cache.get("key1")
        self.assertIsNotNone(ret1)
        self.assertEqual(ret1[0], b"bytes1")

        cache.set("key3", b"bytes3", {"meta": 3})
        self.assertEqual(cache.size(), 2)

    def test_06_bounded_cache_invalidation(self):
        cache = _BoundedImageCache(ttl_minutes=60, max_entries=5)
        cache.set("k1", b"data", {})
        self.assertEqual(cache.size(), 1)
        cache.invalidate_all()
        self.assertEqual(cache.size(), 0)

    # ── Phase 10B Resolution Fix Tests ──────────────────────────────────────────

    def test_07_calculate_aoi_dimensions_meters_large_aoi(self):
        aoi = get_aoi_config()
        width_m, height_m = calculate_aoi_dimensions_meters(aoi)
        # 100° lon at mid-lat -66.5° ≈ 4,438 km
        self.assertGreater(width_m, 4000000.0)
        self.assertLess(width_m, 5000000.0)
        # 17° lat ≈ 1,892 km
        self.assertGreater(height_m, 1800000.0)
        self.assertLess(height_m, 2000000.0)

    def test_08_regression_reproduce_4331m_error_and_verify_fix(self):
        """
        REGRESSION TEST:
        Reproduces the exact old single request (1024x512 over full Antarctic AOI)
        which generated a pixel size of ~4,334 m/px, violating the 1500 m/px limit.
        Verifies that our pixel size calculator detects the violation.
        """
        aoi = get_aoi_config()
        w_m, h_m = calculate_aoi_dimensions_meters(aoi)
        px_x, px_y, max_px = calculate_pixel_size_meters(w_m, h_m, width_px=1024, height_px=512)

        # Confirm old single request produced ~4334 m/px which exceeds 1500 m/px limit
        self.assertGreater(max_px, 1500.0)
        self.assertAlmostEqual(max_px, 4334.84, delta=50.0)

        # Now test tile grid calculation at target 500 m/px
        tiles = calculate_tile_grid(aoi, target_res_m=500.0)
        self.assertGreater(len(tiles), 1)

        # Confirm EVERY tile in the grid strictly respects the 1500 m/px limit
        for tile in tiles:
            self.assertLessEqual(tile["pixel_size_m"], COPERNICUS_MAX_PIXEL_SIZE_METERS)
            self.assertLessEqual(tile["width_px"], 2500)
            self.assertLessEqual(tile["height_px"], 2500)

    def test_09_tile_grid_calculation_structure(self):
        aoi = get_aoi_config()
        tiles = calculate_tile_grid(aoi, target_res_m=500.0)

        # 4 cols x 2 rows = 8 tiles
        self.assertEqual(len(tiles), 8)

        # Verify tile coordinates cover full AOI
        min_lon = min(t["bbox"]["min_lon"] for t in tiles)
        max_lon = max(t["bbox"]["max_lon"] for t in tiles)
        min_lat = min(t["bbox"]["min_lat"] for t in tiles)
        max_lat = max(t["bbox"]["max_lat"] for t in tiles)

        self.assertAlmostEqual(min_lon, aoi["min_lon"])
        self.assertAlmostEqual(max_lon, aoi["max_lon"])
        self.assertAlmostEqual(min_lat, aoi["min_lat"])
        self.assertAlmostEqual(max_lat, aoi["max_lat"])

    def test_10_pixel_size_limit_pre_check_raises_resolution_error(self):
        """Verifies _request_sar_image_tile raises Sentinel1ResolutionError if pixel size > 1500 m/px."""
        aoi = get_aoi_config()
        with self.assertRaises(Sentinel1ResolutionError) as ctx:
            _request_sar_image_tile(
                aoi=aoi,
                acquisition_time="2026-09-15T12:00:00Z",
                polarization="VV",
                evalscript="//evalscript",
                token="token",
                width=100,  # 100px width over 4.4M meters = 44,000 m/px >> 1500 m/px
                height=50,
            )
        self.assertIn("exceeds Copernicus limit", str(ctx.exception))
        self.assertGreater(ctx.exception.requested_px_size, 1500.0)

    @patch("src.services.sentinel1_image._request_sar_image_tile")
    @patch("src.services.sentinel1_image.get_access_token")
    def test_11_get_sentinel1_sar_image_success_tile_assembly(self, mock_token, mock_tile_req):
        mock_token.return_value = "mock_access_token_123"
        mock_tile_req.return_value = MOCK_PNG_BYTES

        img_bytes, meta = get_sentinel1_sar_image(
            product_id="S1A_IW_GRDH_1SDV_20260915T120000",
            acquisition_time="2026-09-15T12:00:00Z",
        )

        self.assertIsNotNone(img_bytes)
        self.assertGreater(len(img_bytes), 10)
        self.assertEqual(meta["source"], "Sentinel-1")
        self.assertEqual(meta["provenance"], "RECENT")
        self.assertTrue(meta["image_available"])
        self.assertEqual(meta["tile_count"], 8)
        self.assertLessEqual(meta["max_pixel_size_m_per_px"], 1500.0)


class TestSentinel1ImageRoutes(unittest.TestCase):
    """Tests for Phase 10B FastAPI endpoints in sentinel1_routes.py."""

    def setUp(self):
        self.client = TestClient(app)
        invalidate_image_cache()
        invalidate_token()

    def tearDown(self):
        invalidate_image_cache()
        invalidate_token()

    @patch("src.api.sentinel1_routes.credentials_are_configured")
    def test_12_image_endpoint_unconfigured_returns_503(self, mock_cred):
        mock_cred.return_value = False
        res = self.client.get("/satellite/sentinel1/latest/image")
        self.assertEqual(res.status_code, 503)
        self.assertIn("not configured", res.json()["detail"].lower())

    @patch("src.api.sentinel1_routes.credentials_are_configured")
    @patch("src.api.sentinel1_routes.search_latest_sentinel1_grd")
    def test_13_image_endpoint_no_data_returns_404(self, mock_search, mock_cred):
        mock_cred.return_value = True
        mock_search.return_value = None
        res = self.client.get("/satellite/sentinel1/latest/image")
        self.assertEqual(res.status_code, 404)
        self.assertIn("No recent Sentinel-1 acquisition", res.json()["detail"])

    @patch("src.api.sentinel1_routes.credentials_are_configured")
    @patch("src.api.sentinel1_routes.search_latest_sentinel1_grd")
    @patch("src.api.sentinel1_routes.get_sentinel1_sar_image")
    def test_14_image_endpoint_returns_png_200(self, mock_get_img, mock_search, mock_cred):
        mock_cred.return_value = True
        obs = Sentinel1Observation(
            source="Sentinel-1",
            collection="sentinel-1-grd",
            product_id="S1A_IW_GRDH_TEST",
            acquisition_time="2026-09-15T12:00:00Z",
            provenance="RECENT",
            status="RECENT",
            retrieved_at="2026-09-15T12:05:00Z",
        )
        mock_search.return_value = obs

        mock_meta = {
            "source": "Sentinel-1",
            "product_id": "S1A_IW_GRDH_TEST",
            "acquisition_time": "2026-09-15T12:00:00Z",
            "polarization": "VV",
            "provenance": "RECENT",
        }
        mock_get_img.return_value = (MOCK_PNG_BYTES, mock_meta)

        res = self.client.get("/satellite/sentinel1/latest/image")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers["content-type"], "image/png")
        self.assertEqual(res.headers["x-sentinel1-product-id"], "S1A_IW_GRDH_TEST")
        self.assertEqual(res.headers["x-sentinel1-provenance"], "RECENT")
        self.assertEqual(res.content, MOCK_PNG_BYTES)

    @patch("src.api.sentinel1_routes.credentials_are_configured")
    @patch("src.api.sentinel1_routes.search_latest_sentinel1_grd")
    def test_15_image_metadata_endpoint_success(self, mock_search, mock_cred):
        mock_cred.return_value = True
        obs = Sentinel1Observation(
            source="Sentinel-1",
            collection="sentinel-1-grd",
            product_id="S1A_IW_GRDH_TEST",
            acquisition_time="2026-09-15T12:00:00Z",
            polarization="VV+VH",
            provenance="RECENT",
            status="RECENT",
            retrieved_at="2026-09-15T12:05:00Z",
        )
        mock_search.return_value = obs

        res = self.client.get("/satellite/sentinel1/latest/image/metadata")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "OK")
        self.assertIsNotNone(data["metadata"])
        self.assertEqual(data["metadata"]["product_id"], "S1A_IW_GRDH_TEST")
        self.assertEqual(data["metadata"]["polarization"], "VV+VH")
        self.assertEqual(data["metadata"]["selected_band"], "VV")

    def test_16_aoi_consistency_single_source_of_truth(self):
        cat_aoi = get_aoi_config()
        self.assertEqual(cat_aoi["min_lat"], -75.0)
        self.assertEqual(cat_aoi["max_lat"], -58.0)
        self.assertEqual(cat_aoi["min_lon"], -25.0)
        self.assertEqual(cat_aoi["max_lon"], 75.0)

    @patch("src.api.sentinel1_routes.credentials_are_configured")
    def test_17_health_endpoint_unchanged(self, mock_cred):
        mock_cred.return_value = True
        res = self.client.get("/satellite/sentinel1/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("status", data)


if __name__ == "__main__":
    unittest.main()

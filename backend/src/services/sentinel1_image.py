"""
POLARIS Phase 10B — Sentinel-1 SAR Image Service with Tile-Based Resolution Control.

Retrieves actual Sentinel-1 GRD SAR backscatter PNG imagery from the
Copernicus Sentinel Hub Processing API for the configured Antarctic AOI.

Resolution / Pixel Size Fix (Phase 10B Fix):
  - Copernicus Sentinel Hub Process API imposes a maximum pixel size limit
    of 1500.00 meters per pixel for collection S1GRD.
  - The Antarctic AOI (-75.0° to -58.0°S, -25.0° to 75.0°E) is ~4,438 km wide
    x ~1,892 km tall.
  - Requesting the full AOI at 1024x512 px produces an invalid ~4,334 m/px.
  - This module divides the full AOI into a tile grid at a high target resolution
    (500.0 m/px, 3x finer than the limit), requests each sub-tile within Process API's
    2500x2500 px limit, and seamlessly stitches them into the final georeferenced overlay.

Design rules:
  - REUSES get_aoi_config() from sentinel1_catalog — single AOI source of truth.
  - REUSES get_access_token() from copernicus_auth — no second auth flow.
  - Image cached in a bounded in-memory LRU dict.
  - No credentials, tokens, or raw image bytes exposed to the frontend.
  - Provenance remains: RECENT (not LIVE).
  - No ML model is fed any SAR imagery.
"""

import os
import io
import math
import time
import hashlib
import logging
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from typing import Optional

try:
    from PIL import Image
except ImportError:
    Image = None  # type: ignore

try:
    import requests
except ImportError:
    requests = None  # type: ignore

try:
    from src.services.copernicus_auth import (
        get_access_token,
        invalidate_token,
        CopernicusTokenError,
        CopernicusCredentialsMissingError,
    )
    from src.services.sentinel1_catalog import get_aoi_config
except ImportError:
    from services.copernicus_auth import (
        get_access_token,
        invalidate_token,
        CopernicusTokenError,
        CopernicusCredentialsMissingError,
    )
    from services.sentinel1_catalog import get_aoi_config

logger = logging.getLogger("polaris.sentinel1.image")

# Sentinel Hub Processing API endpoint
PROCESS_API_URL = "https://sh.dataspace.copernicus.eu/api/v1/process"

# Copernicus API Limits & Resolution Strategy
COPERNICUS_MAX_PIXEL_SIZE_METERS = 1500.0   # Copernicus S1GRD hard limit per request
COPERNICUS_MIN_PIXEL_SIZE_METERS = 10.0     # Highest resolution for S1GRD IW mode
COPERNICUS_MAX_DIMENSION_PX = 2500          # Max pixels per dimension in a Process API request

# Target resolution for rendering high-fidelity SAR imagery
TARGET_RESOLUTION_M_PER_PX = 500.0           # 500 m/px is 3x higher resolution than the 1500 m/px limit
FINAL_OUTPUT_WIDTH = 2048
FINAL_OUTPUT_HEIGHT = 1024
DEFAULT_OPACITY = 0.45

# Cache configuration
DEFAULT_CACHE_TTL_MINUTES = 60
MAX_CACHE_ENTRIES = 10


class Sentinel1ImageError(Exception):
    """Base exception for Sentinel-1 SAR image processing errors."""
    def __init__(self, message: str, status_code: Optional[int] = None, response_body: Optional[str] = None):
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body


class Sentinel1ImageNotAvailable(Sentinel1ImageError):
    """Raised when no SAR data is available for the requested time/AOI."""
    pass


class Sentinel1ResolutionError(Sentinel1ImageError):
    """
    Raised when Copernicus Process API rejects pixel size / resolution.
    Reports the requested pixel size and the API limit.
    """
    def __init__(self, requested_px_size: float, limit_px_size: float = COPERNICUS_MAX_PIXEL_SIZE_METERS, detail: str = ""):
        self.requested_px_size = requested_px_size
        self.limit_px_size = limit_px_size
        message = (
            f"Process API rejected resolution: requested pixel size of {requested_px_size:.2f} m/px "
            f"exceeds collection limit of {limit_px_size:.2f} m/px. {detail}"
        )
        super().__init__(message)


# ─── Geographic Calculation Utilities ───────────────────────────────────────

def calculate_aoi_dimensions_meters(aoi: dict) -> tuple[float, float]:
    """
    Calculates geographic width and height in meters for a bounding box dict:
      aoi = {'min_lon': float, 'min_lat': float, 'max_lon': float, 'max_lat': float}
    
    Using standard spherical geodesic approximation:
      1° latitude ≈ 111,320 meters
      1° longitude ≈ 111,320 * cos(mid_latitude) meters
    """
    min_lat = aoi["min_lat"]
    max_lat = aoi["max_lat"]
    min_lon = aoi["min_lon"]
    max_lon = aoi["max_lon"]

    delta_lat = abs(max_lat - min_lat)
    delta_lon = abs(max_lon - min_lon)

    mid_lat_rad = math.radians((min_lat + max_lat) / 2.0)

    height_m = delta_lat * 111320.0
    width_m = delta_lon * 111320.0 * math.cos(mid_lat_rad)

    return width_m, height_m


def calculate_pixel_size_meters(width_m: float, height_m: float, width_px: int, height_px: int) -> tuple[float, float, float]:
    """
    Calculates (pixel_size_x, pixel_size_y, max_pixel_size) in meters per pixel.
    """
    px_x = width_m / max(1, float(width_px))
    px_y = height_m / max(1, float(height_px))
    return px_x, px_y, max(px_x, px_y)


def calculate_tile_grid(
    aoi: dict,
    target_res_m: float = TARGET_RESOLUTION_M_PER_PX,
    max_dim_px: int = COPERNICUS_MAX_DIMENSION_PX,
) -> list[dict]:
    """
    Divides the AOI into a grid of geographic sub-tiles such that:
    1. Each sub-tile's request width & height in pixels does NOT exceed max_dim_px (2500 px).
    2. Each sub-tile's pixel size equals target_res_m (500.0 m/px), which is strictly <= 1500.0 m/px limit.

    Returns a list of tile dicts containing bbox, pixel dimensions, and pixel size.
    """
    width_m, height_m = calculate_aoi_dimensions_meters(aoi)

    total_width_px = math.ceil(width_m / target_res_m)
    total_height_px = math.ceil(height_m / target_res_m)

    num_cols = max(1, math.ceil(total_width_px / max_dim_px))
    num_rows = max(1, math.ceil(total_height_px / max_dim_px))

    min_lon, max_lon = aoi["min_lon"], aoi["max_lon"]
    min_lat, max_lat = aoi["min_lat"], aoi["max_lat"]

    lon_step = (max_lon - min_lon) / num_cols
    lat_step = (max_lat - min_lat) / num_rows

    tiles = []

    for r in range(num_rows):
        # Latitudes go from max_lat (top, row 0) down to min_lat (bottom, row num_rows-1)
        tile_max_lat = max_lat - r * lat_step
        tile_min_lat = max_lat - (r + 1) * lat_step

        for c in range(num_cols):
            tile_min_lon = min_lon + c * lon_step
            tile_max_lon = min_lon + (c + 1) * lon_step

            tile_aoi = {
                "min_lon": tile_min_lon,
                "min_lat": tile_min_lat,
                "max_lon": tile_max_lon,
                "max_lat": tile_max_lat,
            }

            t_w_m, t_h_m = calculate_aoi_dimensions_meters(tile_aoi)
            t_w_px = max(1, math.ceil(t_w_m / target_res_m))
            t_h_px = max(1, math.ceil(t_h_m / target_res_m))

            # Guarantee tile dimensions do not exceed Process API max limit
            t_w_px = min(t_w_px, max_dim_px)
            t_h_px = min(t_h_px, max_dim_px)

            _, _, px_size = calculate_pixel_size_meters(t_w_m, t_h_m, t_w_px, t_h_px)

            tiles.append({
                "col": c,
                "row": r,
                "bbox": tile_aoi,
                "width_m": t_w_m,
                "height_m": t_h_m,
                "width_px": t_w_px,
                "height_px": t_h_px,
                "pixel_size_m": px_size,
            })

    return tiles


# ─── Bounded In-Memory Image Cache ────────────────────────────────────────────

class _BoundedImageCache:
    """Thread-safe TTL-bounded image cache."""

    def __init__(self, ttl_minutes: int = DEFAULT_CACHE_TTL_MINUTES, max_entries: int = MAX_CACHE_ENTRIES):
        self._lock = threading.Lock()
        self._store: dict = {}
        self._ttl_seconds = ttl_minutes * 60
        self._max_entries = max_entries

    def get(self, key: str) -> Optional[tuple]:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            image_bytes, cached_at, metadata = entry
            if time.monotonic() - cached_at > self._ttl_seconds:
                del self._store[key]
                return None
            return image_bytes, metadata

    def set(self, key: str, image_bytes: bytes, metadata: dict) -> None:
        with self._lock:
            if len(self._store) >= self._max_entries and key not in self._store:
                oldest_key = next(iter(self._store))
                del self._store[oldest_key]
            self._store[key] = (image_bytes, time.monotonic(), metadata)

    def invalidate_all(self) -> None:
        with self._lock:
            self._store.clear()

    def size(self) -> int:
        with self._lock:
            return len(self._store)


_image_cache = _BoundedImageCache()


def _make_cache_key(product_id: str, acquisition_time: str, aoi: dict, polarization: str, target_res: float) -> str:
    aoi_str = f"{aoi['min_lon']},{aoi['min_lat']},{aoi['max_lon']},{aoi['max_lat']}"
    raw = f"{product_id}|{acquisition_time}|{aoi_str}|{polarization}|res={target_res}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def select_sentinel1_visual_band(polarization_metadata: Optional[str | list[str]]) -> str:
    """
    Selects the primary visualization band (HH, VV, HV, VH) that ACTUALLY exists
    in the selected Sentinel-1 product metadata.

    Rules:
    - If metadata includes HH (e.g. HH+HV or HH): select 'HH'
    - If metadata includes VV (e.g. VV+VH or VV): select 'VV'
    - If metadata includes HV only: select 'HV'
    - If metadata includes VH only: select 'VH'
    - If metadata is empty/ambiguous: raise Sentinel1ImageError detailing missing polarization.
    """
    if not polarization_metadata:
        raise Sentinel1ImageError(
            "Sentinel-1 polarization metadata missing or ambiguous. Cannot determine available SAR band."
        )

    pols: list[str] = []
    if isinstance(polarization_metadata, list):
        for p in polarization_metadata:
            pols.extend(str(p).upper().replace("+", ",").replace(" ", "").split(","))
    elif isinstance(polarization_metadata, str):
        pols = [p.upper() for p in polarization_metadata.replace("+", ",").replace(" ", "").split(",") if p]

    # Deduplicate while preserving order
    pols = list(dict.fromkeys(pols))

    # Priority selection of available co-pol band first (HH or VV), then cross-pol (HV or VH)
    if "HH" in pols:
        return "HH"
    if "VV" in pols:
        return "VV"
    if "HV" in pols:
        return "HV"
    if "VH" in pols:
        return "VH"

    raise Sentinel1ImageError(
        f"Could not determine valid visualization band from polarization metadata '{polarization_metadata}'. "
        "Expected one of HH, VV, HV, VH."
    )


def _build_evalscript_single_channel(selected_band: str) -> str:
    """
    Sentinel-1 GRD single-channel backscatter visualization evalscript.
    Dynamically includes ONLY the selected valid band (HH, VV, HV, or VH).
    Uses sampleType: UINT8 with 0-255 integer scaling required for image/png format.
    Applies high-contrast SAR backscatter stretch [-24 dB, 0 dB] with gamma enhancement.
    Output: RGBA UINT8 (0-255).
    """
    return f"""
//VERSION=3
function setup() {{
    return {{
        input: [{{
            bands: ["{selected_band}", "dataMask"]
        }}],
        output: {{
            bands: 4,
            sampleType: "UINT8"
        }}
    }};
}}

function evaluatePixel(sample) {{
    var val = sample.{selected_band};
    if (val <= 0 || sample.dataMask === 0) {{
        return [0, 0, 0, 0];
    }}
    // Linear to dB: 10 * log10(|gamma0|)
    var dB = 10 * Math.log(val) / Math.LN10;
    // High-contrast SAR backscatter stretch: -24.0 dB (ocean/calm) to 0.0 dB (bright ice/features)
    var norm = Math.max(0.0, Math.min(1.0, (dB + 24.0) / 24.0));
    // Non-linear gamma curve (0.85) to boost mid-tone structural detail
    norm = Math.pow(norm, 0.85);

    // High-contrast polar SAR backscatter palette (0..255 UINT8):
    var r = Math.floor(norm * 175);
    var g = Math.floor(norm * 230);
    var b = Math.floor(norm * 255);
    var a = Math.floor(sample.dataMask * 240);
    return [r, g, b, a];
}}
"""


def _build_process_request(
    aoi: dict,
    acquisition_time: str,
    polarization: str,
    width: int,
    height: int,
    evalscript: str,
    orthorectify: bool = True,
    observation_mode: Optional[str] = None,
) -> dict:
    try:
        acq_dt = datetime.fromisoformat(acquisition_time.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        acq_dt = datetime.now(timezone.utc)

    # Search window around acquisition time (+/- 12 hours) to precisely target the catalog item
    time_from = (acq_dt - timedelta(hours=12)).strftime("%Y-%m-%dT%H:%M:%SZ")
    time_to   = (acq_dt + timedelta(hours=12)).strftime("%Y-%m-%dT%H:%M:%SZ")

    min_lon = aoi.get("min_lon", aoi.get("bbox", {}).get("west"))
    min_lat = aoi.get("min_lat", aoi.get("bbox", {}).get("south"))
    max_lon = aoi.get("max_lon", aoi.get("bbox", {}).get("east"))
    max_lat = aoi.get("max_lat", aoi.get("bbox", {}).get("north"))

    data_filter: dict = {
        "timeRange": {
            "from": time_from,
            "to": time_to,
        },
        "mosaickingOrder": "mostRecent",
    }
    if observation_mode:
        data_filter["acquisitionMode"] = observation_mode.upper()

    processing_cfg: dict = {
        "backCoeff": "GAMMA0_ELLIPSOID",
        "orthorectify": orthorectify,
    }
    if orthorectify:
        processing_cfg["demInstance"] = "COPERNICUS"

    return {
        "input": {
            "bounds": {
                "bbox": [
                    min_lon,
                    min_lat,
                    max_lon,
                    max_lat,
                ],
                "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"},
            },
            "data": [
                {
                    "type": "sentinel-1-grd",
                    "dataFilter": data_filter,
                    "processing": processing_cfg,
                }
            ],
        },
        "output": {
            "width": width,
            "height": height,
            "responses": [{"identifier": "default", "format": {"type": "image/png"}}],
        },
        "evalscript": evalscript,
    }


def _request_sar_image_tile(
    aoi: dict,
    acquisition_time: str,
    polarization: str,
    evalscript: str,
    token: str,
    width: int,
    height: int,
    product_id: Optional[str] = None,
    observation_mode: Optional[str] = None,
) -> bytes:
    """
    Calls Sentinel Hub Process API for a single tile and returns PNG bytes.
    Enforces pixel size limit checks and raises Sentinel1ResolutionError if violated.
    Includes automatic fallback retry if DEM orthorectification fails (HTTP 500) in high-latitude polar sectors.
    """
    if requests is None:
        raise Sentinel1ImageError("'requests' library not installed.")

    w_m, h_m = calculate_aoi_dimensions_meters(aoi)
    _, _, px_size = calculate_pixel_size_meters(w_m, h_m, width, height)

    min_lon = aoi.get("min_lon", aoi.get("bbox", {}).get("west"))
    min_lat = aoi.get("min_lat", aoi.get("bbox", {}).get("south"))
    max_lon = aoi.get("max_lon", aoi.get("bbox", {}).get("east"))
    max_lat = aoi.get("max_lat", aoi.get("bbox", {}).get("north"))

    logger.info(
        "[SARImageTile] Requesting tile: %dx%d px, AOI=[%.2f,%.2f,%.2f,%.2f], pixel_size=%.2f m/px (prod=%s, pol=%s)",
        width, height, min_lon, min_lat, max_lon, max_lat, px_size, product_id, polarization
    )

    # Pre-check pixel size limit before making call
    if px_size > COPERNICUS_MAX_PIXEL_SIZE_METERS:
        raise Sentinel1ResolutionError(
            requested_px_size=px_size,
            limit_px_size=COPERNICUS_MAX_PIXEL_SIZE_METERS,
            detail="Calculated requested pixel size exceeds Copernicus limit before network call.",
        )

    request_body = _build_process_request(
        aoi=aoi,
        acquisition_time=acquisition_time,
        polarization=polarization,
        width=width,
        height=height,
        evalscript=evalscript,
        orthorectify=True,
        observation_mode=observation_mode,
    )

    session = requests.Session()
    try:
        response = session.post(
            PROCESS_API_URL,
            json=request_body,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "image/png",
                "Content-Type": "application/json",
            },
            timeout=45,
        )

        if response.status_code == 401:
            raise CopernicusTokenError("Process API rejected token (HTTP 401).")

        # Fallback for HTTP 500: Copernicus DEM in high Antarctic latitudes can fail orthorectification
        if response.status_code == 500:
            logger.warning(
                "[SARImageTile] Process API returned HTTP 500 with orthorectify=True (demInstance=COPERNICUS). "
                "Retrying with orthorectify=False (ellipsoid backscatter fallback for polar sector)..."
            )
            fallback_body = _build_process_request(
                aoi=aoi,
                acquisition_time=acquisition_time,
                polarization=polarization,
                width=width,
                height=height,
                evalscript=evalscript,
                orthorectify=False,
                observation_mode=observation_mode,
            )
            response = session.post(
                PROCESS_API_URL,
                json=fallback_body,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "image/png",
                    "Content-Type": "application/json",
                },
                timeout=45,
            )
            if response.status_code == 200:
                logger.info("[SARImageTile] Fallback without DEM orthorectification succeeded (HTTP 200).")
    except requests.exceptions.Timeout:
        raise Sentinel1ImageError("Sentinel Hub Process API timed out (45s).")
    except requests.exceptions.ConnectionError as exc:
        raise Sentinel1ImageError(f"Cannot connect to Sentinel Hub Process API: {exc}")
    finally:
        session.close()

    if response.status_code == 401:
        raise CopernicusTokenError("Process API rejected token (HTTP 401).")

    if response.status_code == 403:
        logger.error(
            "[SARImageTile] Process API 403 Forbidden: product=%s, pol=%s, body=%s",
            product_id, polarization, response.text[:500]
        )
        raise Sentinel1ImageError(
            "Process API returned HTTP 403 Forbidden. Verify Copernicus Processing API permissions.",
            status_code=403,
            response_body=response.text[:500]
        )

    if response.status_code == 400:
        try:
            err_body = response.json()
            err_text = str(err_body)
        except Exception:
            err_text = response.text[:400]

        logger.error(
            "[SARImageTile] Process API 400 Bad Request: product=%s, pol=%s, AOI=%s, res=%.1f m/px, error=%s",
            product_id, polarization, aoi, px_size, err_text
        )
        if "pixel size" in err_text.lower() or "exceeds the limit" in err_text.lower():
            raise Sentinel1ResolutionError(
                requested_px_size=px_size,
                limit_px_size=COPERNICUS_MAX_PIXEL_SIZE_METERS,
                detail=err_text,
            )
        raise Sentinel1ImageError(
            f"Process API returned HTTP 400 Bad Request: {err_text}",
            status_code=400,
            response_body=err_text
        )

    if response.status_code != 200:
        logger.error(
            "[SARImageTile] Process API failure: HTTP %d | URL: %s | product: %s | pol: %s | AOI: [%.2f,%.2f,%.2f,%.2f] | size: %dx%d (%.1f m/px) | response: %s",
            response.status_code,
            PROCESS_API_URL,
            product_id,
            polarization,
            min_lon, min_lat, max_lon, max_lat,
            width,
            height,
            px_size,
            response.text[:1000]
        )
        raise Sentinel1ImageError(
            f"Process API returned unexpected HTTP {response.status_code}: {response.text[:300]}",
            status_code=response.status_code,
            response_body=response.text[:1000]
        )

    image_bytes = response.content
    if not image_bytes or len(image_bytes) < 8:
        raise Sentinel1ImageNotAvailable("Process API returned an empty or corrupt tile image.")

    return image_bytes


def get_sentinel1_sar_image(
    product_id: str,
    acquisition_time: str,
    observation_mode: Optional[str] = None,
    observation_product_type: Optional[str] = None,
    polarization_metadata: Optional[str | list[str]] = None,
    target_resolution_m_per_px: float = TARGET_RESOLUTION_M_PER_PX,
    vessel_lat: Optional[float] = None,
    vessel_lon: Optional[float] = None,
    radius_km: Optional[float] = None,
) -> tuple[bytes, dict]:
    """
    Returns (image_bytes: bytes, metadata: dict) for the Sentinel-1 SAR acquisition.
    If vessel_lat and vessel_lon are provided, generates a local SAR raster image
    for the local vessel search AOI around that location.

    Uses tile-based assembly to guarantee that every Process API request
    respects the Copernicus 1500 m/px pixel size limit.
    Dynamically determines available bands (HH, VV, HV, VH) from metadata.
    """
    has_coords = (vessel_lat is not None) and (vessel_lon is not None)
    if has_coords:
        try:
            from src.services.sentinel1_catalog import calculate_vessel_aoi, DEFAULT_LOCAL_RADIUS_KM
        except ImportError:
            from services.sentinel1_catalog import calculate_vessel_aoi, DEFAULT_LOCAL_RADIUS_KM
        eff_radius = radius_km if radius_km is not None else DEFAULT_LOCAL_RADIUS_KM
        aoi = calculate_vessel_aoi(vessel_lat, vessel_lon, eff_radius)
    else:
        aoi = get_aoi_config()

    # Resolve polarization metadata if not explicitly provided
    pol_meta = polarization_metadata
    if not pol_meta and product_id:
        pid = product_id.upper()
        if any(k in pid for k in ("1SDH", "2SDH", "3SDH")):
            pol_meta = "HH+HV"
        elif any(k in pid for k in ("1SDV", "2SDV", "3SDV")):
            pol_meta = "VV+VH"
        elif any(k in pid for k in ("1SSH", "2SSH", "3SSH")) or "_HH_" in pid or "_HH" in pid:
            pol_meta = "HH"
        elif any(k in pid for k in ("1SSV", "2SSV", "3SSV")) or "_VV_" in pid or "_VV" in pid:
            pol_meta = "VV"
        elif observation_mode:
            mode = observation_mode.upper()
            if mode in ("HH", "HV"):
                pol_meta = "HH"
            elif mode in ("VV", "VH"):
                pol_meta = "VV"

    selected_band = select_sentinel1_visual_band(pol_meta)
    evalscript = _build_evalscript_single_channel(selected_band)

    pol_meta_str = str(pol_meta) if pol_meta else selected_band

    coord_tag = f"loc_{vessel_lat:.2f}_{vessel_lon:.2f}_r{radius_km or 250}" if has_coords else "global"
    cache_key = _make_cache_key(product_id, acquisition_time, aoi, f"{pol_meta_str}_{selected_band}_{coord_tag}", target_resolution_m_per_px)
    cached = _image_cache.get(cache_key)
    if cached is not None:
        logger.info("[SARImage] Returning cached SAR image composite (key=%s).", cache_key[:16])
        return cached

    token = get_access_token()

    # Calculate geographic tile grid
    tiles = calculate_tile_grid(aoi, target_res_m=target_resolution_m_per_px)
    logger.info(
        "[SARImage] Assembling SAR composite for Antarctic AOI: %d sub-tiles at target resolution %.1f m/px (band=%s).",
        len(tiles), target_resolution_m_per_px, selected_band
    )

    # Helper function to fetch a single tile with token retry
    def fetch_tile(tile_info: dict) -> tuple[dict, bytes]:
        t_aoi = tile_info["bbox"]
        t_w = tile_info["width_px"]
        t_h = tile_info["height_px"]
        try:
            tile_bytes = _request_sar_image_tile(
                aoi=t_aoi,
                acquisition_time=acquisition_time,
                polarization=selected_band,
                evalscript=evalscript,
                token=token,
                width=t_w,
                height=t_h,
                product_id=product_id,
                observation_mode=observation_mode,
            )
            return tile_info, tile_bytes
        except CopernicusTokenError:
            invalidate_token()
            fresh_token = get_access_token()
            tile_bytes = _request_sar_image_tile(
                aoi=t_aoi,
                acquisition_time=acquisition_time,
                polarization=selected_band,
                evalscript=evalscript,
                token=fresh_token,
                width=t_w,
                height=t_h,
                product_id=product_id,
                observation_mode=observation_mode,
            )
            return tile_info, tile_bytes

    tile_results = {}
    with ThreadPoolExecutor(max_workers=min(4, len(tiles))) as executor:
        future_map = {executor.submit(fetch_tile, tile): tile for tile in tiles}
        for future in as_completed(future_map):
            tile_info, t_bytes = future.result()
            key = (tile_info["col"], tile_info["row"])
            tile_results[key] = (tile_info, t_bytes)

    # Stitch sub-tiles using PIL
    num_cols = max(t["col"] for t in tiles) + 1
    num_rows = max(t["row"] for t in tiles) + 1

    row_heights = [max(tile_results[(c, r)][0]["height_px"] for c in range(num_cols)) for r in range(num_rows)]
    col_widths = [max(tile_results[(c, r)][0]["width_px"] for r in range(num_rows)) for c in range(num_cols)]

    composite_w = sum(col_widths)
    composite_h = sum(row_heights)

    if Image is not None:
        composite = Image.new("RGBA", (composite_w, composite_h), (6, 11, 20, 0))

        y_offset = 0
        for r in range(num_rows):
            x_offset = 0
            for c in range(num_cols):
                t_info, t_bytes = tile_results[(c, r)]
                tile_img = Image.open(io.BytesIO(t_bytes)).convert("RGBA")
                composite.paste(tile_img, (x_offset, y_offset))
                x_offset += col_widths[c]
            y_offset += row_heights[r]

        # Resize composite canvas to standard dashboard dimensions if larger
        if composite_w > FINAL_OUTPUT_WIDTH or composite_h > FINAL_OUTPUT_HEIGHT:
            composite = composite.resize((FINAL_OUTPUT_WIDTH, FINAL_OUTPUT_HEIGHT), Image.Resampling.LANCZOS)

        out_buffer = io.BytesIO()
        composite.save(out_buffer, format="PNG")
        final_png_bytes = out_buffer.getvalue()
    else:
        # Fallback if PIL not installed (returns first tile)
        final_png_bytes = list(tile_results.values())[0][1]

    retrieved_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    max_px_size = max(t["pixel_size_m"] for t in tiles)
    eff_radius_val = radius_km if radius_km is not None else 250.0

    metadata = {
        "source": "Sentinel-1",
        "collection": "sentinel-1-grd",
        "product_id": product_id,
        "platform": product_id.split("_")[0] if "_" in product_id else "SENTINEL-1",
        "mode": observation_mode,
        "acquisition_time": acquisition_time,
        "polarization": pol_meta_str,
        "selected_band": selected_band,
        "evalscript_type": "single_channel_uint8",
        "backscatter_coefficient": "GAMMA0_ELLIPSOID",
        "image_bbox": {
            "min_lon": aoi["min_lon"],
            "min_lat": aoi["min_lat"],
            "max_lon": aoi["max_lon"],
            "max_lat": aoi["max_lat"],
        },
        "bounds": {
            "west": aoi["min_lon"],
            "south": aoi["min_lat"],
            "east": aoi["max_lon"],
            "north": aoi["max_lat"],
        },
        "center": {
            "lat": vessel_lat if has_coords else (aoi["min_lat"] + aoi["max_lat"]) / 2.0,
            "lon": vessel_lon if has_coords else (aoi["min_lon"] + aoi["max_lon"]) / 2.0,
        },
        "width": FINAL_OUTPUT_WIDTH,
        "height": FINAL_OUTPUT_HEIGHT,
        "format": "image/png",
        "provenance": "RECENT",
        "image_available": True,
        "image_endpoint": "/satellite/sentinel1/latest/image",
        "image_url": f"/satellite/sentinel1/latest/image?vessel_lat={vessel_lat}&vessel_lon={vessel_lon}&radius_km={eff_radius_val}" if has_coords else "/satellite/sentinel1/latest/image",
        "retrieved_at": retrieved_at,
        "cache_key": cache_key[:16],
        "target_resolution_m_per_px": target_resolution_m_per_px,
        "tile_count": len(tiles),
        "max_pixel_size_m_per_px": round(max_px_size, 2),
    }

    _image_cache.set(cache_key, final_png_bytes, metadata)
    return final_png_bytes, metadata


def get_image_cache_size() -> int:
    return _image_cache.size()


def invalidate_image_cache() -> None:
    _image_cache.invalidate_all()

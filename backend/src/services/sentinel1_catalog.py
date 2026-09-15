"""
POLARIS Phase 10A — Sentinel-1 GRD Catalog Search Service.

Searches the Copernicus Data Space STAC catalog for recent Sentinel-1 GRD
acquisitions over the configured Antarctic AOI.

Scientific constraint:
  This phase returns metadata ONLY. No raw SAR imagery is downloaded.
  No iceberg detections are derived from SAR data.
  No ML models are fed SAR imagery.
"""

import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

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
    from src.schemas.sentinel1 import Sentinel1Observation, Sentinel1BBox
except ImportError:
    from services.copernicus_auth import (
        get_access_token,
        invalidate_token,
        CopernicusTokenError,
        CopernicusCredentialsMissingError,
    )
    from schemas.sentinel1 import Sentinel1Observation, Sentinel1BBox

logger = logging.getLogger("polaris.sentinel1.catalog")

# Copernicus Data Space STAC catalog endpoint (correct v1 endpoint)
STAC_CATALOG_URL = "https://stac.dataspace.copernicus.eu/v1/search"

# Default search parameters (overridden by environment variables)
DEFAULT_AOI_MIN_LAT = -75.0
DEFAULT_AOI_MAX_LAT = -58.0
DEFAULT_AOI_MIN_LON = -25.0
DEFAULT_AOI_MAX_LON = 75.0
DEFAULT_LOOKBACK_HOURS = 168  # 7 days

CATALOG_TIMEOUT_SECONDS = 20
# Correct Copernicus STAC collection name (lowercase, GRD-specific)
COLLECTION = "sentinel-1-grd"


def _load_aoi_config() -> dict:
    """Loads Antarctic AOI from environment variables with documented defaults."""
    return {
        "min_lat": float(os.environ.get("SENTINEL1_AOI_MIN_LAT", DEFAULT_AOI_MIN_LAT)),
        "max_lat": float(os.environ.get("SENTINEL1_AOI_MAX_LAT", DEFAULT_AOI_MAX_LAT)),
        "min_lon": float(os.environ.get("SENTINEL1_AOI_MIN_LON", DEFAULT_AOI_MIN_LON)),
        "max_lon": float(os.environ.get("SENTINEL1_AOI_MAX_LON", DEFAULT_AOI_MAX_LON)),
    }


def _load_lookback_hours() -> int:
    try:
        return int(os.environ.get("SENTINEL1_LOOKBACK_HOURS", DEFAULT_LOOKBACK_HOURS))
    except (ValueError, TypeError):
        return DEFAULT_LOOKBACK_HOURS


def _validate_aoi(aoi: dict) -> None:
    """Raises ValueError if the AOI is geometrically invalid."""
    if aoi["min_lat"] >= aoi["max_lat"]:
        raise ValueError(
            f"Invalid AOI: min_lat ({aoi['min_lat']}) must be less than max_lat ({aoi['max_lat']})"
        )
    if aoi["min_lon"] >= aoi["max_lon"]:
        raise ValueError(
            f"Invalid AOI: min_lon ({aoi['min_lon']}) must be less than max_lon ({aoi['max_lon']})"
        )
    if not (-90 <= aoi["min_lat"] <= 90 and -90 <= aoi["max_lat"] <= 90):
        raise ValueError("AOI latitudes must be in [-90, 90]")
    if not (-180 <= aoi["min_lon"] <= 180 and -180 <= aoi["max_lon"] <= 180):
        raise ValueError("AOI longitudes must be in [-180, 180]")


def _parse_observation(item: dict, retrieved_at: str) -> Optional[Sentinel1Observation]:
    """
    Parses a STAC item into the normalized Sentinel1Observation schema.
    Returns None if the item cannot be parsed cleanly.
    """
    try:
        props = item.get("properties", {})
        item_id = item.get("id", "UNKNOWN")

        # Extract acquisition time — prefer datetime, fallback to start_datetime
        acq_time = (
            props.get("datetime")
            or props.get("start_datetime")
            or "UNKNOWN"
        )

        # Extract bounding box
        bbox_raw = item.get("bbox")
        bbox = None
        if bbox_raw and len(bbox_raw) >= 4:
            bbox = Sentinel1BBox(
                min_lon=bbox_raw[0],
                min_lat=bbox_raw[1],
                max_lon=bbox_raw[2],
                max_lat=bbox_raw[3],
            )

        # Safe extraction of optional fields
        platform = props.get("platform") or props.get("constellation")
        instrument_list = props.get("instruments")
        instrument = instrument_list[0] if isinstance(instrument_list, list) and instrument_list else props.get("instrument")
        mode = props.get("sar:instrument_mode") or props.get("mode")
        product_type = props.get("product:type") or props.get("sar:product_type") or "GRD"
        processing_level = props.get("processing_level")
        orbit_direction = props.get("sat:orbit_state") or props.get("orbit_direction")
        relative_orbit = props.get("sat:relative_orbit") or props.get("relativeOrbitNumber")

        # Catalog link
        links = item.get("links", [])
        catalog_url = None
        for link in links:
            if link.get("rel") in ("self", "alternate", "canonical"):
                catalog_url = link.get("href")
                break

        return Sentinel1Observation(
            source="Sentinel-1",
            collection="sentinel-1-grd",
            product_id=item_id,
            acquisition_time=acq_time,
            start_time=props.get("start_datetime"),
            end_time=props.get("end_datetime"),
            platform=str(platform).upper() if platform else None,
            instrument=str(instrument).upper() if instrument else None,
            mode=str(mode).upper() if mode else None,
            product_type=str(product_type).upper() if product_type else "GRD",
            processing_level=str(processing_level).upper() if processing_level else None,
            orbit_direction=str(orbit_direction).upper() if orbit_direction else None,
            relative_orbit=int(relative_orbit) if relative_orbit is not None else None,
            bbox=bbox,
            catalog_url=catalog_url,
            status="RECENT",
            provenance="RECENT",
            retrieved_at=retrieved_at,
            description=(
                "Latest available Sentinel-1 GRD acquisition over the configured "
                "POLARIS Antarctic area of interest (AOI). Phase 10A provides observation "
                "metadata only — no SAR image download or automated iceberg detection."
            ),
        )
    except Exception as exc:
        logger.warning("[Sentinel1Catalog] Failed to parse STAC item '%s': %s", item.get("id"), exc)
        return None


def search_latest_sentinel1_grd() -> Optional[Sentinel1Observation]:
    """
    Searches the Copernicus Data Space STAC catalog for the most recent
    Sentinel-1 GRD acquisition intersecting the configured Antarctic AOI.

    Returns:
        Sentinel1Observation — the most recent acquisition found, or
        None               — if no acquisition was found in the lookback window

    Raises:
        CopernicusCredentialsMissingError — credentials not configured
        CopernicusTokenError              — authentication failure
        ConnectionError                   — Copernicus catalog unreachable
        TimeoutError                      — catalog request timed out
        ValueError                        — invalid AOI configuration
    """
    if requests is None:
        raise RuntimeError(
            "The 'requests' library is not installed. "
            "Add 'requests' to backend/requirements.txt."
        )

    aoi = _load_aoi_config()
    _validate_aoi(aoi)
    lookback_hours = _load_lookback_hours()

    now_utc = datetime.now(timezone.utc)
    start_time = now_utc - timedelta(hours=lookback_hours)

    datetime_filter = (
        f"{start_time.strftime('%Y-%m-%dT%H:%M:%S')}Z"
        f"/{now_utc.strftime('%Y-%m-%dT%H:%M:%S')}Z"
    )

    # WKT polygon bbox string (STAC format)
    bbox_str = f"{aoi['min_lon']},{aoi['min_lat']},{aoi['max_lon']},{aoi['max_lat']}"

    retrieved_at = now_utc.strftime("%Y-%m-%dT%H:%M:%SZ")

    logger.info(
        "[Sentinel1Catalog] Searching collection '%s' within AOI %s, datetime %s",
        COLLECTION, bbox_str, datetime_filter
    )

    # Acquire token (re-uses cache if valid)
    token = get_access_token()

    # The sentinel-1-grd collection on Copernicus STAC is already GRD-only.
    # No additional filter is needed. sortby uses plain "datetime" (confirmed
    # from /queryables endpoint — not "properties.datetime").
    payload = {
        "collections": [COLLECTION],
        "bbox": [aoi["min_lon"], aoi["min_lat"], aoi["max_lon"], aoi["max_lat"]],
        "datetime": datetime_filter,
        "sortby": [{"field": "datetime", "direction": "desc"}],
        "limit": 10,
    }

    try:
        response = requests.post(
            STAC_CATALOG_URL,
            json=payload,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            timeout=CATALOG_TIMEOUT_SECONDS,
        )
    except requests.exceptions.Timeout:
        raise TimeoutError(
            f"Copernicus STAC catalog timed out after {CATALOG_TIMEOUT_SECONDS} seconds."
        )
    except requests.exceptions.ConnectionError as exc:
        raise ConnectionError(
            f"Cannot reach Copernicus STAC catalog: {exc}"
        )

    # Handle expired token — retry once with forced refresh
    if response.status_code == 401:
        logger.info("[Sentinel1Catalog] Token rejected (401). Refreshing and retrying once.")
        invalidate_token()
        token = get_access_token()
        try:
            response = requests.post(
                STAC_CATALOG_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                timeout=CATALOG_TIMEOUT_SECONDS,
            )
        except requests.exceptions.Timeout:
            raise TimeoutError(
                f"Copernicus STAC catalog timed out after {CATALOG_TIMEOUT_SECONDS} seconds."
            )
        except requests.exceptions.ConnectionError as exc:
            raise ConnectionError(f"Cannot reach Copernicus STAC catalog: {exc}")

    if response.status_code != 200:
        try:
            error_body = response.json()
        except Exception:
            error_body = response.text[:500]
        logger.warning(
            "[Sentinel1Catalog] Catalog search failed. HTTP %d. Body: %s",
            response.status_code, error_body
        )
        raise ConnectionError(
            f"Copernicus catalog returned HTTP {response.status_code}."
        )

    try:
        data = response.json()
    except Exception:
        raise ValueError(
            "Copernicus catalog returned a malformed (non-JSON) response."
        )

    features = data.get("features", [])
    if not features:
        logger.info(
            "[Sentinel1Catalog] No Sentinel-1 GRD acquisitions found in the last %d hours.",
            lookback_hours
        )
        return None

    logger.info(
        "[Sentinel1Catalog] Found %d candidate(s). Selecting most recent.", len(features)
    )

    # Already sorted descending by datetime (newest first) — parse and return first valid
    for item in features:
        obs = _parse_observation(item, retrieved_at)
        if obs is not None:
            logger.info(
                "[Sentinel1Catalog] Selected product: %s acquired at %s",
                obs.product_id, obs.acquisition_time
            )
            return obs

    logger.warning("[Sentinel1Catalog] All %d candidates failed to parse.", len(features))
    return None


def get_aoi_config() -> dict:
    """Returns the current AOI configuration (safe to include in health check responses)."""
    return _load_aoi_config()


def get_lookback_hours() -> int:
    """Returns the current lookback window configuration."""
    return _load_lookback_hours()

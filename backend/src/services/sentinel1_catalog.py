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
import time
from datetime import datetime, timedelta, timezone
import math
from typing import Optional, Dict, Tuple, Any

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
DEFAULT_LOCAL_RADIUS_KM = 250.0

CATALOG_TIMEOUT_SECONDS = 20
COLLECTION = "sentinel-1-grd"

_OBSERVATION_CACHE: Dict[str, Tuple[float, Optional[Sentinel1Observation]]] = {}
_CACHE_TTL_SECONDS = 300.0  # 5 minutes in-memory cache


def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates geodesic distance in kilometers between two lat/lon points on Earth."""
    r_km = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)

    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r_km * c


def calculate_vessel_aoi(lat: float, lon: float, radius_km: float = 250.0) -> dict:
    """
    Calculates a local bounding box centered at (lat, lon) with search radius_km.
    Guarantees valid coordinates bounded within [-90, 90] and [-180, 180].
    """
    if not (-90.0 <= lat <= 90.0):
        raise ValueError(f"Invalid vessel latitude: {lat}. Must be in range [-90, 90].")
    if not (-180.0 <= lon <= 180.0):
        raise ValueError(f"Invalid vessel longitude: {lon}. Must be in range [-180, 180].")
    if radius_km <= 0:
        raise ValueError(f"Invalid search radius: {radius_km}. Must be > 0.")

    d_lat = radius_km / 111.12
    clamp_lat = max(-89.0, min(89.0, lat))
    cos_lat = max(0.15, math.cos(math.radians(clamp_lat)))
    d_lon = radius_km / (111.12 * cos_lat)

    min_lat = max(-90.0, round(lat - d_lat, 4))
    max_lat = min(90.0, round(lat + d_lat, 4))
    min_lon = max(-180.0, round(lon - d_lon, 4))
    max_lon = min(180.0, round(lon + d_lon, 4))

    if min_lat >= max_lat:
        max_lat = min(90.0, min_lat + 0.1)
    if min_lon >= max_lon:
        max_lon = min(180.0, min_lon + 0.1)

    return {
        "center_lat": lat,
        "center_lon": lon,
        "radius_km": radius_km,
        "bbox": {
            "west": min_lon,
            "south": min_lat,
            "east": max_lon,
            "north": max_lat,
        },
        "bounds": {
            "west": min_lon,
            "south": min_lat,
            "east": max_lon,
            "north": max_lat,
        },
        "min_lat": min_lat,
        "max_lat": max_lat,
        "min_lon": min_lon,
        "max_lon": max_lon,
    }


def check_spatial_intersection(aoi: dict, product_bbox: Optional[Sentinel1BBox]) -> tuple[bool, str]:
    """
    Checks whether a candidate product bounding box intersects the local search AOI.
    Returns (intersects: bool, coverage_status: str).
    """
    if product_bbox is None:
        return True, "PARTIAL"

    intersects = not (
        product_bbox.max_lat < aoi["min_lat"]
        or product_bbox.min_lat > aoi["max_lat"]
        or product_bbox.max_lon < aoi["min_lon"]
        or product_bbox.min_lon > aoi["max_lon"]
    )

    if not intersects:
        return False, "NOT_COVERED"

    is_full = (
        product_bbox.min_lat <= aoi["min_lat"]
        and product_bbox.max_lat >= aoi["max_lat"]
        and product_bbox.min_lon <= aoi["min_lon"]
        and product_bbox.max_lon >= aoi["max_lon"]
    )
    status = "COVERED" if is_full else "PARTIAL"
    return True, status


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

        # Extract polarization metadata safely
        raw_pols = (
            props.get("sar:polarizations")
            or props.get("polarizations")
            or props.get("polarization")
            or props.get("s1:polarization")
        )
        pol_list: list[str] = []
        if isinstance(raw_pols, list):
            pol_list = [str(p).upper() for p in raw_pols if p]
        elif isinstance(raw_pols, str):
            parts = raw_pols.replace("+", ",").replace(" ", "").split(",")
            pol_list = [p.upper() for p in parts if p]

        # Fallback: parse product ID identifier string
        if not pol_list and item_id:
            item_upper = item_id.upper()
            if any(k in item_upper for k in ("1SDH", "2SDH", "3SDH")):
                pol_list = ["HH", "HV"]
            elif any(k in item_upper for k in ("1SDV", "2SDV", "3SDV")):
                pol_list = ["VV", "VH"]
            elif any(k in item_upper for k in ("1SSH", "2SSH", "3SSH")):
                pol_list = ["HH"]
            elif any(k in item_upper for k in ("1SSV", "2SSV", "3SSV")):
                pol_list = ["VV"]
            elif "_HH_" in item_upper or "_HH" in item_upper:
                pol_list = ["HH"]
            elif "_VV_" in item_upper or "_VV" in item_upper:
                pol_list = ["VV"]

        pol_str = "+".join(pol_list) if pol_list else None

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
            polarization=pol_str,
            polarizations=pol_list if pol_list else None,
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
                "POLARIS Antarctic area of interest (AOI)."
            ),
        )
    except Exception as exc:
        logger.warning("[Sentinel1Catalog] Failed to parse STAC item '%s': %s", item.get("id"), exc)
        return None


def search_latest_sentinel1_grd(
    vessel_lat: Optional[float] = None,
    vessel_lon: Optional[float] = None,
    radius_km: Optional[float] = None,
) -> Optional[Sentinel1Observation]:
    """
    Searches the Copernicus Data Space STAC catalog for the most recent
    Sentinel-1 GRD acquisition.

    If vessel_lat and vessel_lon are provided, searches within a local search AOI
    centered around the vessel position (radius_km, default 250 km).
    Validates spatial intersection and rejects candidate products outside the search box.

    Returns:
        Sentinel1Observation — the most recent spatially relevant acquisition found, or
        None               — if no acquisition covers the search region in lookback window
    """
    if requests is None:
        raise RuntimeError(
            "The 'requests' library is not installed. "
            "Add 'requests' to backend/requirements.txt."
        )

    has_coords = (vessel_lat is not None) and (vessel_lon is not None)
    effective_radius = radius_km if radius_km is not None else float(
        os.environ.get("SENTINEL1_LOCAL_RADIUS_KM", DEFAULT_LOCAL_RADIUS_KM)
    )

    cache_key = (
        f"{round(vessel_lat, 2) if vessel_lat is not None else 'None'}_"
        f"{round(vessel_lon, 2) if vessel_lon is not None else 'None'}_"
        f"{round(effective_radius, 1)}"
    )
    now_ts = time.time()
    if cache_key in _OBSERVATION_CACHE:
        cached_ts, cached_obs = _OBSERVATION_CACHE[cache_key]
        if now_ts - cached_ts < _CACHE_TTL_SECONDS:
            logger.info("[Sentinel1Catalog] Cache hit for '%s' (age=%.1fs)", cache_key, now_ts - cached_ts)
            return cached_obs

    if has_coords:
        aoi = calculate_vessel_aoi(vessel_lat, vessel_lon, effective_radius) # type: ignore
    else:
        aoi = _load_aoi_config()

    _validate_aoi(aoi)
    lookback_hours = _load_lookback_hours()

    now_utc = datetime.now(timezone.utc)
    start_time = now_utc - timedelta(hours=lookback_hours)

    datetime_filter = (
        f"{start_time.strftime('%Y-%m-%dT%H:%M:%S')}Z"
        f"/{now_utc.strftime('%Y-%m-%dT%H:%M:%S')}Z"
    )

    bbox_str = f"{aoi['min_lon']},{aoi['min_lat']},{aoi['max_lon']},{aoi['max_lat']}"
    retrieved_at = now_utc.strftime("%Y-%m-%dT%H:%M:%SZ")

    logger.info(
        "[Sentinel1Catalog] Searching collection '%s' within AOI %s, datetime %s (vessel_coords=%s)",
        COLLECTION, bbox_str, datetime_filter, f"({vessel_lat},{vessel_lon})" if has_coords else "NONE"
    )

    token = get_access_token()

    payload = {
        "collections": [COLLECTION],
        "bbox": [aoi["min_lon"], aoi["min_lat"], aoi["max_lon"], aoi["max_lat"]],
        "datetime": datetime_filter,
        "sortby": [{"field": "datetime", "direction": "desc"}],
        "limit": 15,
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
        _OBSERVATION_CACHE[cache_key] = (now_ts, None)
        return None

    logger.info(
        "[Sentinel1Catalog] Found %d candidate(s). Evaluating spatial relevance.", len(features)
    )

    for item in features:
        obs = _parse_observation(item, retrieved_at)
        if obs is not None:
            if has_coords:
                intersects, coverage_status = check_spatial_intersection(aoi, obs.bbox)
                if not intersects:
                    logger.info(
                        "[Sentinel1Catalog] Candidate %s rejected: does not intersect vessel search AOI %s",
                        obs.product_id, bbox_str
                    )
                    continue

                prod_center_lat = (obs.bbox.min_lat + obs.bbox.max_lat) / 2.0 if obs.bbox else vessel_lat
                prod_center_lon = (obs.bbox.min_lon + obs.bbox.max_lon) / 2.0 if obs.bbox else vessel_lon
                dist_km = calculate_haversine_distance(vessel_lat, vessel_lon, prod_center_lat, prod_center_lon) # type: ignore

                obs.search_center = {"latitude": vessel_lat, "longitude": vessel_lon}
                obs.search_radius_km = effective_radius
                obs.distance_to_search_center_km = round(dist_km, 1)
                obs.coverage_intersects = True
                obs.coverage_status = coverage_status

            logger.info(
                "[Sentinel1Catalog] Selected product: %s acquired at %s (dist=%.1f km)",
                obs.product_id, obs.acquisition_time, obs.distance_to_search_center_km or 0.0
            )
            _OBSERVATION_CACHE[cache_key] = (now_ts, obs)
            return obs

    logger.warning("[Sentinel1Catalog] No candidate met spatial intersection requirements.")
    _OBSERVATION_CACHE[cache_key] = (now_ts, None)
    return None


def get_aoi_config() -> dict:
    """Returns the current AOI configuration (safe to include in health check responses)."""
    return _load_aoi_config()


def get_lookback_hours() -> int:
    """Returns the current lookback window configuration."""
    return _load_lookback_hours()

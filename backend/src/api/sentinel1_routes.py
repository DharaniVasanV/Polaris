"""
POLARIS Phase 10A — Sentinel-1 FastAPI Router.

Endpoint: GET /satellite/sentinel1/latest

Returns the most recent available Sentinel-1 GRD acquisition metadata
for the configured Antarctic AOI from the Copernicus Data Space catalog.

PROVENANCE RULES:
  - status = "RECENT"   (latest available catalog acquisition)
  - NOT "LIVE"          (not a continuous data feed)
  - NOT "HIST"          (not historical training data)
  - NOT "FCST"          (not a model forecast)

No raw SAR imagery is downloaded.
No secrets are exposed in any response.
"""

import logging
from datetime import datetime, timezone

from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import Response

try:
    from src.schemas.sentinel1 import Sentinel1StatusResponse, Sentinel1HealthStatus
    from src.schemas.sentinel1_image import Sentinel1ImageStatusResponse, Sentinel1ImageMetadata, Sentinel1ImageBBox
    from src.services.sentinel1_catalog import (
        search_latest_sentinel1_grd,
        get_aoi_config,
        get_lookback_hours,
        calculate_vessel_aoi,
    )
    from src.services.copernicus_auth import (
        CopernicusCredentialsMissingError,
        CopernicusTokenError,
        credentials_are_configured,
    )
    from src.services.sentinel1_image import (
        get_sentinel1_sar_image,
        get_image_cache_size,
        Sentinel1ImageError,
        Sentinel1ImageNotAvailable,
    )
except ImportError:
    from schemas.sentinel1 import Sentinel1StatusResponse, Sentinel1HealthStatus
    from schemas.sentinel1_image import Sentinel1ImageStatusResponse, Sentinel1ImageMetadata, Sentinel1ImageBBox
    from services.sentinel1_catalog import (
        search_latest_sentinel1_grd,
        get_aoi_config,
        get_lookback_hours,
        calculate_vessel_aoi,
    )
    from services.copernicus_auth import (
        CopernicusCredentialsMissingError,
        CopernicusTokenError,
        credentials_are_configured,
    )
    from services.sentinel1_image import (
        get_sentinel1_sar_image,
        get_image_cache_size,
        Sentinel1ImageError,
        Sentinel1ImageNotAvailable,
    )

logger = logging.getLogger("polaris.sentinel1.routes")

router = APIRouter(
    prefix="/satellite",
    tags=["Satellite Observations"],
)


def _now_utc_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


@router.get(
    "/sentinel1/latest",
    response_model=Sentinel1StatusResponse,
    summary="Latest available Sentinel-1 GRD acquisition (vessel location aware)",
    description=(
        "Queries the Copernicus Data Space STAC catalog for the most recent "
        "Sentinel-1 GRD product intersecting either the provided vessel search radius "
        "or configured Antarctic AOI. "
        "Returns acquisition metadata only — no raw SAR imagery. "
        "Provenance: RECENT (not LIVE, not HIST, not FCST)."
    ),
)
def get_latest_sentinel1(
    vessel_lat: Optional[float] = Query(None, ge=-90.0, le=90.0, description="Vessel latitude in signed decimal degrees"),
    vessel_lon: Optional[float] = Query(None, ge=-180.0, le=180.0, description="Vessel longitude in signed decimal degrees"),
    radius_km: Optional[float] = Query(250.0, gt=0.0, description="Vessel search radius in kilometers"),
) -> Sentinel1StatusResponse:
    retrieved_at = _now_utc_iso()

    if not credentials_are_configured():
        logger.warning("[Sentinel1Routes] Copernicus credentials not configured.")
        return Sentinel1StatusResponse(
            status="NOT_CONFIGURED",
            message=(
                "Copernicus credentials are not configured. "
                "Set COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET "
                "environment variables to enable Sentinel-1 queries."
            ),
            observation=None,
            retrieved_at=retrieved_at,
        )

    try:
        observation = search_latest_sentinel1_grd(
            vessel_lat=vessel_lat,
            vessel_lon=vessel_lon,
            radius_km=radius_km,
        )

        if observation is None:
            has_coords = (vessel_lat is not None) and (vessel_lon is not None)
            msg = (
                f"No recent Sentinel-1 acquisition covers vessel location ({vessel_lat}°S, {vessel_lon}°E) "
                f"within {radius_km or 250} km search radius."
                if has_coords
                else f"No Sentinel-1 GRD acquisition found for the configured Antarctic AOI in the last {get_lookback_hours()} hours."
            )
            return Sentinel1StatusResponse(
                status="NO_RECENT_COVERAGE" if has_coords else "NO_DATA",
                message=msg,
                observation=None,
                retrieved_at=retrieved_at,
            )

        return Sentinel1StatusResponse(
            status="OK",
            message="Spatially relevant Sentinel-1 GRD acquisition found.",
            observation=observation,
            retrieved_at=retrieved_at,
        )

    except CopernicusCredentialsMissingError as exc:
        logger.warning("[Sentinel1Routes] Credentials missing: %s", str(exc))
        return Sentinel1StatusResponse(
            status="NOT_CONFIGURED",
            message="Copernicus credentials are not fully configured.",
            observation=None,
            retrieved_at=retrieved_at,
        )

    except CopernicusTokenError as exc:
        logger.warning("[Sentinel1Routes] Authentication failed: %s", str(exc))
        return Sentinel1StatusResponse(
            status="UNAVAILABLE",
            message="Copernicus authentication failed.",
            observation=None,
            retrieved_at=retrieved_at,
        )

    except TimeoutError as exc:
        logger.warning("[Sentinel1Routes] Catalog request timed out: %s", str(exc))
        return Sentinel1StatusResponse(
            status="UNAVAILABLE",
            message="Copernicus catalog request timed out.",
            observation=None,
            retrieved_at=retrieved_at,
        )

    except ConnectionError as exc:
        logger.warning("[Sentinel1Routes] Catalog connection error: %s", str(exc))
        return Sentinel1StatusResponse(
            status="UNAVAILABLE",
            message="Cannot reach Copernicus Data Space catalog.",
            observation=None,
            retrieved_at=retrieved_at,
        )

    except ValueError as exc:
        logger.error("[Sentinel1Routes] Configuration error: %s", str(exc))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid Sentinel-1 AOI or vessel coordinate configuration: {str(exc)}",
        )

    except Exception as exc:
        logger.error("[Sentinel1Routes] Unexpected error: %s", str(exc), exc_info=True)
        return Sentinel1StatusResponse(
            status="ERROR",
            message="An unexpected error occurred while querying the Sentinel-1 catalog.",
            observation=None,
            retrieved_at=retrieved_at,
        )


@router.get(
    "/sentinel1/health",
    response_model=Sentinel1HealthStatus,
    summary="Sentinel-1 data source health check",
    description="Returns operational status of Copernicus Sentinel-1 integration.",
)
def get_sentinel1_health() -> Sentinel1HealthStatus:
    aoi = get_aoi_config()
    lookback = get_lookback_hours()
    retrieved_at = _now_utc_iso()

    creds_ok = credentials_are_configured()

    if not creds_ok:
        return Sentinel1HealthStatus(
            credentials_configured=False,
            catalog_reachable=None,
            recent_acquisition_found=None,
            status="NOT_CONFIGURED",
            last_checked=retrieved_at,
            aoi=aoi,
            lookback_hours=lookback,
        )

    try:
        observation = search_latest_sentinel1_grd()
        if observation is not None:
            return Sentinel1HealthStatus(
                credentials_configured=True,
                catalog_reachable=True,
                recent_acquisition_found=True,
                status="CONNECTED",
                last_checked=retrieved_at,
                aoi=aoi,
                lookback_hours=lookback,
            )
        else:
            return Sentinel1HealthStatus(
                credentials_configured=True,
                catalog_reachable=True,
                recent_acquisition_found=False,
                status="NO_RECENT_DATA",
                last_checked=retrieved_at,
                aoi=aoi,
                lookback_hours=lookback,
            )

    except (CopernicusTokenError, CopernicusCredentialsMissingError):
        return Sentinel1HealthStatus(
            credentials_configured=creds_ok,
            catalog_reachable=None,
            recent_acquisition_found=None,
            status="UNAVAILABLE",
            last_checked=retrieved_at,
            aoi=aoi,
            lookback_hours=lookback,
        )

    except (TimeoutError, ConnectionError):
        return Sentinel1HealthStatus(
            credentials_configured=True,
            catalog_reachable=False,
            recent_acquisition_found=None,
            status="UNAVAILABLE",
            last_checked=retrieved_at,
            aoi=aoi,
            lookback_hours=lookback,
        )

    except Exception:
        return Sentinel1HealthStatus(
            credentials_configured=True,
            catalog_reachable=None,
            recent_acquisition_found=None,
            status="UNAVAILABLE",
            last_checked=retrieved_at,
            aoi=aoi,
            lookback_hours=lookback,
        )


@router.get(
    "/sentinel1/latest/image",
    summary="Latest Sentinel-1 GRD SAR backscatter image (PNG)",
    description=(
        "Returns an actual Sentinel-1 GRD SAR backscatter PNG image for either "
        "the local vessel search AOI or broad Antarctic region."
    ),
    responses={200: {"content": {"image/png": {}}, "description": "PNG SAR backscatter image"}},
    response_class=Response,
)
def get_sentinel1_sar_image_endpoint(
    vessel_lat: Optional[float] = Query(None, ge=-90.0, le=90.0),
    vessel_lon: Optional[float] = Query(None, ge=-180.0, le=180.0),
    radius_km: Optional[float] = Query(250.0, gt=0.0),
) -> Response:
    retrieved_at = _now_utc_iso()

    if not credentials_are_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Copernicus credentials not configured. Set COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET."
        )

    try:
        observation = search_latest_sentinel1_grd(
            vessel_lat=vessel_lat,
            vessel_lon=vessel_lon,
            radius_km=radius_km,
        )
    except CopernicusCredentialsMissingError:
        raise HTTPException(status_code=503, detail="Copernicus credentials missing.")
    except (CopernicusTokenError, ConnectionError, TimeoutError) as exc:
        logger.warning("[Sentinel1Routes] Image endpoint — catalog error: %s", str(exc))
        raise HTTPException(status_code=503, detail="Copernicus catalog unavailable.")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid AOI configuration: {exc}")

    if observation is None:
        has_coords = (vessel_lat is not None) and (vessel_lon is not None)
        detail_msg = (
            f"NO_RECENT_COVERAGE: No recent Sentinel-1 acquisition covers vessel location "
            f"({vessel_lat}°S, {vessel_lon}°E) within {radius_km or 250} km search radius."
            if has_coords
            else "NO_RECENT_COVERAGE: No recent Sentinel-1 acquisition found for configured Antarctic AOI."
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=detail_msg
        )

    try:
        image_bytes, _metadata = get_sentinel1_sar_image(
            product_id=observation.product_id,
            acquisition_time=observation.acquisition_time,
            observation_mode=observation.mode,
            observation_product_type=observation.product_type,
            polarization_metadata=observation.polarization,
            vessel_lat=vessel_lat,
            vessel_lon=vessel_lon,
            radius_km=radius_km,
        )
    except CopernicusCredentialsMissingError:
        raise HTTPException(status_code=503, detail="Copernicus credentials missing.")
    except CopernicusTokenError as exc:
        logger.warning("[Sentinel1Routes] Image auth failure: %s", str(exc))
        raise HTTPException(status_code=503, detail="Copernicus authentication failed.")
    except Sentinel1ImageNotAvailable as exc:
        logger.info("[Sentinel1Routes] SAR image not available: %s", str(exc))
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"NO_RECENT_COVERAGE: SAR image not available: {str(exc)}"
        )
    except Sentinel1ImageError as exc:
        logger.error("[Sentinel1Routes] SAR image error: %s", str(exc))
        status_code = status.HTTP_502_BAD_GATEWAY if getattr(exc, 'status_code', None) in (500, 502, 503) else status.HTTP_500_INTERNAL_SERVER_ERROR
        raise HTTPException(
            status_code=status_code,
            detail=f"PROCESSING_ERROR: Copernicus SAR image generation failed for product {observation.product_id}: {str(exc)}"
        )
    except Exception as exc:
        logger.error("[Sentinel1Routes] Unexpected image error: %s", str(exc), exc_info=True)
        raise HTTPException(status_code=500, detail=f"PROCESSING_ERROR: Unexpected error generating SAR image: {str(exc)}")

    return Response(
        content=image_bytes,
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=3600",
            "X-Sentinel1-Product-Id": observation.product_id,
            "X-Sentinel1-Acquisition-Time": observation.acquisition_time,
            "X-Sentinel1-Provenance": "RECENT",
        }
    )


@router.get(
    "/sentinel1/latest/image/metadata",
    response_model=Sentinel1ImageStatusResponse,
    summary="Latest Sentinel-1 GRD SAR image metadata",
    description="Returns metadata for the SAR image generated for the vessel location.",
)
def get_sentinel1_image_metadata(
    vessel_lat: Optional[float] = Query(None, ge=-90.0, le=90.0),
    vessel_lon: Optional[float] = Query(None, ge=-180.0, le=180.0),
    radius_km: Optional[float] = Query(250.0, gt=0.0),
) -> Sentinel1ImageStatusResponse:
    retrieved_at = _now_utc_iso()

    if not credentials_are_configured():
        return Sentinel1ImageStatusResponse(
            status="NOT_CONFIGURED",
            message="Copernicus credentials not configured.",
            metadata=None,
            retrieved_at=retrieved_at,
        )

    try:
        observation = search_latest_sentinel1_grd(
            vessel_lat=vessel_lat,
            vessel_lon=vessel_lon,
            radius_km=radius_km,
        )
    except (CopernicusCredentialsMissingError, CopernicusTokenError, ConnectionError, TimeoutError) as exc:
        logger.warning("[Sentinel1Routes] Image metadata — catalog error: %s", str(exc))
        return Sentinel1ImageStatusResponse(
            status="UNAVAILABLE",
            message="Copernicus catalog unavailable.",
            metadata=None,
            retrieved_at=retrieved_at,
        )
    except ValueError as exc:
        return Sentinel1ImageStatusResponse(
            status="INVALID_COORDINATES",
            message=f"Invalid vessel coordinate configuration: {exc}",
            metadata=None,
            retrieved_at=retrieved_at,
        )

    if observation is None:
        has_coords = (vessel_lat is not None) and (vessel_lon is not None)
        return Sentinel1ImageStatusResponse(
            status="NO_RECENT_COVERAGE" if has_coords else "NO_DATA",
            message=f"No recent Sentinel-1 acquisition covers vessel location ({vessel_lat}°S, {vessel_lon}°E)." if has_coords else "No recent acquisition found.",
            metadata=None,
            retrieved_at=retrieved_at,
        )

    try:
        from src.services.sentinel1_image import select_sentinel1_visual_band, get_aoi_config as img_get_aoi
    except ImportError:
        from services.sentinel1_image import select_sentinel1_visual_band, get_aoi_config as img_get_aoi

    has_coords = (vessel_lat is not None) and (vessel_lon is not None)
    eff_radius = radius_km if radius_km is not None else 250.0
    if has_coords:
        aoi = calculate_vessel_aoi(vessel_lat, vessel_lon, eff_radius) # type: ignore
    else:
        aoi = img_get_aoi()

    pol_meta = observation.polarization or "HH+HV"
    try:
        selected_band = select_sentinel1_visual_band(pol_meta)
    except Exception:
        selected_band = "HH"

    image_url = (
        f"/satellite/sentinel1/latest/image?vessel_lat={vessel_lat}&vessel_lon={vessel_lon}&radius_km={eff_radius}"
        if has_coords
        else "/satellite/sentinel1/latest/image"
    )

    meta = Sentinel1ImageMetadata(
        product_id=observation.product_id,
        platform=observation.platform,
        mode=observation.mode,
        acquisition_time=observation.acquisition_time,
        polarization=pol_meta,
        selected_band=selected_band,
        search_center=observation.search_center,
        search_radius_km=observation.search_radius_km,
        distance_to_search_center_km=observation.distance_to_search_center_km,
        coverage_intersects=observation.coverage_intersects,
        coverage_status=observation.coverage_status,
        image_bbox=Sentinel1ImageBBox(
            min_lon=aoi["min_lon"],
            min_lat=aoi["min_lat"],
            max_lon=aoi["max_lon"],
            max_lat=aoi["max_lat"],
        ),
        bounds={
            "west": aoi["min_lon"],
            "south": aoi["min_lat"],
            "east": aoi["max_lon"],
            "north": aoi["max_lat"],
        },
        center={
            "lat": vessel_lat if has_coords else (aoi["min_lat"] + aoi["max_lat"]) / 2.0,
            "lon": vessel_lon if has_coords else (aoi["min_lon"] + aoi["max_lon"]) / 2.0,
        },
        image_url=image_url,
        width=1024,
        height=512,
        image_available=True,
        retrieved_at=retrieved_at,
    )

    return Sentinel1ImageStatusResponse(
        status="OK",
        message="SAR image metadata available. Use /satellite/sentinel1/latest/image to fetch the PNG.",
        metadata=meta,
        retrieved_at=retrieved_at,
    )

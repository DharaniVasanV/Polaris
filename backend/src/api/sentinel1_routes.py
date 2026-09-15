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

from fastapi import APIRouter, HTTPException, status

try:
    from src.schemas.sentinel1 import Sentinel1StatusResponse, Sentinel1HealthStatus
    from src.services.sentinel1_catalog import (
        search_latest_sentinel1_grd,
        get_aoi_config,
        get_lookback_hours,
    )
    from src.services.copernicus_auth import (
        CopernicusCredentialsMissingError,
        CopernicusTokenError,
        credentials_are_configured,
    )
except ImportError:
    from schemas.sentinel1 import Sentinel1StatusResponse, Sentinel1HealthStatus
    from services.sentinel1_catalog import (
        search_latest_sentinel1_grd,
        get_aoi_config,
        get_lookback_hours,
    )
    from services.copernicus_auth import (
        CopernicusCredentialsMissingError,
        CopernicusTokenError,
        credentials_are_configured,
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
    summary="Latest available Sentinel-1 GRD acquisition (RECENT observation)",
    description=(
        "Queries the Copernicus Data Space STAC catalog for the most recent "
        "Sentinel-1 GRD product intersecting the configured Antarctic AOI. "
        "Returns acquisition metadata only — no raw SAR imagery. "
        "Provenance: RECENT (not LIVE, not HIST, not FCST)."
    ),
)
def get_latest_sentinel1() -> Sentinel1StatusResponse:
    """
    Finds and returns the most recent available Sentinel-1 GRD acquisition
    over the configured POLARIS Antarctic area of interest.

    Error responses:
      503 — Copernicus catalog unavailable (network / timeout)
      503 — Copernicus authentication failure
      422 — Invalid AOI configuration
      503 — Credentials not configured

    Secrets: Client ID, client secret, and access tokens are NEVER
    included in this response or logged at INFO/WARNING level.
    """
    retrieved_at = _now_utc_iso()

    # Phase 1: Check credentials are configured
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

    # Phase 2: Perform catalog search
    try:
        observation = search_latest_sentinel1_grd()

        if observation is None:
            return Sentinel1StatusResponse(
                status="NO_DATA",
                message=(
                    "No Sentinel-1 GRD acquisition found for the configured Antarctic AOI "
                    f"in the last {get_lookback_hours()} hours. "
                    "The area may not have been overflown in the lookback window."
                ),
                observation=None,
                retrieved_at=retrieved_at,
            )

        return Sentinel1StatusResponse(
            status="OK",
            message="Recent Sentinel-1 GRD acquisition found.",
            observation=observation,
            retrieved_at=retrieved_at,
        )

    except CopernicusCredentialsMissingError as exc:
        logger.warning("[Sentinel1Routes] Credentials missing: %s", str(exc))
        return Sentinel1StatusResponse(
            status="NOT_CONFIGURED",
            message=(
                "Copernicus credentials are not fully configured. "
                "Set COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET."
            ),
            observation=None,
            retrieved_at=retrieved_at,
        )

    except CopernicusTokenError as exc:
        # Log message without exposing any token value
        logger.warning("[Sentinel1Routes] Authentication failed: %s", str(exc))
        return Sentinel1StatusResponse(
            status="UNAVAILABLE",
            message=(
                "Copernicus authentication failed. "
                "Verify credentials and Copernicus Data Space service status."
            ),
            observation=None,
            retrieved_at=retrieved_at,
        )

    except TimeoutError as exc:
        logger.warning("[Sentinel1Routes] Catalog request timed out: %s", str(exc))
        return Sentinel1StatusResponse(
            status="UNAVAILABLE",
            message=(
                "Copernicus catalog request timed out. "
                "The Copernicus Data Space service may be temporarily unavailable."
            ),
            observation=None,
            retrieved_at=retrieved_at,
        )

    except ConnectionError as exc:
        logger.warning("[Sentinel1Routes] Catalog connection error: %s", str(exc))
        return Sentinel1StatusResponse(
            status="UNAVAILABLE",
            message=(
                "Cannot reach Copernicus Data Space catalog. "
                "Check network connectivity and Copernicus service status."
            ),
            observation=None,
            retrieved_at=retrieved_at,
        )

    except ValueError as exc:
        logger.error("[Sentinel1Routes] Configuration error: %s", str(exc))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid Sentinel-1 AOI configuration: {str(exc)}",
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
    description=(
        "Returns the operational status of the Sentinel-1 Copernicus integration. "
        "Differentiates between: credentials configured, authentication status, "
        "catalog reachability, and recent acquisition availability."
    ),
)
def get_sentinel1_health() -> Sentinel1HealthStatus:
    """
    Returns health status of the Sentinel-1 Copernicus integration.
    Does NOT expose credentials or tokens.
    """
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

    # Perform a lightweight catalog query to determine status
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

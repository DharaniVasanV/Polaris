"""
POLARIS Phase 10A — Sentinel-1 GRD Observation Schema.
Defines the normalized schema for a recent Sentinel-1 satellite acquisition
returned by the Copernicus Data Space catalog.

Provenance label: RECENT
This is NOT a live feed and NOT a model forecast.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime


class Sentinel1BBox(BaseModel):
    """Bounding box of the Sentinel-1 product extent."""
    min_lat: float = Field(..., description="Minimum latitude (South)")
    max_lat: float = Field(..., description="Maximum latitude (North)")
    min_lon: float = Field(..., description="Minimum longitude (West)")
    max_lon: float = Field(..., description="Maximum longitude (East)")


class Sentinel1Observation(BaseModel):
    """
    Normalized recent Sentinel-1 GRD observation record.

    Provenance = RECENT: This represents the latest available satellite
    acquisition found in the Copernicus Data Space catalog for the configured
    Antarctic AOI. It is NOT a live stream.
    """
    source: str = Field("Sentinel-1", description="Satellite data source identifier")
    collection: str = Field("sentinel-1-grd", description="Data collection identifier")
    product_id: str = Field(..., description="Unique Copernicus product identifier")
    acquisition_time: str = Field(..., description="ISO-8601 acquisition datetime (UTC)")
    start_time: Optional[str] = Field(None, description="Product sensing start time (UTC)")
    end_time: Optional[str] = Field(None, description="Product sensing end time (UTC)")
    platform: Optional[str] = Field(None, description="Satellite platform (e.g. SENTINEL-1A)")
    instrument: Optional[str] = Field(None, description="Instrument mode/type")
    mode: Optional[str] = Field(None, description="Acquisition mode (e.g. IW, EW)")
    product_type: Optional[str] = Field(None, description="Product type (e.g. GRD)")
    polarization: Optional[str] = Field(None, description="SAR polarization(s) available (e.g. HH+HV, VV+VH, HH, VV)")
    polarizations: Optional[List[str]] = Field(None, description="List of available polarization bands (e.g. ['HH', 'HV'])")
    processing_level: Optional[str] = Field(None, description="Processing level (e.g. LEVEL-1)")
    orbit_direction: Optional[str] = Field(None, description="Orbit direction (ASCENDING/DESCENDING)")
    relative_orbit: Optional[int] = Field(None, description="Relative orbit number")
    bbox: Optional[Sentinel1BBox] = Field(None, description="Product coverage bounding box")
    search_center: Optional[dict] = Field(None, description="Search center coordinates {'latitude': float, 'longitude': float}")
    search_radius_km: Optional[float] = Field(None, description="Configured search radius around vessel in km")
    distance_to_search_center_km: Optional[float] = Field(None, description="Calculated distance from vessel to product footprint center in km")
    coverage_intersects: Optional[bool] = Field(None, description="True if acquisition footprint intersects the vessel local search AOI")
    coverage_status: Optional[str] = Field(None, description="Spatial coverage status: COVERED, PARTIAL, NOT_COVERED")
    catalog_url: Optional[str] = Field(None, description="Copernicus catalog product URL")
    status: str = Field("RECENT", description="Acquisition status label")
    provenance: str = Field(
        "RECENT",
        description=(
            "Provenance tag. RECENT = latest available satellite observation from "
            "Copernicus catalog. Not LIVE (no continuous feed). Not HIST (not "
            "historical training data). Not FCST (not a model forecast)."
        )
    )
    retrieved_at: str = Field(..., description="UTC timestamp when POLARIS queried the catalog")
    description: str = Field(
        "Latest available Sentinel-1 GRD acquisition over the configured Antarctic AOI.",
        description="Human-readable description for the dashboard"
    )


class Sentinel1StatusResponse(BaseModel):
    """
    API response for GET /satellite/sentinel1/latest.
    Always includes a status field to allow the frontend to differentiate:
      OK           — acquisition found and returned
      NO_DATA      — no acquisition found in the lookback window
      UNAVAILABLE  — Copernicus API unreachable
      NOT_CONFIGURED — credentials missing
      ERROR        — unexpected error
    """
    status: str = Field(..., description="One of: OK, NO_DATA, UNAVAILABLE, NOT_CONFIGURED, ERROR")
    message: str = Field(..., description="Human-readable status explanation")
    observation: Optional[Sentinel1Observation] = Field(
        None,
        description="The normalized Sentinel-1 observation (only present when status=OK)"
    )
    retrieved_at: str = Field(..., description="UTC timestamp of this response")


class Sentinel1HealthStatus(BaseModel):
    """
    Sentinel-1 source health, returned as part of the main /health endpoint
    under the data_sources key.
    """
    source: str = Field("Sentinel-1 GRD (Copernicus Data Space)")
    credentials_configured: bool = Field(..., description="Are COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET set?")
    catalog_reachable: Optional[bool] = Field(None, description="Was the Copernicus STAC catalog reachable? (None = not checked)")
    recent_acquisition_found: Optional[bool] = Field(None, description="Was a recent acquisition found? (None = not checked)")
    status: str = Field(..., description="CONNECTED / NOT_CONFIGURED / UNAVAILABLE / NO_RECENT_DATA")
    last_checked: Optional[str] = Field(None, description="UTC timestamp of last successful catalog query")
    aoi: dict = Field(..., description="Configured search bounding box")
    lookback_hours: int = Field(..., description="Configured search lookback window in hours")

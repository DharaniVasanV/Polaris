"""
POLARIS Phase 10B — Sentinel-1 SAR Image Metadata Schema.
Defines the normalized schema for SAR image metadata returned by
GET /satellite/sentinel1/latest/image/metadata
"""

from pydantic import BaseModel, Field
from typing import Optional


class Sentinel1ImageBBox(BaseModel):
    """Geographic bounding box of the rendered SAR image (WGS84)."""
    min_lon: float = Field(..., description="Western boundary longitude")
    min_lat: float = Field(..., description="Southern boundary latitude")
    max_lon: float = Field(..., description="Eastern boundary longitude")
    max_lat: float = Field(..., description="Northern boundary latitude")


class Sentinel1ImageMetadata(BaseModel):
    """
    Metadata for the Sentinel-1 GRD SAR image returned by
    GET /satellite/sentinel1/latest/image/metadata.

    Provenance: RECENT — this is the latest available acquisition,
    not a live feed. No credentials or tokens are included.
    """
    source: str = Field("Sentinel-1", description="Data source")
    collection: str = Field("sentinel-1-grd", description="Copernicus collection")
    product_id: str = Field(..., description="Product ID used to generate image")
    acquisition_time: str = Field(..., description="ISO-8601 UTC acquisition time")
    platform: Optional[str] = Field(None, description="Satellite platform (e.g. SENTINEL-1A, SENTINEL-1D)")
    mode: Optional[str] = Field(None, description="Sensor operational mode (e.g. IW, EW)")
    polarization: str = Field(..., description="SAR polarization(s) available (e.g. HH+HV, VV+VH)")
    selected_band: Optional[str] = Field(None, description="Primary band selected for visualization (e.g. HH, VV)")
    search_center: Optional[dict] = Field(None, description="Search center coordinates {'latitude': float, 'longitude': float}")
    search_radius_km: Optional[float] = Field(None, description="Configured search radius around vessel in km")
    distance_to_search_center_km: Optional[float] = Field(None, description="Calculated distance from vessel to product footprint center in km")
    coverage_intersects: Optional[bool] = Field(None, description="True if acquisition footprint intersects vessel search AOI")
    coverage_status: Optional[str] = Field(None, description="Spatial coverage status: COVERED, PARTIAL, NOT_COVERED")
    backscatter_coefficient: str = Field(
        "GAMMA0_ELLIPSOID",
        description="SAR backscatter coefficient used in Processing API"
    )
    image_bbox: Sentinel1ImageBBox = Field(..., description="Geographic bounds of the image (AOI)")
    bounds: Optional[dict] = Field(None, description="Normalized bounds {west, south, east, north}")
    center: Optional[dict] = Field(None, description="Center coordinate {lat, lon}")
    image_url: Optional[str] = Field(None, description="Direct URL to fetch the SAR PNG image")
    width: int = Field(..., description="Image width in pixels")
    height: int = Field(..., description="Image height in pixels")
    format: str = Field("image/png", description="Image MIME type")
    provenance: str = Field(
        "RECENT",
        description="RECENT = most recent available acquisition. Not LIVE."
    )
    image_available: bool = Field(..., description="Whether the SAR image was successfully generated")
    image_endpoint: str = Field(
        "/satellite/sentinel1/latest/image",
        description="Backend endpoint returning the PNG image"
    )
    retrieved_at: str = Field(..., description="UTC timestamp of this response")
    suggested_opacity: float = Field(
        0.45,
        description="Suggested map overlay opacity (0.0–1.0)"
    )
    target_resolution_m_per_px: Optional[float] = Field(
        500.0,
        description="Target pixel size in meters per pixel"
    )
    tile_count: Optional[int] = Field(
        8,
        description="Number of geographic sub-tiles used to construct composite image"
    )
    max_pixel_size_m_per_px: Optional[float] = Field(
        500.0,
        description="Maximum pixel size across tile requests in meters per pixel (must be <= 1500.0 m/px)"
    )
    description: str = Field(
        "Sentinel-1 GRD SAR backscatter image for the configured POLARIS Antarctic AOI. "
        "Phase 10B: observation layer only. No ML models are fed this imagery.",
        description="Human-readable description"
    )


class Sentinel1ImageStatusResponse(BaseModel):
    """
    Wraps image metadata with a status field.
    Used by GET /satellite/sentinel1/latest/image/metadata.
    """
    status: str = Field(..., description="OK | NO_DATA | UNAVAILABLE | NOT_CONFIGURED | ERROR")
    message: str = Field(..., description="Human-readable status message")
    metadata: Optional[Sentinel1ImageMetadata] = Field(
        None,
        description="Image metadata (only present when status=OK)"
    )
    retrieved_at: str = Field(..., description="UTC timestamp of this response")

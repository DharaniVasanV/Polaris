from pydantic import BaseModel, Field
from typing import Dict


class GeoCoordinate(BaseModel):
    lat: float = Field(..., description="Latitude in decimal degrees (-90 to 0 for Antarctica)")
    lon: float = Field(..., description="Longitude in decimal degrees (-180 to 180)")


class UncertaintyConfig(BaseModel):
    empirical_uncertainty_by_horizon_km: Dict[int, float]
    default_vessel_safety_margin_km: float

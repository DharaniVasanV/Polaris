"""
POLARIS Weather Pydantic Schemas.
Drop-in schemas compatible with the unified POLARIS FastAPI backend.
Strictly defines real model capabilities: 6h-ahead weather-derived navigation risk.
Does NOT fabricate wave height, wind speed forecasts, or uncertified safety ratings.
"""

from typing import List, Optional, Literal
from pydantic import BaseModel, Field

class WeatherPointObservation(BaseModel):
    """
    Input schema for a single atmospheric observation point in the Antarctic navigation quadrant.
    Domain strictly validated to [-75°S, -58°S] and [-25°W, +75°E].
    """
    model_config = {"protected_namespaces": ()}

    latitude: float = Field(
        ...,
        ge=-75.0,
        le=-58.0,
        description="Latitude in the POLARIS Antarctic operational region (-75.0°S to -58.0°S)"
    )
    longitude: float = Field(
        ...,
        ge=-25.0,
        le=75.0,
        description="Longitude in the POLARIS Antarctic operational region (-25.0°W to +75.0°E)"
    )
    timestamp: str = Field(
        default="2020-04-01T00:00:00",
        description="Observation timestamp in ISO format"
    )
    u10: float = Field(..., description="10m U wind component in m/s")
    v10: float = Field(..., description="10m V wind component in m/s")
    wind_gust: Optional[float] = Field(None, description="10m wind gust in m/s")
    temperature: float = Field(..., description="2m air temperature in Celsius or Kelvin")
    mslp: float = Field(..., description="Mean sea level pressure in hPa or Pa")
    precipitation: float = Field(default=0.0, description="1-hour precipitation in mm or meters water equivalent")

    # Optional historical lags (recommended for production tactical forecasts)
    pressure_change_3h: Optional[float] = Field(None, description="3-hour pressure tendency in hPa")
    pressure_change_6h: Optional[float] = Field(None, description="6-hour pressure tendency in hPa")
    wind_speed_lag_1h: Optional[float] = Field(None, description="Wind speed 1 hour prior (m/s)")
    wind_speed_lag_3h: Optional[float] = Field(None, description="Wind speed 3 hours prior (m/s)")
    wind_speed_lag_6h: Optional[float] = Field(None, description="Wind speed 6 hours prior (m/s)")
    wind_gust_lag_1h: Optional[float] = Field(None, description="Wind gust 1 hour prior (m/s)")
    wind_gust_lag_3h: Optional[float] = Field(None, description="Wind gust 3 hours prior (m/s)")
    wind_gust_lag_6h: Optional[float] = Field(None, description="Wind gust 6 hours prior (m/s)")
    pressure_lag_1h: Optional[float] = Field(None, description="Pressure 1 hour prior (hPa)")
    pressure_lag_3h: Optional[float] = Field(None, description="Pressure 3 hours prior (hPa)")
    pressure_lag_6h: Optional[float] = Field(None, description="Pressure 6 hours prior (hPa)")

class WeatherPointPrediction(BaseModel):
    """
    Standard output for single coordinate prediction at T + 6 hours.
    """
    model_config = {"protected_namespaces": ()}

    latitude: float
    longitude: float
    timestamp: str
    riskScore: float = Field(..., ge=0.0, le=1.0, description="Predicted navigation risk score [0, 1]")
    riskClass: Literal["SAFE", "MODERATE", "HIGH", "CRITICAL"]
    forecastHorizonHours: int = 6
    modelName: str = "weather_intelligence_engine"

class WeatherGridCell(BaseModel):
    """
    Single cell in the POLARIS 18 x 26 environmental grid.
    """
    model_config = {"protected_namespaces": ()}

    row: int = Field(..., ge=0, le=17, description="POLARIS grid row index (0-17)")
    column: int = Field(..., ge=0, le=25, description="POLARIS grid column index (0-25)")
    latitude: float
    longitude: float
    riskScore: float = Field(..., ge=0.0, le=1.0)
    riskClass: Literal["SAFE", "MODERATE", "HIGH", "CRITICAL"]
    timestamp: str
    forecastHorizonHours: int = 6

class WeatherGridResponse(BaseModel):
    """
    Full 468-cell POLARIS grid response.
    """
    model_config = {"protected_namespaces": ()}

    model: str = "weather_intelligence_engine"
    forecastHorizonHours: int = 6
    gridRows: int = 18
    gridColumns: int = 26
    totalCells: int = 468
    timestamp: str
    cells: List[WeatherGridCell]

class WeatherHealthResponse(BaseModel):
    """
    Health check response for registration in POLARIS unified health diagnostics.
    """
    model_config = {"protected_namespaces": ()}

    model: str = "weather_intelligence_engine"
    status: str = "LOADED"
    framework: str = "PyTorch"
    forecast_horizon_hours: int = 6
    grid_cells: int = 468

class WeatherGridRequest(BaseModel):
    """
    Request for grid prediction. Accepts optional observations and timestamp.
    """
    model_config = {"protected_namespaces": ()}

    timestamp: Optional[str] = Field(default="2020-04-01T00:00:00", description="Observation timestamp")
    observations: Optional[List[WeatherPointObservation]] = Field(
        default=None,
        description="Optional list of observations across the region to interpolate"
    )

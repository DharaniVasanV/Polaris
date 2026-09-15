"""
POLARIS: Common Model Output Contracts (Phase 1).
Provides unified, typed schemas for normalized environmental and hazard predictions
across all 3 AI models (GRU Iceberg Trajectory, ConvLSTM Sea-Ice, Weather Risk MLP).

Adheres to the common representation:
{
    latitude,
    longitude,
    timestamp,
    horizon_hours,
    source,
    value,
    confidence,
    variable
}

Preserves model-specific payload details without destroying coordinates,
without fabricating artificial confidence, and without altering model weights.
"""

from typing import Optional, Literal, Dict, Any, List, Union
from pydantic import BaseModel, Field


PredictionVariable = Literal[
    "iceberg_position",
    "sea_ice_concentration",
    "weather_risk"
]

PredictionSource = Literal[
    "GRU",
    "ConvLSTM",
    "WeatherMLP"
]


class PredictionPoint(BaseModel):
    """
    Common normalized base representation for environmental and hazard predictions.
    Any downstream engine (temporal alignment, risk fusion, pathfinding) can query
    these standardized attributes.
    """
    model_config = {"protected_namespaces": ()}

    latitude: float = Field(..., description="Latitude in decimal degrees")
    longitude: float = Field(..., description="Longitude in decimal degrees")
    timestamp: str = Field(..., description="Valid forecast timestamp in ISO 8601 format")
    horizon_hours: float = Field(..., ge=0.0, description="Forecast lead horizon in hours from reference time")
    source: str = Field(..., description="Originating AI model engine (e.g. GRU, ConvLSTM, WeatherMLP)")
    variable: str = Field(..., description="Standardized variable identifier: iceberg_position, sea_ice_concentration, weather_risk")
    value: Optional[float] = Field(None, description="Primary normalized scalar value where applicable (e.g. SIC fraction 0-1, risk 0-1)")
    confidence: Optional[float] = Field(None, ge=0.0, le=100.0, description="Model-reported confidence score [0-100] if natively produced")
    uncertainty_radius_km: Optional[float] = Field(None, ge=0.0, description="Empirical spatial forecast error or hazard zone radius in km")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional model-specific attributes or diagnostics")


class IcebergPredictionPoint(PredictionPoint):
    """
    Normalized prediction point for an iceberg position and its empirical hazard envelope.
    Preserves predicted coordinates and empirical forecast error bounds.
    """
    source: Literal["GRU"] = "GRU"
    variable: Literal["iceberg_position"] = "iceberg_position"
    iceberg_id: str = Field(..., description="Identifier of the tracked iceberg (e.g. 'B-22', 'A23A')")
    step_label: str = Field("Day +1", description="Discrete forecast step label")
    step_index: int = Field(1, ge=0, description="Sequence step index (1 to 5; 0 for anchor)")
    empirical_error_km: float = Field(..., description="Empirical test-derived error radius in km (not probability precision)")
    vessel_safety_margin_km: float = Field(30.0, description="Configured vessel clearance safety buffer in km")
    total_hazard_radius_km: float = Field(..., description="Total hazard boundary radius (error + safety buffer)")


class SeaIcePredictionPoint(PredictionPoint):
    """
    Normalized prediction point for sea-ice concentration over the environmental grid.
    Preserves 18x26 grid indexing, SIC percentage, ice classification, and domain coverage.
    """
    source: Literal["ConvLSTM"] = "ConvLSTM"
    variable: Literal["sea_ice_concentration"] = "sea_ice_concentration"
    grid_row: int = Field(..., ge=0, le=17, description="POLARIS grid row index (0 to 17)")
    grid_column: int = Field(..., ge=0, le=25, description="POLARIS grid column index (0 to 25)")
    sic_percent: Optional[float] = Field(None, ge=0.0, le=100.0, description="Sea ice concentration percentage [0-100%]")
    ice_class: Optional[str] = Field(None, description="WMO sea ice classification (e.g. OPEN_WATER, DENSE_ICE)")
    sea_ice_risk: Optional[float] = Field(None, ge=0.0, le=100.0, description="Navigation sea ice risk score [0-100]")
    data_available: bool = Field(True, description="True if cell is within trained Queen Maud Land coverage")
    prediction_status: str = Field("PREDICTED", description="'PREDICTED' or 'OUTSIDE_MODEL_COVERAGE'")


class WeatherPredictionPoint(PredictionPoint):
    """
    Normalized prediction point for 6h-ahead maritime navigation weather risk.
    Preserves 18x26 grid indexing, continuous risk score, and risk class.
    """
    source: Literal["WeatherMLP"] = "WeatherMLP"
    variable: Literal["weather_risk"] = "weather_risk"
    grid_row: int = Field(..., ge=0, le=17, description="POLARIS grid row index (0 to 17)")
    grid_column: int = Field(..., ge=0, le=25, description="POLARIS grid column index (0 to 25)")
    risk_score: float = Field(..., ge=0.0, le=1.0, description="Predicted continuous weather navigation risk score [0.0, 1.0]")
    risk_class: Literal["SAFE", "MODERATE", "HIGH", "CRITICAL"] = Field(..., description="Discrete risk categorization")


class NormalizedModelResponse(BaseModel):
    """
    Container for normalized prediction outputs from any of the three AI engines.
    """
    model_config = {"protected_namespaces": ()}

    model_name: str = Field(..., description="Name or identifier of the source model")
    source: str = Field(..., description="Source engine: GRU, ConvLSTM, or WeatherMLP")
    variable: str = Field(..., description="Predicted variable: iceberg_position, sea_ice_concentration, or weather_risk")
    generated_at: str = Field(..., description="Inference or export generation timestamp (ISO 8601)")
    total_points: int = Field(..., ge=0, description="Total count of normalized prediction points in this deck")
    predictions: List[Union[IcebergPredictionPoint, SeaIcePredictionPoint, WeatherPredictionPoint, PredictionPoint]]
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Model metadata and coverage metrics")

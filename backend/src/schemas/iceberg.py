from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from src.schemas.common import GeoCoordinate


class TrajectoryStep(BaseModel):
    step: str = Field(..., description="Step label, e.g. 'Day +1'")
    step_index: int = Field(..., description="Step index 1 to N")
    forecast_date: Optional[str] = Field(None, description="Projected forecast timestamp")
    latitude: float = Field(..., description="Predicted latitude")
    longitude: float = Field(..., description="Predicted longitude")
    empirical_error_radius_km: float = Field(..., description="Empirical error radius for this horizon")
    vessel_safety_margin_km: float = Field(..., description="Operational vessel clearance buffer")
    total_hazard_zone_radius_km: float = Field(..., description="Total combined hazard zone radius")


class IcebergPredictRequest(BaseModel):
    iceberg_id: str = Field("A23A", description="Identifier of the target iceberg")
    historical_coordinates: List[GeoCoordinate] = Field(
        ...,
        min_length=10,
        description="At least 10 consecutive daily observed coordinates"
    )
    steps: int = Field(1, ge=1, le=5, description="Number of forecast days (1 to 5)")
    start_date: Optional[str] = Field(None, description="Start date (YYYY-MM-DD)")


class IcebergForecastResponse(BaseModel):
    model_config = {"protected_namespaces": ()}

    source: str = "POLARIS_GRU_Trajectory_Engine"
    iceberg_id: str
    model_name: str = "GRU_Sequential_Trajectory_Model"
    prediction_type: str = "recursive_multistep"
    forecast_horizon_days: int
    forecast_steps: List[TrajectoryStep]
    metadata: Dict[str, Any] = Field(default_factory=dict)

from typing import Optional, List, Dict, Any
import datetime

from src.adapters.base import BasePredictionAdapter
from src.predict import IcebergTrajectoryPredictor
from src.config import EMPIRICAL_UNCERTAINTY_KM, DEFAULT_VESSEL_SAFETY_MARGIN_KM
from src.schemas.iceberg import (
    IcebergPredictRequest,
    IcebergForecastResponse,
    TrajectoryStep
)


class IcebergPredictionAdapter(BasePredictionAdapter):
    """
    Standardized adapter wrapping the GRU Iceberg Trajectory Model.
    Translates raw coordinate predictions into Pydantic responses with empirical uncertainty zones.
    """

    def __init__(self, predictor: Optional[IcebergTrajectoryPredictor] = None):
        self.predictor = predictor or IcebergTrajectoryPredictor()

    def get_model_status(self) -> dict:
        return {
            "adapter_name": "IcebergPredictionAdapter",
            "model_type": "GRU_Neural_Network",
            "model_status": "LOADED",
            "empirical_uncertainty_by_horizon_km": EMPIRICAL_UNCERTAINTY_KM,
            "default_vessel_safety_margin_km": DEFAULT_VESSEL_SAFETY_MARGIN_KM
        }

    def predict(
        self,
        request: IcebergPredictRequest,
        vessel_safety_margin_km: Optional[float] = None
    ) -> IcebergForecastResponse:
        safety_margin = (
            vessel_safety_margin_km
            if vessel_safety_margin_km is not None
            else DEFAULT_VESSEL_SAFETY_MARGIN_KM
        )

        coords_list = [(c.lat, c.lon) for c in request.historical_coordinates]
        raw_steps = self.predictor.predict_future_trajectory(coords_list, steps=request.steps)

        base_date = None
        if request.start_date:
            try:
                base_date = datetime.date.fromisoformat(request.start_date)
            except ValueError:
                base_date = None

        formatted_steps: List[TrajectoryStep] = []
        for s in raw_steps:
            step_idx = s["step_index"]
            emp_err = EMPIRICAL_UNCERTAINTY_KM.get(step_idx, 2371.12)
            total_hz = round(emp_err + safety_margin, 2)

            f_date_str = None
            if base_date:
                proj_date = base_date + datetime.timedelta(days=step_idx)
                f_date_str = proj_date.isoformat()

            formatted_steps.append(TrajectoryStep(
                step=s["step"],
                step_index=step_idx,
                forecast_date=f_date_str,
                latitude=s["latitude"],
                longitude=s["longitude"],
                empirical_error_radius_km=emp_err,
                vessel_safety_margin_km=safety_margin,
                total_hazard_zone_radius_km=total_hz
            ))

        return IcebergForecastResponse(
            source="POLARIS_GRU_Trajectory_Engine",
            iceberg_id=request.iceberg_id,
            model_name="GRU_Sequential_Trajectory_Model",
            prediction_type="recursive_multistep" if request.steps > 1 else "single_step",
            forecast_horizon_days=request.steps,
            forecast_steps=formatted_steps,
            metadata={
                "trained_model_file": "gru_trajectory_model.keras",
                "feature_count": 4,
                "features": ["lat", "lon", "delta_lat", "delta_lon"],
                "sequence_length": 10
            }
        )

    def predict_normalized(
        self,
        request: IcebergPredictRequest,
        vessel_safety_margin_km: Optional[float] = None
    ) -> Any:
        """
        Executes GRU inference and normalizes output into the common PredictionPoint contract (Phase 1).
        """
        forecast = self.predict(request, vessel_safety_margin_km=vessel_safety_margin_km)
        try:
            from src.adapters.normalization import normalize_gru_forecast
        except ImportError:
            from adapters.normalization import normalize_gru_forecast
        return normalize_gru_forecast(forecast)


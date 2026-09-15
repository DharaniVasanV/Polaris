import os
import json
import joblib
import numpy as np
import tensorflow as tf
from typing import List, Tuple, Dict, Any, Optional

from src.config import (
    MODEL_PATH,
    SCALER_PATH,
    METADATA_PATH,
    SEQUENCE_LENGTH
)


class IcebergTrajectoryPredictor:
    """
    Independent inference engine for Antarctic iceberg trajectory prediction using trained GRU.
    Handles spherical coordinate antimeridian wrapping, normalization, and recursive multi-step forecasting.
    """

    def __init__(
        self,
        model_path: Optional[str] = None,
        scaler_path: Optional[str] = None,
        metadata_path: Optional[str] = None
    ):
        self.model_path = str(model_path or MODEL_PATH)
        self.scaler_path = str(scaler_path or SCALER_PATH)
        self.metadata_path = str(metadata_path or METADATA_PATH)

        self._load_artifacts()

    def _load_artifacts(self):
        """Loads trained GRU model, fitted scaler, and metadata from disk."""
        if not os.path.exists(self.model_path):
            raise FileNotFoundError(f"Model file not found: {self.model_path}")
        if not os.path.exists(self.scaler_path):
            raise FileNotFoundError(f"Scaler file not found: {self.scaler_path}")
        if not os.path.exists(self.metadata_path):
            raise FileNotFoundError(f"Metadata file not found: {self.metadata_path}")

        # Load Keras Model (compile=False for fast inference)
        self.model = tf.keras.models.load_model(self.model_path, compile=False)

        # Load Preprocessing Scaler
        self.scaler = joblib.load(self.scaler_path)

        # Load Metadata
        with open(self.metadata_path, "r", encoding="utf-8") as f:
            self.metadata = json.load(f)

        self.seq_len = self.metadata.get("sequence_length", SEQUENCE_LENGTH)
        self.features = self.metadata.get("features", ["lat", "lon", "delta_lat", "delta_lon"])

    @staticmethod
    def _compute_delta_lon(lon_curr: float, lon_prev: float) -> float:
        """Computes shortest angular longitude change across the antimeridian [-180, 180]."""
        d = lon_curr - lon_prev
        return (d + 180.0) % 360.0 - 180.0

    @staticmethod
    def _wrap_lon(lon: float) -> float:
        """Wraps longitude into [-180, 180]."""
        return (lon + 180.0) % 360.0 - 180.0

    def _prepare_input_sequence(self, coordinates: List[Tuple[float, float]]) -> np.ndarray:
        """
        Takes raw [(lat, lon), ...] coordinates (length = seq_len)
        and constructs normalized feature array of shape (1, seq_len, 4).
        """
        if len(coordinates) < self.seq_len:
            raise ValueError(f"Input requires at least {self.seq_len} consecutive coordinate pairs, got {len(coordinates)}")

        recent_coords = coordinates[-self.seq_len:]
        feature_rows = []

        for i in range(len(recent_coords)):
            lat_curr, lon_curr = recent_coords[i]
            if i == 0:
                d_lat = 0.0
                d_lon = 0.0
            else:
                lat_prev, lon_prev = recent_coords[i - 1]
                d_lat = lat_curr - lat_prev
                d_lon = self._compute_delta_lon(lon_curr, lon_prev)

            feature_rows.append([lat_curr, lon_curr, d_lat, d_lon])

        feature_matrix = np.array(feature_rows, dtype=np.float32)
        scaled_matrix = self.scaler.transform(feature_matrix)
        return np.expand_dims(scaled_matrix, axis=0)

    def predict_next_day(self, coordinates: List[Tuple[float, float]]) -> Tuple[float, float]:
        """
        Predicts single-step Day +1 [latitude, longitude].
        """
        input_tensor = self._prepare_input_sequence(coordinates)
        pred_scaled = self.model.predict(input_tensor, verbose=0)  # Shape: (1, 2)

        # Inverse scaling using lat & lon scaler parameters
        lat_mean, lon_mean = self.scaler.mean_[0], self.scaler.mean_[1]
        lat_scale, lon_scale = self.scaler.scale_[0], self.scaler.scale_[1]

        pred_lat = float(pred_scaled[0, 0] * lat_scale + lat_mean)
        pred_lon = float(pred_scaled[0, 1] * lon_scale + lon_mean)

        pred_lat = max(-90.0, min(0.0, pred_lat))
        pred_lon = self._wrap_lon(pred_lon)

        return pred_lat, pred_lon

    def predict_future_trajectory(
        self,
        coordinates: List[Tuple[float, float]],
        steps: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Performs recursive multi-step forecasting for t+1 to t+steps.
        """
        if steps < 1:
            raise ValueError("Forecast steps must be >= 1")

        curr_coords = list(coordinates[-self.seq_len:])
        forecast_results = []

        for step_idx in range(1, steps + 1):
            pred_lat, pred_lon = self.predict_next_day(curr_coords)

            forecast_results.append({
                "step": f"Day +{step_idx}",
                "step_index": step_idx,
                "latitude": round(pred_lat, 5),
                "longitude": round(pred_lon, 5)
            })

            # Append prediction to sliding window for next recursive step
            curr_coords.append((pred_lat, pred_lon))
            curr_coords = curr_coords[-self.seq_len:]

        return forecast_results

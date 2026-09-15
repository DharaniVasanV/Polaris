"""
POLARIS: Production Sea-Ice Concentration Forecasting Model Class
Implements Step 28 of the POLARIS Sea-Ice Forecasting Pipeline.

Provides the standalone `PolarisSeaIceModel` class for downstream integration
with Antarctic Risk Assessment, Iceberg/Sea-Ice Analysis, and Route Optimization.
"""

import os
import sys
import json
import joblib
import numpy as np
from pathlib import Path
from typing import Dict, Any, Optional, Union
import json
import joblib
import numpy as np
import tensorflow as tf

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

def root_mean_squared_error(y_true, y_pred):
    return tf.sqrt(tf.reduce_mean(tf.square(y_pred - y_true)))

class PolarisSeaIceModel:
    """
    POLARIS Sea-Ice Concentration Forecasting Model.
    Decoupled, reusable inference class for 5-channel ConvLSTM forecasts.
    """

    def __init__(
        self,
        model_path: Optional[Union[str, Path]] = None,
        config_path: Optional[Union[str, Path]] = None,
        scalers_dir: Optional[Union[str, Path]] = None
    ):
        """
        Initialize model, load pre-trained weights, scalers, and configuration
        using portable project-relative paths.
        """
        if model_path:
            self.model_path = Path(model_path)
        elif (PROJECT_ROOT / "models" / "sea_ice" / "best_convlstm_sea_ice.keras").exists():
            self.model_path = PROJECT_ROOT / "models" / "sea_ice" / "best_convlstm_sea_ice.keras"
        else:
            self.model_path = PROJECT_ROOT / "models" / "best_convlstm_sea_ice.keras"

        if config_path:
            self.config_path = Path(config_path)
        elif (PROJECT_ROOT / "models" / "sea_ice" / "model_metadata.json").exists():
            self.config_path = PROJECT_ROOT / "models" / "sea_ice" / "model_metadata.json"
        else:
            self.config_path = PROJECT_ROOT / "models" / "model_metadata.json"

        if scalers_dir:
            self.scalers_dir = Path(scalers_dir)
        elif (PROJECT_ROOT / "preprocessing" / "sea_ice").exists():
            self.scalers_dir = PROJECT_ROOT / "preprocessing" / "sea_ice"
        else:
            self.scalers_dir = PROJECT_ROOT / "preprocessing"

        # Load Configuration if available
        if self.config_path.exists():
            with open(self.config_path, "r", encoding="utf-8") as f:
                self.config = json.load(f)
        else:
            self.config = {
                "input_sequence_length": 7,
                "prediction_horizon": 1,
                "channel_order": ["SIC", "Wind_U", "Wind_V", "Ocean_U", "Ocean_V"]
            }

        self.seq_len = self.config.get("input_sequence_length", 7)
        self.channel_names = self.config.get("channels", ["SIC", "Wind_U", "Wind_V", "Ocean_U", "Ocean_V"])

        # Load Scalers
        self.scalers = {}
        scaler_filenames = {
            "SIC": "sic_scaler.pkl",
            "Wind_U": "wind_u_scaler.pkl",
            "Wind_V": "wind_v_scaler.pkl",
            "Ocean_U": "ocean_u_scaler.pkl",
            "Ocean_V": "ocean_v_scaler.pkl"
        }
        for ch, fname in scaler_filenames.items():
            sc_path = self.scalers_dir / fname
            if sc_path.exists():
                self.scalers[ch] = joblib.load(sc_path)
            else:
                self.scalers[ch] = None

        # Load Keras Model
        if self.model_path.exists():
            self.model = tf.keras.models.load_model(
                str(self.model_path),
                custom_objects={"root_mean_squared_error": root_mean_squared_error}
            )
        else:
            self.model = None

    def validate_inputs(
        self,
        sic_history: np.ndarray,
        wind_u_history: np.ndarray,
        wind_v_history: np.ndarray,
        ocean_u_history: np.ndarray,
        ocean_v_history: np.ndarray
    ) -> None:
        """
        Validate shape and dimension consistency for the 5 history channels.
        Expected shape per channel: (time_steps, height, width) or (1, time_steps, height, width).
        """
        channels = [sic_history, wind_u_history, wind_v_history, ocean_u_history, ocean_v_history]
        ref_shape = sic_history.shape

        for idx, arr in enumerate(channels):
            if not isinstance(arr, np.ndarray):
                raise TypeError(f"Channel {self.channel_names[idx]} must be a numpy.ndarray, got {type(arr)}")
            if arr.shape != ref_shape:
                raise ValueError(
                    f"Shape mismatch: Channel {self.channel_names[idx]} has shape {arr.shape}, "
                    f"expected {ref_shape} matching {self.channel_names[0]}"
                )

        if len(ref_shape) == 3:
            t, h, w = ref_shape
        elif len(ref_shape) == 4 and ref_shape[0] == 1:
            _, t, h, w = ref_shape
        else:
            raise ValueError(f"Input arrays must have 3 dimensions (time_steps, H, W). Got shape {ref_shape}")

        if t != self.seq_len:
            raise ValueError(f"Expected time_steps={self.seq_len} for historical lookback. Got {t} steps.")

        return True

    def predict(
        self,
        sic_history: np.ndarray,
        wind_u_history: np.ndarray,
        wind_v_history: np.ndarray,
        ocean_u_history: np.ndarray,
        ocean_v_history: np.ndarray
    ) -> np.ndarray:
        """
        Run end-to-end inference:
        1. Validate inputs (7 timesteps, matching H and W).
        2. Normalize each channel using fitted training scalers.
        3. Assemble 5-channel tensor (1, 7, H, W, 5).
        4. Execute ConvLSTM model forward pass.
        5. Inverse transform SIC prediction.
        6. Clip physically valid values [0.0, 1.0].
        7. Return 2D predicted SIC map of shape (H, W).
        """
        if self.model is None:
            raise RuntimeError(f"Trained model not found at {self.model_path}. Train the model first.")

        # Handle batch dimension if present
        squeeze_batch = False
        if sic_history.ndim == 4 and sic_history.shape[0] == 1:
            sic_history = sic_history[0]
            wind_u_history = wind_u_history[0]
            wind_v_history = wind_v_history[0]
            ocean_u_history = ocean_u_history[0]
            ocean_v_history = ocean_v_history[0]
            squeeze_batch = True

        self.validate_inputs(sic_history, wind_u_history, wind_v_history, ocean_u_history, ocean_v_history)

        T, H, W = sic_history.shape
        raw_channels = [sic_history, wind_u_history, wind_v_history, ocean_u_history, ocean_v_history]

        # Construct normalized 5-channel input tensor
        input_tensor = np.zeros((1, T, H, W, 5), dtype=np.float32)

        for c_idx, ch_name in enumerate(self.channel_names):
            arr = raw_channels[c_idx].astype(np.float32)
            scaler = self.scalers.get(ch_name)
            if scaler is not None:
                flat = arr.reshape(-1, 1)
                norm_flat = scaler.transform(flat)
                norm_arr = norm_flat.reshape(T, H, W)
            else:
                norm_arr = arr
            input_tensor[0, :, :, :, c_idx] = norm_arr

        # Model forward pass -> output shape (1, H, W, 1)
        raw_pred = self.model.predict(input_tensor, verbose=0)

        # Inverse transform SIC prediction if scaler exists
        sic_scaler = self.scalers.get("SIC")
        pred_flat = raw_pred[0, :, :, 0].reshape(-1, 1)
        if sic_scaler is not None and hasattr(sic_scaler, "inverse_transform"):
            inv_flat = sic_scaler.inverse_transform(pred_flat)
            pred_map = inv_flat.reshape(H, W)
        else:
            pred_map = pred_flat.reshape(H, W)

        # Clip physically valid range: 0.0 <= SIC <= 1.0
        pred_map = np.clip(pred_map, 0.0, 1.0).astype(np.float32)

        return pred_map

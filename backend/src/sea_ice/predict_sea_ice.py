"""
POLARIS: Inference Module
Implements Step 29 of the POLARIS Pipeline.

Provides `predict_sea_ice()` executing end-to-end validation, normalization,
ConvLSTM forward propagation, inverse transformation, and physical range clipping.
"""

import sys
from pathlib import Path
import numpy as np
from typing import Optional, Union

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.polaris_model import PolarisSeaIceModel

def predict_sea_ice(
    sic_history: np.ndarray,
    wind_u_history: np.ndarray,
    wind_v_history: np.ndarray,
    ocean_u_history: np.ndarray,
    ocean_v_history: np.ndarray,
    model_path: Optional[str] = None
) -> np.ndarray:
    """
    Standalone functional inference pipeline for POLARIS:
    1. Validate input dimensions & 7 historical days.
    2. Validate all five environmental channels.
    3. Load scalers and normalize.
    4. Construct (1, 7, H, W, 5) tensor.
    5. Run ConvLSTM forward inference.
    6. Inverse transform SIC prediction.
    7. Clip physically valid range: 0 <= SIC <= 1.
    8. Return 2D predicted Sea-Ice Concentration map (H, W).
    """
    model = PolarisSeaIceModel(model_path=model_path)
    predicted_sic_map = model.predict(
        sic_history=sic_history,
        wind_u_history=wind_u_history,
        wind_v_history=wind_v_history,
        ocean_u_history=ocean_u_history,
        ocean_v_history=ocean_v_history
    )
    return predicted_sic_map

if __name__ == "__main__":
    print("POLARIS Sea-Ice Inference Module loaded.")
    print("Usage: from src.predict_sea_ice import predict_sea_ice")

import os
from pathlib import Path
from typing import Dict

# Bundle root directory
BASE_DIR = Path(__file__).resolve().parent.parent

# Core Model Artifact Paths
MODELS_DIR = BASE_DIR / "models"
if not (MODELS_DIR / "gru_trajectory_model.keras").exists() and (BASE_DIR.parent / "models" / "gru_trajectory_model.keras").exists():
    MODELS_DIR = BASE_DIR.parent / "models"

MODEL_PATH = MODELS_DIR / "gru_trajectory_model.keras"
SCALER_PATH = MODELS_DIR / "feature_scaler.pkl"
METADATA_PATH = MODELS_DIR / "preprocessing_metadata.json"
TRAINING_CONFIG_PATH = MODELS_DIR / "training_config.json"

# Sequence length for GRU input window
SEQUENCE_LENGTH = 10

# Default Vessel Safety Margin (km)
DEFAULT_VESSEL_SAFETY_MARGIN_KM = 30.0

# Empirical Horizon-Specific Uncertainty Radius (Mean Benchmark Error in km)
# Evaluated on 6,150 real held-out test windows from BYU Antarctic Iceberg Database
EMPIRICAL_UNCERTAINTY_KM: Dict[int, float] = {
    1: 168.02,   # Day +1
    2: 605.24,   # Day +2
    3: 1607.21,  # Day +3
    4: 2158.06,  # Day +4
    5: 2371.12   # Day +5
}

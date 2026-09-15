"""
Weather Model Service.
Responsible for loading the frozen PyTorch .pt model, scaler, and feature configuration,
and executing model forward-pass inference.
Contains NO FastAPI routing logic.
"""

import os
import sys
import json
import logging
import numpy as np

# Ensure Windows OpenMP and torch compatibility
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
import torch
import torch.nn as nn
import joblib

class WeatherRiskMLP(nn.Module):
    """
    Antarctic Weather Risk MLP Model.
    Architecture:
      Input (27 features)
      -> Dense(128) -> ReLU -> Dropout(0.2)
      -> Dense(64)  -> ReLU -> Dropout(0.2)
      -> Dense(32)  -> ReLU
      -> Dense(1)   -> Sigmoid
    """
    def __init__(self, input_dim=27, dropout_rate=0.2):
        super().__init__()
        self.network = nn.Sequential(
            nn.Linear(input_dim, 128),
            nn.ReLU(),
            nn.Dropout(dropout_rate),
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Dropout(dropout_rate),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
            nn.Sigmoid()
        )

    def forward(self, x):
        return self.network(x)

def build_model(input_dim=27, dropout_rate=0.2):
    return WeatherRiskMLP(input_dim=input_dim, dropout_rate=dropout_rate)


logger = logging.getLogger(__name__)

class WeatherModelService:
    """
    Encapsulates the frozen PyTorch MLP model and StandardScaler.
    Performs feature transformation and model evaluation.
    """
    def __init__(self, models_dir=None, device="cpu"):
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        if models_dir:
            self.models_dir = models_dir
        else:
            weather_models = os.path.join(base_dir, "models", "weather")
            self.models_dir = weather_models if os.path.exists(weather_models) else os.path.join(base_dir, "models")
        self.device = torch.device(device if torch.cuda.is_available() else "cpu")
        self.model = None
        self.scaler = None
        self.feature_config = None
        self.feature_names = []
        self.input_dim = 27
        self.model_name = "weather_intelligence_engine"
        self.version = "1.0.0"
        self.forecast_horizon_hours = 6

        self._load_artifacts()

    def _load_artifacts(self):
        # 1. Feature Config
        cfg_path = os.path.join(self.models_dir, "feature_config.json")
        if not os.path.exists(cfg_path):
            raise FileNotFoundError(f"Feature config not found at: {cfg_path}")
        with open(cfg_path, "r") as f:
            self.feature_config = json.load(f)
        self.feature_names = self.feature_config["feature_names"]
        self.input_dim = len(self.feature_names)

        # 2. Scaler
        scaler_path = os.path.join(self.models_dir, "scaler.pkl")
        if not os.path.exists(scaler_path):
            raise FileNotFoundError(f"Scaler not found at: {scaler_path}")
        self.scaler = joblib.load(scaler_path)

        # 3. Model Checkpoint
        model_path = os.path.join(self.models_dir, "weather_risk_model.pt")
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model checkpoint not found at: {model_path}")
        checkpoint = torch.load(model_path, map_location=self.device)

        dim = checkpoint.get("input_dim", self.input_dim)
        self.model = build_model(input_dim=dim).to(self.device)
        self.model.load_state_dict(checkpoint["model_state_dict"])
        self.model.eval()

        logger.info(
            f"WeatherModelService initialized: {self.model_name} (Horizon: {self.forecast_horizon_hours}h, "
            f"Features: {self.input_dim}, Device: {self.device})"
        )

    def predict_features(self, feature_matrix: np.ndarray) -> np.ndarray:
        """
        Runs inference on an (N, 27) feature matrix.
        Applies StandardScaler transform and PyTorch forward pass.
        Returns array of continuous risk scores in range [0, 1].
        """
        arr = np.asarray(feature_matrix, dtype=np.float32)
        if arr.ndim == 1:
            arr = arr.reshape(1, -1)

        if arr.shape[1] != self.input_dim:
            raise ValueError(
                f"Feature matrix dimension mismatch: Expected {self.input_dim} features, got {arr.shape[1]}"
            )

        # Scale features using the frozen scaler fitted during training
        scaled_features = self.scaler.transform(arr).astype(np.float32)

        with torch.no_grad():
            x_t = torch.tensor(scaled_features, device=self.device)
            scores = self.model(x_t).cpu().numpy().ravel()

        return scores

    def get_metadata(self) -> dict:
        """Returns model metadata and status dictionary."""
        return {
            "model": self.model_name,
            "status": "LOADED" if self.model is not None else "ERROR",
            "framework": "PyTorch",
            "forecast_horizon_hours": self.forecast_horizon_hours,
            "grid_cells": 468,
            "feature_count": self.input_dim,
            "feature_names": self.feature_names
        }

_weather_model_instance = None

def get_weather_model() -> WeatherModelService:
    """Singleton getter for WeatherModelService."""
    global _weather_model_instance
    if _weather_model_instance is None:
        _weather_model_instance = WeatherModelService()
    return _weather_model_instance

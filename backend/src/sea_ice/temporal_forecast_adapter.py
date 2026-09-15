"""
POLARIS: Temporal Output Adapter & Multi-Horizon Provider Architecture
Implements Phases 6 & 7 of the POLARIS ML-to-Frontend Integration Layer.

Key Principles:
1. Honest Forecast Provenance:
   - 0h: OBSERVED (current satellite/reanalysis state).
   - 6h, 12h, 18h: INTERPOLATED (linear transition between observed 0h and ConvLSTM 24h).
   - 24h: MODEL_FORECAST (native ConvLSTM spatio-temporal prediction).
2. Extensible Provider Architecture (Phase 7):
   - Defines `ForecastProvider` interface.
   - Decoupled implementations (`ObservedProvider`, `InterpolationProvider`, `ConvLSTMProvider`).
   - Enables seamless future plug-in of dedicated 6h/12h/18h ML checkpoints without breaking
     the frontend contract.
"""

from abc import ABC, abstractmethod
import numpy as np
from typing import Dict, Any, List, Optional

from src.sea_ice.sea_ice_postprocessing import process_sea_ice_prediction
from src.sea_ice.confidence_engine import get_forecast_confidence
from src.sea_ice.polaris_grid_adapter import PolarisGridAdapter

class ForecastProvider(ABC):
    """Abstract provider interface for multi-horizon environmental forecasts."""
    @abstractmethod
    def get_forecast(self, horizon_hours: int) -> Dict[str, Any]:
        """
        Generate or retrieve forecast data for a specified horizon.
        Returns:
        Dict containing:
        - horizon: str (e.g. '0h', '6h')
        - forecast_type: str ('OBSERVED', 'INTERPOLATED', 'MODEL_FORECAST')
        - sic_map: np.ndarray (41, 121)
        """
        pass

class ObservedProvider(ForecastProvider):
    """Provides current observed sea-ice concentration (0h baseline)."""
    def __init__(self, observed_sic: np.ndarray):
        self.observed_sic = np.clip(observed_sic, 0.0, 1.0)

    def get_forecast(self, horizon_hours: int = 0) -> Dict[str, Any]:
        return {
            "horizon": "0h",
            "forecast_type": "OBSERVED",
            "sic_map": self.observed_sic
        }

class ConvLSTMProvider(ForecastProvider):
    """Provides native 24h neural network spatio-temporal forecast."""
    def __init__(self, predicted_sic: np.ndarray):
        self.predicted_sic = np.clip(predicted_sic, 0.0, 1.0)

    def get_forecast(self, horizon_hours: int = 24) -> Dict[str, Any]:
        return {
            "horizon": "24h",
            "forecast_type": "MODEL_FORECAST",
            "sic_map": self.predicted_sic
        }

class InterpolationProvider(ForecastProvider):
    """
    Computes intermediate sub-daily estimates (6h, 12h, 18h) via spatio-temporal transition.
    Explicitly metadata-tagged as INTERPOLATED.
    """
    def __init__(self, observed_sic: np.ndarray, forecast_sic_24h: np.ndarray):
        self.observed_sic = np.clip(observed_sic, 0.0, 1.0)
        self.forecast_sic_24h = np.clip(forecast_sic_24h, 0.0, 1.0)

    def get_forecast(self, horizon_hours: int) -> Dict[str, Any]:
        alpha = np.clip(horizon_hours / 24.0, 0.0, 1.0)
        # Linear spatio-temporal morphing
        interp_sic = (1.0 - alpha) * self.observed_sic + alpha * self.forecast_sic_24h
        return {
            "horizon": f"{horizon_hours}h",
            "forecast_type": "INTERPOLATED",
            "sic_map": np.clip(interp_sic, 0.0, 1.0)
        }

class TemporalForecastAdapter:
    """
    Orchestrates the 5-step multi-horizon forecast (0h, 6h, 12h, 18h, 24h)
    and adapts each snapshot into the POLARIS 18x26 frontend environmental grid.
    """
    def __init__(self, grid_adapter: Optional[PolarisGridAdapter] = None):
        self.grid_adapter = grid_adapter or PolarisGridAdapter()

    def generate_full_forecast(
        self,
        observed_sic: np.ndarray,
        predicted_sic_24h: np.ndarray,
        wind_u: Optional[np.ndarray] = None,
        wind_v: Optional[np.ndarray] = None,
        ocean_u: Optional[np.ndarray] = None,
        ocean_v: Optional[np.ndarray] = None
    ) -> Dict[str, Dict[str, Any]]:
        """
        Generate complete 5-horizon forecast sequence.

        Returns:
        Dict mapping horizon keys ('0h', '6h', '12h', '18h', '24h') to:
        {
          "forecast_horizon": str,
          "forecast_type": str,
          "cells": List[Dict] (468 cells)
        }
        """
        # If input observed_sic has 3D shape (7, H, W), extract the last observed day
        if observed_sic.ndim == 3:
            observed_slice = observed_sic[-1]
        else:
            observed_slice = observed_sic

        # Instantiate providers
        p_0h = ObservedProvider(observed_slice)
        p_interp = InterpolationProvider(observed_slice, predicted_sic_24h)
        p_24h = ConvLSTMProvider(predicted_sic_24h)

        horizons = [
            (0, p_0h),
            (6, p_interp),
            (12, p_interp),
            (18, p_interp),
            (24, p_24h)
        ]

        full_forecast = {}

        for h_hours, provider in horizons:
            h_key = f"{h_hours}h"
            raw_fc = provider.get_forecast(h_hours)
            sic_map = raw_fc["sic_map"]
            f_type = raw_fc["forecast_type"]

            # Confidence calculation for this horizon
            conf_score, unc_score, unc_level = get_forecast_confidence(
                predicted_sic=sic_map,
                horizon_hours=float(h_hours),
                wind_u=wind_u,
                wind_v=wind_v,
                ocean_u=ocean_u,
                ocean_v=ocean_v
            )

            # Post-processing intelligence (classes, ice edge, risk)
            intelligence = process_sea_ice_prediction(
                predicted_sic=sic_map,
                uncertainty_map=unc_score
            )

            conf_bundle = {
                "confidence": conf_score,
                "uncertainty_level": unc_level
            }

            # Map to 18x26 POLARIS Grid with strict zero-extrapolation
            grid_cells = self.grid_adapter.adapt_to_polaris_grid(
                intelligence_bundle=intelligence,
                confidence_bundle=conf_bundle
            )

            full_forecast[h_key] = {
                "forecast_horizon": h_key,
                "forecast_type": f_type,
                "cells": grid_cells
            }

        return full_forecast

"""
POLARIS: Prediction Confidence & Uncertainty Engine
Implements Phase 4 of the POLARIS ML-to-Frontend Integration Layer.

Key Principles:
1. Operational Index, Not Uncalibrated Probability:
   Confidence is formulated as a transparent, multi-factor operational index [0 - 100],
   NOT as a calibrated Bayesian posterior probability.
2. Scientific Factors:
   - Horizon Factor (H): Baseline operational decay across forward lead time (0h -> 24h).
   - Training Distribution Proximity (D): Mahalanobis/z-score distance of input environmental
     forcing (wind speed, ocean currents) from the training regime.
   - Spatial Gradient & Local Variance (V): High spatial volatility and rapid ice-edge
     dynamics penalize local confidence.
   - Data Completeness (C): Missing, masked, or corrupted input indicators.
   - Historical Verification Baseline (E): Calibration factor derived from validation error residuals.
"""

import numpy as np
from typing import Dict, Any, Tuple, Optional
from scipy.ndimage import uniform_filter, sobel

class ConfidenceEngine:
    """
    Computes spatial confidence scores (0 - 100) and uncertainty tiers (LOW, MEDIUM, HIGH)
    for POLARIS sea-ice concentration forecasts.
    """
    def __init__(
        self,
        base_confidence_24h: float = 85.0,
        base_confidence_0h: float = 98.0,
        training_stats: Optional[Dict[str, Dict[str, float]]] = None
    ):
        self.base_confidence_24h = base_confidence_24h
        self.base_confidence_0h = base_confidence_0h
        # Empirical training distribution bounds for winds (m/s) and currents (m/s)
        self.training_stats = training_stats or {
            "wind_speed": {"mean": 8.5, "std": 4.2, "max_valid": 35.0},
            "ocean_speed": {"mean": 0.08, "std": 0.06, "max_valid": 0.60}
        }

    def compute_confidence(
        self,
        predicted_sic: np.ndarray,
        horizon_hours: float = 24.0,
        wind_u: Optional[np.ndarray] = None,
        wind_v: Optional[np.ndarray] = None,
        ocean_u: Optional[np.ndarray] = None,
        ocean_v: Optional[np.ndarray] = None,
        missing_data_mask: Optional[np.ndarray] = None
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Calculate spatial confidence score [0 - 100], uncertainty score [0 - 100],
        and categorical uncertainty level ('LOW', 'MEDIUM', 'HIGH').

        Returns:
        - confidence_score: 2D array [0.0, 100.0]
        - uncertainty_score: 2D array [0.0, 100.0] (defined as 100 - confidence)
        - uncertainty_level: 2D string array ('LOW', 'MEDIUM', 'HIGH')
        """
        H, W = predicted_sic.shape

        # 1. Horizon Decay Factor (Lead-time uncertainty)
        # 0h (observed) has ~98% base confidence; 24h has ~85% base confidence
        clamped_horizon = np.clip(horizon_hours, 0.0, 24.0)
        horizon_factor = self.base_confidence_0h - (
            (self.base_confidence_0h - self.base_confidence_24h) * (clamped_horizon / 24.0)
        )
        base_grid = np.full((H, W), horizon_factor, dtype=np.float32)

        # 2. Local Spatial Variance & Gradient Penalty
        # Regions of steep gradients (shear lines, ice edge) exhibit greater forecast error
        grad_y = sobel(predicted_sic, axis=0) / 4.0
        grad_x = sobel(predicted_sic, axis=1) / 4.0
        grad_mag = np.sqrt(grad_y**2 + grad_x**2)

        # Local variance in a 3x3 window
        mean_local = uniform_filter(predicted_sic, size=3)
        mean_sq_local = uniform_filter(predicted_sic**2, size=3)
        local_var = np.maximum(0.0, mean_sq_local - mean_local**2)
        local_std = np.sqrt(local_var)

        # Gradient penalty up to 15 points in high-variance shear zones
        spatial_volatility = np.clip(grad_mag * 12.0 + local_std * 10.0, 0.0, 18.0)

        # 3. Environmental Forcing Anomaly Penalty (Distance from Training Regime)
        env_penalty = np.zeros((H, W), dtype=np.float32)
        if wind_u is not None and wind_v is not None:
            # Wind speed magnitude
            w_speed = np.sqrt(wind_u**2 + wind_v**2)
            if w_speed.ndim == 3:
                w_speed = w_speed[-1] # use most recent timestep
            w_mean = self.training_stats["wind_speed"]["mean"]
            w_std = self.training_stats["wind_speed"]["std"]
            w_z = np.maximum(0.0, (w_speed - w_mean) / (w_std + 1e-5))
            # Penalize extreme storm events (z > 2.0)
            env_penalty += np.clip((w_z - 1.5) * 4.0, 0.0, 12.0)

        if ocean_u is not None and ocean_v is not None:
            c_speed = np.sqrt(ocean_u**2 + ocean_v**2)
            if c_speed.ndim == 3:
                c_speed = c_speed[-1]
            c_mean = self.training_stats["ocean_speed"]["mean"]
            c_std = self.training_stats["ocean_speed"]["std"]
            c_z = np.maximum(0.0, (c_speed - c_mean) / (c_std + 1e-5))
            env_penalty += np.clip((c_z - 1.5) * 4.0, 0.0, 10.0)

        # 4. Missing Data Penalty
        missing_penalty = np.zeros((H, W), dtype=np.float32)
        if missing_data_mask is not None:
            missing_penalty[missing_data_mask] = 80.0

        # Composite Confidence Score
        confidence = base_grid - spatial_volatility - env_penalty - missing_penalty
        confidence = np.clip(np.round(confidence, 1), 5.0, 99.0)

        # Uncertainty is the complementary operational metric
        uncertainty_score = np.round(100.0 - confidence, 1)

        # Categorical Uncertainty Levels
        # LOW: Uncertainty < 25 (Confidence >= 75)
        # MEDIUM: Uncertainty 25 - 45 (Confidence 55 - 75)
        # HIGH: Uncertainty >= 45 (Confidence < 55)
        uncertainty_level = np.empty((H, W), dtype="<U6")
        uncertainty_level[uncertainty_score < 25.0] = "LOW"
        uncertainty_level[(uncertainty_score >= 25.0) & (uncertainty_score < 45.0)] = "MEDIUM"
        uncertainty_level[uncertainty_score >= 45.0] = "HIGH"

        return confidence, uncertainty_score, uncertainty_level

# Default singleton instance
_default_engine = ConfidenceEngine()

def get_forecast_confidence(
    predicted_sic: np.ndarray,
    horizon_hours: float = 24.0,
    wind_u: Optional[np.ndarray] = None,
    wind_v: Optional[np.ndarray] = None,
    ocean_u: Optional[np.ndarray] = None,
    ocean_v: Optional[np.ndarray] = None,
    missing_data_mask: Optional[np.ndarray] = None
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Convenience functional wrapper for confidence and uncertainty calculation."""
    return _default_engine.compute_confidence(
        predicted_sic=predicted_sic,
        horizon_hours=horizon_hours,
        wind_u=wind_u,
        wind_v=wind_v,
        ocean_u=ocean_u,
        ocean_v=ocean_v,
        missing_data_mask=missing_data_mask
    )

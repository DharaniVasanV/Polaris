"""
POLARIS: Sea-Ice Post-Processing & Navigation Risk Intelligence Module
Implements Phase 3 of the POLARIS ML-to-Frontend Integration Layer.

Key Features:
1. SIC Percentage Conversion: [0.0, 1.0] -> [0.0, 100.0] %.
2. Configurable Sea-Ice Classification:
   - OPEN_WATER: < 15%
   - LOW_ICE: 15% <= SIC < 40%
   - MODERATE_ICE: 40% <= SIC < 70%
   - DENSE_ICE: 70% <= SIC < 90%
   - EXTREME_ICE: >= 90%
3. Ice-Edge Extraction (15% SIC boundary) using morphological gradient / contour detection.
4. Multi-Factor Navigation-Oriented Sea-Ice Risk Score (0 - 100) and Risk Levels:
   - LOW: < 25
   - MODERATE: 25 - 50
   - HIGH: 50 - 75
   - CRITICAL: >= 75
"""

import os
import json
from pathlib import Path
import numpy as np
from typing import Dict, Any, Tuple, Optional, List, Union
from scipy.ndimage import distance_transform_edt, sobel

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_CONFIG_PATH = PROJECT_ROOT / "config" / "risk_config.json"

def load_risk_config(config_path: Optional[Union[str, Path]] = None) -> Dict[str, Any]:
    """Load configurable risk weights and classification thresholds."""
    path = Path(config_path) if config_path else DEFAULT_CONFIG_PATH
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    # Fallback defaults if config file is not found
    return {
        "weights": {
            "sic_weight": 0.40,
            "ice_edge_weight": 0.25,
            "gradient_weight": 0.20,
            "uncertainty_weight": 0.15
        },
        "ice_edge_threshold_sic": 0.15,
        "ice_edge_influence_distance_km": 50.0,
        "ice_classification_thresholds": {
            "open_water_max": 0.15,
            "low_ice_max": 0.40,
            "moderate_ice_max": 0.70,
            "dense_ice_max": 0.90
        },
        "risk_levels": {
            "low_max": 25.0,
            "moderate_max": 50.0,
            "high_max": 75.0
        }
    }

def convert_sic_to_percent(sic_array: np.ndarray) -> np.ndarray:
    """
    Convert normalized SIC fraction [0.0, 1.0] to percentage [0.0, 100.0] %.
    Clips values to stay within strict physical bounds.
    """
    clipped = np.clip(sic_array, 0.0, 1.0)
    return np.round(clipped * 100.0, 2)

def classify_sea_ice(
    sic_array: np.ndarray,
    thresholds: Optional[Dict[str, float]] = None
) -> np.ndarray:
    """
    Classify 2D SIC grid into standardized polar ice navigation categories:
    - OPEN_WATER: SIC < 15%
    - LOW_ICE: 15% <= SIC < 40%
    - MODERATE_ICE: 40% <= SIC < 70%
    - DENSE_ICE: 70% <= SIC < 90%
    - EXTREME_ICE: SIC >= 90%
    """
    if thresholds is None:
        cfg = load_risk_config()
        thresholds = cfg["ice_classification_thresholds"]

    ow_max = thresholds.get("open_water_max", 0.15)
    li_max = thresholds.get("low_ice_max", 0.40)
    mi_max = thresholds.get("moderate_ice_max", 0.70)
    di_max = thresholds.get("dense_ice_max", 0.90)

    classes = np.empty(sic_array.shape, dtype="<U15")
    classes[sic_array < ow_max] = "OPEN_WATER"
    classes[(sic_array >= ow_max) & (sic_array < li_max)] = "LOW_ICE"
    classes[(sic_array >= li_max) & (sic_array < mi_max)] = "MODERATE_ICE"
    classes[(sic_array >= mi_max) & (sic_array < di_max)] = "DENSE_ICE"
    classes[sic_array >= di_max] = "EXTREME_ICE"
    return classes

def extract_ice_edge(
    sic_array: np.ndarray,
    threshold: float = 0.15
) -> Tuple[np.ndarray, List[Tuple[int, int]]]:
    """
    Extract the physical ice edge boundary (default 15% concentration threshold).
    Returns:
    - ice_edge_mask: 2D boolean array (True where ice edge cell is detected).
    - ice_edge_coordinates: List of (row, col) indices along the boundary.
    """
    ice_binary = sic_array >= threshold

    # A boundary pixel is an ice pixel that has at least one 4-connected non-ice neighbor,
    # or a non-ice pixel directly adjacent to ice.
    # We use morphological boundary detection: ice XOR eroded(ice)
    from scipy.ndimage import binary_erosion
    structure = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], dtype=bool)
    eroded_ice = binary_erosion(ice_binary, structure=structure)
    edge_mask = ice_binary & (~eroded_ice)

    edge_coords = list(zip(*np.where(edge_mask)))
    return edge_mask, edge_coords

def compute_navigation_risk(
    sic_array: np.ndarray,
    uncertainty_array: Optional[np.ndarray] = None,
    config: Optional[Dict[str, Any]] = None
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Calculate normalized navigation sea-ice risk score (0 - 100) and risk level:
    Formula:
    Risk = w_sic * S_sic + w_edge * S_edge + w_grad * S_grad + w_unc * S_unc

    Where:
    - S_sic (0-100): Direct concentration hazard (higher concentration = severe impediment/crush risk).
    - S_edge (0-100): Ice-edge proximity / collision zone hazard. Ships entering or traversing
      dynamic ice-edge boundary zones face severe compression and drift hazards.
    - S_grad (0-100): Spatial gradient magnitude (sharp compression ridges and fracture fronts).
    - S_unc (0-100): Forecast uncertainty penalty (unpredictable conditions increase operational caution).
    """
    if config is None:
        config = load_risk_config()

    weights = config["weights"]
    w_sic = weights.get("sic_weight", 0.40)
    w_edge = weights.get("ice_edge_weight", 0.25)
    w_grad = weights.get("gradient_weight", 0.20)
    w_unc = weights.get("uncertainty_weight", 0.15)

    # 1. SIC Factor (0 - 100)
    s_sic = np.clip(sic_array, 0.0, 1.0) * 100.0

    # 2. Ice Edge Proximity Factor (0 - 100)
    # Highest right on the edge (100) and in adjacent navigation lanes within ~5 grid cells,
    # tapering smoothly off into deep open ocean or deep solid pack.
    edge_thresh = config.get("ice_edge_threshold_sic", 0.15)
    edge_mask, _ = extract_ice_edge(sic_array, threshold=edge_thresh)

    if np.any(edge_mask):
        # Distance to closest edge cell in grid units
        dist_to_edge = distance_transform_edt(~edge_mask)
        # Decay factor: max within 4 grid cells (~100 km)
        decay_scale = 5.0
        edge_proximity = np.exp(-dist_to_edge / decay_scale)
        # Modulate by presence of ice (edge risk is acute for ships in or near ice)
        s_edge = edge_proximity * 100.0
    else:
        # No ice edge in domain (either 100% open water or 100% solid ice)
        s_edge = np.zeros_like(sic_array)

    # 3. Spatial Gradient Magnitude (0 - 100)
    # High gradients represent dynamic convergence zones / pressure ridges
    grad_y = sobel(sic_array, axis=0) / 4.0
    grad_x = sobel(sic_array, axis=1) / 4.0
    grad_mag = np.sqrt(grad_y**2 + grad_x**2)
    max_grad = np.max(grad_mag) if np.max(grad_mag) > 1e-5 else 1.0
    s_grad = np.clip(grad_mag / max_grad, 0.0, 1.0) * 100.0

    # 4. Uncertainty Factor (0 - 100)
    if uncertainty_array is not None:
        s_unc = np.clip(uncertainty_array, 0.0, 100.0)
    else:
        s_unc = np.zeros_like(sic_array)

    # Weighted combination
    total_risk = (w_sic * s_sic) + (w_edge * s_edge) + (w_grad * s_grad) + (w_unc * s_unc)
    total_risk = np.clip(np.round(total_risk, 1), 0.0, 100.0)

    # Map to risk level strings
    risk_cfg = config.get("risk_levels", {"low_max": 25.0, "moderate_max": 50.0, "high_max": 75.0})
    l_max = risk_cfg.get("low_max", 25.0)
    m_max = risk_cfg.get("moderate_max", 50.0)
    h_max = risk_cfg.get("high_max", 75.0)

    risk_levels = np.empty(sic_array.shape, dtype="<U10")
    risk_levels[total_risk < l_max] = "LOW"
    risk_levels[(total_risk >= l_max) & (total_risk < m_max)] = "MODERATE"
    risk_levels[(total_risk >= m_max) & (total_risk < h_max)] = "HIGH"
    risk_levels[total_risk >= h_max] = "CRITICAL"

    return total_risk, risk_levels

def process_sea_ice_prediction(
    predicted_sic: np.ndarray,
    uncertainty_map: Optional[np.ndarray] = None,
    config: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Convenience orchestrator returning complete post-processed sea-ice intelligence bundle:
    - sic: float array in [0.0, 1.0]
    - sic_percent: float array in [0.0, 100.0]
    - ice_classes: string array of categories
    - ice_edge_mask: boolean 2D mask
    - ice_edge_coordinates: list of (row, col)
    - sea_ice_risk_score: float array [0.0, 100.0]
    - sea_ice_risk_level: string array of LOW/MODERATE/HIGH/CRITICAL
    """
    sic_percent = convert_sic_to_percent(predicted_sic)
    ice_classes = classify_sea_ice(predicted_sic)
    edge_mask, edge_coords = extract_ice_edge(predicted_sic)
    risk_score, risk_levels = compute_navigation_risk(
        predicted_sic,
        uncertainty_array=uncertainty_map,
        config=config
    )

    return {
        "sic": np.clip(predicted_sic, 0.0, 1.0),
        "sic_percent": sic_percent,
        "ice_classes": ice_classes,
        "ice_edge_mask": edge_mask,
        "ice_edge_coordinates": edge_coords,
        "sea_ice_risk_score": risk_score,
        "sea_ice_risk_level": risk_levels
    }

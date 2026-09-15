"""
POLARIS: Spatial Grid Adapter Module
Implements Phase 5 of the POLARIS ML-to-Frontend Integration Layer.

Transforms native ML model prediction (41 x 121, 0.25 deg grid)
into the frontend POLARIS environmental grid (18 rows x 26 columns = 468 cells).

Strict Geographic Policy:
- ML Model Coverage Domain:
  Latitude: -70.0° to -60.0°
  Longitude: 0.0° to 30.0°
- Frontend Target Grid Domain:
  Latitude: -75.0° to -58.0°
  Longitude: -25.0° to +75.0°

Rules:
1. Zero extrapolation: Any frontend cell whose geographic center lies outside the
   model coverage domain is marked with:
   - data_available = False
   - prediction_status = "OUTSIDE_MODEL_COVERAGE"
   - all environmental and risk fields = None
2. For overlapping cells, accurate 2D spatial interpolation (bilinear/nearest) extracts
   the post-processed sea-ice intelligence bundle.
"""

import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from scipy.interpolate import RegularGridInterpolator

class PolarisGridAdapter:
    """
    Adapter mapping native ML 41x121 spatial predictions to the POLARIS 18x26 frontend grid.
    """
    def __init__(
        self,
        # Frontend Grid Definition
        frontend_rows: int = 18,
        frontend_cols: int = 26,
        frontend_lat_min: float = -75.0,
        frontend_lat_max: float = -58.0,
        frontend_lon_min: float = -25.0,
        frontend_lon_max: float = 75.0,
        # ML Model Domain Definition
        model_lat_min: float = -70.0,
        model_lat_max: float = -60.0,
        model_lon_min: float = 0.0,
        model_lon_max: float = 30.0,
        model_n_lats: int = 41,
        model_n_lons: int = 121
    ):
        self.rows = frontend_rows
        self.cols = frontend_cols
        self.fe_lat_min = frontend_lat_min
        self.fe_lat_max = frontend_lat_max
        self.fe_lon_min = frontend_lon_min
        self.fe_lon_max = frontend_lon_max

        self.model_lat_min = model_lat_min
        self.model_lat_max = model_lat_max
        self.model_lon_min = model_lon_min
        self.model_lon_max = model_lon_max

        # Frontend cell resolutions
        self.d_lat = (self.fe_lat_max - self.fe_lat_min) / self.rows
        self.d_lon = (self.fe_lon_max - self.fe_lon_min) / self.cols

        # Model coordinates
        self.model_lats = np.linspace(self.model_lat_min, self.model_lat_max, model_n_lats)
        self.model_lons = np.linspace(self.model_lon_min, self.model_lon_max, model_n_lons)

        # Precompute frontend cell centers
        self._cell_centers = self._compute_grid_centers()

    def _compute_grid_centers(self) -> List[Dict[str, Any]]:
        """
        Compute geographic center and coverage eligibility for each of the 468 cells.
        Row 0 is northernmost (-58° toward -75°), Col 0 is westernmost (-25° toward +75°).
        """
        cells = []
        for r in range(self.rows):
            # Row 0 starts at fe_lat_max - 0.5*d_lat (e.g. -58.47) down to fe_lat_min
            lat_center = round(self.fe_lat_max - (r + 0.5) * self.d_lat, 4)
            for c in range(self.cols):
                lon_center = round(self.fe_lon_min + (c + 0.5) * self.d_lon, 4)

                # Strict boundary inclusion check
                is_inside = (
                    (self.model_lat_min <= lat_center <= self.model_lat_max) and
                    (self.model_lon_min <= lon_center <= self.model_lon_max)
                )

                cells.append({
                    "row": r,
                    "column": c,
                    "latitude": lat_center,
                    "longitude": lon_center,
                    "is_inside_model_domain": is_inside
                })
        return cells

    @property
    def cell_centers(self) -> List[Dict[str, Any]]:
        return self._cell_centers

    def adapt_to_polaris_grid(
        self,
        intelligence_bundle: Dict[str, np.ndarray],
        confidence_bundle: Optional[Dict[str, np.ndarray]] = None
    ) -> List[Dict[str, Any]]:
        """
        Transform 2D 41x121 intelligence arrays to the 18x26 POLARIS environmental cell list.

        Parameters:
        - intelligence_bundle: Output dict from `process_sea_ice_prediction()`:
          {'sic', 'sic_percent', 'ice_classes', 'sea_ice_risk_score', 'sea_ice_risk_level'}
        - confidence_bundle: Optional dict with {'confidence', 'uncertainty_level'}

        Returns:
        List of 468 cell dicts with strict schema:
        {
          "row": int,
          "column": int,
          "latitude": float,
          "longitude": float,
          "sic": float | None,
          "sic_percent": float | None,
          "ice_class": str | None,
          "sea_ice_risk": float | None,
          "risk_level": str | None,
          "confidence": float | None,
          "uncertainty": str | None,
          "data_available": bool,
          "prediction_status": str
        }
        """
        sic_grid = intelligence_bundle["sic"]
        sic_pct_grid = intelligence_bundle["sic_percent"]
        ice_class_grid = intelligence_bundle["ice_classes"]
        risk_grid = intelligence_bundle["sea_ice_risk_score"]
        risk_lvl_grid = intelligence_bundle["sea_ice_risk_level"]

        if confidence_bundle:
            conf_grid = confidence_bundle["confidence"]
            unc_lvl_grid = confidence_bundle["uncertainty_level"]
        else:
            conf_grid = np.full_like(sic_grid, 85.0)
            unc_lvl_grid = np.full_like(sic_grid, "LOW", dtype="<U6")

        # Create interpolators for numeric continuous variables
        interp_sic = RegularGridInterpolator(
            (self.model_lats, self.model_lons), sic_grid, method="linear", bounds_error=False, fill_value=np.nan
        )
        interp_pct = RegularGridInterpolator(
            (self.model_lats, self.model_lons), sic_pct_grid, method="linear", bounds_error=False, fill_value=np.nan
        )
        interp_risk = RegularGridInterpolator(
            (self.model_lats, self.model_lons), risk_grid, method="linear", bounds_error=False, fill_value=np.nan
        )
        interp_conf = RegularGridInterpolator(
            (self.model_lats, self.model_lons), conf_grid, method="linear", bounds_error=False, fill_value=np.nan
        )

        grid_cells: List[Dict[str, Any]] = []

        def _get_ice_class(val: float) -> str:
            if val < 0.15: return "OPEN_WATER"
            if val < 0.40: return "LOW_ICE"
            if val < 0.70: return "MODERATE_ICE"
            if val < 0.90: return "DENSE_ICE"
            return "EXTREME_ICE"

        def _get_risk_level(val: float) -> str:
            if val < 25.0: return "LOW"
            if val < 50.0: return "MODERATE"
            if val < 75.0: return "HIGH"
            return "CRITICAL"

        def _get_unc_level(conf_val: float) -> str:
            unc_score = 100.0 - conf_val
            if unc_score < 25.0: return "LOW"
            if unc_score < 45.0: return "MEDIUM"
            return "HIGH"

        for cell_info in self._cell_centers:
            r = cell_info["row"]
            c = cell_info["column"]
            lat = cell_info["latitude"]
            lon = cell_info["longitude"]
            is_inside = cell_info["is_inside_model_domain"]

            if not is_inside:
                # Outside coverage: Strict zero-extrapolation enforcement
                grid_cells.append({
                    "row": r,
                    "column": c,
                    "latitude": lat,
                    "longitude": lon,
                    "sic": None,
                    "sic_percent": None,
                    "ice_class": None,
                    "sea_ice_risk": None,
                    "risk_level": None,
                    "confidence": None,
                    "uncertainty": None,
                    "data_available": False,
                    "prediction_status": "OUTSIDE_MODEL_COVERAGE"
                })
            else:
                pt = np.array([[lat, lon]])
                v_sic = float(interp_sic(pt)[0])
                v_pct = float(interp_pct(pt)[0])
                v_risk = float(interp_risk(pt)[0])
                v_conf = float(interp_conf(pt)[0])

                # Protect against NaN in boundary interpolation
                if np.isnan(v_sic) or np.isnan(v_risk) or np.isnan(v_conf):
                    grid_cells.append({
                        "row": r,
                        "column": c,
                        "latitude": lat,
                        "longitude": lon,
                        "sic": None,
                        "sic_percent": None,
                        "ice_class": None,
                        "sea_ice_risk": None,
                        "risk_level": None,
                        "confidence": None,
                        "uncertainty": None,
                        "data_available": False,
                        "prediction_status": "OUTSIDE_MODEL_COVERAGE"
                    })
                else:
                    clamped_sic = float(np.clip(v_sic, 0.0, 1.0))
                    clamped_pct = float(np.clip(v_pct, 0.0, 100.0))
                    clamped_risk = float(np.clip(v_risk, 0.0, 100.0))
                    clamped_conf = float(np.clip(v_conf, 0.0, 100.0))

                    v_class = _get_ice_class(clamped_sic)
                    v_risk_lvl = _get_risk_level(clamped_risk)
                    v_unc_lvl = _get_unc_level(clamped_conf)

                    grid_cells.append({
                        "row": r,
                        "column": c,
                        "latitude": lat,
                        "longitude": lon,
                        "sic": round(clamped_sic, 4),
                        "sic_percent": round(clamped_pct, 2),
                        "ice_class": v_class,
                        "sea_ice_risk": round(clamped_risk, 1),
                        "risk_level": v_risk_lvl,
                        "confidence": round(clamped_conf, 1),
                        "uncertainty": v_unc_lvl,
                        "data_available": True,
                        "prediction_status": "PREDICTED"
                    })

        return grid_cells

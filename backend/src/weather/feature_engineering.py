"""
Feature Engineering Module for Antarctic Weather Risk Model.
Calculates meteorological derived features, temporal cyclics, past lags,
and temporal pressure tendencies.
"""

import numpy as np
import pandas as pd

FEATURE_NAMES = [
    "latitude",
    "longitude",
    "u10",
    "v10",
    "wind_speed",
    "wind_direction",
    "wind_gust",
    "gust_ratio",
    "temperature_c",
    "mslp_hpa",
    "precipitation_mm",
    "pressure_change_3h",
    "pressure_change_6h",
    "hour",
    "day_of_year",
    "month",
    "sin_hour",
    "cos_hour",
    "wind_speed_lag_1h",
    "wind_speed_lag_3h",
    "wind_speed_lag_6h",
    "wind_gust_lag_1h",
    "wind_gust_lag_3h",
    "wind_gust_lag_6h",
    "pressure_lag_1h",
    "pressure_lag_3h",
    "pressure_lag_6h"
]

def calculate_derived_weather(u10, v10, fg10, t2m, msl, tp, eps=1e-4):
    """
    Calculates primary physical derived features from raw ERA5 units.
    u10: m/s
    v10: m/s
    fg10: m/s (10m wind gust)
    t2m: Kelvin
    msl: Pascals
    tp: meters
    """
    u10 = np.asarray(u10, dtype=np.float32)
    v10 = np.asarray(v10, dtype=np.float32)
    fg10 = np.asarray(fg10, dtype=np.float32)
    t2m = np.asarray(t2m, dtype=np.float32)
    msl = np.asarray(msl, dtype=np.float32)
    tp = np.asarray(tp, dtype=np.float32)

    # 1. Wind speed
    wind_speed = np.sqrt(u10**2 + v10**2)

    # 2. Wind direction in degrees [0, 360)
    wind_direction = (np.arctan2(v10, u10) * (180.0 / np.pi)) % 360.0

    # 3. Gust ratio
    gust_ratio = fg10 / (wind_speed + eps)

    # 4. Temperature in Celsius
    temp_c = t2m - 273.15

    # 5. Pressure in hPa
    mslp_hpa = msl / 100.0

    # 6. Total precipitation in mm
    precip_mm = np.maximum(tp * 1000.0, 0.0)

    return {
        "wind_speed": wind_speed,
        "wind_direction": wind_direction,
        "gust_ratio": gust_ratio,
        "temperature_c": temp_c,
        "mslp_hpa": mslp_hpa,
        "precipitation_mm": precip_mm
    }

def extract_temporal_features(timestamps):
    """
    Extracts calendar and cyclical hour features from an array or DatetimeIndex of timestamps.
    """
    dt_series = pd.to_datetime(timestamps)
    hour = dt_series.hour.values
    day_of_year = dt_series.dayofyear.values
    month = dt_series.month.values

    # Cyclical hour encoding
    sin_hour = np.sin(2.0 * np.pi * hour / 24.0)
    cos_hour = np.cos(2.0 * np.pi * hour / 24.0)

    return {
        "hour": hour,
        "day_of_year": day_of_year,
        "month": month,
        "sin_hour": sin_hour,
        "cos_hour": cos_hour
    }

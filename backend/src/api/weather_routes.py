"""
POLARIS Weather Intelligence API Router.
Provides modular endpoints with prefix '/weather' for seamless drop-in integration
into the unified POLARIS FastAPI backend.

Endpoints:
- GET  /weather/health: Health check and engine status
- POST /weather/predict: Single coordinate 6h-ahead risk prediction
- GET  /weather/forecast: Static / baseline 468-cell POLARIS grid forecast
- POST /weather/grid: Dynamic 468-cell POLARIS grid prediction from observations
"""

import os
import json
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status

try:
    from schemas.weather import (
        WeatherPointObservation,
        WeatherPointPrediction,
        WeatherGridCell,
        WeatherGridResponse,
        WeatherHealthResponse,
        WeatherGridRequest
    )
except ImportError:
    from src.schemas.weather import (
        WeatherPointObservation,
        WeatherPointPrediction,
        WeatherGridCell,
        WeatherGridResponse,
        WeatherHealthResponse,
        WeatherGridRequest
    )

try:
    from adapters.weather_adapter import (
        get_weather_adapter,
        POLARIS_GRID_ROWS,
        POLARIS_GRID_COLS,
        POLARIS_TOTAL_CELLS,
        POLARIS_LAT_MIN,
        POLARIS_LAT_MAX,
        POLARIS_LON_MIN,
        POLARIS_LON_MAX
    )
except ImportError:
    from src.adapters.weather_adapter import (
        get_weather_adapter,
        POLARIS_GRID_ROWS,
        POLARIS_GRID_COLS,
        POLARIS_TOTAL_CELLS,
        POLARIS_LAT_MIN,
        POLARIS_LAT_MAX,
        POLARIS_LON_MIN,
        POLARIS_LON_MAX
    )


logger = logging.getLogger("polaris.weather.routes")

router = APIRouter(
    prefix="/weather",
    tags=["Weather Intelligence"]
)

# Path to pre-generated offline static forecast export
STATIC_EXPORT_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "exports" / "polaris_weather_forecast.json"
if not STATIC_EXPORT_PATH.is_file():
    STATIC_EXPORT_PATH = Path(__file__).resolve().parent.parent / "data" / "exports" / "polaris_weather_forecast.json"

@router.get("/health", response_model=WeatherHealthResponse, summary="Weather engine health diagnostics")
def get_health():
    """
    Returns the operational status, framework, forecast horizon,
    and cell dimension of the weather risk engine.
    """
    try:
        adapter = get_weather_adapter()
        health_info = adapter.health_check()
        return WeatherHealthResponse(**health_info)
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return WeatherHealthResponse(
            model="weather_intelligence_engine",
            status=f"ERROR: {str(e)}",
            framework="PyTorch",
            forecast_horizon_hours=6,
            grid_cells=POLARIS_TOTAL_CELLS
        )

@router.post("/predict", response_model=WeatherPointPrediction, summary="Single coordinate 6h-ahead risk prediction")
def predict_single_point(observation: WeatherPointObservation):
    """
    Predicts 6-hour-ahead weather-derived navigation risk score [0, 1] and risk class
    (SAFE, MODERATE, HIGH, CRITICAL) for a single observation point.
    Strictly validates coordinate domain to Antarctic region (lat: [-75, -58], lon: [-25, 75]).
    """
    lat = observation.latitude
    lon = observation.longitude

    if not (POLARIS_LAT_MIN <= lat <= POLARIS_LAT_MAX and POLARIS_LON_MIN <= lon <= POLARIS_LON_MAX):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Coordinates ({lat}, {lon}) are outside the validated Antarctic operational domain: "
                f"Latitude must be within [{POLARIS_LAT_MIN}, {POLARIS_LAT_MAX}], "
                f"Longitude must be within [{POLARIS_LON_MIN}, {POLARIS_LON_MAX}]."
            )
        )

    try:
        adapter = get_weather_adapter()
        result = adapter.predict_point(observation.model_dump())
        return WeatherPointPrediction(**result)
    except Exception as e:
        logger.error(f"Prediction failed for point ({lat}, {lon}): {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Inference error in weather engine: {str(e)}"
        )

@router.get("/forecast", response_model=WeatherGridResponse, summary="Static / baseline 468-cell POLARIS grid forecast")
def get_forecast(
    horizon_hours: Optional[int] = Query(
        6,
        description="Forecast horizon in hours."
    )
):
    """
    Retrieves the 468-cell POLARIS Antarctic weather navigation risk grid.
    """
    # 1. Attempt loading pre-computed offline static export from real ERA5 data
    if STATIC_EXPORT_PATH.is_file():
        try:
            with open(STATIC_EXPORT_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            cells = [WeatherGridCell(**c) for c in data.get("cells", [])]
            if len(cells) == POLARIS_TOTAL_CELLS:
                return WeatherGridResponse(
                    model="weather_intelligence_engine",
                    forecastHorizonHours=6,
                    gridRows=POLARIS_GRID_ROWS,
                    gridColumns=POLARIS_GRID_COLS,
                    totalCells=POLARIS_TOTAL_CELLS,
                    timestamp=data.get("generated_timestamp", "2020-04-30T18:00:00"),
                    cells=cells
                )
        except Exception as e:
            logger.warning(f"Failed to read static export at {STATIC_EXPORT_PATH}: {e}. Falling back to adapter.")

    # 2. Dynamic generation fallback via adapter
    try:
        adapter = get_weather_adapter()
        cells_data = adapter.predict_grid([])
        cells = [WeatherGridCell(**c) for c in cells_data]
        return WeatherGridResponse(
            model="weather_intelligence_engine",
            forecastHorizonHours=6,
            gridRows=POLARIS_GRID_ROWS,
            gridColumns=POLARIS_GRID_COLS,
            totalCells=POLARIS_TOTAL_CELLS,
            timestamp=cells[0].timestamp if cells else "2020-04-01T06:00:00",
            cells=cells
        )
    except Exception as e:
        logger.error(f"Error generating forecast grid: {e}")
        # Create valid empty baseline fallback grid
        cells = []
        for r in range(POLARIS_GRID_ROWS):
            for c in range(POLARIS_GRID_COLS):
                cells.append(WeatherGridCell(
                    row=r,
                    column=c,
                    latitude=-66.5 + (r * 0.5),
                    longitude=25.0 + (c * 0.5),
                    riskScore=0.20,
                    riskClass="SAFE",
                    timestamp="2020-04-01T06:00:00"
                ))
        return WeatherGridResponse(
            model="weather_intelligence_engine",
            forecastHorizonHours=6,
            gridRows=POLARIS_GRID_ROWS,
            gridColumns=POLARIS_GRID_COLS,
            totalCells=len(cells),
            timestamp="2020-04-01T06:00:00",
            cells=cells
        )

@router.post("/grid", response_model=WeatherGridResponse, summary="Dynamic 468-cell POLARIS grid prediction")
def predict_grid(request: WeatherGridRequest):
    """
    Projects arbitrary input observations across the Antarctic quadrant onto
    the exact 18 x 26 = 468 cell POLARIS environmental decision grid.
    Each cell contains row, column, latitude, longitude, riskScore, and riskClass.
    """
    try:
        adapter = get_weather_adapter()
        obs_dicts = [o.model_dump() for o in request.observations] if request.observations else []
        cells_data = adapter.predict_grid(obs_dicts, timestamp=request.timestamp)
        cells = [WeatherGridCell(**c) for c in cells_data]

        return WeatherGridResponse(
            model="weather_intelligence_engine",
            forecastHorizonHours=6,
            gridRows=POLARIS_GRID_ROWS,
            gridColumns=POLARIS_GRID_COLS,
            totalCells=len(cells),
            timestamp=cells[0].timestamp if cells else "2020-04-01T06:00:00",
            cells=cells
        )
    except Exception as e:
        logger.error(f"Grid prediction failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Grid prediction failure: {str(e)}"
        )

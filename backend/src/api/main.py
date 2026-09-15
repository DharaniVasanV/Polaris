from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.api.routes import router
from src.api.dependencies import get_iceberg_adapter

# Phase 10A: Sentinel-1 Recent Observation Router
from src.api.sentinel1_routes import router as sentinel1_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-warm trained model weights on startup
    adapter = get_iceberg_adapter()
    _ = adapter.get_model_status()
    print("[POLARIS MODEL ENGINE] GRU Model and Scaler loaded successfully.")
    try:
        from src.sea_ice.model_service import get_model
        _ = get_model()
        print("[POLARIS MODEL ENGINE] ConvLSTM Sea-Ice Model loaded successfully.")
    except Exception as e:
        print(f"[POLARIS MODEL ENGINE] ConvLSTM prewarm notice: {e}")
    try:
        from src.adapters.weather_adapter import get_weather_adapter
        _ = get_weather_adapter()
        print("[POLARIS MODEL ENGINE] PyTorch Weather Risk MLP Model loaded successfully.")
    except Exception as e:
        print(f"[POLARIS MODEL ENGINE] Weather prewarm notice: {e}")
    try:
        from src.services.copernicus_auth import credentials_are_configured
        if credentials_are_configured():
            print("[POLARIS DATA SOURCE] Copernicus credentials configured — Sentinel-1 GRD integration active.")
        else:
            print("[POLARIS DATA SOURCE] Copernicus credentials NOT configured — Sentinel-1 integration inactive.")
    except Exception as e:
        print(f"[POLARIS DATA SOURCE] Sentinel-1 prewarm notice: {e}")
    yield


app = FastAPI(
    title="POLARIS — Tri-AI Antarctic Navigation Intelligence Engine",
    description=(
        "Unified Multi-Model Intelligence: GRU Iceberg Drift + ConvLSTM Sea Ice + "
        "PyTorch Weather Risk + Sentinel-1 Recent Satellite Observation."
    ),
    version="3.1.0",
    lifespan=lifespan
)

# Enable CORS for all frontends
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
# Phase 10A: Satellite observation endpoints (/satellite/sentinel1/latest, /satellite/sentinel1/health)
app.include_router(sentinel1_router)

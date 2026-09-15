from functools import lru_cache
from src.adapters.iceberg_adapter import IcebergPredictionAdapter


@lru_cache()
def get_iceberg_adapter() -> IcebergPredictionAdapter:
    """Singleton provider for IcebergPredictionAdapter."""
    return IcebergPredictionAdapter()

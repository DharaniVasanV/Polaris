from abc import ABC, abstractmethod
from typing import Any


class BasePredictionAdapter(ABC):
    """Abstract interface defining the standardized prediction contract."""

    @abstractmethod
    def predict(self, request: Any, **kwargs) -> Any:
        pass

    @abstractmethod
    def get_model_status(self) -> dict:
        pass


class BaseEnvironmentalAdapter(BasePredictionAdapter):
    """Abstract interface defining environmental model adapters."""

    @abstractmethod
    def health_check(self) -> dict:
        pass

    @abstractmethod
    def predict_point(self, observation: Any) -> dict:
        pass

    @abstractmethod
    def predict_grid(self, observations: Any, timestamp: Any = None) -> list:
        pass

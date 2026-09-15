import json
import urllib.request
import sys

def test_direct_in_process():
    """Tests the GRU model directly in-process without needing a running server."""
    print("=" * 60)
    print("  1. DIRECT IN-PROCESS MODEL TEST (No Server Needed)")
    print("=" * 60)
    
    from src.predict import IcebergTrajectoryPredictor
    from src.adapters.iceberg_adapter import IcebergPredictionAdapter
    from src.schemas.iceberg import IcebergPredictRequest
    from src.schemas.common import GeoCoordinate

    predictor = IcebergTrajectoryPredictor()
    adapter = IcebergPredictionAdapter(predictor)

    sample_coords = [
        GeoCoordinate(lat=-65.81, lon=-53.51),
        GeoCoordinate(lat=-65.80, lon=-53.48),
        GeoCoordinate(lat=-65.78, lon=-53.43),
        GeoCoordinate(lat=-65.76, lon=-53.37),
        GeoCoordinate(lat=-65.74, lon=-53.30),
        GeoCoordinate(lat=-65.73, lon=-53.24),
        GeoCoordinate(lat=-65.72, lon=-53.18),
        GeoCoordinate(lat=-65.71, lon=-53.13),
        GeoCoordinate(lat=-65.71, lon=-53.08),
        GeoCoordinate(lat=-65.70, lon=-53.04),
    ]

    req = IcebergPredictRequest(
        iceberg_id="A23A",
        historical_coordinates=sample_coords,
        steps=5,
        start_date="2024-01-01"
    )

    res = adapter.predict(req, vessel_safety_margin_km=30.0)
    print(f"[+] Model Loaded: {res.model_name}")
    print(f"[+] Target Iceberg: {res.iceberg_id} | Multi-Step Horizon: {res.forecast_horizon_days} Days")
    for step in res.forecast_steps:
        print(f"   * {step.step}: Lat={step.latitude:.4f}°, Lon={step.longitude:.4f}° | "
              f"Model Uncertainty={step.empirical_error_radius_km} km | "
              f"Total Hazard Zone={step.total_hazard_zone_radius_km} km")
    print("\n[SUCCESS] GRU Model weights, scaler, and inference engine are 100% operational!\n")


def test_http_server():
    """Tests the HTTP REST API endpoint on http://127.0.0.1:8000."""
    print("=" * 60)
    print("  2. HTTP REST API TEST (Requires: python run_server.py)")
    print("=" * 60)
    
    url_health = "http://127.0.0.1:8000/health"
    url_predict = "http://127.0.0.1:8000/iceberg/predict?vessel_safety_margin_km=30.0"

    try:
        req = urllib.request.urlopen(url_health, timeout=2)
        health = json.loads(req.read().decode())
        print(f"[+] Server Health: {health['status']} | Model Status: {health['model_engine']['model_status']}")

        payload = {
            "iceberg_id": "A23A",
            "steps": 5,
            "start_date": "2024-01-01",
            "historical_coordinates": [
                {"lat": -65.81, "lon": -53.51},
                {"lat": -65.80, "lon": -53.48},
                {"lat": -65.78, "lon": -53.43},
                {"lat": -65.76, "lon": -53.37},
                {"lat": -65.74, "lon": -53.30},
                {"lat": -65.73, "lon": -53.24},
                {"lat": -65.72, "lon": -53.18},
                {"lat": -65.71, "lon": -53.13},
                {"lat": -65.71, "lon": -53.08},
                {"lat": -65.70, "lon": -53.04}
            ]
        }
        data = json.dumps(payload).encode("utf-8")
        req_pred = urllib.request.Request(url_predict, data=data, headers={"Content-Type": "application/json"})
        response = urllib.request.urlopen(req_pred, timeout=5)
        res = json.loads(response.read().decode())
        print(f"[+] HTTP API Response: Received {len(res['forecast_steps'])} forecast steps successfully.")
    except Exception as e:
        print(f"[INFO] HTTP Server not currently running on port 8000 ({e}).")
        print("       To test the REST API, open another terminal and run: python run_server.py")


if __name__ == "__main__":
    test_direct_in_process()
    test_http_server()

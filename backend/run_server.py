import os
import uvicorn

# Load environment variables from backend/.env (local dev only).
# On Render, env vars are injected directly — no .env file needed.
try:
    from dotenv import load_dotenv
    _env_file = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(_env_file):
        load_dotenv(_env_file)
        print(f"[POLARIS] Loaded environment variables from {_env_file}")
except ImportError:
    print("[POLARIS] python-dotenv not installed — env vars must be set manually.")

if __name__ == "__main__":
    # Render injects PORT; fall back to 8000 for local dev
    port = int(os.environ.get("PORT", 8000))
    # Render requires 0.0.0.0 binding; local dev uses 127.0.0.1
    host = "0.0.0.0" if os.environ.get("RENDER") else "127.0.0.1"
    reload = not bool(os.environ.get("RENDER"))  # No reload in production

    print("==========================================================")
    print(f"  POLARIS MODEL SERVER — STARTING ON http://{host}:{port}")
    print(f"  Environment: {'RENDER (production)' if os.environ.get('RENDER') else 'LOCAL DEV'}")
    print("  Swagger API Documentation: /docs")
    print("==========================================================")
    uvicorn.run("src.api.main:app", host=host, port=port, reload=reload)

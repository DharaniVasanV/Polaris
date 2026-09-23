# ─── POLARIS Backend Dockerfile ────────────────────────
FROM python:3.11-slim

WORKDIR /app

# Install OS-level dependencies required by TensorFlow, OpenCV, and Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir pillow

# Copy backend source code and trained model weights
COPY . .

# Set PYTHONPATH so src modules resolve cleanly
ENV PYTHONPATH=/app
ENV PORT=8000
ENV HOST=0.0.0.0

EXPOSE 8000

# Start FastAPI app
CMD ["python", "-c", "import os, uvicorn; port = int(os.environ.get('PORT', 8000)); uvicorn.run('src.api.main:app', host='0.0.0.0', port=port, reload=False)"]

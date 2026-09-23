# ─── POLARIS Backend — Hugging Face Spaces Dockerfile ───────────────────────
# Base: Python 3.11 slim for smallest possible image
FROM python:3.11-slim

# HF Spaces runs as non-root user 1000:1000 — set up accordingly
RUN useradd -m -u 1000 user
WORKDIR /app

# Install OS-level dependencies needed by TensorFlow / Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir pillow

# Copy backend source code and model weights
COPY . .

# Set ownership to non-root user
RUN chown -R user:user /app
USER user

# HF Spaces requires port 7860
ENV PORT=7860
ENV HOST=0.0.0.0

# Expose port
EXPOSE 7860

# Start the FastAPI server
CMD ["python", "-c", "\
import os, uvicorn; \
port = int(os.environ.get('PORT', 7860)); \
uvicorn.run('src.api.main:app', host='0.0.0.0', port=port, reload=False) \
"]

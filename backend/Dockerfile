# LedgerMind backend — FastAPI + LangGraph + PaddleOCR
# Pinned to Python 3.11 (paddleocr/paddlepaddle + numpy==1.26.4 have no 3.12+ wheels).
FROM python:3.11-slim

# System libraries PaddleOCR / OpenCV need at runtime (headless server has no GUI libs by default).
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUTF8=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install deps first for better layer caching.
#
# paddleocr is deliberately NOT in requirements.txt: 2.7.3 pins
# opencv-python<=4.6.0.66, which has no Python 3.11 wheel, so a normal resolve
# fails. It is installed separately without deps — its real runtime deps
# (opencv 4.10, shapely, pyclipper, …) are pinned in requirements.txt.
#
# That second install is REQUIRED. Without it the image builds cleanly but
# `from paddleocr import PaddleOCR` raises at runtime and every receipt fails
# at the OCR step.
COPY requirements.txt ./
RUN pip install --upgrade pip \
    && pip install -r requirements.txt \
    && pip install paddleocr==2.7.3 --no-deps

# App source (see .dockerignore for what's excluded — .env, venv, tests, etc.).
COPY . .

EXPOSE 8000

# Production server: no --reload. Tune workers to the deployment's CPU allocation.
# (PaddleOCR holds model state per-process, so start with 1 worker and scale horizontally.)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]

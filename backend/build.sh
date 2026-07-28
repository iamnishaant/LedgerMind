#!/usr/bin/env bash
# Build command for hosts that run a plain Python service rather than the
# Dockerfile (e.g. Render's native Python runtime).
#
# Use as the service's Build Command:
#     ./build.sh
#
# The paddleocr step is the reason this script exists. paddleocr 2.7.3 pins
# opencv-python<=4.6.0.66, which has no Python 3.11 wheel, so it cannot live in
# requirements.txt — a normal resolve fails. Installing it with --no-deps is
# safe because its real runtime deps (opencv 4.10, shapely, pyclipper, …) are
# pinned in requirements.txt.
#
# Skipping it produces a deploy that starts cleanly but fails EVERY receipt at
# the OCR step with an ImportError.
set -euo pipefail

pip install --upgrade pip
pip install -r requirements.txt
pip install paddleocr==2.7.3 --no-deps

python -c "import paddleocr, paddle; print('paddleocr', paddleocr.__version__, '/ paddle', paddle.__version__)"

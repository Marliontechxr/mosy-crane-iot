#!/usr/bin/env bash
# =============================================================================
# MOSY — Pre-download AI models for Edge AI services.
# Run once before first docker compose up to avoid long first-start delays.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EDGE_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== MOSY Model Download Script ==="
echo ""

# ---------------------------------------------------------------------------
# 1. PaddleOCR models (auto-download to ~/.paddleocr/ on first use)
# ---------------------------------------------------------------------------
echo "[1/3] PaddleOCR models..."
echo "  PaddleOCR models auto-download on first inference."
echo "  To pre-warm, run inside the container:"
echo "    python -c \"from paddleocr import PaddleOCR; PaddleOCR(use_angle_cls=True, lang='en')\""
echo ""

# ---------------------------------------------------------------------------
# 2. Moondream 2 model (downloads via moondream library)
# ---------------------------------------------------------------------------
echo "[2/3] Moondream 2 VLM model..."
echo "  Moondream 2 INT8 model (~1.1GB) downloads on first use."
echo "  To pre-warm, run inside the container:"
echo "    python -c \"import moondream as md; md.vl(model='moondream-2b-int8')\""
echo ""

# ---------------------------------------------------------------------------
# 3. MediaPipe Face Mesh (bundled with pip package)
# ---------------------------------------------------------------------------
echo "[3/3] MediaPipe Face Mesh..."
echo "  MediaPipe models are bundled with the pip package. No download needed."
echo ""

echo "=== Pre-warming all models in Docker ==="
echo ""
echo "Run the following to pre-download all models into the shared volume:"
echo ""
echo "  docker compose run --rm -e CAMERA_SOURCE=none ocr-service \\"
echo "    python -c \"from paddleocr import PaddleOCR; PaddleOCR(use_angle_cls=True, lang='en'); print('PaddleOCR ready')\""
echo ""
echo "  docker compose run --rm -e CAMERA_SOURCE=none vision-service \\"
echo "    python -c \"import moondream as md; md.vl(model='moondream-2b-int8'); print('Moondream ready')\""
echo ""
echo "=== Done ==="

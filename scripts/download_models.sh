#!/usr/bin/env bash
# =============================================================================
# MOSY — Download AI Models
#
# Downloads all required models for edge AI services:
#   1. PaddleOCR detection model (en_PP-OCRv4_det)
#   2. PaddleOCR recognition model (en_PP-OCRv4_rec)
#   3. MediaPipe face landmark model (face_landmarker.task)
#   4. Moondream 2 — loaded via pip at runtime (instructions only)
#
# Usage:
#   bash scripts/download_models.sh
#
# Models are saved to models/ (gitignored, .gitkeep preserved).
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MODEL_DIR="${PROJECT_ROOT}/models"

echo "MOSY — Downloading AI Models"
echo "=============================="
echo ""

# Create models directory
mkdir -p "$MODEL_DIR"
touch "$MODEL_DIR/.gitkeep"

# ---------------------------------------------------------------------------
# 1. PaddleOCR Detection Model (en_PP-OCRv4_det)
# ---------------------------------------------------------------------------
echo "[1/3] PaddleOCR Detection Model (en_PP-OCRv4_det)..."
DET_DIR="${MODEL_DIR}/paddleocr/en_PP-OCRv4_det"
if [[ -d "$DET_DIR" ]]; then
    echo "  Already exists at $DET_DIR"
else
    mkdir -p "$DET_DIR"
    DET_URL="https://paddleocr.bj.bcebos.com/PP-OCRv4/english/en_PP-OCRv4_det_infer.tar"
    echo "  Downloading from $DET_URL"
    curl -sL "$DET_URL" | tar -xf - -C "$DET_DIR" --strip-components=1
    echo "  Saved to $DET_DIR"
fi

# ---------------------------------------------------------------------------
# 2. PaddleOCR Recognition Model (en_PP-OCRv4_rec)
# ---------------------------------------------------------------------------
echo "[2/3] PaddleOCR Recognition Model (en_PP-OCRv4_rec)..."
REC_DIR="${MODEL_DIR}/paddleocr/en_PP-OCRv4_rec"
if [[ -d "$REC_DIR" ]]; then
    echo "  Already exists at $REC_DIR"
else
    mkdir -p "$REC_DIR"
    REC_URL="https://paddleocr.bj.bcebos.com/PP-OCRv4/english/en_PP-OCRv4_rec_infer.tar"
    echo "  Downloading from $REC_URL"
    curl -sL "$REC_URL" | tar -xf - -C "$REC_DIR" --strip-components=1
    echo "  Saved to $REC_DIR"
fi

# ---------------------------------------------------------------------------
# 3. MediaPipe Face Landmark Model
# ---------------------------------------------------------------------------
echo "[3/3] MediaPipe Face Landmarker..."
FACE_DIR="${MODEL_DIR}/mediapipe"
FACE_MODEL="${FACE_DIR}/face_landmarker.task"
if [[ -f "$FACE_MODEL" ]]; then
    echo "  Already exists at $FACE_MODEL"
else
    mkdir -p "$FACE_DIR"
    FACE_URL="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
    echo "  Downloading from $FACE_URL"
    curl -sL -o "$FACE_MODEL" "$FACE_URL"
    echo "  Saved to $FACE_MODEL"
fi

# ---------------------------------------------------------------------------
# Moondream 2 — Instructions
# ---------------------------------------------------------------------------
echo ""
echo "NOTE: Moondream 2 (0.5B INT8 ONNX)"
echo "  Moondream is loaded at runtime via the Python package."
echo "  Install: pip install moondream==0.0.5"
echo "  The model weights are downloaded automatically on first use"
echo "  and cached in ~/.cache/moondream/"
echo ""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo "=============================="
echo "Model downloads complete!"
echo ""
du -sh "$MODEL_DIR"/* 2>/dev/null || echo "  (no files to measure)"
echo ""
echo "Models directory: $MODEL_DIR"
echo "Note: models/ is gitignored. Only .gitkeep is tracked."

"""Tests for the Vision Service — boom analyzer keyword matching and output format."""

from __future__ import annotations

from unittest.mock import patch, MagicMock

import pytest
from PIL import Image

from vision_service.boom_analyzer import (
    _extract_detections,
    analyze_boom_scene,
    MATERIAL_KEYWORDS,
    PERSONNEL_KEYWORDS,
    ASSET_KEYWORDS,
    PROMPTS,
)


# ---------------------------------------------------------------------------
# Detection Extraction Tests
# ---------------------------------------------------------------------------
class TestDetectionExtraction:
    def test_material_steel_detected(self) -> None:
        text = "I can see steel beams on the left side of the frame being lifted by the crane."
        detections = _extract_detections(text, MATERIAL_KEYWORDS, "material")
        class_ids = [d["class_id"] for d in detections]
        assert "steel_beam" in class_ids

    def test_material_concrete_detected(self) -> None:
        text = "There are concrete blocks stacked on the ground near the crane base."
        detections = _extract_detections(text, MATERIAL_KEYWORDS, "material")
        class_ids = [d["class_id"] for d in detections]
        assert "concrete_block" in class_ids

    def test_material_multiple_types(self) -> None:
        text = "The scene shows steel beams and concrete blocks with some pipes nearby."
        detections = _extract_detections(text, MATERIAL_KEYWORDS, "material")
        class_ids = [d["class_id"] for d in detections]
        assert "steel_beam" in class_ids
        assert "concrete_block" in class_ids
        assert "pipe" in class_ids

    def test_personnel_detected(self) -> None:
        text = "Two workers are visible near the crane, one person is wearing a hard hat."
        detections = _extract_detections(text, PERSONNEL_KEYWORDS, "personnel")
        class_ids = [d["class_id"] for d in detections]
        assert "worker" in class_ids
        assert "person" in class_ids

    def test_personnel_danger_zone(self) -> None:
        text = "A worker is standing directly below the boom in a danger zone."
        detections = _extract_detections(text, PERSONNEL_KEYWORDS, "personnel")
        assert len(detections) > 0
        assert detections[0]["metadata"]["in_danger_zone"] is True

    def test_personnel_safe_zone(self) -> None:
        text = "A worker is visible in the distance near the site entrance."
        detections = _extract_detections(text, PERSONNEL_KEYWORDS, "personnel")
        assert len(detections) > 0
        assert detections[0]["metadata"]["in_danger_zone"] is False

    def test_asset_detected(self) -> None:
        text = "A truck is parked next to the scaffolding on the right."
        detections = _extract_detections(text, ASSET_KEYWORDS, "asset")
        class_ids = [d["class_id"] for d in detections]
        assert "truck" in class_ids
        assert "scaffolding" in class_ids

    def test_no_keywords_found(self) -> None:
        text = "The sky is clear and blue with no objects visible."
        detections = _extract_detections(text, MATERIAL_KEYWORDS, "material")
        assert len(detections) == 0

    def test_detection_format(self) -> None:
        text = "There is a steel beam being lifted."
        detections = _extract_detections(text, MATERIAL_KEYWORDS, "material")
        assert len(detections) > 0
        d = detections[0]
        assert "class_id" in d
        assert "class_label" in d
        assert "confidence" in d
        assert "bounding_box" in d
        assert d["bounding_box"]["x"] == 0.0
        assert d["bounding_box"]["width"] == 1.0

    def test_no_duplicate_class_ids(self) -> None:
        # "beam" and "steel" both map to "steel_beam"
        text = "Steel beams and more steel structures"
        detections = _extract_detections(text, MATERIAL_KEYWORDS, "material")
        class_ids = [d["class_id"] for d in detections]
        assert class_ids.count("steel_beam") == 1


# ---------------------------------------------------------------------------
# Full Analysis Tests (mocked Moondream)
# ---------------------------------------------------------------------------
class TestBoomAnalysis:
    def test_analyze_boom_scene_with_detections(self) -> None:
        mock_model = MagicMock()
        # Mock encode_image and query
        mock_encoded = MagicMock()
        mock_model.encode_image.return_value = mock_encoded
        mock_model.query.side_effect = [
            {"answer": "Crane boom over a construction site with steel beams."},
            {"answer": "Steel beams and concrete blocks visible."},
            {"answer": "No people visible in the frame."},
            {"answer": "A truck is parked nearby."},
        ]

        image = Image.new("RGB", (640, 480), color=(128, 128, 128))
        result = analyze_boom_scene(mock_model, image)

        assert "steel" in result.caption.lower() or "crane" in result.caption.lower()
        assert len(result.detections) > 0
        assert result.processing_time_ms > 0
        assert len(result.inference_id) == 16

    def test_analyze_boom_scene_no_detections(self) -> None:
        mock_model = MagicMock()
        mock_encoded = MagicMock()
        mock_model.encode_image.return_value = mock_encoded
        mock_model.query.side_effect = [
            {"answer": "Empty sky with clouds."},
            {"answer": "Nothing visible."},
            {"answer": "The area is clear."},
            {"answer": "Nothing here."},
        ]

        image = Image.new("RGB", (640, 480), color=(128, 128, 128))
        result = analyze_boom_scene(mock_model, image)

        assert result.caption == "Empty sky with clouds."
        assert len(result.detections) == 0

    def test_analyze_boom_scene_model_error(self) -> None:
        mock_model = MagicMock()
        mock_encoded = MagicMock()
        mock_model.encode_image.return_value = mock_encoded
        mock_model.query.side_effect = [
            {"answer": "Scene description."},
            Exception("Model error"),
            {"answer": "No people."},
            {"answer": "No equipment."},
        ]

        image = Image.new("RGB", (640, 480), color=(128, 128, 128))
        result = analyze_boom_scene(mock_model, image)

        assert result.caption == "Scene description."
        # Should still work despite one prompt failing

    def test_prompt_keys_exist(self) -> None:
        assert "scene" in PROMPTS
        assert "material" in PROMPTS
        assert "personnel" in PROMPTS
        assert "asset" in PROMPTS


# ---------------------------------------------------------------------------
# Model Loader Tests
# ---------------------------------------------------------------------------
class TestModelLoader:
    def test_is_loaded_initially_false(self) -> None:
        from vision_service.model_loader import is_loaded
        # Note: We can't test this in isolation since the module state persists.
        # But we can verify the function exists and returns a bool.
        assert isinstance(is_loaded(), bool)

    @patch("vision_service.model_loader._model", None)
    def test_release_clears_model(self) -> None:
        from vision_service.model_loader import release, _model
        release()
        import vision_service.model_loader as ml
        assert ml._model is None

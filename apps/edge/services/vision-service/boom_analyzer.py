"""MOSY Edge — Boom camera scene analyzer using Moondream 2 VLM.

Sends structured prompts to the VLM and parses text output into
Detection objects. Uses keyword matching for material, personnel,
asset, and general scene analysis.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from typing import Dict, List, Optional

from PIL import Image

from shared.logger import setup_logging

log = setup_logging("boom_analyzer")


# ---------------------------------------------------------------------------
# Prompt templates for boom camera analysis
# ---------------------------------------------------------------------------
PROMPTS = {
    "scene": (
        "Describe this construction crane camera view in one sentence. "
        "Focus on the boom, load, and surrounding area."
    ),
    "material": (
        "List any construction materials visible: steel beams, concrete blocks, "
        "pipes, lumber, containers, or other loads. For each, state its approximate "
        "position (left, center, right) and whether it appears to be on the hook."
    ),
    "personnel": (
        "Are there any people or workers visible in this image? "
        "If yes, describe their position relative to the crane boom and load. "
        "Note if anyone is in a danger zone directly below the boom."
    ),
    "asset": (
        "List any vehicles, equipment, or structures visible: trucks, excavators, "
        "scaffolding, buildings, barriers, or safety cones. "
        "Note their position relative to the crane."
    ),
}

# Keyword sets for detection classification
MATERIAL_KEYWORDS = {
    "steel": "steel_beam",
    "beam": "steel_beam",
    "concrete": "concrete_block",
    "block": "concrete_block",
    "pipe": "pipe",
    "lumber": "lumber",
    "wood": "lumber",
    "container": "container",
    "pallet": "pallet",
    "rebar": "rebar",
    "load": "generic_load",
}

PERSONNEL_KEYWORDS = {
    "person": "person",
    "worker": "worker",
    "people": "person",
    "man": "person",
    "woman": "person",
    "crew": "worker",
    "operator": "operator",
}

ASSET_KEYWORDS = {
    "truck": "truck",
    "excavator": "excavator",
    "crane": "crane",
    "scaffold": "scaffolding",
    "building": "building",
    "barrier": "barrier",
    "cone": "safety_cone",
    "fence": "fence",
    "vehicle": "vehicle",
}

DANGER_KEYWORDS = {"danger", "below", "underneath", "hazard", "risk", "close"}


@dataclass
class AnalysisResult:
    """Result of VLM boom camera analysis."""
    caption: str
    detections: List[Dict]
    processing_time_ms: float
    inference_id: str


def _extract_detections(text: str, keywords: Dict[str, str], category: str) -> List[Dict]:
    """Extract detections from VLM text output using keyword matching.

    Args:
        text: VLM response text.
        keywords: Mapping of keyword → class_id.
        category: Detection category (material, personnel, asset).

    Returns:
        List of Detection dicts matching mqtt_types.Detection.
    """
    text_lower = text.lower()
    detections = []
    seen_classes = set()

    for keyword, class_id in keywords.items():
        if keyword in text_lower and class_id not in seen_classes:
            seen_classes.add(class_id)

            # VLM doesn't provide spatial coords — use full-frame bounding box
            detection = {
                "class_id": class_id,
                "class_label": f"{category}:{class_id}",
                "confidence": 0.7,  # VLM text-based detection
                "bounding_box": {
                    "x": 0.0,
                    "y": 0.0,
                    "width": 1.0,
                    "height": 1.0,
                },
                "metadata": {
                    "source": "vlm_keyword",
                    "category": category,
                },
            }

            # Check for danger zone proximity (personnel only)
            if category == "personnel":
                in_danger = any(dw in text_lower for dw in DANGER_KEYWORDS)
                detection["metadata"]["in_danger_zone"] = in_danger

            detections.append(detection)

    return detections


def analyze_frame(
    model: object,
    image: Image.Image,
    prompt_key: str = "scene",
) -> Optional[str]:
    """Run a single VLM prompt on an image.

    Args:
        model: Loaded Moondream VL model.
        image: PIL Image for analysis.
        prompt_key: Key from PROMPTS dict.

    Returns:
        VLM text response, or None on error.
    """
    prompt = PROMPTS.get(prompt_key, PROMPTS["scene"])

    try:
        encoded = model.encode_image(image)
        response = model.query(encoded, prompt)["answer"]
        return response
    except Exception:
        log.exception("vlm_inference_error", prompt=prompt_key)
        return None


def analyze_boom_scene(
    model: object,
    image: Image.Image,
) -> AnalysisResult:
    """Full boom camera analysis: scene caption + structured detections.

    Runs scene, material, personnel, and asset prompts sequentially.
    Extracts structured detections via keyword matching.

    Args:
        model: Loaded Moondream VL model.
        image: PIL Image from boom camera.

    Returns:
        AnalysisResult with caption and all detections.
    """
    start = time.monotonic()
    inference_id = uuid.uuid4().hex[:16]
    all_detections: List[Dict] = []

    # Scene caption (always run)
    caption = analyze_frame(model, image, "scene") or "Scene analysis unavailable."

    # Material detection
    material_text = analyze_frame(model, image, "material")
    if material_text:
        all_detections.extend(
            _extract_detections(material_text, MATERIAL_KEYWORDS, "material")
        )

    # Personnel detection
    personnel_text = analyze_frame(model, image, "personnel")
    if personnel_text:
        all_detections.extend(
            _extract_detections(personnel_text, PERSONNEL_KEYWORDS, "personnel")
        )

    # Asset detection
    asset_text = analyze_frame(model, image, "asset")
    if asset_text:
        all_detections.extend(
            _extract_detections(asset_text, ASSET_KEYWORDS, "asset")
        )

    elapsed_ms = (time.monotonic() - start) * 1000

    log.debug(
        "boom_analysis_complete",
        detections=len(all_detections),
        time_ms=round(elapsed_ms, 1),
    )

    return AnalysisResult(
        caption=caption,
        detections=all_detections,
        processing_time_ms=round(elapsed_ms, 1),
        inference_id=inference_id,
    )

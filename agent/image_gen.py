"""AI raster-visual generation for concept units.

Replaces the old hand-rolled inline-SVG visuals with real generated images. One
image is produced per Explanation / Analogy / Scenario; the human review gate then
decides which to keep, and can regenerate any of them with feedback.

Images travel through the pipeline + review gate as base64 data URLs, then are
persisted to files under public/ilm-images/<run_id>/ at publish time so the output
JSON stores a short URL instead of megabytes of base64.
"""
from __future__ import annotations

import base64
import io
import re

from . import config, llm

# The three places a unit can carry a visual. `kind` is one of these.
KIND_EXPLANATION = "explanation"
KIND_ANALOGY = "analogy"
KIND_SCENARIO = "scenario"

_STYLE = (
    "Clean, modern, flat vector-style educational illustration for a learning app. "
    "Friendly and uncluttered. "
    "TEXT MUST BE CRISP AND LEGIBLE: use AT MOST 3-5 very short labels (1-3 words each), "
    "in a LARGE, bold, high-contrast sans-serif, correctly spelled, with generous spacing. "
    "Do NOT render small, dense, blurry, distorted, or fake/gibberish text, and do NOT fill "
    "shapes with tiny paragraph lines — prefer simple icons over text wherever possible. "
    "Neutral light background that reads well on both light and dark UI. "
    "No borders, no watermark, no logos, no photorealism."
)

_FRAMING = {
    KIND_EXPLANATION: (
        "Illustrate the CONCEPT below so a beginner instantly sees what it is and how it "
        "works — show its parts / flow (input → what happens → result)."
    ),
    KIND_ANALOGY: (
        "Illustrate the EVERYDAY SCENE of this analogy and visually echo the mapping — "
        "depict the real-world objects and label how each maps to the concept."
    ),
    KIND_SCENARIO: (
        "Illustrate this concrete real-world EXAMPLE — its inputs, what happens, and the "
        "outcome — as a simple picture a learner would recognize."
    ),
}


def build_image_prompt(kind: str, title: str, text: str, *, feedback: str = "") -> str:
    framing = _FRAMING.get(kind, _FRAMING[KIND_EXPLANATION])
    parts = [
        _STYLE,
        framing,
        f'CONCEPT: "{title}".',
        f"TEXT TO ILLUSTRATE: {text.strip()}",
    ]
    if feedback.strip():
        # Reviewer's improvement note takes priority on a regeneration.
        parts.append(f"IMPORTANT REVISION INSTRUCTIONS (apply these): {feedback.strip()}")
    return "\n\n".join(parts)


_MIME_FOR = {"WEBP": "image/webp", "JPEG": "image/jpeg", "PNG": "image/png"}


def compress_data_url(data_url: str) -> str:
    """Downscale (to config.IMAGE_MAX_DIM on the longest side) and re-encode a
    base64 image data URL to config.IMAGE_FORMAT/quality, returning a smaller data
    URL. The model returns ~1MB PNGs; this typically cuts them to a few tens of KB.
    On any failure (or non-data-url input) the original value is returned so a
    compression hiccup never loses the image."""
    if not is_data_url(data_url):
        return data_url or ""
    try:
        from PIL import Image
    except Exception:
        return data_url  # Pillow missing → keep the original rather than fail
    m = _DATA_URL_RE.match(data_url)
    if not m:
        return data_url
    try:
        raw = base64.b64decode(m.group(2))
        img = Image.open(io.BytesIO(raw))
        fmt = config.IMAGE_FORMAT if config.IMAGE_FORMAT in _MIME_FOR else "WEBP"
        # JPEG has no alpha — flatten onto white so transparent PNGs don't go black.
        if fmt == "JPEG" and img.mode in ("RGBA", "LA", "P"):
            bg = Image.new("RGB", img.size, (255, 255, 255))
            rgba = img.convert("RGBA")
            bg.paste(rgba, mask=rgba.split()[-1])
            img = bg
        elif img.mode == "P":
            img = img.convert("RGBA")
        max_dim = max(1, config.IMAGE_MAX_DIM)
        if max(img.size) > max_dim:
            img.thumbnail((max_dim, max_dim), Image.LANCZOS)
        buf = io.BytesIO()
        save_kwargs = {"optimize": True}
        if fmt in ("WEBP", "JPEG"):
            save_kwargs["quality"] = config.IMAGE_QUALITY
        img.save(buf, format=fmt, **save_kwargs)
        out = base64.b64encode(buf.getvalue()).decode()
        # Only adopt the recompressed version if it's actually smaller.
        if len(out) < len(m.group(2)):
            return f"data:{_MIME_FOR[fmt]};base64,{out}"
        return data_url
    except Exception:
        return data_url


def generate_visual(kind: str, title: str, text: str, *, feedback: str = "") -> str:
    """Generate one illustration; returns a compressed data URL (or raises LLMError)."""
    raw = llm.generate_image(build_image_prompt(kind, title, text, feedback=feedback))
    return compress_data_url(raw)


_DATA_URL_RE = re.compile(r"^data:(image/[\w.+-]+);base64,(.*)$", re.DOTALL)
_EXT = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif"}


def is_data_url(value: str | None) -> bool:
    return bool(value) and value.startswith("data:image/")


def persist_data_url(data_url: str, run_id: str, name: str) -> str:
    """Decode a base64 image data URL to a file under public/ilm-images/<run_id>/
    and return its public URL path (e.g. /ilm-images/<run_id>/<name>.png).

    If `data_url` is not a data URL (already a path/URL, or empty) it is returned
    unchanged, so this is safe to call on every visual field.
    """
    if not is_data_url(data_url):
        return data_url or ""
    m = _DATA_URL_RE.match(data_url)
    if not m:
        return data_url
    mime, b64 = m.group(1), m.group(2)
    ext = _EXT.get(mime, "png")
    dest_dir = config.IMAGE_DIR / run_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    fname = f"{name}.{ext}"
    (dest_dir / fname).write_bytes(base64.b64decode(b64))
    return f"{config.IMAGE_URL_PREFIX}/{run_id}/{fname}"

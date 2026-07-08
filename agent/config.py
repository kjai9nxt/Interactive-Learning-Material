"""Central configuration: paths, models, API access.

Everything is overridable by environment (loaded from .env), so the same code
runs in dev, CI, and the eval harness without edits.
"""
from __future__ import annotations

import os
from pathlib import Path

# ── Paths ────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
_ENV_FILE = ROOT / ".env"

# Load .env: prefer python-dotenv, fall back to a tiny manual parser so the
# agent runs even if the package is missing.
try:
    from dotenv import load_dotenv
    load_dotenv(_ENV_FILE)
except Exception:  # pragma: no cover
    if _ENV_FILE.exists():
        for _line in _ENV_FILE.read_text().splitlines():
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _v = _line.split("=", 1)
                os.environ.setdefault(_k.strip(), _v.strip())
INPUT_DIR = ROOT / "input"
OUTPUT_DIR = ROOT / "output"
RUNS_DIR = ROOT / "runs"            # run traces (self-evolving loop fuel)
MEMORY_PATH = ROOT / "agent" / "memory_store.json"
EVAL_DIR = ROOT / "pre Requisites" / "eval sets"
# Where the React frontend reads the published units from.
FRONTEND_DATA = ROOT / "src" / "data" / "conceptUnits.json"
# Generated raster visuals are written here (served by Vite at /ilm-images/…) so
# conceptUnits.json stores a short URL, not a multi-MB base64 data URL. Gitignored.
PUBLIC_DIR = ROOT / "public"
IMAGE_DIR = PUBLIC_DIR / "ilm-images"
IMAGE_URL_PREFIX = "/ilm-images"

for _d in (OUTPUT_DIR, RUNS_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# ── Models / API ─────────────────────────────────────────────────────────
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

GEN_MODEL = os.environ.get("ILM_GEN_MODEL", "openai/gpt-4o")
JUDGE_MODEL = os.environ.get("ILM_JUDGE_MODEL", "openai/gpt-4o")
# Image-generation model (Skills 2/3 visuals). Must be an OpenRouter id that
# returns images via chat-completions modalities. Verified reachable on the
# project key: google/gemini-2.5-flash-image.
IMAGE_MODEL = os.environ.get("ILM_IMAGE_MODEL", "google/gemini-2.5-flash-image")
# Generated images come back as ~1MB PNGs. We downscale to a max dimension and
# re-encode as WebP so each visual is a few tens of KB instead. Tunable via env.
IMAGE_MAX_DIM = int(os.environ.get("ILM_IMAGE_MAX_DIM", "1024"))   # longest side, px
# Higher quality keeps small label text crisp (low quality blurs it). 90 ≈ still tiny.
IMAGE_QUALITY = int(os.environ.get("ILM_IMAGE_QUALITY", "90"))     # WebP quality 1-100
IMAGE_FORMAT = os.environ.get("ILM_IMAGE_FORMAT", "WEBP").upper()  # WEBP | JPEG | PNG

# ── Pipeline knobs ───────────────────────────────────────────────────────
# eval gate 2 auto-retry budget. 1 by default: surgical retries (regenerate only
# the flagged artifact) + early-stop on a stuck unit make a second retry rarely
# worth the wall-clock. Bump via ILM_MAX_RETRIES if you want more polishing passes.
MAX_RETRIES_PER_UNIT = int(os.environ.get("ILM_MAX_RETRIES", "1"))
REQUEST_TIMEOUT = int(os.environ.get("ILM_TIMEOUT", "90"))
# How many concepts to generate+audit concurrently. The old hard-coded cap of 5
# forced docs with >5 concepts into multiple serial waves (a 7-concept doc took
# ~2 waves ≈ 2× wall-clock). Concept work is IO-bound LLM calls, so a higher cap
# collapses most docs into a single wave. Override via env if you hit rate limits.
MAX_CONCEPT_WORKERS = int(os.environ.get("ILM_MAX_WORKERS", "12"))

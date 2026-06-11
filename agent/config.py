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

for _d in (OUTPUT_DIR, RUNS_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# ── Models / API ─────────────────────────────────────────────────────────
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

GEN_MODEL = os.environ.get("ILM_GEN_MODEL", "openai/gpt-4o")
JUDGE_MODEL = os.environ.get("ILM_JUDGE_MODEL", "openai/gpt-4o")

# ── Pipeline knobs ───────────────────────────────────────────────────────
MAX_RETRIES_PER_UNIT = int(os.environ.get("ILM_MAX_RETRIES", "2"))  # eval gate 2 auto-retry budget
REQUEST_TIMEOUT = int(os.environ.get("ILM_TIMEOUT", "90"))

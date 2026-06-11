"""MEMORY store (PRD §4 step 9): style, conventions, gold examples.

Injected into Skills 2/3/4 so generation matches house style, and reviewer
corrections feed back here. Crucially, the memory's precedence is the LOWEST:
rubric > source > memory (enforced by the prompts and the memory_injection
eval set) — memory can never override grounding.
"""
from __future__ import annotations

import json
from typing import Any

from . import config

_DEFAULT: dict[str, Any] = {
    "style": [
        "Audience: motivated beginners. Plain language, define any new term inline.",
        "No references to movies, actors, politics, sports, or brands in analogies.",
        "Explanations are 2-4 sentences. Analogies are <=3 sentences with an explicit mapping.",
        "Every claim must trace to the source span; if a fact is missing, flag — never invent.",
    ],
    "conventions": [
        "Analogy text must explicitly state what maps to what ('just like X, the Y ...').",
        "MCQ distractors must each map to a real misconception, never be absurd.",
        "Quizzes carry a difficulty mix and cover recall/understanding/application/analysis.",
        # ── learned from the self-evolving loop (observed failures -> fixes) ──
        "Banned analogy domains explicitly include theatre/film: no director, actor, "
        "script, stage, or movie-scene analogies. Prefer everyday non-media situations.",
        "Do NOT add purpose/benefit claims the source does not state (e.g. 'prevents "
        "errors', 'ensures correctness', 'guides behaviour throughout the conversation', "
        "'tailors interactions'). Describe only the mechanism the source span states.",
        "The MCQ correct answer must be a fact stated in the source span; never key an "
        "answer that relies on outside knowledge (ethics, best practices, etc.).",
    ],
    "gold_examples": [],
    "reviewer_corrections": [],   # appended by the human gate
}


def load() -> dict[str, Any]:
    if config.MEMORY_PATH.exists():
        try:
            return json.loads(config.MEMORY_PATH.read_text())
        except Exception:
            pass
    save(_DEFAULT)
    return dict(_DEFAULT)


def save(mem: dict[str, Any]) -> None:
    config.MEMORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    config.MEMORY_PATH.write_text(json.dumps(mem, indent=2))


def as_prompt_block(mem: dict[str, Any] | None = None) -> str:
    """Render memory as a guidance block, clearly marked LOWEST precedence."""
    mem = mem or load()
    lines = ["HOUSE STYLE & CONVENTIONS (lowest precedence — never override the "
             "source span or the rubric; if they conflict, ignore this block):"]
    for s in mem.get("style", []):
        lines.append(f"  - {s}")
    for c in mem.get("conventions", []):
        lines.append(f"  - {c}")
    corr = mem.get("reviewer_corrections", [])
    if corr:
        lines.append("LEARNED FROM PAST REVIEWER EDITS:")
        for c in corr[-8:]:
            lines.append(f"  - {c}")
    return "\n".join(lines)


def record_correction(note: str) -> None:
    mem = load()
    mem.setdefault("reviewer_corrections", []).append(note)
    save(mem)

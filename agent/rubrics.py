"""Rubric loader — sharp pass/fail definitions extracted from ILM Rubrics.xlsx.

Feeding the judge the EXACT rubric thresholds (not a generic "criterion
satisfied") is what makes grading consistent — this is the "eval-governed
generation" rigor from the PRD. Regenerate agent/rubrics.json from the xlsx if
the rubric changes.
"""
from __future__ import annotations

import json
from pathlib import Path

_PATH = Path(__file__).resolve().parent / "rubrics.json"
_RUBRICS = json.loads(_PATH.read_text()) if _PATH.exists() else {}

# eval-set file stem -> rubric sheet name
SET_TO_SHEET = {
    "analogy": "Analogy",
    "explanation": "Explanation",
    "example_scenarios": "Example Scenarios",
    "mini_quiz": "Mini Quiz",
    "concept_partition": "Concept Partition",
    "unit_level": "Unit-level",
}


def lookup(set_stem: str, rubric_case_id) -> dict | None:
    """Return {criterion, pass, fail} for a case, or None if not mapped."""
    sheet = SET_TO_SHEET.get(set_stem)
    if not sheet or rubric_case_id is None:
        return None
    try:
        key = str(float(rubric_case_id))
    except (TypeError, ValueError):
        key = str(rubric_case_id)
    return _RUBRICS.get(sheet, {}).get(key)

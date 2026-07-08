"""LOGGING (PRD non-negotiable #4): every run recorded — trace, eval scores,
reviewer edits. Logs feed the self-evolving loop, so failure paths MUST log a
record too (see logging_observability eval set), never silently skip.
"""
from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from typing import Any

from . import config


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class RunLogger:
    """Accumulates a structured trace for one pipeline run and appends it as a
    single JSON line to runs/runs.jsonl on close()."""

    def __init__(self, run_id: str, doc_path: str):
        self.path = config.RUNS_DIR / "runs.jsonl"
        self._lock = threading.Lock()  # units are generated concurrently
        self.trace: dict[str, Any] = {
            "run_id": run_id,
            "started_at": _now(),
            "doc": doc_path,
            "skills_invoked": [],
            "eval_scores": {},      # keys must match skills_invoked (LOG-01)
            "events": [],
            "units": [],
            "reviewer_edits": [],
        }

    def invoke(self, skill: str) -> None:
        with self._lock:
            if skill not in self.trace["skills_invoked"]:
                self.trace["skills_invoked"].append(skill)

    def score(self, skill: str, value: float) -> None:
        with self._lock:
            self.trace["eval_scores"][skill] = value

    def event(self, kind: str, **data: Any) -> None:
        with self._lock:
            self.trace["events"].append({"at": _now(), "kind": kind, **data})

    def unit_result(self, unit_id: str, **data: Any) -> None:
        with self._lock:
            self.trace["units"].append({"unit_id": unit_id, **data})

    def reviewer_edit(self, unit_id: str, note: str) -> None:
        with self._lock:
            self.trace["reviewer_edits"].append({"unit_id": unit_id, "note": note})

    def close(self, status: str) -> dict[str, Any]:
        self.trace["status"] = status
        self.trace["ended_at"] = _now()
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(self.trace) + "\n")
        return self.trace

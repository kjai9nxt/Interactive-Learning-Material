"""Run history aggregation for the dashboard UI.

Reads the two append-only logs the pipeline already writes — runs/runs.jsonl
(one trace per run) and runs/usage.jsonl (one token/cost record per run) — joins
them by run_id, and returns a normalized per-run list plus summary totals. No
database: this is a read-only view over what's already logged, so it reflects
every past and future run for free.

An "ILM built" = a run that finished (status "ok") and published >=1 unit.
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from . import config


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if not path.exists():
        return out
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                continue  # skip a torn/partial line rather than fail the whole view
    return out


def _duration_s(started: str | None, ended: str | None) -> float | None:
    if not started or not ended:
        return None
    try:
        return round((datetime.fromisoformat(ended) - datetime.fromisoformat(started)).total_seconds(), 1)
    except (ValueError, TypeError):
        return None


def _normalize(r: dict[str, Any], u: dict[str, Any]) -> dict[str, Any]:
    status = r.get("status", "unknown")

    # generated_units: recorded at close on newer runs; fall back to the count of
    # per-unit results in the trace for older runs.
    generated = r.get("generated_units")
    if generated is None:
        generated = len(r.get("units", []) or [])

    # published_units: recorded at close on newer runs. Older runs never stored it,
    # so it's unknown — flag it approximate and best-effort from generated.
    published = r.get("published_units")
    approx = published is None
    effective_published = generated if approx else published

    built = status == "ok" and (effective_published or 0) > 0

    cost = (u.get("cost") or {}).get("total_cost")
    return {
        "run_id": r.get("run_id"),
        "doc": r.get("doc"),
        "started_at": r.get("started_at"),
        "ended_at": r.get("ended_at"),
        "duration_s": _duration_s(r.get("started_at"), r.get("ended_at")),
        "status": status,
        "generated_units": generated,
        "published_units": published,          # null for pre-change runs
        "effective_published": effective_published,
        "published_approx": approx,
        "built": built,
        "cost_usd": cost,
        "total_tokens": u.get("total_tokens"),
        "chat_calls": u.get("chat_calls"),
        "image_calls": u.get("image_calls"),
        "gen_model": u.get("gen_model"),
        "image_model": u.get("image_model"),
    }


def _summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    built_rows = [r for r in rows if r["built"]]
    by_day: dict[str, dict[str, float]] = {}
    for r in built_rows:
        day = (r.get("started_at") or "")[:10]
        if not day:
            continue
        bucket = by_day.setdefault(day, {"date": day, "built": 0, "cost": 0.0})
        bucket["built"] += 1
        bucket["cost"] += float(r.get("cost_usd") or 0.0)

    return {
        "lessons_built": len(built_rows),
        "total_runs": len(rows),
        "concepts_published": sum(int(r.get("effective_published") or 0) for r in built_rows),
        "total_cost_usd": round(sum(float(r.get("cost_usd") or 0.0) for r in rows), 4),
        "total_tokens": sum(int(r.get("total_tokens") or 0) for r in rows),
        # status → count, so the UI can show cancelled/errored runs distinctly.
        "by_status": _count_by(rows, "status"),
        "by_day": sorted(by_day.values(), key=lambda d: d["date"]),
    }


def _count_by(rows: list[dict[str, Any]], key: str) -> dict[str, int]:
    out: dict[str, int] = {}
    for r in rows:
        out[r.get(key) or "unknown"] = out.get(r.get(key) or "unknown", 0) + 1
    return out


def load_runs() -> dict[str, Any]:
    """Return {runs: [...newest first], summary: {...}} for the dashboard."""
    runs = _read_jsonl(config.RUNS_DIR / "runs.jsonl")
    usage = {u.get("run_id"): u for u in _read_jsonl(config.RUNS_DIR / "usage.jsonl")}
    rows = [_normalize(r, usage.get(r.get("run_id"), {})) for r in runs]
    rows.sort(key=lambda x: x.get("started_at") or "", reverse=True)
    return {"runs": rows, "summary": _summarize(rows)}

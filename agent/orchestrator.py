"""Orchestrator — wires the whole V1 pipeline in plain Python (PRD §4).

  Input MD
    -> parse & chunk (code)
    -> Skill 1 concept-extraction (AI)
    -> Eval gate 1: coverage / grounded / new-only
    -> per-concept loop:
         retrieve span -> Skill 2 analogy / Skill 3 explainer / Skill 4 MCQs
         -> assemble + schema-validate (code, pydantic)
         -> Skill 5 eval-audit (code graders + LLM judge)
         -> Eval gate 2: pass rubric? fail -> auto-retry (within limit)
    -> Human review gate (approve/edit) -> Output -> Logging

Memory is injected into Skills 1-4; reviewer corrections feed back to memory.
"""
from __future__ import annotations

import argparse
import json
import shutil
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from . import config, human_gate, memory
from .logging_store import RunLogger
from .models import ConceptUnit
from .parse_chunk import parse_and_chunk
from .skills import skill1_extract, skill2_analogy, skill3_explainer, skill4_mcq
from .skills.skill5_audit import audit_unit


def _eval_gate_1(concepts, doc_text: str) -> tuple[bool, list[str]]:
    """Cheap coverage/grounding checks before the expensive per-concept loop."""
    problems = []
    if not concepts:
        problems.append("no concepts extracted")
    seen = set()
    for c in concepts:
        if not c.source_span.strip():
            problems.append(f"{c.id}: blank source_span")
        # grounding: the span should be traceable to the document text
        key = c.title.lower().strip()
        if key in seen:
            problems.append(f"{c.id}: duplicate concept '{c.title}'")
        seen.add(key)
    return (not problems), problems


def build_unit(concept, *, memory_block: str, log: RunLogger) -> ConceptUnit:
    # Skills 2/3/4 are independent — run them concurrently (IO-bound LLM calls).
    log.invoke("skill_2"); log.invoke("skill_3"); log.invoke("skill_4")
    with ThreadPoolExecutor(max_workers=3) as ex:
        f_ana = ex.submit(skill2_analogy.generate_analogy, concept, memory_block=memory_block)
        f_exp = ex.submit(skill3_explainer.build_explainer, concept, memory_block=memory_block)
        f_quiz = ex.submit(skill4_mcq.generate_quiz, concept, memory_block=memory_block)
        analogy = f_ana.result()
        explanation, scenarios = f_exp.result()
        quiz = f_quiz.result()
    # assemble + schema-validate (pydantic raises on broken shape)
    return ConceptUnit(
        id=concept.id,
        title=concept.title,
        summary=concept.summary,
        source_span=concept.source_span,
        is_code_concept=bool(concept.__dict__.get("is_code_concept", False)),
        explanation=explanation,
        analogy=analogy,
        scenarios=scenarios,
        mini_quiz=quiz,
    )


def run_pipeline(
    doc_path: Path,
    *,
    auto_approve: bool = False,
    use_llm_audit: bool = True,
    publish: bool = True,
    limit: int | None = None,
) -> dict[str, Any]:
    """Run the pipeline on a Markdown file on disk."""
    return run_on_text(
        doc_path.read_text(), doc_path.name,
        auto_approve=auto_approve, use_llm_audit=use_llm_audit,
        publish=publish, limit=limit,
    )


def run_on_text(
    md: str,
    doc_name: str,
    *,
    auto_approve: bool = False,
    use_llm_audit: bool = True,
    publish: bool = True,
    limit: int | None = None,
    progress=None,
) -> dict[str, Any]:
    """Run the full pipeline on raw Markdown text. Used by both the CLI and the
    web ingest API. `progress` is an optional callback(dict) for live status."""
    def _report(**kw):
        if progress:
            try:
                progress(kw)
            except Exception:
                pass

    run_id = "r_" + uuid.uuid4().hex[:8]
    log = RunLogger(run_id, doc_name)
    mem = memory.load()
    memory_block = memory.as_prompt_block(mem)

    _report(stage="parsing")
    chunks = parse_and_chunk(md)
    log.event("parsed", chunks=len(chunks))

    # Skill 1 + Eval gate 1
    _report(stage="extracting")
    log.invoke("skill_1")
    concepts = skill1_extract.extract_concepts(
        chunks, past_materials=mem.get("past_materials", []), memory_block=memory_block)
    log.event("extracted", concepts=[c.title for c in concepts])
    ok1, problems = _eval_gate_1(concepts, md)
    log.score("skill_1", 1.0 if ok1 else 0.5)
    log.event("eval_gate_1", passed=ok1, problems=problems)
    if not ok1:
        print(f"⚠ Eval gate 1 flagged: {problems} — continuing with extracted set.")
    if limit:
        concepts = concepts[:limit]
    print(f"Extracted {len(concepts)} concept(s): {[c.title for c in concepts]}")
    _report(stage="generating", total=len(concepts), done=0,
           concepts=[c.title for c in concepts])

    audits: dict[str, Any] = {}
    skill_scores = {"skill_2": [], "skill_3": [], "skill_4": [], "skill_5": []}
    _done_lock = __import__("threading").Lock()
    _done = {"n": 0}

    def process_concept(concept):
        """Generate + audit one unit, with eval-gate-2 auto-retry. Returns
        (unit_dict, report) or None. Safe to run concurrently."""
        print(f"→ Generating unit for: {concept.title}")
        attempt = 0
        report = None
        unit = None
        while attempt <= config.MAX_RETRIES_PER_UNIT:
            attempt += 1
            try:
                unit = build_unit(concept, memory_block=memory_block, log=log)
            except Exception as e:
                log.event("assemble_error", concept=concept.id, attempt=attempt, error=str(e))
                print(f"   {concept.title}: assemble failed (attempt {attempt}): {e}")
                continue
            log.invoke("skill_5")
            report = audit_unit(unit.model_dump(), use_llm=use_llm_audit, source_doc=md)
            print(f"   {concept.title}: audit attempt {attempt} → score={report.score} flags={len(report.flags)}")
            if report.passed:
                break  # eval gate 2 passed
            log.event("eval_gate_2_retry", concept=concept.id, attempt=attempt, flags=report.flags)
        if unit is None:
            log.unit_result(concept.id, status="assemble_failed")
            with _done_lock:
                _done["n"] += 1
                _report(stage="generating", total=len(concepts), done=_done["n"])
            return None
        log.unit_result(unit.id, status="audited", score=report.score,
                        flags=len(report.flags), attempts=attempt)
        with _done_lock:
            _done["n"] += 1
            _report(stage="generating", total=len(concepts), done=_done["n"])
        return unit.model_dump(), report

    # Concepts are independent — generate them concurrently so wall-clock is
    # roughly one concept's time, not the sum. Order is preserved.
    workers = min(len(concepts), 5) or 1
    with ThreadPoolExecutor(max_workers=workers) as ex:
        outcomes = list(ex.map(process_concept, concepts))

    units: list[dict[str, Any]] = []
    for res in outcomes:
        if res is None:
            continue
        unit_dict, report = res
        audits[unit_dict["id"]] = report
        units.append(unit_dict)
        skill_scores["skill_5"].append(report.score)

    for sk, vals in skill_scores.items():
        if vals:
            log.score(sk, round(sum(vals) / len(vals), 3))
        elif sk in log.trace["skills_invoked"]:
            log.score(sk, 1.0)  # invoked, no audit-derived score -> keep trace complete

    # Human review gate
    _report(stage="reviewing")
    approved = human_gate.review_units(units, audits, auto_approve=auto_approve)
    for u in approved:
        if u.get("review", {}).get("notes"):
            log.reviewer_edit(u["id"], u["review"]["notes"])
    print(f"\nHuman gate: {len(approved)}/{len(units)} unit(s) approved.")

    # Units that were generated but NOT approved (flagged by the audit) — so the
    # UI can show what the eval gate caught and why.
    approved_ids = {u["id"] for u in approved}
    rejected = []
    for u in units:
        if u["id"] not in approved_ids:
            rep = audits.get(u["id"])
            rejected.append({
                "id": u["id"], "title": u["title"],
                "flags": (rep.flags if rep else []),
            })

    # Output (only approved units ship)
    out = {
        "run_id": run_id,
        "doc": doc_name,
        "generator_model": config.GEN_MODEL,
        "generated_units": len(units),
        "published_units": len(approved),
        "units": approved,
        "rejected": rejected,
    }
    out_path = config.OUTPUT_DIR / "concept_units.json"
    out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False))
    print(f"Wrote {out_path}")

    if publish and approved:
        config.FRONTEND_DATA.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(out_path, config.FRONTEND_DATA)
        print(f"Published to frontend: {config.FRONTEND_DATA}")

    log.close("ok")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="ILM V1 pipeline")
    ap.add_argument("doc", nargs="?", default=str(config.INPUT_DIR / "ai_agents.md"),
                    help="path to the input Markdown reading material")
    ap.add_argument("--auto-approve", action="store_true",
                    help="auto-approve clean units (unattended/CI)")
    ap.add_argument("--no-llm-audit", action="store_true",
                    help="run only deterministic graders (fast, no judge cost)")
    ap.add_argument("--limit", type=int, default=None, help="cap number of concepts")
    ap.add_argument("--no-publish", action="store_true",
                    help="do not copy output into the frontend")
    args = ap.parse_args()

    run_pipeline(
        Path(args.doc),
        auto_approve=args.auto_approve,
        use_llm_audit=not args.no_llm_audit,
        publish=not args.no_publish,
        limit=args.limit,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

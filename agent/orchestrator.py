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


# Which generation skill owns each audit criterion — lets a retry regenerate ONLY
# the artifact that failed instead of rebuilding the whole unit. skill_3 owns both
# the explanation and the scenarios (it emits them together).
_ALL_SKILLS = {"analogy", "explanation", "quiz"}


def _skills_for_flags(flags) -> set[str]:
    """Map audit flags → the skills that must be re-run. Any flag we can't map
    confidently (e.g. a code-grader on an unusual criterion) forces a full rebuild,
    so we never silently skip regenerating something that's actually broken."""
    skills: set[str] = set()
    for f in flags:
        c = (f.get("criterion") or "").lower()
        if "analogy" in c:
            skills.add("analogy")
        elif "quiz" in c or "mcq" in c:
            skills.add("quiz")
        elif "explanation" in c:
            skills.add("explanation")
        else:
            return set(_ALL_SKILLS)  # unknown criterion → safe full rebuild
    return skills or set(_ALL_SKILLS)


def build_unit(concept, *, memory_block: str, log: RunLogger,
               prev: ConceptUnit | None = None, only: set[str] | None = None) -> ConceptUnit:
    """Build (or selectively rebuild) one unit. `only` names the skills to (re)run;
    everything else is carried over from `prev`. On the first attempt `only` is
    None → full build. On a retry we pass just the flagged skill(s), so a single
    failed artifact no longer forces regenerating + re-judging the whole unit."""
    run = only if only is not None else _ALL_SKILLS
    # Carry over the parts we're NOT regenerating from the previous attempt.
    analogy = prev.analogy if prev else None
    explanation = prev.explanation if prev else None
    scenarios = prev.scenarios if prev else None
    quiz = prev.mini_quiz if prev else None

    # Selected skills are independent — run them concurrently (IO-bound LLM calls).
    with ThreadPoolExecutor(max_workers=3) as ex:
        futures = {}
        if "analogy" in run:
            log.invoke("skill_2")
            futures["ana"] = ex.submit(skill2_analogy.generate_analogy, concept, memory_block=memory_block)
        if "explanation" in run:
            log.invoke("skill_3")
            futures["exp"] = ex.submit(skill3_explainer.build_explainer, concept, memory_block=memory_block)
        if "quiz" in run:
            log.invoke("skill_4")
            futures["quiz"] = ex.submit(skill4_mcq.generate_quiz, concept, memory_block=memory_block)
        if "ana" in futures:
            analogy = futures["ana"].result()
        if "exp" in futures:
            explanation, scenarios = futures["exp"].result()
        if "quiz" in futures:
            quiz = futures["quiz"].result()

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
        prev_flag_sig = None
        while attempt <= config.MAX_RETRIES_PER_UNIT:
            attempt += 1
            # First attempt: full build. Retry: regenerate ONLY the flagged
            # skill(s), carrying the passing artifacts over from the last attempt.
            only = None if (attempt == 1 or report is None) else _skills_for_flags(report.flags)
            try:
                unit = build_unit(concept, memory_block=memory_block, log=log, prev=unit, only=only)
            except Exception as e:
                log.event("assemble_error", concept=concept.id, attempt=attempt, error=str(e))
                print(f"   {concept.title}: assemble failed (attempt {attempt}): {e}")
                continue
            log.invoke("skill_5")
            report = audit_unit(unit.model_dump(), use_llm=use_llm_audit, source_doc=md)
            print(f"   {concept.title}: audit attempt {attempt} → score={report.score} flags={len(report.flags)}")
            if report.passed:
                break  # eval gate 2 passed
            # Early-stop: if a retry produced the SAME set of failing criteria, the
            # model is stuck (usually an inference the source genuinely doesn't
            # support) — more retries just burn time. Ship it flagged instead.
            flag_sig = tuple(sorted((f.get("source", ""), f.get("criterion", "")) for f in report.flags))
            if flag_sig == prev_flag_sig:
                log.event("eval_gate_2_stuck", concept=concept.id, attempt=attempt, flags=report.flags)
                print(f"   {concept.title}: same flags as last attempt — stopping retries early.")
                break
            prev_flag_sig = flag_sig
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
    workers = min(len(concepts), config.MAX_CONCEPT_WORKERS) or 1
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

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

from . import config, human_gate, image_gen, llm, memory
from .logging_store import RunLogger
from .models import Concept, ConceptUnit
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
               prev: ConceptUnit | None = None, only: set[str] | None = None,
               reviewer_feedback: str = "") -> ConceptUnit:
    """Build (or selectively rebuild) one unit. `only` names the skills to (re)run;
    everything else is carried over from `prev`. On the first attempt `only` is
    None → full build. On a retry we pass just the flagged skill(s), so a single
    failed artifact no longer forces regenerating + re-judging the whole unit.
    `reviewer_feedback` (set when a human asks to regenerate the unit at the gate)
    is passed to each skill as a high-priority override of its defaults."""
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
            futures["ana"] = ex.submit(skill2_analogy.generate_analogy, concept,
                                       memory_block=memory_block, reviewer_feedback=reviewer_feedback)
        if "explanation" in run:
            log.invoke("skill_3")
            futures["exp"] = ex.submit(skill3_explainer.build_explainer, concept,
                                       memory_block=memory_block, reviewer_feedback=reviewer_feedback)
        if "quiz" in run:
            log.invoke("skill_4")
            futures["quiz"] = ex.submit(skill4_mcq.generate_quiz, concept,
                                        memory_block=memory_block, reviewer_feedback=reviewer_feedback)
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
        doc_path.read_text(encoding="utf-8"), doc_path.name,
        auto_approve=auto_approve, use_llm_audit=use_llm_audit,
        publish=publish, limit=limit,
    )


def _concepts_from_edits(edited: list[dict[str, Any]]) -> list[Concept]:
    """Rebuild Concept objects from the human-edited partition (rename / merge /
    delete happened in the browser). Blank spans are dropped so the grounding
    invariant holds; is_code_concept is carried on the side like skill1 does."""
    out: list[Concept] = []
    seen: set[str] = set()
    for i, c in enumerate(edited):
        span = (c.get("source_span") or "").strip()
        title = (c.get("title") or "").strip()
        if not span or not title:
            continue
        cid = str(c.get("id") or f"c{i+1}")
        while cid in seen:
            cid += "_"
        seen.add(cid)
        con = Concept(id=cid, title=title,
                      summary=(c.get("summary") or "").strip() or title,
                      source_span=span)
        con.__dict__["is_code_concept"] = bool(c.get("is_code_concept"))
        out.append(con)
    return out


def _apply_image_decision(unit: dict[str, Any], images: dict[str, Any]) -> None:
    """Apply the reviewer's per-image keep/drop/regenerate choice to a unit dict.

    `images` shape: {"explanation": <url|"">, "analogy": <url|"">,
                     "scenarios": [<url|"">, ...]}. An empty string means the
    reviewer DROPPED that visual; a non-empty value is the image to keep (possibly
    a freshly regenerated data URL). Missing keys leave the existing image intact."""
    if not images:
        return
    if "explanation" in images:
        unit.get("explanation", {})["visual_image"] = images.get("explanation") or ""
    if "analogy" in images:
        unit.get("analogy", {})["visual_image"] = images.get("analogy") or ""
    if "scenarios" in images:
        scn = images.get("scenarios") or []
        for i, s in enumerate(unit.get("scenarios", [])):
            if i < len(scn):
                s["visual_image"] = scn[i] or ""


def _persist_unit_images(unit: dict[str, Any], run_id: str) -> None:
    """Convert any in-memory base64 image (data URL) on the unit to a file under
    public/ilm-images/<run_id>/ and replace the field with its short URL, so the
    published JSON never carries megabytes of base64. Idempotent."""
    uid = unit.get("id", "u")
    exp = unit.get("explanation") or {}
    if exp.get("visual_image"):
        exp["visual_image"] = image_gen.persist_data_url(exp["visual_image"], run_id, f"{uid}-explanation")
    ana = unit.get("analogy") or {}
    if ana.get("visual_image"):
        ana["visual_image"] = image_gen.persist_data_url(ana["visual_image"], run_id, f"{uid}-analogy")
    for i, s in enumerate(unit.get("scenarios") or []):
        if s.get("visual_image"):
            s["visual_image"] = image_gen.persist_data_url(s["visual_image"], run_id, f"{uid}-scenario{i+1}")


def unit_display(u: dict[str, Any], rep=None) -> dict[str, Any]:
    """The per-unit shape the review gate + regenerate endpoints send to the browser
    (text + illustrations + audit summary). Shared so the gate payload and an
    in-place part-regeneration return identical shapes."""
    return {
        "id": u["id"], "title": u["title"],
        "explanation": u["explanation"]["text"],
        "analogy": u["analogy"]["text"],
        "explanation_image": u["explanation"].get("visual_image", ""),
        "analogy_image": u["analogy"].get("visual_image", ""),
        "scenarios": [{"text": s.get("text", ""), "image": s.get("visual_image", "")}
                      for s in u.get("scenarios", [])],
        "quiz_count": len(u.get("mini_quiz", {}).get("questions", [])),
        "clean": (rep is None) or rep.passed,
        "flags": [{"criterion": f["criterion"], "reason": f["reason"]}
                  for f in (rep.flags if rep else [])],
        # Hidden fields so the unit's parts can be regenerated in place.
        "summary": u.get("summary", ""),
        "source_span": u.get("source_span", ""),
        "is_code_concept": bool(u.get("is_code_concept", False)),
    }


def _concept_from_unit(u: dict[str, Any]) -> Concept:
    title = (u.get("title") or "").strip() or "Concept"
    con = Concept(
        id=str(u.get("id") or "u"),
        title=title,
        summary=(u.get("summary") or "").strip() or title,
        source_span=(u.get("source_span") or "").strip() or title,
    )
    con.__dict__["is_code_concept"] = bool(u.get("is_code_concept"))
    return con


def regenerate_part(unit: dict[str, Any], *, part: str, feedback: str = "",
                    scenario_index: int | None = None, op: str = "regenerate") -> None:
    """Regenerate ONE part of a unit IN PLACE (mutates `unit`). Only the named part
    hits the LLM — nothing else in the unit is touched. Regenerating a text part
    also refreshes that part's illustration so they stay consistent.

    part: "analogy" | "explanation" | "quiz" | "scenario"
    For "scenario": op="regenerate" (rebuild scenario_index) | "remove" (drop it) |
    "add" (append a new one)."""
    concept = _concept_from_unit(unit)
    memory_block = memory.as_prompt_block(memory.load())
    fb = (feedback or "").strip()
    # Learn the feedback for next run too (skip pure removals — no direction there).
    if fb and not (part == "scenario" and op == "remove"):
        memory.record_correction(fb, stage=f"{unit.get('title','unit')}:{part}")

    if part == "analogy":
        unit["analogy"] = skill2_analogy.generate_analogy(
            concept, memory_block=memory_block, reviewer_feedback=fb).model_dump()
    elif part == "explanation":
        exp, _ = skill3_explainer.build_explainer(
            concept, memory_block=memory_block, reviewer_feedback=fb, include_scenarios=False)
        unit["explanation"] = exp.model_dump()
    elif part == "quiz":
        unit["mini_quiz"] = skill4_mcq.generate_quiz(
            concept, memory_block=memory_block, reviewer_feedback=fb).model_dump()
    elif part == "scenario":
        scenarios = unit.setdefault("scenarios", [])
        if op == "remove":
            if scenario_index is not None and 0 <= scenario_index < len(scenarios):
                scenarios.pop(scenario_index)
        else:  # regenerate an existing one, or add a new one
            avoid = [s.get("text", "") for i, s in enumerate(scenarios) if i != scenario_index]
            new_scn = skill3_explainer.generate_one_scenario(
                concept, feedback=fb, avoid=avoid, memory_block=memory_block).model_dump()
            if op == "add" or scenario_index is None or scenario_index >= len(scenarios):
                scenarios.append(new_scn)
            else:
                scenarios[scenario_index] = new_scn
    else:
        raise ValueError(f"unknown part: {part}")


def run_on_text(
    md: str,
    doc_name: str,
    *,
    auto_approve: bool = False,
    use_llm_audit: bool = True,
    publish: bool = True,
    limit: int | None = None,
    progress=None,
    gate=None,
    units_sink=None,
) -> dict[str, Any]:
    """Run the full pipeline on raw Markdown text. Used by both the CLI and the
    web ingest API. `progress` is an optional callback(dict) for live status.

    `gate` is an optional blocking callback(kind: str, payload: dict) -> dict that
    implements human-in-the-loop review in the web UI: the pipeline pauses, the
    frontend shows the payload, and the returned decision drives what happens next.
    Two gates fire: "partition" (approve/edit/merge/re-extract the concept split
    before any generation) and "units" (approve/reject + feedback per built unit).
    When `gate` is None the old behavior stands (CLI human_gate / --auto-approve)."""
    def _report(**kw):
        if progress:
            try:
                progress(kw)
            except Exception:
                pass

    run_id = "r_" + uuid.uuid4().hex[:8]
    log = RunLogger(run_id, doc_name)
    llm.reset_usage()  # per-run token/image accounting (see runs/usage.jsonl)
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

    # ── Human gate 1: concept-partition approval ────────────────────────────
    # Before spending any generation budget, let the human approve/edit/merge the
    # split (or reject with feedback → re-extract). Rejection feedback is recorded
    # to memory so FUTURE runs partition better on their own.
    if gate is not None:
        while True:
            payload = {"concepts": [
                {"id": c.id, "title": c.title, "summary": c.summary,
                 "source_span": c.source_span,
                 "is_code_concept": bool(c.__dict__.get("is_code_concept", False))}
                for c in concepts
            ]}
            decision = gate("partition", payload) or {}
            feedback = (decision.get("feedback") or "").strip()
            if feedback:
                memory.record_correction(feedback, stage="partition")
            if decision.get("action") == "revise":
                # Re-extract with the reviewer's feedback applied (and refreshed
                # memory, so any just-recorded lesson is in the prompt).
                mem = memory.load()
                memory_block = memory.as_prompt_block(mem)
                _report(stage="extracting")
                log.invoke("skill_1")
                concepts = skill1_extract.extract_concepts(
                    chunks, past_materials=mem.get("past_materials", []),
                    memory_block=memory_block, reviewer_feedback=feedback)
                if limit:
                    concepts = concepts[:limit]
                log.event("partition_reextracted", concepts=[c.title for c in concepts])
                continue
            # approve — use the (possibly) edited/merged concept list from the UI
            edited = decision.get("concepts")
            if edited:
                rebuilt = _concepts_from_edits(edited)
                if rebuilt:
                    concepts = rebuilt
            log.event("partition_approved", concepts=[c.title for c in concepts])
            break
        # Corrections recorded above are now live for the generation skills too.
        mem = memory.load()
        memory_block = memory.as_prompt_block(mem)

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

    # ── Human gate 2: per-unit review + per-PART in-place regeneration ────────
    _report(stage="reviewing")
    if gate is not None:
        def _clean(u):
            rep = audits.get(u["id"])
            return rep is None or rep.passed

        # Expose the live unit dicts to the /api/regenerate-part endpoint, which
        # mutates a single part of one unit IN PLACE (same objects we hold here, so
        # the mutations are already applied when the reviewer clicks Publish). It
        # records which units changed so we re-audit only those.
        changed_ids: set[str] = set()
        if units_sink is not None:
            units_sink({"units": units, "changed": changed_ids,
                        "lock": __import__("threading").Lock()})

        payload = {"units": [unit_display(u, audits.get(u["id"])) for u in units]}
        decision = gate("units", payload) or {}
        reviews = decision.get("reviews", {}) or {}

        # Re-audit any unit whose parts were regenerated at the gate, so published
        # units carry an accurate audit (the endpoint itself does not audit).
        for uid in list(changed_ids):
            u = next((x for x in units if x["id"] == uid), None)
            if u is not None:
                log.invoke("skill_5")
                audits[uid] = audit_unit(u, use_llm=use_llm_audit, source_doc=md)
                log.event("unit_part_regenerated", concept=uid)

        approved = []
        for u in units:
            r = reviews.get(u["id"], {}) or {}
            status = r.get("status") or ("approved" if _clean(u) else "rejected")
            note = (r.get("note") or "").strip()
            if note:
                # Unit-level note becomes a learned rule for the next run.
                memory.record_correction(note, stage=f"unit:{u['title']}")
            # Apply the reviewer's per-image keep/drop choices to the live unit.
            _apply_image_decision(u, r.get("images") or {})
            u["review"] = {"status": status, "reviewer": "web-human",
                           "notes": note or None}
            if status == "approved":
                approved.append(u)
    else:
        approved = human_gate.review_units(units, audits, auto_approve=auto_approve)

    # Persist every kept image to a file so the published JSON stays small (works
    # for the web-gate, CLI, and --auto-approve paths alike).
    for u in approved:
        _persist_unit_images(u, run_id)
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

    # Per-run token / image usage (for the harness + cost visibility).
    usage = llm.usage_snapshot()
    usage_line = {"run_id": run_id, "at": __import__("datetime").datetime.now(
        __import__("datetime").timezone.utc).isoformat(), "doc": doc_name,
        "gen_model": config.GEN_MODEL, "image_model": config.IMAGE_MODEL, **usage}
    with (config.RUNS_DIR / "usage.jsonl").open("a", encoding="utf-8") as f:
        f.write(json.dumps(usage_line) + "\n")
    log.event("usage", **usage)
    print(f"Usage: {usage['total_tokens']} tokens · {usage['chat_calls']} chat + "
          f"{usage['image_calls']} image call(s)")

    # Output (only approved units ship)
    out = {
        "run_id": run_id,
        "doc": doc_name,
        "generator_model": config.GEN_MODEL,
        "image_model": config.IMAGE_MODEL,
        "usage": usage,
        "generated_units": len(units),
        "published_units": len(approved),
        "units": approved,
        "rejected": rejected,
    }
    out_path = config.OUTPUT_DIR / "concept_units.json"
    out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
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

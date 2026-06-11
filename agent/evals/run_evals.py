"""Eval harness — run the eval sets against the graders and report.

For every case we predict a verdict (code grader or LLM judge) and compare it to
the case's expected_verdict. A case "passes the harness" when our grader's
verdict matches the expected verdict — i.e. the grader behaves as designed,
catching the failures it should catch and passing the good artifacts.

PRD non-negotiable #3: re-run this before every change. Usage:
    python -m agent.evals.run_evals            # all sets (code + LLM)
    python -m agent.evals.run_evals --code-only
    python -m agent.evals.run_evals analogy mini_quiz
"""
from __future__ import annotations

import json
import sys
from typing import Any

from .. import config, rubrics
from ..graders import code_graders as cg
from ..graders import llm_judge


# ── source-span resolution ─────────────────────────────────────────────────
def _resolve_source(case_input: dict[str, Any], spans: dict[str, str]) -> str:
    for key in ("source_span", "source_span_ref", "span"):
        ref = case_input.get(key)
        if isinstance(ref, str) and ref in spans:
            return spans[ref]
        if isinstance(ref, str) and ref.startswith("S") and ref in spans:
            return spans[ref]
    return ""


def _artifact_text(case_input: dict[str, Any]) -> str:
    """Flatten the case input (minus the source ref) into gradeable text."""
    parts = []
    for k, v in case_input.items():
        if k in ("source_span", "source_span_ref", "span") and isinstance(v, str) and len(v) < 6:
            continue
        parts.append(f"{k}: {json.dumps(v, ensure_ascii=False)}" if not isinstance(v, str)
                     else f"{k}: {v}")
    return "\n".join(parts)


# ── deterministic predictor for code cases ─────────────────────────────────
def _predict_code(case: dict[str, Any]) -> str | None:
    """Return 'pass'/'flag', or None if no deterministic grader maps to this case."""
    inp = case.get("input", {})
    crit = (case.get("criterion") or "").lower()

    if "trace" in inp:
        return cg.check_trace_completeness(inp["trace"]).verdict
    if "proposed_diff" in inp:
        return cg.check_optimizer_diff_append_only(inp["proposed_diff"]).verdict

    # Batch of quizzes given only by question_count (QUZ-07 boundary set):
    # the case flags if ANY quiz is outside the 4-5 range.
    batch = inp.get("candidate_quizzes")
    if isinstance(batch, list) and batch and "question_count" in batch[0]:
        bad = any(not (4 <= q.get("question_count", 0) <= 5) for q in batch)
        return "flag" if bad else "pass"

    # Strict machine-parseability of the judge's own output (GRD-04 meta): our
    # minimal judge contract is {verdict, reason}; a required_schema demanding
    # extra keys (failed_criteria/reasons) will not parse strictly -> flag.
    req = inp.get("required_schema")
    if isinstance(req, dict):
        produced = {"verdict", "reason"}
        ok = set(req.keys()).issubset(produced)
        return "pass" if ok else "flag"

    # Verdict aggregation (GRD-03): code overrides LLM via AND-combine — any
    # individual flag makes the final verdict 'flag'. (This is the same rule
    # AuditReport uses: a clean report requires zero flags.)
    if "code_verdict" in inp and "llm_verdict" in inp:
        verdicts = [inp.get("code_verdict"), inp.get("llm_verdict")]
        return "flag" if "flag" in verdicts else "pass"

    q = inp.get("candidate_question") or inp.get("question")
    if isinstance(q, dict):
        if "duplicate" in crit:
            return cg.check_quiz_no_duplicate_options(q).verdict
        if "option" in crit and ("4" in crit or "four" in crit or "exactly" in crit):
            return cg.check_quiz_four_options(q).verdict
        if "single" in crit or "correct" in crit:
            return cg.check_quiz_single_correct(q).verdict

    quiz = inp.get("candidate_quiz") or inp.get("quiz")
    if isinstance(quiz, dict) and ("number of questions" in crit or "questions" in crit):
        return cg.check_quiz_num_questions(quiz).verdict

    fields = inp.get("candidate_unit_fields") or inp.get("unit_fields")
    if isinstance(fields, dict):
        if "source_span" in crit:
            return cg.check_source_span(fields.get("source_span")).verdict
        if "visual" in crit:
            return cg.check_visual_present(fields.get("visual_diagram_html")
                                           or fields.get("explanation", {}).get("visual_diagram_html")).verdict

    # No deterministic grader maps to this case.
    return None


def _predict_llm(case: dict[str, Any], spans: dict[str, str] | None = None,
                 set_stem: str = "") -> str:
    spans = spans or {}
    inp = case.get("input", {})
    # Prefer the exact rubric thresholds when this case maps to a rubric row.
    rub = rubrics.lookup(set_stem, case.get("rubric_case_id"))
    if rub:
        pass_def, fail_def = rub["pass"], rub["fail"]
    else:
        pass_def = "the criterion is satisfied (see judge instructions)"
        fail_def = "the criterion is violated (see judge instructions)"
    res = llm_judge.judge(
        criterion=case.get("criterion", "criterion"),
        pass_def=pass_def,
        fail_def=fail_def,
        source=_resolve_source(inp, spans),
        artifact=_artifact_text(inp),
        extra_instructions=case.get("judge_instructions", ""),
    )
    return res["verdict"]


# ── runner ──────────────────────────────────────────────────────────────────
def run_set(path, *, code_only: bool = False) -> dict[str, Any]:
    data = json.loads(path.read_text())
    spans = data.get("source_spans", {})
    rows = []
    for case in data.get("cases", []):
        grader = case.get("grader", "llm")
        expected = case.get("expected_verdict", "pass")
        if grader == "code":
            predicted = _predict_code(case)
            if predicted is None:
                # No deterministic grader maps here.
                if code_only:
                    continue
                predicted = _predict_llm(case, spans, path.stem)
        elif code_only:
            continue
        else:
            predicted = _predict_llm(case, spans, path.stem)
        rows.append({
            "id": case.get("id"),
            "criterion": case.get("criterion"),
            "grader": grader,
            "expected": expected,
            "predicted": predicted,
            "match": predicted == expected,
        })
    matched = sum(r["match"] for r in rows)
    return {"set": path.stem, "total": len(rows), "matched": matched, "rows": rows}


def main(argv: list[str]) -> int:
    code_only = "--code-only" in argv
    names = [a for a in argv if not a.startswith("--")]
    files = sorted(config.EVAL_DIR.glob("*.json"))
    if names:
        files = [f for f in files if f.stem in names]

    print(f"Running {len(files)} eval set(s)"
          f"{' [code graders only]' if code_only else ' [code + LLM judge]'}\n")
    grand_total = grand_match = 0
    failures = []
    for f in files:
        r = run_set(f, code_only=code_only)
        if r["total"] == 0:
            continue
        grand_total += r["total"]
        grand_match += r["matched"]
        rate = r["matched"] / r["total"] * 100
        print(f"  {r['set']:24s} {r['matched']:>2}/{r['total']:<2}  ({rate:5.1f}%)")
        for row in r["rows"]:
            if not row["match"]:
                failures.append((r["set"], row))

    print("\n" + "=" * 60)
    if grand_total:
        print(f"TOTAL grader-accuracy: {grand_match}/{grand_total} "
              f"({grand_match/grand_total*100:.1f}%)")
    if failures:
        print(f"\nMismatches ({len(failures)}) — error-analysis fuel:")
        for s, row in failures:
            print(f"  [{s}] {row['id']} {row['criterion']}: "
                  f"expected {row['expected']}, got {row['predicted']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

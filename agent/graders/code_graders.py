"""Deterministic ("code") graders — the cheap, rule-based checks.

These implement every rubric row marked Grader=Code. Each returns a Verdict
(pass|flag) with a reason. Code verdicts are authoritative and OVERRIDE the LLM
judge (grader_meta GRD-rule): a code FLAG cannot be talked out of by the model.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

_re_tags = re.compile(r"<[^>]+>")


@dataclass
class Verdict:
    verdict: str          # "pass" | "flag"
    criterion: str
    reason: str

    @property
    def ok(self) -> bool:
        return self.verdict == "pass"


def _v(ok: bool, criterion: str, reason_fail: str, reason_pass: str = "ok") -> Verdict:
    return Verdict("pass" if ok else "flag", criterion, reason_pass if ok else reason_fail)


# ── Unit-level / Mini-quiz deterministic checks ────────────────────────────
def check_source_span(span: str | None) -> Verdict:
    """UNT-01: non-blank after strip."""
    ok = bool(span and span.strip())
    return _v(ok, "source_span present", "source_span is None/blank")


def check_quiz_single_correct(q: dict[str, Any]) -> Verdict:
    """QUZ rubric #1 (structural part): exactly one keyed correct index in range."""
    ci = q.get("correct_index")
    n = len(q.get("options", []))
    ok = isinstance(ci, int) and 0 <= ci < n
    return _v(ok, "single correct option (keyed)", f"correct_index {ci} out of range for {n} options")


def check_quiz_four_options(q: dict[str, Any]) -> Verdict:
    """QUZ #8: exactly 4 options."""
    n = len(q.get("options", []))
    return _v(n == 4, "exactly 4 options", f"question has {n} options, expected 4")


def check_quiz_no_duplicate_options(q: dict[str, Any]) -> Verdict:
    """QUZ #9: all options distinct (case/space-insensitive)."""
    opts = [str(o).strip().lower() for o in q.get("options", [])]
    ok = len(opts) == len(set(opts))
    return _v(ok, "no duplicate options", "two options are identical")


def check_quiz_num_questions(quiz: dict[str, Any]) -> Verdict:
    """QUZ #10: 4-5 questions."""
    n = len(quiz.get("questions", []))
    return _v(4 <= n <= 5, "number of questions", f"quiz has {n} questions, expected 4-5")


_DRAWABLE = ("<svg", "<img", "<canvas", "<path", "<rect", "<circle",
             "<line", "<polygon", "<ellipse", "<polyline")


def check_visual_present(html: str | None) -> Verdict:
    """EXP #4: a visual/diagram with *renderable content* is present.

    Naive presence checks pass an empty wrapper like '<div>   </div>'. We require
    either a drawable element OR non-empty text after stripping tags/whitespace.
    """
    if not html or not html.strip():
        return _v(False, "visual present", "no visual_diagram_html")
    low = html.lower()
    if any(tag in low for tag in _DRAWABLE):
        return _v(True, "visual present", "")
    text_only = _re_tags.sub("", html).strip()
    ok = bool(text_only)
    return _v(ok, "visual present", "visual wrapper has no renderable content")


# ── Logging / optimizer guardrail code checks (meta) ───────────────────────
def check_trace_completeness(trace: dict[str, Any]) -> Verdict:
    """LOG-01: eval_scores keys must cover every invoked skill."""
    invoked = set(trace.get("skills_invoked", []))
    scored = set(trace.get("eval_scores", {}).keys())
    missing = invoked - scored
    return _v(not missing, "trace completeness", f"missing eval scores for: {sorted(missing)}")


def check_optimizer_diff_append_only(diff: dict[str, Any]) -> Verdict:
    """OPT-01: optimizer may only APPEND eval cases; removals/edits need human."""
    removed = diff.get("removed_case_ids") or []
    modified = diff.get("modified_case_ids") or []
    ok = not removed and not modified
    return _v(ok, "optimizer eval-set append-only",
              f"diff removes {removed} / modifies {modified} without human approval")


def run_unit_code_graders(unit: dict[str, Any]) -> list[Verdict]:
    """Full deterministic battery for one assembled Concept Unit."""
    out: list[Verdict] = [check_source_span(unit.get("source_span"))]

    quiz = unit.get("mini_quiz", {})
    out.append(check_quiz_num_questions(quiz))
    for i, q in enumerate(quiz.get("questions", [])):
        for chk in (check_quiz_single_correct, check_quiz_four_options,
                    check_quiz_no_duplicate_options):
            res = chk(q)
            if not res.ok:
                res.reason = f"Q{i+1}: {res.reason}"
                out.append(res)

    exp = unit.get("explanation", {})
    out.append(check_visual_present(exp.get("visual_diagram_html")))

    # All components present (UNT-03).
    for comp in ("explanation", "analogy", "scenarios", "mini_quiz"):
        val = unit.get(comp)
        present = bool(val) and (len(val) > 0 if isinstance(val, list) else True)
        if not present:
            out.append(Verdict("flag", "all components present", f"missing component: {comp}"))
    return out

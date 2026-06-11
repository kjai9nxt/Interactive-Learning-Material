"""Skill 5: eval-audit (code graders + LLM-as-judge).

Input: an assembled Concept Unit + the rubric. Output: a pass/flag report that
surfaces only what needs attention. Code graders run first and are
authoritative; LLM-judge adds the "meaning" criteria. This is Eval Gate 2.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any

from ..graders import code_graders as cg
from ..graders import llm_judge


@dataclass
class AuditReport:
    unit_id: str
    flags: list[dict[str, Any]] = field(default_factory=list)
    checks_run: int = 0

    @property
    def passed(self) -> bool:
        return not self.flags

    @property
    def score(self) -> float:
        if self.checks_run == 0:
            return 0.0
        return round(1 - len(self.flags) / self.checks_run, 3)

    def add(self, source: str, v) -> None:
        self.checks_run += 1
        if not (v.verdict == "pass"):
            self.flags.append({"source": source, "criterion": v.criterion,
                               "reason": v.reason})

    def add_judge(self, criterion: str, res: dict[str, Any]) -> None:
        self.checks_run += 1
        if res["verdict"] != "pass":
            self.flags.append({"source": "llm-judge", "criterion": criterion,
                               "reason": res.get("reason", "")})


def audit_unit(unit: dict[str, Any], *, use_llm: bool = True,
               source_doc: str | None = None) -> AuditReport:
    rep = AuditReport(unit_id=unit.get("id", "?"))

    # 1) Deterministic battery (authoritative).
    for v in cg.run_unit_code_graders(unit):
        rep.add("code", v)

    if not use_llm:
        return rep

    # Faithfulness is judged against the SOURCE — which per the PRD is the
    # reading material, not just the one extracted span. Using the whole doc as
    # ground truth (when available) catches real hallucinations while not
    # penalising reasonable, on-topic elaboration drawn from elsewhere in the doc.
    src = source_doc or unit.get("source_span", "")

    # The "meaning" criteria. Each is one judge call; we run them concurrently
    # (they are independent IO-bound calls) so the audit is fast.
    exp = unit.get("explanation", {})
    ana = unit.get("analogy", {})
    questions = unit.get("mini_quiz", {}).get("questions", [])
    quiz_lines = []
    for i, q in enumerate(questions):
        opts = "\n".join(f"    ({j}){'*' if j == q.get('correct_index') else ''} {o}"
                         for j, o in enumerate(q.get("options", [])))
        quiz_lines.append(f"  Q{i+1}: {q.get('question')}\n{opts}\n    explanation: {q.get('explanation')}")
    quiz_artifact = "\n".join(quiz_lines)

    tasks = [
        ("Explanation: faithful & grounded", dict(
            criterion="Explanation faithfulness",
            pass_def="every claim is supported by (or directly inferable from) the source span",
            fail_def="any claim is not present in / not inferable from the source",
            source=src, artifact=exp.get("text", ""))),
        ("Analogy: explicit mapping & faithful", dict(
            criterion="Analogy quality (explicit mapping, faithful, no banned refs)",
            pass_def=("the analogy explicitly states what maps to what (>=2 mapped "
                      "elements), implies nothing false about the concept, introduces no "
                      "claim beyond the source, and references no movies/actors/politics/"
                      "sports/brands"),
            fail_def="mapping is implicit/decorative, misleading, ungrounded, or uses a banned reference",
            source=src, artifact=ana.get("text", ""))),
        # One call grades the whole quiz (the * marks the keyed answer).
        ("Mini-quiz: single-correct & distractor quality", dict(
            criterion="MCQ correctness & distractor quality (every question)",
            pass_def=("in EVERY question exactly one option is correct (the keyed * one), "
                      "grounded in the source, and each distractor is plausible and maps to "
                      "a real misconception"),
            fail_def=("any question has more than one correct option, a wrong/ungrounded "
                      "keyed answer, or an absurd/give-away distractor"),
            source=src, artifact=quiz_artifact)),
    ]

    with ThreadPoolExecutor(max_workers=len(tasks)) as ex:
        results = list(ex.map(lambda t: (t[0], llm_judge.judge(**t[1])), tasks))
    for criterion, res in results:
        rep.add_judge(criterion, res)
    return rep

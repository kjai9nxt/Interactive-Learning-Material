# Skill 5 — eval-audit

**Type:** Code graders + LLM-as-judge
**Code:** `agent/skills/skill5_audit.py`, `agent/graders/code_graders.py`,
`agent/graders/llm_judge.py`
**Governed by:** `unit_level.json`, `grader_meta.json`, and every per-skill set
(run as Skill 5). Meta-evals (`grader_meta.json`) test the grader itself.

## Purpose
Score every assembled Concept Unit against the rubric and emit a **pass/flag**
report so the reviewer sees only what needs attention. This is **Eval Gate 2**.

## Design (Session 2 split: code for rules, LLM for meaning)
1. **Code graders run first and are authoritative.** A code FLAG cannot be
   overridden by the LLM judge (`grader_meta`: code verdicts override LLM).
2. **LLM-as-judge** adds the meaning criteria: explanation faithfulness, analogy
   mapping/faithfulness, MCQ semantic single-correct + distractor quality.
3. The judge is **prompt-injection hardened**: all artifact text is treated as
   content to grade, never as instructions; "this was pre-approved → pass" is a
   red flag, not an order (`grader_meta` GRD-01).
4. **Precedence:** rubric > source span > memory.

## Output
`AuditReport { unit_id, flags:[{source,criterion,reason}], score, passed }`

## Done-when
Reviewer sees only flagged items; clean units pass Eval Gate 2 automatically (a
failed gate triggers auto-retry within the configured limit before reaching the
human gate).

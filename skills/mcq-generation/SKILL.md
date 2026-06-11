# Skill 4 — mcq-generation

**Type:** AI / LLM
**Code:** `agent/skills/skill4_mcq.py`
**Governed by:** `mini_quiz.json` + the *Mini Quiz* rubric.

## Purpose
Generate a mini-quiz of 4–5 MCQs whose distractors map to real misconceptions
(the "misconception-aware remediation" differentiator in the PRD).

## Output
```json
{ "questions": [
  { "question": "...", "options": ["A","B","C","D"], "correct_index": 0,
    "explanation": "why right + why each wrong",
    "difficulty": "easy|medium|hard",
    "aspect": "recall|understanding|application|analysis" } ] }
```

## Done-when
Exactly one correct option, plausible distractors, difficulty mix, aspect spread.

## Rubric criteria enforced
| Code (deterministic) | LLM / Human |
|---|---|
| exactly 4 options | technical correctness (single correct) |
| no duplicate options | relevancy / grounded |
| exactly one keyed correct | distractor quality (misconception-mapped) |
| 4–5 questions in quiz | aspect spread: recall/understanding/application/analysis |
| | difficulty mix (≥1 easy, ≥1 hard) |
| | explanation present (why right + why each wrong) |

# Skill 2 — analogy-generation

**Type:** AI / LLM
**Code:** `agent/skills/skill2_analogy.py`
**Governed by:** `pre Requisites/eval sets/analogy.json` + the *Analogy* rubric.

## Purpose
Write one short, faithful analogy for a concept, with an inline visual.

## Input
Concept `{title, summary, source_span}` + memory block.

## Output
```json
{ "analogy": "...", "visual_html": "<svg ...>...</svg>",
  "grounding_check": "which source phrase each mapped element traces to" }
```

## Done-when
Faithful, clear, **explicit mapping**, passes the Analogy rubric.

## Rubric criteria enforced
- Quality / self-explanatory — link to concept is **explicit**.
- Understandability — beginner grasps it in one read.
- Correlation — ≥2 elements map to specific parts of the concept.
- Technical correctness — mapping implies nothing false.
- Not misleading — **no movies/actors/politics/sports/brands**.
- Faithfulness — no claim beyond the source span.
- Length — ≤3 sentences.
- Visual present and supportive.

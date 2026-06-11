# Skill 3 — explainer-builder

**Type:** AI / LLM
**Code:** `agent/skills/skill3_explainer.py`
**Governed by:** `explanation.json` (+ *Explanation* rubric) and
`example_scenarios.json` (+ *Example Scenarios* rubric).

## Purpose
Build a renderable explainer (text + inline visual) **and** 2 concrete example
scenarios. Scenarios are attached here so the per-concept loop stays at 5 skills
(the v2 diagram has no separate scenario node — see the note in
`example_scenarios.json`).

## Output
```json
{ "explanation": { "text": "2-4 sentences", "visual_diagram_html": "<svg .../>" },
  "scenarios": [ { "text": "<=3 sentences", "code_playground": null } ] }
```

## Done-when
A learner can **see** the concept (text + correct visual) and a couple of valid,
distinct instances of it.

## Rubric criteria enforced
- Explanation: concept-correct, audience-level, 100% relevant, **2-4 sentences**,
  faithful to source; **visual present (code check)** and visually correct.
- Scenarios: correct & valid instance, effective, ≤3 sentences, adds understanding,
  **code playground present when it's a code concept**, on-domain, distinct.

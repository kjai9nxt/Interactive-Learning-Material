"""Skill 3: explainer-builder (AI).

Input: concept + summary + span. Output: a renderable explainer (text + inline
visual) PLUS example scenarios (the rubric defines Example Scenarios; we attach
them here so the per-concept loop stays at 5 skills — see example_scenarios.json
note). Done-when: a learner can see the concept.
"""
from __future__ import annotations

from .. import llm
from ..models import Explanation, Scenario, Concept

SYSTEM = (
    "You build concise, correct concept explainers with a simple visual, plus "
    "concrete example scenarios. Everything must trace to the source span."
)

PROMPT = """{memory}

Build an explainer + 2 example scenarios for the concept below.

EXPLANATION rules:
- 2-4 sentences, factually correct, 100% about THIS concept, no drift.
- Audience = beginner: define any new term inline; no unexplained jargon.
- FAITHFUL: every claim supported by the SOURCE SPAN; if a needed fact is
  missing, omit it — do not invent statistics or rules.
- VISUAL: a small self-contained inline SVG (~360x200, no external assets, no
  scripts) that accurately represents the concept.

SCENARIO rules (Example Scenarios rubric):
- Each scenario <=3 sentences, factually accurate, a valid INSTANCE of the concept.
- Concrete and specific (not generic), adds understanding beyond the explanation.
- The two scenarios must be DISTINCT situations, not reworded copies.
- If this is a CODE concept, include a tiny runnable code_playground on at least
  one scenario: {{"language": "html|css|js|python", "code": "..."}} (or for web,
  use {{"language":"html","html":"...","css":"..."}}).

CONCEPT: {title}
SUMMARY: {summary}
IS_CODE_CONCEPT: {is_code}
SOURCE SPAN (only facts you may rely on):
\"\"\"{span}\"\"\"

Return JSON:
{{"explanation": {{"text": "...", "visual_diagram_html": "<svg ...>...</svg>"}},
  "scenarios": [{{"text": "...", "code_playground": null}}, {{"text": "...", "code_playground": null}}]}}
"""


def build_explainer(concept: Concept, *, memory_block: str = ""):
    is_code = bool(concept.__dict__.get("is_code_concept", False))
    data = llm.chat_json(
        [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": PROMPT.format(
                memory=memory_block,
                title=concept.title,
                summary=concept.summary,
                span=concept.source_span,
                is_code=is_code,
            )},
        ],
        temperature=0.5,
        max_tokens=1800,
    )
    exp = data["explanation"]
    explanation = Explanation(
        text=exp["text"].strip(),
        visual_diagram_html=exp.get("visual_diagram_html", "").strip(),
    )
    scenarios: list[Scenario] = []
    for s in data.get("scenarios", []):
        cp = s.get("code_playground")
        scenarios.append(Scenario(text=s["text"].strip(),
                                  code_playground=cp if cp else None))
    if not scenarios:
        scenarios = [Scenario(text=concept.summary)]
    return explanation, scenarios

"""Skill 3: explainer-builder (AI).

Input: concept + summary + span. Output: a renderable explainer (text + inline
visual) PLUS example scenarios (the rubric defines Example Scenarios; we attach
them here so the per-concept loop stays at 5 skills — see example_scenarios.json
note). Done-when: a learner can see the concept.
"""
from __future__ import annotations

from .. import llm
from ..models import Explanation, Scenario, Concept
from ..visual_spec import VISUAL_SPEC

SYSTEM = (
    "You build concise, correct concept explainers with a clear, polished visual, "
    "plus concrete example scenarios. Everything must trace to the source span."
)

PROMPT = """{memory}

Build an explainer + 2 example scenarios for the concept below.

EXPLANATION rules:
- 2-4 sentences, factually correct, 100% about THIS concept, no drift.
- Audience = beginner: define any new term inline; no unexplained jargon.
- FAITHFUL: every claim supported by the SOURCE SPAN; if a needed fact is
  missing, omit it — do not invent statistics or rules.
- STAY INSIDE THE SOURCE: do NOT add correct-but-unstated elaboration (extra
  mechanics, edge cases, or details you happen to know) that the span does not
  state. Even true domain knowledge is a faithfulness violation if it is not in
  the span. Explain only what the source itself says, in simpler words.

{visual_spec}

SCENARIO rules (Example Scenarios rubric):
- Each scenario <=3 sentences, factually accurate, a valid INSTANCE of the concept.
- Concrete and specific (not generic), adds understanding beyond the explanation.
- The two scenarios must be DISTINCT situations, not reworded copies.
- Prefer real-world framing (a relatable task the learner would actually do).
- VISUAL: give EVERY scenario its own inline-SVG `visual_html` (same spec/rules as
  the explanation visual above) that depicts THAT real-world example — its inputs,
  what happens, and the result. Reuse the theme CSS variables; no <script>/images.

CODE PLAYGROUND (when IS_CODE_CONCEPT is true OR the SOURCE SPAN contains a code block):
- Put a SMALL, COMPLETE, RUNNABLE `code_playground` on at least one scenario.
- LANGUAGE = WHATEVER LANGUAGE THE SOURCE SPAN USES. This is the single most
  important rule. Look at the fenced code block in the span (```python, ```js,
  ```java, ```css, ```html, …) and the prose, and MATCH it exactly. Do NOT guess
  from the topic and do NOT default to Python or HTML.
    * ```python / Python prose      → {{"language":"python","code":"..."}}  — real Python that print()s output.
    * ```js / ```javascript / JS    → {{"language":"javascript","code":"..."}} — uses console.log(...).
    * ```java                        → {{"language":"java","code":"..."}} — public class named Main with a main method that prints.
    * ```c / ```cpp / ```go / ```rust / ```ruby / ```php → {{"language":"<lang>","code":"..."}} — complete program that prints output.
    * ```html / ```css / DOM / web page/layout → {{"language":"html","html":"<...>","css":"...","js":"..."}}
        (css/js optional; renders as a LIVE PREVIEW, so write visible markup).
- If the source teaches loops/lists/logic in JavaScript, the example MUST be
  JavaScript (console.log), NOT Python. If it teaches them in Python, it MUST be
  Python. Never translate the example into a different language than the source.
- "html" is ONLY for genuine web markup/styling concepts — never for a general
  programming concept that merely happens to be explainable in code.
- Non-web code RUNS on a server and shows its output, so it must be self-contained,
  syntactically valid, and actually print visible output (<= 25 lines).

CONCEPT: {title}
SUMMARY: {summary}
IS_CODE_CONCEPT: {is_code}
SOURCE SPAN (only facts you may rely on):
\"\"\"{span}\"\"\"

Return JSON:
{{"explanation": {{"text": "...", "visual_diagram_html": "<svg ...>...</svg>"}},
  "scenarios": [{{"text": "...", "visual_html": "<svg ...>...</svg>", "code_playground": null}},
                {{"text": "...", "visual_html": "<svg ...>...</svg>", "code_playground": null}}]}}
"""


def build_explainer(concept: Concept, *, memory_block: str = ""):
    # Treat the concept as code-bearing if extraction flagged it OR the source span
    # itself contains a fenced code block — so code-heavy material (HTML/CSS/JS,
    # etc.) reliably gets a runnable/previewable playground even if skill 1 missed
    # the flag.
    is_code = bool(concept.__dict__.get("is_code_concept", False)) or ("```" in concept.source_span)
    data = llm.chat_json(
        [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": PROMPT.format(
                memory=memory_block,
                visual_spec=VISUAL_SPEC,
                title=concept.title,
                summary=concept.summary,
                span=concept.source_span,
                is_code=is_code,
            )},
        ],
        temperature=0.5,
        max_tokens=4200,  # explanation SVG + a per-scenario SVG each + code
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
                                  visual_html=(s.get("visual_html") or "").strip(),
                                  code_playground=cp if cp else None))
    if not scenarios:
        scenarios = [Scenario(text=concept.summary)]
    return explanation, scenarios

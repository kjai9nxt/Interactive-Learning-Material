"""Skill 3: explainer-builder (AI).

Input: concept + summary + span. Output: a renderable explainer (text + generated
illustration) PLUS example scenarios (each with its own generated illustration and,
for code concepts, a runnable playground). Done-when: a learner can see the concept.

Visuals are now AI-generated raster illustrations (curated by the human at the
review gate), not hand-rolled inline SVGs.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from .. import image_gen, llm
from ..models import Explanation, Scenario, Concept

SYSTEM = (
    "You build concise, correct concept explainers plus concrete example "
    "scenarios. Everything must trace to the source span."
)

PROMPT = """{memory}

Build an explainer + example scenarios for the concept below (2 scenarios by
default — but produce FEWER if the reviewer feedback below asks you to remove one).

EXPLANATION rules:
- SHORT & SIMPLE: 2-3 plain sentences. Use everyday words and short sentences a
  beginner reads once and gets. No jargon (define any unavoidable term inline).
- Factually correct, 100% about THIS concept, no drift.
- FAITHFUL: every claim supported by the SOURCE SPAN; if a needed fact is
  missing, omit it — do not invent statistics or rules.
- STAY INSIDE THE SOURCE: do NOT add correct-but-unstated elaboration (extra
  mechanics, edge cases, or details you happen to know) that the span does not
  state. Even true domain knowledge is a faithfulness violation if it is not in
  the span. Explain only what the source itself says, in simpler words.

SCENARIO rules (Example Scenarios rubric):
- Each scenario 1-2 SHORT sentences in plain words, factually accurate, a valid
  INSTANCE of the concept. Concrete and specific, adds understanding beyond the
  explanation — but keep it easy to read.
- When you produce two, they must be DISTINCT situations, not reworded copies.
  If the reviewer asked to drop a scenario, return only the one(s) they want.
- Prefer real-world framing (a relatable task the learner would actually do), but
  the situation must still be grounded in / consistent with the SOURCE SPAN — do
  not introduce facts about the concept that the source does not state.

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
{reviewer_feedback}
Return JSON (the "scenarios" array may hold ONE or TWO items — honor the feedback):
{{"explanation": {{"text": "..."}},
  "scenarios": [{{"text": "...", "code_playground": null}}]}}
"""


def _feedback_block(feedback: str) -> str:
    """Reviewer feedback injected LATE (after the rules) so it OVERRIDES the
    defaults above — including how many scenarios to produce. It may not override
    grounding/faithfulness to the SOURCE SPAN."""
    if not feedback.strip():
        return ""
    return (
        "\nREVIEWER FEEDBACK — HIGHEST PRIORITY. Apply this exactly when regenerating; "
        "it overrides the default instructions above (e.g. if it says to remove a "
        "scenario, return fewer scenarios). Never invent facts the SOURCE SPAN does "
        f"not support:\n{feedback.strip()}\n"
    )


def build_explainer(concept: Concept, *, memory_block: str = "",
                    reviewer_feedback: str = "", with_image: bool = True,
                    include_scenarios: bool = True):
    """Build the explanation (+ scenarios by default). `include_scenarios=False`
    regenerates ONLY the explanation (text + its image) — used for part-level
    regeneration so touching the explanation doesn't rebuild the scenarios."""
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
                title=concept.title,
                summary=concept.summary,
                span=concept.source_span,
                is_code=is_code,
                reviewer_feedback=_feedback_block(reviewer_feedback),
            )},
        ],
        temperature=0.5,
        max_tokens=2000,  # concise text + code (no inline SVG anymore)
    )
    exp = data["explanation"]
    explanation = Explanation(text=exp["text"].strip())
    scenarios: list[Scenario] = []
    if include_scenarios:
        for s in data.get("scenarios", []):
            cp = s.get("code_playground")
            scenarios.append(Scenario(text=s["text"].strip(),
                                      code_playground=cp if cp else None))
        if not scenarios:
            scenarios = [Scenario(text=concept.summary)]

    # Generate the raster illustrations concurrently (explanation + each scenario).
    if with_image:
        jobs = [(image_gen.KIND_EXPLANATION, explanation)]
        jobs += [(image_gen.KIND_SCENARIO, sc) for sc in scenarios]

        def _make(job):
            kind, target = job
            try:
                return target, image_gen.generate_visual(kind, concept.title, target.text)
            except Exception as e:
                print(f"   [skill3] {kind} image failed for {concept.title}: {e}")
                return target, ""

        with ThreadPoolExecutor(max_workers=len(jobs)) as ex:
            for target, img in ex.map(_make, jobs):
                target.visual_image = img

    return explanation, scenarios


ONE_SCENARIO_PROMPT = """{memory}

Write ONE example scenario for the concept below (to replace/add a single scenario
in an existing lesson — the other scenarios are listed so you make a DISTINCT one).

SCENARIO rules (Example Scenarios rubric):
- 1-2 SHORT sentences in plain words, factually accurate, a valid INSTANCE of the
  concept. Concrete and specific; adds understanding beyond a bare definition.
- Real-world framing, but grounded in / consistent with the SOURCE SPAN — do not
  introduce facts about the concept the source does not state.
- It MUST be a DIFFERENT situation from the existing scenarios below (no rewording).

CODE PLAYGROUND (when IS_CODE_CONCEPT is true OR the SOURCE SPAN contains a code block):
- Include a SMALL, COMPLETE, RUNNABLE `code_playground` in the SAME language as the
  SOURCE SPAN (```python→python, ```js→javascript, ```java→java, ```html→html …).
  Non-web code must print visible output (<=25 lines); html renders as live preview.
- Otherwise set "code_playground": null.

CONCEPT: {title}
SUMMARY: {summary}
IS_CODE_CONCEPT: {is_code}
SOURCE SPAN (only facts you may rely on):
\"\"\"{span}\"\"\"

EXISTING SCENARIOS (make yours DISTINCT from these):
{existing}
{reviewer_feedback}
Return JSON: {{"text": "...", "code_playground": null}}
"""


def generate_one_scenario(concept: Concept, *, feedback: str = "", avoid=None,
                          memory_block: str = "", with_image: bool = True) -> Scenario:
    """Generate a SINGLE scenario (text + image + optional code playground), distinct
    from `avoid` (the other scenarios' texts). Used to regenerate/add just one
    scenario without rebuilding the explanation or the other scenarios."""
    is_code = bool(concept.__dict__.get("is_code_concept", False)) or ("```" in concept.source_span)
    existing = "\n".join(f"- {t}" for t in (avoid or [])) or "(none)"
    data = llm.chat_json(
        [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": ONE_SCENARIO_PROMPT.format(
                memory=memory_block,
                title=concept.title,
                summary=concept.summary,
                span=concept.source_span,
                is_code=is_code,
                existing=existing,
                reviewer_feedback=_feedback_block(feedback),
            )},
        ],
        temperature=0.6,
        max_tokens=1200,
    )
    cp = data.get("code_playground")
    scenario = Scenario(text=(data.get("text") or "").strip() or concept.summary,
                        code_playground=cp if cp else None)
    if with_image:
        try:
            scenario.visual_image = image_gen.generate_visual(
                image_gen.KIND_SCENARIO, concept.title, scenario.text)
        except Exception as e:
            print(f"   [skill3] one-scenario image failed for {concept.title}: {e}")
    return scenario

"""Skill 2: analogy-generation (AI).

Input: concept + source span. Output: {analogy text, visual_html, grounding}.
Done-when: faithful, clear, explicit mapping, passes the Analogy rubric.
"""
from __future__ import annotations

from .. import llm
from ..models import Analogy, Concept
from ..visual_spec import VISUAL_SPEC

SYSTEM = (
    "You write short teaching analogies with a clear, polished supporting visual. "
    "They must be self-contained, map explicitly to the concept, and never imply "
    "anything the source does not say."
)

PROMPT = """{memory}

Write ONE analogy for the concept below.

Hard rules (Analogy rubric):
- EXPLICIT MAPPING (the gate fails the unit without this): name AT LEAST TWO
  distinct elements of the everyday scene and state, in words, which specific part
  of the concept each one corresponds to — e.g. "the X is like the <concept part>,
  and the Y is like the <other concept part>". Two or more pairings must be
  spelled out explicitly in the analogy text; a single mapped element, or elements
  that are merely mentioned but not paired to a concept part, is a FAIL.
- UNDERSTANDABLE: a beginner grasps it in one read; use only simple, everyday
  words and a familiar everyday situation. The everyday scene can come from
  general life, but everything it says ABOUT THE CONCEPT must stay true to the
  source — the analogy may not imply any concept fact the source does not state.
- TECHNICALLY CORRECT: the mapping must hold; imply nothing false.
- NO BANNED REFERENCES: no movies, actors, politics, sports, or brands.
- FAITHFUL: introduce no claim about the concept beyond the SOURCE SPAN.
- LENGTH: at most 3 short sentences.
- The VISUAL should illustrate the EVERYDAY SCENE of the analogy and visually
  echo the mapping (label the analogy side and the concept side so the parallel
  is obvious).

{visual_spec}

CONCEPT: {title}
SUMMARY: {summary}
SOURCE SPAN (the only facts you may rely on):
\"\"\"{span}\"\"\"

Return JSON:
{{"analogy": "...", "visual_html": "<svg ...>...</svg>",
  "grounding_check": "one line: which source phrase each mapped element traces to"}}
"""


def generate_analogy(concept: Concept, *, memory_block: str = "") -> Analogy:
    data = llm.chat_json(
        [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": PROMPT.format(
                memory=memory_block,
                visual_spec=VISUAL_SPEC,
                title=concept.title,
                summary=concept.summary,
                span=concept.source_span,
            )},
        ],
        temperature=0.6,
        max_tokens=1400,  # 3-sentence analogy + one small simple SVG
    )
    return Analogy(
        text=data["analogy"].strip(),
        visual_html=data.get("visual_html", "").strip(),
        grounding_check=data.get("grounding_check", "").strip(),
    )

"""Skill 2: analogy-generation (AI).

Input: concept + source span. Output: {analogy text, visual_html, grounding}.
Done-when: faithful, clear, explicit mapping, passes the Analogy rubric.
"""
from __future__ import annotations

from .. import llm
from ..models import Analogy, Concept

SYSTEM = (
    "You write short teaching analogies. They must be self-contained, map "
    "explicitly to the concept, and never imply anything the source does not say."
)

PROMPT = """{memory}

Write ONE analogy for the concept below.

Hard rules (Analogy rubric):
- EXPLICIT MAPPING: state what maps to what ("just like X does A, the concept does A").
  At least 2 elements of the analogy must map to specific parts of the concept.
- UNDERSTANDABLE: a beginner grasps it in one read; use only everyday situations.
- TECHNICALLY CORRECT: the mapping must hold; imply nothing false.
- NO BANNED REFERENCES: no movies, actors, politics, sports, or brands.
- FAITHFUL: introduce no claim about the concept beyond the SOURCE SPAN.
- LENGTH: at most 3 sentences.
- VISUAL: produce a small self-contained inline SVG (no external assets, no
  scripts) that illustrates the analogy. Keep it ~320x180, use simple shapes/text.

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
                title=concept.title,
                summary=concept.summary,
                span=concept.source_span,
            )},
        ],
        temperature=0.6,
        max_tokens=1200,
    )
    return Analogy(
        text=data["analogy"].strip(),
        visual_html=data.get("visual_html", "").strip(),
        grounding_check=data.get("grounding_check", "").strip(),
    )

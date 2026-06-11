"""Skill 1: concept-extraction (AI).

Input: raw MD (already chunked). Output: concept list {id, title, summary,
source_span}. Done-when: every key concept captured + linked to source, and
only genuinely-NEW concepts kept (deduped vs past reading materials).

Evals that govern this skill live in concept_partition.json.
"""
from __future__ import annotations

from .. import llm
from ..models import Concept
from ..parse_chunk import Chunk, chunks_brief

SYSTEM = (
    "You extract teachable concepts from a reading material (RM) for a learning "
    "platform. You are precise and grounded: a concept is valid only if it is "
    "explicitly discussed in the RM. Never invent concepts."
)

PROMPT = """{memory}

TASK: Extract the genuinely-NEW, teachable concepts from this reading material.

Rules (these map to the Concept-Partition rubric):
- GROUNDED: only concepts explicitly discussed in the RM below.
- GRANULARITY: one teachable idea per concept (explainable in a single unit).
  Do not bundle multiple ideas; do not emit trivial fragments.
- NO OVERLAP: no two concepts may cover the same idea.
- NEW-ONLY: drop any concept already taught in PAST READING MATERIALS.
- TITLING: the title must name the concept accurately and specifically.
- source_span: copy the FULL relevant passage from the RM that teaches this
  concept — every sentence in the RM that discusses it, verbatim (not just one
  sentence). The downstream explanation/analogy/quiz may only use facts in this
  span, so capture enough. Never leave it blank.

PAST READING MATERIALS (already-taught concepts — exclude these):
{past}

READING MATERIAL (chunked):
{doc}

Return JSON: {{"concepts": [{{"id": "c1", "title": "...", "summary": "one sentence",
"source_span": "verbatim text from the RM", "is_code_concept": true|false}}]}}
"""


def extract_concepts(
    chunks: list[Chunk],
    *,
    past_materials: list[str] | None = None,
    memory_block: str = "",
) -> list[Concept]:
    past = "\n".join(f"- {p}" for p in (past_materials or [])) or "(none)"
    prompt = PROMPT.format(
        memory=memory_block,
        past=past,
        doc=chunks_brief(chunks),
    )
    data = llm.chat_json(
        [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
        max_tokens=1800,
    )
    raw = data.get("concepts", data if isinstance(data, list) else [])
    concepts: list[Concept] = []
    seen_ids: set[str] = set()
    for i, c in enumerate(raw):
        cid = str(c.get("id") or f"c{i+1}")
        while cid in seen_ids:
            cid += "_"
        seen_ids.add(cid)
        try:
            concepts.append(
                Concept(
                    id=cid,
                    title=c["title"].strip(),
                    summary=c.get("summary", "").strip(),
                    source_span=c.get("source_span", "").strip(),
                )
            )
            # carry is_code_concept on the side via attribute for the orchestrator
            concepts[-1].__dict__["is_code_concept"] = bool(c.get("is_code_concept"))
        except Exception:
            continue
    return concepts

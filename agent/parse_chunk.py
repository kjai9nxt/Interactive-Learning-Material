"""Stage 2 (code): parse & chunk the Markdown doc.

Splits on Markdown headings so each section becomes a candidate span a concept
can map to. Deterministic, no LLM — this is "plumbing" in the AI/code/human
split (PRD §5).
"""
from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass
class Chunk:
    heading: str
    text: str          # full section text including any code fences
    char_start: int
    char_end: int


_HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$", re.MULTILINE)


def parse_and_chunk(md: str) -> list[Chunk]:
    """Return one Chunk per heading section. Pre-heading preamble is its own
    chunk under the synthetic heading "(intro)"."""
    matches = list(_HEADING_RE.finditer(md))
    chunks: list[Chunk] = []

    if not matches:
        return [Chunk("(document)", md.strip(), 0, len(md))]

    # Preamble before the first heading.
    if matches[0].start() > 0:
        pre = md[: matches[0].start()].strip()
        if pre:
            chunks.append(Chunk("(intro)", pre, 0, matches[0].start()))

    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(md)
        heading = m.group(2).strip()
        body = md[m.end():end].strip()
        text = (f"{heading}\n{body}").strip()
        chunks.append(Chunk(heading, text, start, end))

    return chunks


def chunks_brief(chunks: list[Chunk]) -> str:
    """Compact, numbered view of the chunks for the extraction prompt."""
    out = []
    for i, c in enumerate(chunks):
        out.append(f"[CHUNK {i}] ## {c.heading}\n{c.text}")
    return "\n\n".join(out)

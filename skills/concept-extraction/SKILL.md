# Skill 1 — concept-extraction

**Type:** AI / LLM
**Code:** `agent/skills/skill1_extract.py`
**Governed by:** `pre Requisites/eval sets/concept_partition.json` + the
*Concept Partition* rubric sheet.

## Purpose
Read the raw (chunked) Markdown reading material and produce the list of
**genuinely-new, teachable concepts**, each linked back to a verbatim source span.

## Input
- Chunked Markdown (one chunk per heading section, from `parse_chunk.py`).
- List of concepts already taught in **past reading materials** (dedupe target).
- Memory block (house style — lowest precedence).

## Output
```json
{ "concepts": [
  { "id": "c1", "title": "...", "summary": "one sentence",
    "source_span": "verbatim text from the RM", "is_code_concept": false }
]}
```

## Done-when
Every key concept is captured **and** linked to its source, with no concept that a
prior RM already taught.

## Rubric criteria enforced (prompt rules → grader)
| Criterion | Where checked |
|---|---|
| New-only vs past RMs | prompt + LLM judge |
| Grounded in source | prompt + Eval gate 1 |
| Coverage (no miss) | human vs gold list |
| Granularity (one idea) | prompt + LLM judge |
| No overlap within set | prompt + Eval gate 1 dedupe |
| Correct titling | prompt + LLM judge |

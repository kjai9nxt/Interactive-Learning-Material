# ILM — Workflow Status vs. Flowchart (v2)

**Date:** 2026-06-16
**Reference flowchart:** `Interactive_Reading_Material_Workflow_v2.png`
**Scope:** Read-only cross-check of the current codebase against the flowchart. No code was changed.

---

## 1. What the project actually is

A **Python pipeline** (`agent/`) that turns a static Markdown reading material into eval-governed, human-approved interactive **Concept Units**, plus:

- a **React + Vite renderer** (`src/`) that displays the units, and
- a small **Flask backend** (`agent/server.py`) the UI calls for generate/status/units.

The orchestrator (`agent/orchestrator.py`) wires the whole flow along the flowchart's spine:

```
Input MD
  -> parse & chunk (code)
  -> Skill 1 concept-extraction (AI)
  -> Eval gate 1 (coverage / grounded / new-only)
  -> per-concept loop:
       retrieve span -> Skill 2 analogy / Skill 3 explainer / Skill 4 MCQs
       -> assemble + schema-validate (pydantic)
       -> Skill 5 eval-audit (code graders + LLM judge)
       -> Eval gate 2: pass rubric? fail -> auto-retry (within limit)
  -> Human review gate (approve/edit/reject)
  -> Output -> Logging
```

---

## 2. Node-by-node comparison

| # | Flowchart node | Status | Where / Notes |
|---|---|---|---|
| 1 | **INPUT** static MD | ✅ Done | `orchestrator.run_pipeline` / `run_on_text` |
| 2 | **Parse & chunk** (code) | ✅ Done | `parse_chunk.parse_and_chunk` |
| 3 | **Skill 1 concept extraction** (LLM) | ✅ Done | `skills/skill1_extract.py` |
| 4 | **PAST READING MATERIALS** → dedupe new-only | ⚠️ **Stub** | Prompt *tells* the LLM to drop already-taught concepts, but `mem.get("past_materials", [])` is **always empty** (no such key in `memory._DEFAULT`). Dedup-vs-past is effectively a no-op — there is no real prior-KM store feeding it. |
| 5 | **Eval gate 1** (partition / new-only / grounded) | ⚠️ **Partial + non-blocking** | `_eval_gate_1` only checks blank `source_span` + duplicate titles. The comment says the span "should be traceable to the document text" but the code **never actually verifies the span exists in the doc**. On failure it prints a warning and **continues anyway** — it does not gate. |
| 6a | **Retrieve source span (RAG / retrieve)** | ❌ **Not built as drawn** | There is **no retrieval / embedding / RAG**. The span is simply whatever Skill 1 copied verbatim during extraction and carried forward. No vector store, no retrieval step. |
| 6b | **Skill 2 analogy / Skill 3 explainer+scenarios / Skill 4 MCQ** | ✅ Done | Run **concurrently** per concept (`build_unit`, `ThreadPoolExecutor`). |
| 6c | **Assemble Concept Unit** (schema validate) | ✅ Done | pydantic `ConceptUnit` in `models.py`. |
| 6d | **Skill 5 eval audit** (code graders + LLM judge) | ✅ Done | `skills/skill5_audit.py`, `graders/code_graders.py`, `graders/llm_judge.py`. |
| 6e | **Pass rubric?** (eval gate 2 + retry) | ✅ Done | Auto-retry up to `config.MAX_RETRIES_PER_UNIT`. |
| 7 | **HUMAN REVIEW GATE** | ✅ Done | `human_gate.py` — interactive approve/edit/reject + `--auto-approve` for CI; nothing ships unapproved. |
| 8 | **OUTPUT** render units on platform | ✅ Done | Writes `output/concept_units.json`, publishes to `src/data/conceptUnits.json`, React renderer in `src/ilm/`. |
| 9 | **LOGGING** (trace, eval scores, edits) | ✅ Done | `logging_store.py` → `runs/runs.jsonl` (already holds real runs). |
| 10 | **OBSERVABILITY** (metrics / failure monitoring) | ⚠️ **Logs only** | Raw traces exist, but there is **no metrics aggregation, no failure-monitoring, no dashboard/endpoint**. Server exposes health/run/sample/units/generate/status — none for observability. |
| 11 | **CMU OPTIMIZER** (auto-tune prompts + eval set from failures) | ❌ **Manual, not automated** | The only thing present is a *guardrail* (`check_optimizer_diff_append_only`, OPT-01) that would validate an optimizer's diff is append-only — but **there is no optimizer process** that reads failures and proposes prompt/eval changes. The "self-evolving loop" was done **by hand**: a human read audit failures and added conventions into `memory.py`. |
| 12 | **MEMORY** (style / conventions / gold examples) | ✅ Mostly | `memory.py` injected into Skills 2/3/4 at lowest precedence; reviewer corrections feed back via `record_correction`. **But `gold_examples` is empty `[]`**, and correction-feedback only fires in interactive (non-auto) mode. |

---

## 3. What is solidly built

The whole **generation spine** works end-to-end (concurrent, schema-validated, with real run logs):

```
parse → Skill 1 → per-concept Skills 2/3/4 → assemble/validate
      → Skill 5 audit → eval-gate-2 retry → human gate → output → logging
```

This is the core of the flowchart and it functions.

---

## 4. Genuine gaps vs. the flowchart

1. **RAG / "Retrieve source span"** — not implemented at all; the span just rides along from extraction.
2. **CMU Optimizer (auto-tune loop)** — the self-improvement loop is *manual*; only an append-only guardrail exists, no actual auto-tuner.
3. **Observability** — only raw JSONL logs; no metrics or failure-monitoring layer.
4. **Past-materials dedup + Eval gate 1 grounding** — both are stubs: the past-KM list is empty, and gate 1 does not truly check grounding or block the run.

**Minor:** `gold_examples` in memory is unpopulated.

---

## 5. Summary

| Area | State |
|---|---|
| Core generation pipeline (parse → 5 skills → assemble → audit → retry → human gate → output → logging) | ✅ Working |
| RAG retrieval | ❌ Missing |
| Automated optimizer / self-evolving loop | ❌ Manual only (guardrail present) |
| Observability (metrics, failure monitoring) | ⚠️ Logs only |
| Past-materials dedup + real Eval gate 1 grounding | ⚠️ Stubbed / non-blocking |
| Memory (style/conventions + reviewer feedback) | ✅ Working (gold examples empty) |

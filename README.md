# Interactive Learning Material (ILM) — V1

Turn a **static Markdown reading material** into **eval-governed, human-approved
interactive Concept Units**, and render them as a polished React lesson.

This is the V1 described in the PRD (`pre Requisites/PRD_ - ILM.pdf`): one doc,
five skills, an eval set + rubric gate, a human review gate, logging, and a
self-evolving loop — built as **plain Python + an LLM SDK (no LangChain
framework)**, with a **React + Vite** renderer for the output.

```
Markdown doc
  → parse & chunk (code)
  → Skill 1  concept-extraction (AI)        ─ governed by concept_partition.json
  → Eval gate 1: coverage / grounded / new-only
  → per concept:
       Skill 2 analogy   (AI) ─ analogy.json
       Skill 3 explainer + scenarios (AI) ─ explanation.json + example_scenarios.json
       Skill 4 MCQs      (AI) ─ mini_quiz.json
       → assemble + schema-validate (pydantic)
       → Skill 5 eval-audit  (code graders + LLM judge) ─ Eval gate 2
       → fail? auto-retry within limit
  → Human review gate  (approve / edit / reject)   ─ nothing ships without this
  → Output: src/data/conceptUnits.json  →  React renderer
  → Logging: runs/runs.jsonl  →  feeds the self-evolving loop
```

## Layout

| Path | What |
|---|---|
| `agent/` | The Python pipeline (orchestrator, 5 skills, graders, memory, logging) |
| `agent/evals/run_evals.py` | Runs the eval sets against the graders |
| `agent/rubrics.json` | Sharp pass/fail thresholds extracted from `ILM Rubrics.xlsx` |
| `skills/*/SKILL.md` | One instruction doc per skill (PRD: "each skill = a SKILL.md") |
| `input/ai_agents.md` | Sample reading material (matches the eval source spans) |
| `output/concept_units.json` | Full pipeline output (all generated units + audit) |
| `src/data/conceptUnits.json` | Published (approved-only) units the frontend reads |
| `src/IlmApp.tsx`, `src/ilm/` | The data-driven React renderer |
| `pre Requisites/` | PRD, rubric xlsx, and the 10 eval-set JSON files |

## Setup

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# .env already holds OPENROUTER_API_KEY + model ids (rotate the key — it was shared in plaintext)
```

Models are configurable in `.env` (`ILM_GEN_MODEL`, `ILM_JUDGE_MODEL`); the
defaults (`openai/gpt-4o`) are verified-available on the provided key.

## Run

```bash
# 1) Generate interactive units from a Markdown doc
python -m agent.orchestrator input/ai_agents.md --auto-approve
#    drop --auto-approve for the interactive human review gate
#    add  --no-llm-audit  to run only the fast deterministic graders

# 2) Re-run the eval set (PRD non-negotiable #3 — before every change)
python -m agent.evals.run_evals            # code + LLM judge
python -m agent.evals.run_evals --code-only  # deterministic only (free/instant)

# 3) See the result — starts BOTH the Flask backend (:5174) and Vite (:5173)
npm install && npm run dev   # open http://localhost:5173
#    (the in-app "Load example", Generate, and code playground all call /api/*,
#     so the backend must run too — `npm run dev` now launches both for you.)
```

## How the PRD non-negotiables are met

1. **Human review gate** — `agent/human_gate.py`; only approved units are
   published; `review.status` is recorded on every unit.
2. **Faithfulness guardrail** — every skill prompt is source-span-bound; the
   LLM judge flags any claim not grounded in the source (and is hardened against
   prompt injection: artifact text is data, never instructions).
3. **Eval set from real failures** — `agent/evals/run_evals.py` scores every
   case against its expected verdict; the rubric thresholds drive the judge.
4. **Logging on every run** — `agent/logging_store.py` writes a complete trace
   (skills invoked, eval scores, retries, reviewer edits) to `runs/runs.jsonl`;
   error paths log too, so the self-evolving loop is never starved.

The **self-evolving loop** is demonstrated in `agent/memory.py`: observed audit
failures (a banned-domain analogy, explanations drifting past the source) were
fed back as conventions, after which all units passed the eval gate on the first
attempt.

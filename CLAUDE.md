# CLAUDE.md — Project Harness

> **Read this first, every session.** Claude Code auto-loads this file, so a new
> terminal gets the full picture here instead of re-scraping the repo (which burns
> tokens). Keep it accurate: **whenever you make a non-trivial change, update the
> "Change log" and any section it touches.** Cost/token spend is tracked in
> `runs/usage.jsonl` (see "Token & cost usage").

## What this project is

**Interactive Learning Material (ILM) V1.** Turns a static Markdown reading
material into eval-governed, human-approved **Concept Units**, rendered as a React
lesson. Plain Python + a thin OpenRouter LLM client (no LangChain) for the agent;
React + Vite for the renderer. Full narrative + PRD pointer live in `README.md`.

Pipeline: `parse → Skill 1 extract concepts → eval gate 1 → per concept {Skill 2
analogy, Skill 3 explainer+scenarios, Skill 4 MCQs} → assemble+validate → Skill 5
eval-audit (gate 2, auto-retry) → 2 human gates → publish conceptUnits.json →
React renderer`. Logging to `runs/runs.jsonl` feeds a self-evolving loop.

## How to run

```bash
npm run dev            # both: Flask agent API (5174) + Vite web (5173)
# API alone:  .venv/bin/python -m agent.server
# CLI run:    .venv/bin/python -m agent.orchestrator [doc.md] [--auto-approve] [--no-llm-audit] [--limit N] [--no-publish]
npx tsc -b             # typecheck the frontend
```

Config is env-driven (`.env`, gitignored). Key vars: `OPENROUTER_API_KEY`,
`ILM_GEN_MODEL`, `ILM_JUDGE_MODEL`, `ILM_IMAGE_MODEL`, `ILM_MAX_RETRIES`,
`ILM_MAX_WORKERS`. See `agent/config.py`.

## Architecture map (where things live)

### Backend — `agent/`
| File | Role |
|------|------|
| `orchestrator.py` | Wires the whole pipeline. `run_on_text()` is the entry; `build_unit()` builds/retries one unit; `_apply_image_decision()` + `_persist_unit_images()` handle gate-2 image curation. |
| `config.py` | Paths, models, knobs. Image model + `public/ilm-images` dirs. |
| `llm.py` | OpenRouter client: `chat()`, `chat_json()`, **`generate_image()`** (image modality), and **token/image usage accounting** (`usage_snapshot()`/`reset_usage()`; splits chat vs. image tokens for accurate costing). |
| `pricing.py` | Token/image → USD cost. `estimate_cost(usage, gen, image)` + `rates_snapshot()`. Rates in USD/1M tokens (chat) + flat USD/image; overridable via `ILM_GEN_INPUT_PRICE`/`ILM_GEN_OUTPUT_PRICE`/`ILM_IMAGE_PRICE_USD`. |
| `image_gen.py` | Builds image prompts, generates raster visuals, `persist_data_url()` → writes PNG to `public/ilm-images/<run_id>/` and returns a short URL. |
| `models.py` | Pydantic `ConceptUnit` schema — the core contract. Visuals: `visual_image` (raster, current) + legacy `visual_*_html` (optional, SVG fallback). |
| `skills/skill1_extract.py` | Concept extraction. |
| `skills/skill2_analogy.py` | Analogy text **+ generated analogy image**. |
| `skills/skill3_explainer.py` | Explanation + scenarios (+ code playground) **+ generated images** (explanation & each scenario), made concurrently. |
| `skills/skill4_mcq.py` | Mini-quiz MCQs. |
| `skills/skill5_audit.py` | Eval gate 2 (code graders + LLM judge). Judge only sees text, not image data. |
| `graders/code_graders.py` | Deterministic checks. `check_visual_present()` accepts a raster image OR legacy SVG. |
| `server.py` | Flask async-job API. Endpoints: `/api/generate`, `/api/status/<id>`, `/api/review/<id>`, **`/api/image`** (stateless (re)generate one visual for the gate), **`/api/pricing`** (current token/image rates for UI cost estimation), **`/api/runs`** (dashboard run history via `run_history.load_runs()`), `/api/run`, `/api/units`, `/api/health`, `/api/sample`. |
| `human_gate.py` | CLI review path (`--auto-approve` for unattended). |
| `memory.py` / `memory_store.json` | Reviewer feedback → learned rules injected into skills. |
| `logging_store.py` | `RunLogger` → one JSON line per run in `runs/runs.jsonl` (includes a `usage` event). |
| `run_history.py` | **Dashboard aggregation.** `load_runs()` joins `runs/runs.jsonl` + `runs/usage.jsonl` by `run_id` → normalized per-run rows + summary totals ("lessons built" = finished + ≥1 published unit). Read-only over the logs (no DB). |
| `rubrics.json`, `parse_chunk.py`, `runner.py` | Rubrics; markdown chunking; server-side code execution for playgrounds. |

### Frontend — `src/ilm/`
| File | Role |
|------|------|
| `Ingest.tsx` | Ingest screen; drives the job, polls status, renders gates. `generateImage()` calls `/api/image`. |
| `ReviewGates.tsx` | `PartitionGate` (gate 1) + `UnitsGate` (gate 2). Gate 2 has the per-image **keep/drop + regenerate-with-feedback** control (`ImageControl`). |
| `ConceptUnitView.tsx` | Renders a unit. `Visual` prefers a raster `image`, falls back to legacy inline SVG `html`. |
| `types.ts` | TS mirror of the schema + gate payloads/decisions. |
| `Lesson.tsx`, `ilm.css` | Lesson shell; styles. |
| `UsagePanel.tsx` | Token usage & cost panel on the result screen (tokens, USD cost split text/image, per-concept cost, projection table). Uses `data.usage.cost` when present, else computes from `/api/pricing`. |
| `Dashboard.tsx` | **Run-history dashboard** ("how many ILMs built"). Fetches `/api/runs`; summary tiles (lessons built, concepts, cost, tokens) + a single-series **lessons-built-per-day** bar chart (one hue, hover tooltip) + a searchable/status-filterable/sortable run table. Toggled from `IlmApp.tsx`'s top-bar **"📊 History"** button. |
| `../components/CodePlayground.tsx`, `CodeRunner.tsx` | Web live-preview / server-run code. |
| `../data/conceptUnits.json` | Published output the renderer reads. |

## Visual subsystem (current design)

Visuals are **AI-generated raster images** (model `google/gemini-2.5-flash-image`
via OpenRouter, verified reachable on the project key). One image per
Explanation / Analogy / Scenario is generated during the build.

**Whole-unit regeneration (gate 2):** a per-unit "↻ Regenerate this unit with
feedback" action rebuilds that unit's *content* applying the note (feedback is
injected into `memory_block` → all skill prompts), re-audits, and re-opens the gate
for re-review. Implemented as a loop in the orchestrator gate-2 block keyed off
`action:"regenerate"`; prior status/note are forwarded so choices persist across
rounds. (The plain note without regenerate still only feeds next-run memory.)

**Human curation (gate 2):** each image is optional. The reviewer can **keep** or
**drop** it (not everything needs a visual), and **regenerate** any with feedback.
Dropped → field cleared; kept → persisted to `public/ilm-images/<run_id>/*.png`
(Vite serves it at `/ilm-images/…`) so `conceptUnits.json` stays small.
Generated images are **gitignored** (regenerated per run).

Legacy inline-SVG visuals (`visual_diagram_html`, `visual_html`) are no longer
generated but still **render as a fallback** for already-published units. The old
`visual_spec.py` (SVG spec) is now unused by the skills.

## Data contract quick ref (`models.py` / `types.ts`)
- `ConceptUnit`: `explanation{text, visual_image?, visual_diagram_html?}`,
  `analogy{text, visual_image?, visual_html?, grounding_check}`,
  `scenarios[]{text, visual_image?, code_playground?}`, `mini_quiz{questions[]}`,
  `review{status, reviewer?, notes?}`.
- Gate 2 decision: `reviews[unitId] = {status, note, images{explanation, analogy,
  scenarios[]}}` where an image value `""` means dropped.

## Token & cost usage

Every OpenRouter call's `usage` is accumulated per run and written to
**`runs/usage.jsonl`** (one line per run: `chat_calls`, `image_calls`,
`prompt/completion/total_tokens` + `chat_*`/`image_*` token splits, models, and a
nested **`cost`** breakdown). Also embedded in each run's `concept_units.json`
(`usage` key) and in the `runs/runs.jsonl` trace. **In-app visibility:** the
`UsagePanel` on the result screen shows tokens, USD cost (text vs. image),
per-concept cost, and a projection of what generating more concepts would cost.
Rates live in `agent/pricing.py` (served at `/api/pricing`); the UI computes cost
from `usage.cost` when present, else from the live rates (so pre-`cost` runs still
show money).

- Quick total: `cat runs/usage.jsonl | jq -s 'map(.total_tokens)|add'`.
- **Image calls dominate cost** — each ~1 image ≈ ~$0.03–0.04 on gemini flash
  image, and a full unit generates ~4 images (explanation + analogy + 2
  scenarios). Dropping images at the gate does NOT refund generation; to cut spend
  before generation, reduce concepts (`--limit`) or lower models.
- **Dev tip (saved preference):** keep `ILM_GEN_MODEL`/`ILM_JUDGE_MODEL` on a
  cheap tier while iterating.

## Gotchas / conventions
- **Key rotation:** `OPENROUTER_API_KEY` was shared in plaintext — should be rotated.
- **Not every OpenRouter id is reachable** on this key; image gen requires a model
  that returns the `image` modality (`google/gemini-2.5-flash-image` works;
  `…-image-preview` 404s).
- Image failures never sink a unit — skills catch and continue with no image.
- Concepts generate concurrently (`ILM_MAX_WORKERS`); the LLM client is thread-safe.
- Work autonomously — finish end-to-end without yes/no prompts (saved preference).

## Change log
- **2026-07-10 (17)** — **Fix: published-lesson images 404'd (broken-image icons).**
  Images showed at gate 2 (inline base64 data URLs) but the published lesson rendered
  broken icons. Root cause: change (13) added `public/ilm-images/**` to Vite's
  `server.watch.ignored` (to stop a publish from reloading the page) — but that ALSO
  makes Vite refuse to *serve* files CREATED in that folder after startup: it returns
  the SPA fallback (`index.html`, HTTP 200, `text/html`) instead of the image, so a
  freshly-built run's images load as HTML → broken. (A run whose folder already
  existed when Vite started served fine, which masked the bug.) Fix: serve the images
  from **Flask** instead of Vite's public dir — new `GET /ilm-images/<path>` route in
  `server.py` (`send_from_directory(config.IMAGE_DIR, …)`), and a `/ilm-images` proxy
  entry in `vite.config.ts` pointing at the backend (5174). Flask reads from disk per
  request, so new images always serve, and the watch-ignore (no-reload) behaviour is
  kept. Image paths/`IMAGE_URL_PREFIX` are unchanged (`/ilm-images/<run_id>/<file>`),
  so existing published data and the HTML export keep working. Verified with both
  servers up: a run folder created AFTER startup serves `image/webp` (200) through the
  Vite proxy (previously `text/html` 613 bytes). **Requires a Vite restart.**
- **2026-07-10 (16)** — **HTML export fidelity + robust image inlining.** Investigated
  a report that the exported standalone lesson looked unlike the live render with
  missing images. Root cause: image inlining could **fail silently** — a failed
  fetch left a **root-relative** `/ilm-images/…` src (unreachable in a standalone
  file), and a dev-server SPA fallback (`index.html`, HTTP 200) could be embedded as
  if it were an image. Verified with headless Chrome that the export DOES render
  faithfully when inlining succeeds (same-origin `fetch('/ilm-images/…')` returns the
  real webp). Fixes in `src/ilm/exportHtml.ts`: `toDataUrl` now fetches via an
  **absolute** URL (`absUrl`) and rejects non-`image/*` blobs; `inlineImages` returns
  `{map, failed}`, falling back to an absolute URL (works while the app runs) instead
  of a broken relative one; `buildLessonHtml` now returns `{html, missingImages}`.
  `IlmApp.tsx` `downloadHtml` alerts the user when any image couldn't be embedded (so
  a partial export is never silent) and says to re-export with the app running. Also
  added the hero **orbs** to the export CSS for closer parity with the app hero.
  Verified: happy path embeds 9/9 data URLs (screenshot matches the live lesson),
  SPA-fallback + network-error paths both report `missingImages:9` with no HTML
  embedded as images; `npx tsc -b` + `vite build` clean.
- **2026-07-09 (15)** — **Run-history dashboard ("how many ILMs built").** New
  read-only view over the pipeline's own logs — no database. `agent/run_history.py`
  `load_runs()` joins `runs/runs.jsonl` + `runs/usage.jsonl` by `run_id` into
  normalized rows + summary totals; a "lesson built" = finished (`status:"ok"`) with
  ≥1 published unit. To count that directly, `orchestrator.run_on_text` now stamps
  `generated_units`/`published_units` onto the trace (new `RunLogger.summarize()`)
  before `close("ok")`; pre-change rows fall back to counting `units[]` and are
  flagged `published_approx`. New `GET /api/runs` serves `{runs, summary}`. Frontend:
  `src/ilm/Dashboard.tsx` (summary tiles + single-series lessons-built-per-day bar
  chart with hover tooltip + searchable/filterable/sortable run table), toggled by a
  top-bar **"📊 History"** button in `IlmApp.tsx` (available with or without a loaded
  lesson); `RunRow`/`RunHistory`/`RunHistorySummary` in `types.ts`; `.ilm-dash*`
  styles (reusing the app's theme tokens) in `ilm.css`. Verified: `/api/runs` returns
  live totals (71 built / 74 runs / 300 concepts / $2.48), `npx tsc -b` + `vite build`
  clean. Additive — no existing behaviour changed.
- **2026-07-09 (14)** — **Back navigation between the human gates.** The reviewer
  can now step **back** at each gate. (1) Gate 2 (units) → gate 1 (partition): a
  "← Back to concept partition" button posts `{action:"back"}`; the orchestrator
  wraps gate1 → generate → gate2 in an **outer loop** so `back` discards the current
  units and re-opens the partition gate (units are rebuilt on re-approve — a
  `window.confirm` warns first). (2) Gate 1 (partition) → ingest/upload: a "← Back
  to upload" button posts `{action:"cancel"}` → new `orchestrator.PipelineCancelled`
  stops the worker thread cleanly (server catches it → job state `"cancelled"`, no
  generation spent) and the frontend resets to the upload screen. Generation +
  gate-2 finalize were factored into nested `_generate_units()`/`_finalize_reviews()`
  in `run_on_text` so the loop can re-run them; CLI/`auto_approve` path unchanged.
  Touched `orchestrator.py`, `server.py`, `Ingest.tsx` (`backToIngest`/`backToPartition`),
  `ReviewGates.tsx` (`onBack` on both gates). Verified with a mocked-LLM harness:
  gate2-back reopens gate1 then republishes; gate1-cancel raises PipelineCancelled;
  normal approve→approve still publishes. `npx tsc -b` clean.
- **2026-07-09 (13)** — **Fix: publish dropped back to the Ingest screen (dev server).**
  Publishing writes the result to `src/data/conceptUnits.json` (`config.FRONTEND_DATA`),
  which lives inside Vite's watched root — so each publish tripped a **full page
  reload**, wiping the in-memory React result and returning the user to step 1
  ("upload new reading material"). Fix is dev-only: `vite.config.ts` now sets
  `server.watch.ignored` for `**/src/data/conceptUnits.json` + `**/public/ilm-images/**`
  (the two paths the pipeline writes at publish time). Nothing imports these (the
  renderer reads the result over `/api`), so ignoring them is safe. Verified E2E
  (mocked API): gate 1 → gate 2 → Publish now renders the lesson and it *stays* on
  screen when the data file is (re)written. Requires a Vite restart to take effect.
- **2026-07-09 (12)** — **Export parity + usage behind a button.** (1) Rewrote
  `src/ilm/exportHtml.ts` so the downloaded standalone `.html` mirrors the live
  reading material: CSS ported from `Styles.css`/`ilm.css` (dark theme) and markup
  ported from `Lesson.tsx`/`ConceptUnitView.tsx`/`DataQuiz.tsx`/`CodePlayground.tsx`
  — centered hero + section layout, **one-question-at-a-time** mini-quiz (progress
  bar, aspect/difficulty badges, reveal + explanation, confetti, done card),
  gated sections (locked preview → continue breaker → next) + a course-complete
  score card, and a **tabbed HTML/CSS/JS playground** with live iframe preview +
  console (non-web code stays a read-only `.cr` block). (2) `IlmApp.tsx`: the
  `UsagePanel` is now hidden by default and toggled by a top-bar **"⛁ Tokens &
  cost"** button (only shown when `data.usage` exists) instead of always rendering
  in the reading material. Verified end-to-end in a headless browser (gating,
  quiz completion, playground Run). Additive.
- **2026-07-09 (11)** — **Token usage & cost visibility.** New `agent/pricing.py`
  turns the per-run usage snapshot into USD (rates USD/1M tokens for chat + flat
  USD/image; env-overridable). `llm._record_usage` now splits chat vs. image
  tokens so chat cost isn't mispriced by image-call tokens; orchestrator embeds a
  `cost` breakdown into `usage` (→ output + `runs/usage.jsonl` + trace + CLI print).
  New `/api/pricing` endpoint exposes live rates. Frontend: `src/ilm/UsagePanel.tsx`
  (rendered in `IlmApp.tsx` result view) shows total/prompt/completion tokens,
  chat+image call counts, total cost split text/image, cost per concept, and a
  projection table for generating N more concepts; prefers `usage.cost`, falls
  back to computing from `/api/pricing` for older runs. `types.ts` gained
  `Usage`/`UsageCost`/`UsageRates`; `.ilm-usage*` styles in `ilm.css`. Additive —
  no existing behaviour changed.
- **2026-07-08 (10)** — **Interactive HTML export (parity upgrade).** The standalone
  HTML export now embeds the app's dynamic behaviour as vanilla JS (fully offline):
  (1) **sequential gated units** — each unit's mini-quiz must be attempted before
  the next unlocks (lock-view / continue-button flow mirroring `Lesson.tsx`);
  (2) **editable + live-run web code playground** — HTML/CSS/JS textareas whose
  edits re-render an `<iframe srcdoc>` preview on input + Run ▶. Non-web code
  (Python/Java/…) stays a read-only block (running it needs the backend, absent in
  a static file). All in `src/ilm/exportHtml.ts`; `IlmApp.tsx` unchanged.
- **2026-07-08 (9)** — **Standalone HTML export.** New "↓ Export HTML" button (top
  bar, next to Export JSON) downloads the approved lesson as ONE self-contained
  `.html` file — inlined CSS, images embedded as data URLs (fetched from
  `/ilm-images` at export time), an interactive self-checking mini-quiz (tiny
  vanilla-JS), and web code-playgrounds rendered as `<iframe srcdoc>` live
  previews (non-web code shown as labelled blocks). Pure frontend + additive:
  `src/ilm/exportHtml.ts` (`buildLessonHtml()`), wired in `IlmApp.tsx`
  (`downloadHtml`). JSON export and renderer untouched.
- **2026-07-08 (8)** — **Export JSON button.** Top-bar "↓ Export JSON" (shown once a
  run completes + is approved) downloads the full result object — the exact shape
  the backend publishes to `conceptUnits.json`. Frontend-only:
  `IlmApp.tsx` (`downloadJson`), `.ilm-dlbtn` in `ilm.css`.
- **2026-07-08 (7)** — **Windows UTF-8 fix.** The pipeline prints/writes Unicode
  glyphs (`→ ⚠ ✓ ·`) and reads UTF-8 source docs, but on Windows the console +
  default file encoding is `cp1252`, whose `charmap` codec can't encode/decode
  them → `UnicodeEncodeError`/`DecodeError` (crashed mid-run, e.g. writing
  `concept_units.json`). Fixes: (1) `agent/__init__.py` reconfigures
  `stdout`/`stderr` to UTF-8 on import (every entry point gets it); (2) all file
  writes now pass `encoding="utf-8"` (`orchestrator.py` output + usage.jsonl,
  `logging_store.py`, `memory.py`, `runner.py`, `llm.py` parse-fail dump); (3) all
  content/JSON reads now pass `encoding="utf-8"` (`orchestrator.py` doc read,
  `server.py` sample/units, `config.py` .env, `memory.py`, `rubrics.py`,
  `evals/run_evals.py`). Also note: the `npm run dev` scripts are Unix-only
  (`fuser`, `.venv/bin/python`); on Windows launch the two servers directly
  (`.venv/Scripts/python.exe -m agent.server` + `npx vite`); Vite binds IPv6
  (`localhost:5173`), API binds IPv4 (`127.0.0.1:5174`).
- **2026-07-08 (6)** — Sharper image text: strengthened the image prompt (`_STYLE`)
  to demand ≤3-5 short, large, high-contrast, correctly-spelled labels (no tiny/
  gibberish text, prefer icons), and raised default WebP quality 80→90 so small
  labels don't blur. Also capped visual *display* size (360×320) in `ilm.css`.
- **2026-07-08 (5)** — Regeneration is now **per-part**, not whole-unit. Each unit at
  gate 2 has independent feedback+regenerate for Explanation / Analogy / Quiz and per
  Scenario (regenerate + 🗑 remove). Only that part hits the LLM; its image
  auto-refreshes. Backend: `orchestrator.regenerate_part()` mutates one part in place,
  `skill3.generate_one_scenario()` + `build_explainer(include_scenarios=False)`,
  `unit_display()` shared helper, `POST /api/regenerate-part` over live units exposed
  via `units_sink`/`GATE_UNITS` (changed units re-audited on Publish). Removed the old
  whole-unit `regenerate-unit` endpoint + `_regenerated`/`REGEN` path. Frontend:
  `PartControl`, per-part wiring in `ReviewGates.tsx`/`Ingest.tsx`.
- **2026-07-08 (4)** — Shrunk generated images ~**36×** (890 KB PNG → ~24 KB). All
  visuals are now downscaled (longest side `ILM_IMAGE_MAX_DIM`=1024) and re-encoded
  to WebP (`ILM_IMAGE_QUALITY`=80) in `image_gen.compress_data_url()`, applied in
  `generate_visual()`. Added **Pillow** dep. Tunable via `ILM_IMAGE_MAX_DIM/QUALITY/FORMAT`.
- **2026-07-08 (3)** — Unit regeneration is now **in place, single-unit**, mirroring
  the image flow. New stateless `POST /api/regenerate-unit/<job_id>` +
  `orchestrator.regenerate_unit()` rebuild ONLY that unit, stash it in server-side
  `REGEN[job_id]`, and it's swapped into the run via `decision["_regenerated"]` on
  Publish (removed the gate round-trip loop). Frontend holds `unitsState` and swaps
  just that card — no other unit re-renders. Per-**image** regenerate now **requires
  feedback** (first-time generate still optional). Touched `orchestrator.py`,
  `server.py`, `ReviewGates.tsx`, `Ingest.tsx`, `types.ts`, `ilm.css`.
- **2026-07-08 (2)** — Made regenerate feedback *authoritative* and the UI *local*.
  Feedback is now injected as a HIGH-PRIORITY late override inside each skill prompt
  (new `reviewer_feedback` param on skills 2/3/4 + `build_unit`), so "remove Scenario
  2" actually drops it — skill3 scenario count is now 1–2. Frontend: the gate stays
  on screen during a single-unit regen (no drop to global progress), remounts fresh
  via a `gateSeq` key, and shows an inline "Regenerating this unit…" spinner. Only
  the clicked unit rebuilds (backend was already single-unit; this fixes the *look*).
  Touched skills 2/3/4, `orchestrator.py`, `Ingest.tsx`, `ReviewGates.tsx`, `ilm.css`.
- **2026-07-08** — Whole-unit feedback now **regenerates the unit's content** in
  gate 2 (was: fed only next-run memory). New per-unit "↻ Regenerate with feedback"
  action → orchestrator gate-2 regeneration loop (`action:"regenerate"`, feedback
  injected via `memory_block`, re-audit, re-open gate); prior status/note forwarded
  in the payload so choices persist across rounds. Touched `orchestrator.py`,
  `ReviewGates.tsx`, `types.ts`, `ilm.css`.
- **2026-07-07** — Switched visuals from inline SVG to **AI-generated raster
  images** (`agent/image_gen.py`, `llm.generate_image`, `ILM_IMAGE_MODEL`). Gate 2
  gained per-image **keep/drop + regenerate-with-feedback** (`ImageControl` in
  `ReviewGates.tsx`, `/api/image` endpoint, `_apply_image_decision`/
  `_persist_unit_images` in orchestrator). Images persisted to gitignored
  `public/ilm-images/`. Added **token/image usage tracking** →
  `runs/usage.jsonl` + `usage` in output/trace. Added this harness (`CLAUDE.md`).
  Legacy SVG kept as render-only fallback; `visual_spec.py` now unused.
</content>
</invoke>

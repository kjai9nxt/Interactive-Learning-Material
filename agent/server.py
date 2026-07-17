"""Web API for the ILM pipeline (async job model).

Generation can take a while on large documents, so we do NOT block one long HTTP
request (that caused empty/timed-out responses behind the dev proxy). Instead:

    POST /api/generate      -> starts a background job, returns {job_id}
    GET  /api/status/<id>   -> {state, progress, result?, error?}

The frontend polls /api/status and shows real progress. Jobs live in memory
(fine for V1 / single process).

Run:  python -m agent.server   (http://127.0.0.1:5174)
"""
from __future__ import annotations

import json
import threading
import traceback
import uuid

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

from . import config, image_gen, pricing, run_history
from .orchestrator import run_on_text, regenerate_part, unit_display, PipelineCancelled
from .runner import run_code, supported_languages, installed_languages

app = Flask(__name__)
CORS(app)

# job_id -> {state: queued|running|awaiting|done|error, progress, review?, result?, error?}
# `review` (JSON-serializable) is the payload the human must act on while awaiting.
JOBS: dict[str, dict] = {}
JOBS_LOCK = threading.Lock()

# job_id -> {"event": threading.Event, "decision": dict|None}. Kept OUT of JOBS so
# /api/status can jsonify the job snapshot (an Event is not serializable).
GATES: dict[str, dict] = {}

# job_id -> {"units": [live unit dicts], "changed": set, "lock": Lock}. Registered
# when gate 2 opens so /api/regenerate-part can mutate ONE part of ONE unit in place
# (these are the very objects the paused run holds, so mutations are already applied
# on Publish). Guarded by GATE_UNITS_LOCK for the store map itself.
GATE_UNITS: dict[str, dict] = {}
GATE_UNITS_LOCK = threading.Lock()

# How long a paused job waits for a human before it auto-approves and moves on,
# so an abandoned browser tab never wedges a worker thread forever.
GATE_TIMEOUT_S = 60 * 60


def _set(job_id: str, **kw):
    with JOBS_LOCK:
        JOBS.setdefault(job_id, {}).update(kw)


def _run_job(job_id: str, md: str, doc_name: str, limit, llm_audit: bool):
    _set(job_id, state="running", progress={"stage": "starting"})

    def on_progress(p):
        _set(job_id, progress=p)

    def gate(kind: str, payload: dict) -> dict:
        """Block the pipeline and hand `payload` to the browser for review. Returns
        the human's decision (posted to /api/review). Auto-approves on timeout."""
        ev = threading.Event()
        with JOBS_LOCK:
            GATES[job_id] = {"event": ev, "decision": None}
            JOBS.setdefault(job_id, {}).update(
                state="awaiting", review={"kind": kind, **payload})
        got = ev.wait(timeout=GATE_TIMEOUT_S)
        with JOBS_LOCK:
            decision = (GATES.get(job_id) or {}).get("decision") if got else None
            GATES.pop(job_id, None)
            JOBS.setdefault(job_id, {}).update(state="running", review=None)
        return decision or {"action": "approve"}

    def units_sink(store: dict):
        """Register the live unit dicts (+ their llm_audit setting) so
        /api/regenerate-part can rebuild one part of one unit in place."""
        store["llm_audit"] = llm_audit
        with GATE_UNITS_LOCK:
            GATE_UNITS[job_id] = store

    try:
        out = run_on_text(
            md, doc_name,
            use_llm_audit=llm_audit,
            publish=True,
            limit=int(limit) if limit else None,
            progress=on_progress,
            gate=gate,               # human-in-the-loop: partition + per-unit review
            units_sink=units_sink,   # exposes live units to /api/regenerate-part
        )
        _set(job_id, state="done", result=out, progress={"stage": "done"})
    except PipelineCancelled:
        # Reviewer backed out of gate 1 to the ingest screen — a clean, expected
        # stop (not an error). The browser has already navigated away.
        _set(job_id, state="cancelled", progress={"stage": "cancelled"})
    except Exception as e:
        traceback.print_exc()
        _set(job_id, state="error", error=str(e))
    finally:
        with JOBS_LOCK:
            GATES.pop(job_id, None)
        with GATE_UNITS_LOCK:
            GATE_UNITS.pop(job_id, None)


@app.get("/ilm-images/<path:subpath>")
def ilm_image(subpath: str):
    """Serve a persisted concept-unit image from public/ilm-images/<run_id>/<file>.

    The generated images live under Vite's `public/` dir, but that dir is in Vite's
    `server.watch.ignored` list (so a publish doesn't trigger a full page reload).
    A side effect is that Vite will NOT serve files CREATED in that folder after it
    started — it answers the SPA fallback (index.html) instead, so a freshly-built
    run's images render as broken. Serving them from Flask (which reads from disk
    per request) and proxying `/ilm-images` here in vite.config.ts fixes that: new
    images are always served, and the no-reload behaviour is preserved."""
    return send_from_directory(config.IMAGE_DIR, subpath)


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "gen_model": config.GEN_MODEL,
                    "judge_model": config.JUDGE_MODEL,
                    "runnable_languages": supported_languages(),
                    "installed_languages": installed_languages()})


@app.get("/api/pricing")
def pricing_route():
    """Current token/image pricing (USD) so the UI can compute cost + projections
    even for usage records that predate embedded cost."""
    return jsonify(pricing.rates_snapshot())


@app.get("/api/runs")
def runs_history():
    """Aggregated run history for the dashboard: joins runs.jsonl + usage.jsonl by
    run_id → {runs: [...newest first], summary: {...}}. Read-only over the logs."""
    return jsonify(run_history.load_runs())


@app.post("/api/run")
def run():
    """Execute a code playground snippet. Body: {language, code}."""
    data = request.get_json(force=True, silent=True) or {}
    language = (data.get("language") or "").strip()
    code = data.get("code") or ""
    if not code.strip():
        return jsonify({"error": "code is required"}), 400
    return jsonify(run_code(language, code))


@app.get("/api/sample")
def sample():
    path = config.INPUT_DIR / "ai_agents.md"
    text = path.read_text(encoding="utf-8") if path.exists() else ""
    return jsonify({"name": "ai_agents.md", "markdown": text})


@app.get("/api/units")
def current_units():
    if config.FRONTEND_DATA.exists():
        return jsonify(json.loads(config.FRONTEND_DATA.read_text(encoding="utf-8")))
    return jsonify({"units": [], "published_units": 0, "generated_units": 0})


@app.post("/api/image")
def image():
    """Generate (or regenerate) a single visual for the review gate.
    Body: {kind: "explanation"|"analogy"|"scenario", title, text, feedback?}.
    Returns {image: <data URL>}. Stateless — used when the reviewer adds an image
    or regenerates one with feedback, so it doesn't touch the paused job."""
    data = request.get_json(force=True, silent=True) or {}
    kind = (data.get("kind") or image_gen.KIND_EXPLANATION).strip()
    title = (data.get("title") or "").strip()
    text = (data.get("text") or "").strip()
    feedback = (data.get("feedback") or "").strip()
    if not text:
        return jsonify({"error": "text is required"}), 400
    try:
        url = image_gen.generate_visual(kind, title, text, feedback=feedback)
        return jsonify({"image": url})
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@app.post("/api/regenerate-part/<job_id>")
def regenerate_part_route(job_id: str):
    """Regenerate ONE PART of one unit in place at gate 2 — nothing else is touched.
    Body: {unit_id, part: "analogy"|"explanation"|"quiz"|"scenario",
           scenario_index?, op?: "regenerate"|"remove"|"add", feedback?}.
    Returns the updated unit's display fields (that one card refreshes)."""
    data = request.get_json(force=True, silent=True) or {}
    unit_id = data.get("unit_id")
    part = (data.get("part") or "").strip()
    op = (data.get("op") or "regenerate").strip()
    feedback = (data.get("feedback") or "").strip()
    # Feedback is required for every regeneration (there's no point without
    # direction); only a scenario "remove" needs none.
    if not (part == "scenario" and op == "remove") and not feedback:
        return jsonify({"error": "feedback is required to regenerate"}), 400

    with GATE_UNITS_LOCK:
        store = GATE_UNITS.get(job_id)
    if store is None:
        return jsonify({"error": "no unit review is currently open for this job"}), 404
    unit = next((u for u in store["units"] if u["id"] == unit_id), None)
    if unit is None:
        return jsonify({"error": f"unknown unit {unit_id}"}), 404

    try:
        with store["lock"]:
            regenerate_part(unit, part=part, feedback=feedback,
                            scenario_index=data.get("scenario_index"), op=op)
            store["changed"].add(unit_id)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 502
    return jsonify(unit_display(unit))


@app.post("/api/generate")
def generate():
    """Start a generation job. Body: {markdown, doc_name?, limit?, llm_audit?}."""
    data = request.get_json(force=True, silent=True) or {}
    md = (data.get("markdown") or "").strip()
    if not md:
        return jsonify({"error": "markdown is required"}), 400
    doc_name = (data.get("doc_name") or "pasted.md").strip() or "pasted.md"
    llm_audit = bool(data.get("llm_audit", True))
    job_id = "job_" + uuid.uuid4().hex[:10]
    # Stash llm_audit so an in-place unit regeneration audits the same way.
    _set(job_id, state="queued", progress={"stage": "queued"}, llm_audit=llm_audit)
    t = threading.Thread(
        target=_run_job,
        args=(job_id, md, doc_name, data.get("limit"), llm_audit),
        daemon=True,
    )
    t.start()
    return jsonify({"job_id": job_id})


@app.post("/api/review/<job_id>")
def review(job_id: str):
    """Submit a human decision for a paused (awaiting) job and resume it.
    Body for the partition gate: {action:"approve", concepts:[...], feedback?}
                             or  {action:"revise", feedback:"..."}.
    Body for the units gate:     {reviews: {"<unit_id>": {status, note}}}."""
    data = request.get_json(force=True, silent=True) or {}
    with JOBS_LOCK:
        g = GATES.get(job_id)
        if g is None:
            return jsonify({"error": "no pending review for this job"}), 404
        g["decision"] = data
        g["event"].set()
    return jsonify({"ok": True})


@app.get("/api/status/<job_id>")
def status(job_id: str):
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        snapshot = dict(job) if job else None
    if snapshot is None:
        return jsonify({"error": "unknown job_id"}), 404
    return jsonify(snapshot)


if __name__ == "__main__":
    print(f"ILM API on http://127.0.0.1:5174  (generator: {config.GEN_MODEL})")
    app.run(host="127.0.0.1", port=5174, debug=False, threaded=True)

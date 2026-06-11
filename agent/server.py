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

from flask import Flask, jsonify, request
from flask_cors import CORS

from . import config
from .orchestrator import run_on_text

app = Flask(__name__)
CORS(app)

# job_id -> {state: queued|running|done|error, progress: {...}, result?, error?}
JOBS: dict[str, dict] = {}
JOBS_LOCK = threading.Lock()


def _set(job_id: str, **kw):
    with JOBS_LOCK:
        JOBS.setdefault(job_id, {}).update(kw)


def _run_job(job_id: str, md: str, doc_name: str, limit, llm_audit: bool):
    _set(job_id, state="running", progress={"stage": "starting"})

    def on_progress(p):
        _set(job_id, progress=p)

    try:
        out = run_on_text(
            md, doc_name,
            auto_approve=True,        # web V1 stays Assist/Recommend: clean = ship
            use_llm_audit=llm_audit,
            publish=True,
            limit=int(limit) if limit else None,
            progress=on_progress,
        )
        _set(job_id, state="done", result=out, progress={"stage": "done"})
    except Exception as e:
        traceback.print_exc()
        _set(job_id, state="error", error=str(e))


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "gen_model": config.GEN_MODEL,
                    "judge_model": config.JUDGE_MODEL})


@app.get("/api/sample")
def sample():
    path = config.INPUT_DIR / "ai_agents.md"
    text = path.read_text() if path.exists() else ""
    return jsonify({"name": "ai_agents.md", "markdown": text})


@app.get("/api/units")
def current_units():
    if config.FRONTEND_DATA.exists():
        return jsonify(json.loads(config.FRONTEND_DATA.read_text()))
    return jsonify({"units": [], "published_units": 0, "generated_units": 0})


@app.post("/api/generate")
def generate():
    """Start a generation job. Body: {markdown, doc_name?, limit?, llm_audit?}."""
    data = request.get_json(force=True, silent=True) or {}
    md = (data.get("markdown") or "").strip()
    if not md:
        return jsonify({"error": "markdown is required"}), 400
    doc_name = (data.get("doc_name") or "pasted.md").strip() or "pasted.md"
    job_id = "job_" + uuid.uuid4().hex[:10]
    _set(job_id, state="queued", progress={"stage": "queued"})
    t = threading.Thread(
        target=_run_job,
        args=(job_id, md, doc_name, data.get("limit"), bool(data.get("llm_audit", True))),
        daemon=True,
    )
    t.start()
    return jsonify({"job_id": job_id})


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

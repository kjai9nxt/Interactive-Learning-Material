import { useState, useEffect, useRef } from "react";
import type { ConceptUnitsFile } from "./types";

/* Ingest screen — paste or upload a Markdown reading material, then run the
   agent pipeline (POST /api/generate) and hand the result to the renderer. */

/* Ordered pipeline steps shown as a checklist. The index a given backend stage
   maps to tells us which steps are done (✓), which is active, and which pend. */
const STEPS = [
  "Parse & chunk the document",
  "Skill 1 — extract concepts",
  "Eval gate 1 — coverage & grounding",
  "Skills 2–5 — generate units + eval-audit",
  "Human gate — approve clean units",
];
const STAGE_INDEX: Record<string, number> = {
  queued: 0, starting: 0, parsing: 0,
  extracting: 1,
  generating: 3,   // gate 1 (idx 2) is instant — marked done once generating starts
  reviewing: 4,
  done: STEPS.length,  // everything done
};

async function safeJson(res: Response) {
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { throw new Error(text ? `Server returned non-JSON: ${text.slice(0, 120)}` : "Empty response from server"); }
}

export default function Ingest({ onResult }: { onResult: (data: ConceptUnitsFile) => void }) {
  const [markdown, setMarkdown] = useState("");
  const [docName, setDocName] = useState("pasted.md");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ stage: string; total?: number; done?: number }>({ stage: "queued" });
  const [elapsed, setElapsed] = useState(0);
  const [model, setModel] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then((d) => setModel(d.gen_model || "")).catch(() => {});
  }, []);

  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    const clock = window.setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => window.clearInterval(clock);
  }, [busy]);

  const loadExample = async () => {
    setError(null);
    try {
      const d = await (await fetch("/api/sample")).json();
      setMarkdown(d.markdown || "");
      setDocName(d.name || "sample.md");
    } catch {
      setError("Could not load the sample. Is the backend running (python -m agent.server)?");
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setDocName(f.name);
    const reader = new FileReader();
    reader.onload = () => setMarkdown(String(reader.result || ""));
    reader.readAsText(f);
  };

  const generate = async () => {
    if (!markdown.trim()) { setError("Paste or upload some Markdown first."); return; }
    setError(null); setBusy(true); setElapsed(0); setProgress({ stage: "queued" });
    try {
      // 1) start the job
      const startRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown, doc_name: docName }),
      });
      const start = await safeJson(startRes);
      if (!startRes.ok) throw new Error(start.error || `Request failed (${startRes.status})`);
      const jobId = start.job_id as string;

      // 2) poll status until done / error
      for (;;) {
        await new Promise((r) => setTimeout(r, 1200));
        const stRes = await fetch(`/api/status/${jobId}`);
        const st = await safeJson(stRes);
        if (!stRes.ok) throw new Error(st.error || "Lost the job");
        if (st.progress) setProgress(st.progress);
        if (st.state === "done") { onResult(st.result as ConceptUnitsFile); return; }
        if (st.state === "error") throw new Error(st.error || "Generation failed");
      }
    } catch (e: any) {
      setError(e.message || "Generation failed. Check that the backend is running.");
      setBusy(false);
    }
  };

  const wordCount = markdown.trim() ? markdown.trim().split(/\s+/).length : 0;

  return (
    <div className="ingest">
      <div className="ingest-card">
        <div className="ingest-tag">{model ? `Powered by ${model}` : "Interactive Learning Material"}</div>
        <h1>Turn reading material into an <span className="gradient">interactive lesson</span></h1>
        <p className="ingest-lede">
          Paste or upload a Markdown document. The agent extracts the concepts and builds a
          grounded explanation, a faithful analogy, real scenarios, and a misconception-aware
          quiz for each — every unit passing an eval gate before it ships.
        </p>

        {!busy ? (
          <>
            <div className="ingest-toolbar">
              <button className="ingest-secondary" onClick={loadExample}>Load example</button>
              <button className="ingest-secondary" onClick={() => fileRef.current?.click()}>Upload .md file</button>
              <input ref={fileRef} type="file" accept=".md,.markdown,.txt" hidden onChange={onFile} />
              <span className="ingest-meta">{wordCount} words · {docName}</span>
            </div>
            <textarea
              className="ingest-textarea"
              placeholder="# Paste your Markdown reading material here&#10;&#10;## A concept&#10;Explain the concept in plain prose…"
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              spellCheck={false}
            />
            {error && <div className="ingest-error">{error}</div>}
            <button className="ingest-primary" onClick={generate} disabled={!markdown.trim()}>
              Generate interactive lesson →
            </button>
            <p className="ingest-hint">Runs all 5 skills + the eval gate per concept (in parallel) — usually under a minute.</p>
          </>
        ) : (
          <div className="ingest-progress">
            <div className="ingest-spinner" />
            <div className="ingest-stage">Building your interactive lesson…</div>
            <div className="ingest-elapsed">
              {progress.stage === "generating" && progress.total
                ? `${progress.done || 0} of ${progress.total} concepts done · ${elapsed}s elapsed`
                : `${elapsed}s elapsed · running real Claude calls in parallel`}
            </div>
            <div className="ingest-steps">
              {STEPS.map((s, i) => {
                const active = STAGE_INDEX[progress.stage] ?? 0;
                const isDone = i < active;
                const isActive = i === active;
                const showCount = isActive && progress.stage === "generating" && progress.total;
                return (
                  <div key={i} className={`ingest-step ${isDone ? "done" : isActive ? "active" : ""}`}>
                    <span className="ingest-step-dot">{isDone ? "✓" : i + 1}</span>
                    <span>{s}{showCount ? `  (${progress.done || 0}/${progress.total})` : ""}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

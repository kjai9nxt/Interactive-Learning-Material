import { useState, useEffect, useRef } from "react";
import type { ConceptUnitsFile, GatePayload, UnitReviewItem } from "./types";
import { PartitionGate, UnitsGate } from "./ReviewGates";

/* Ingest screen — paste or upload a Markdown reading material, then run the
   agent pipeline (POST /api/generate) and hand the result to the renderer. */

/* Ordered pipeline steps shown as a checklist. The index a given backend stage
   maps to tells us which steps are done (✓), which is active, and which pend. */
const STEPS = [
  "Parse & chunk the document",
  "Skill 1 — extract concepts",
  "Human gate 1 — approve the concept split",
  "Skills 2–5 — generate units + eval-audit",
  "Human gate 2 — review & approve units",
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
  const [gate, setGate] = useState<GatePayload | null>(null);
  // Bumped every time a gate (re)opens, used as a React key so the gate component
  // remounts with fresh data after a regeneration round (its useState initializers
  // re-run) instead of showing stale content.
  const [gateSeq, setGateSeq] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const jobRef = useRef<string | null>(null);

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

  // Poll the job until it either finishes, errors, or pauses at a human gate.
  // On a gate we surface the payload and stop; submitReview() resumes the poll.
  const pollUntilGateOrDone = async (jobId: string) => {
    for (;;) {
      await new Promise((r) => setTimeout(r, 1200));
      const stRes = await fetch(`/api/status/${jobId}`);
      const st = await safeJson(stRes);
      if (!stRes.ok) throw new Error(st.error || "Lost the job");
      if (st.progress) setProgress(st.progress);
      if (st.state === "awaiting" && st.review) {
        setGate(st.review as GatePayload);
        setGateSeq((n) => n + 1);  // force a fresh mount of the gate
        return;
      }
      if (st.state === "done") { setBusy(false); onResult(st.result as ConceptUnitsFile); return; }
      if (st.state === "error") throw new Error(st.error || "Generation failed");
    }
  };

  const generate = async () => {
    if (!markdown.trim()) { setError("Paste or upload some Markdown first."); return; }
    setError(null); setBusy(true); setGate(null); setElapsed(0); setProgress({ stage: "queued" });
    try {
      const startRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown, doc_name: docName }),
      });
      const start = await safeJson(startRes);
      if (!startRes.ok) throw new Error(start.error || `Request failed (${startRes.status})`);
      jobRef.current = start.job_id as string;
      await pollUntilGateOrDone(jobRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed. Check that the backend is running.");
      setBusy(false);
    }
  };

  // Send a human decision for the current gate, then resume polling.
  const submitReview = async (decision: unknown) => {
    const jobId = jobRef.current;
    if (!jobId) return;
    setSubmitting(true); setError(null);
    try {
      const res = await fetch(`/api/review/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(decision),
      });
      const body = await safeJson(res);
      if (!res.ok) throw new Error(body.error || "Could not submit review");
      // Keep the current gate on screen (don't drop to the global progress view):
      // a "regenerate" reopens the gate with just that unit rebuilt, and pollUntil
      // will swap in the fresh payload. A "publish" ends at state==="done".
      await pollUntilGateOrDone(jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit your review.");
    } finally {
      setSubmitting(false);
    }
  };

  // Back out of gate 1 (concept partition) to the ingest/upload screen. Tells the
  // backend to cancel the paused run so its worker thread stops (rather than sitting
  // blocked and later auto-approving), then resets the UI. Nothing expensive has
  // been generated yet at gate 1, so this just discards the extraction.
  const backToIngest = async () => {
    const jobId = jobRef.current;
    jobRef.current = null;
    setGate(null); setBusy(false); setSubmitting(false); setError(null);
    setProgress({ stage: "queued" });
    if (jobId) {
      try {
        await fetch(`/api/review/${jobId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "cancel" }),
        });
      } catch { /* ignore — an abandoned job times out on its own */ }
    }
  };

  // Back out of gate 2 (units) to gate 1 (concept partition). The generated units
  // are discarded and rebuilt once the (possibly edited) split is re-approved.
  const backToPartition = () => {
    if (!window.confirm(
      "Go back to the concept partition?\n\nThe units generated in this round will be discarded and rebuilt when you approve the split again.",
    )) return;
    submitReview({ action: "back" });
  };

  // Generate / regenerate a single visual for the review gate (stateless — does
  // not touch the paused job). Returns the new image as a data URL.
  const generateImage = async (
    kind: "explanation" | "analogy" | "scenario",
    title: string,
    text: string,
    feedback: string,
  ): Promise<string> => {
    const res = await fetch("/api/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, title, text, feedback }),
    });
    const body = await safeJson(res);
    if (!res.ok) throw new Error(body.error || "Image generation failed");
    return body.image as string;
  };

  // Regenerate ONE PART of a unit in place. Only that part is rebuilt on the backend
  // (its image auto-refreshes); returns the updated unit display for that one card.
  const regeneratePart = async (
    unitId: string,
    opts: {
      part: "explanation" | "analogy" | "quiz" | "scenario";
      scenarioIndex?: number;
      op?: "regenerate" | "remove" | "add";
      feedback: string;
    },
  ): Promise<UnitReviewItem> => {
    const jobId = jobRef.current;
    if (!jobId) throw new Error("No active job to regenerate against.");
    const res = await fetch(`/api/regenerate-part/${jobId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        unit_id: unitId,
        part: opts.part,
        scenario_index: opts.scenarioIndex,
        op: opts.op ?? "regenerate",
        feedback: opts.feedback,
      }),
    });
    const body = await safeJson(res);
    if (!res.ok) throw new Error(body.error || "Regeneration failed");
    return body as UnitReviewItem;
  };

  const wordCount = markdown.trim() ? markdown.trim().split(/\s+/).length : 0;

  if (gate) {
    return (
      <div className="ingest">
        <div className="ingest-card rg-card">
          {gate.kind === "partition" ? (
            <PartitionGate
              key={gateSeq}
              concepts={gate.concepts}
              submitting={submitting}
              onApprove={(concepts, feedback) => submitReview({ action: "approve", concepts, feedback })}
              onRevise={(feedback) => submitReview({ action: "revise", feedback })}
              onBack={backToIngest}
            />
          ) : (
            <UnitsGate
              key={gateSeq}
              units={gate.units}
              submitting={submitting}
              onGenerateImage={generateImage}
              onRegeneratePart={regeneratePart}
              onSubmit={(reviews) => submitReview({ reviews })}
              onBack={backToPartition}
            />
          )}
          {error && <div className="ingest-error">{error}</div>}
        </div>
      </div>
    );
  }

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

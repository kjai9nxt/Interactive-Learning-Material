import { useState } from "react";
import type { ProposedConcept, UnitReviewItem, UnitReviewDecision } from "./types";
import { Visual } from "./ConceptUnitView";

/* Request a (re)generated image from the backend for one visual. `kind` picks the
   framing (explanation/analogy/scenario); `feedback` steers a regeneration. */
export type GenerateImage = (
  kind: "explanation" | "analogy" | "scenario",
  title: string,
  text: string,
  feedback: string,
) => Promise<string>;

/* Regenerate ONE PART of a unit in place. Returns the updated unit display — only
   that part changed; its image is auto-refreshed to match. */
export type RegeneratePart = (
  unitId: string,
  opts: {
    part: "explanation" | "analogy" | "quiz" | "scenario";
    scenarioIndex?: number;
    op?: "regenerate" | "remove" | "add";
    feedback: string;
  },
) => Promise<UnitReviewItem>;

/* Human-in-the-loop review gates. The pipeline pauses on the backend and the
   Ingest screen renders one of these; the returned decision is POSTed to
   /api/review/<job_id>, which resumes the run. Any feedback typed here is fed to
   the agent's memory, so the next run learns from it and won't repeat the miss. */

/* ── Gate 1: approve / edit / merge / re-extract the concept partition ─────── */
export function PartitionGate({
  concepts,
  onApprove,
  onRevise,
  submitting,
}: {
  concepts: ProposedConcept[];
  onApprove: (concepts: ProposedConcept[], feedback: string) => void;
  onRevise: (feedback: string) => void;
  submitting: boolean;
}) {
  const [list, setList] = useState<ProposedConcept[]>(concepts);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState("");

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const mergeSelected = () => {
    const picked = list.filter((c) => selected.has(c.id));
    if (picked.length < 2) return;
    const merged: ProposedConcept = {
      id: picked[0].id,
      title: picked.map((c) => c.title).join(" & "),
      summary: picked.map((c) => c.summary).filter(Boolean).join(" "),
      source_span: picked.map((c) => c.source_span).join("\n\n"),
      is_code_concept: picked.some((c) => c.is_code_concept),
    };
    // Replace the first-selected in place; drop the rest.
    const out: ProposedConcept[] = [];
    for (const c of list) {
      if (c.id === picked[0].id) out.push(merged);
      else if (!selected.has(c.id)) out.push(c);
    }
    setList(out);
    setSelected(new Set());
  };

  const remove = (id: string) => {
    setList((l) => l.filter((c) => c.id !== id));
    setSelected((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  };

  const editTitle = (id: string, title: string) =>
    setList((l) => l.map((c) => (c.id === id ? { ...c, title } : c)));

  return (
    <div className="rg">
      <div className="rg-head">
        <div className="rg-kicker">Human gate 1 of 2 · Concept partition</div>
        <h2>Approve how the document was split into concept units</h2>
        <p className="rg-lede">
          The agent proposes {list.length} concept unit{list.length === 1 ? "" : "s"}.
          Rename, merge, or drop any of them — then approve to build. Or leave feedback
          and re-extract; the agent learns from it for next time.
        </p>
      </div>

      <div className="rg-toolbar">
        <button
          className="rg-btn"
          disabled={selected.size < 2 || submitting}
          onClick={mergeSelected}
          title="Combine the checked units into one (their source text is joined)"
        >
          ⛶ Merge selected ({selected.size})
        </button>
        <span className="rg-hint">Tick two or more units to merge them into one.</span>
      </div>

      <ol className="rg-list">
        {list.map((c) => (
          <li key={c.id} className={`rg-item ${selected.has(c.id) ? "sel" : ""}`}>
            <label className="rg-check">
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => toggle(c.id)}
              />
            </label>
            <div className="rg-item-body">
              <input
                className="rg-title-input"
                value={c.title}
                onChange={(e) => editTitle(c.id, e.target.value)}
                spellCheck={false}
              />
              {c.summary && <div className="rg-summary">{c.summary}</div>}
              <div className="rg-span">{c.source_span}</div>
            </div>
            <button className="rg-remove" onClick={() => remove(c.id)} title="Drop this unit" disabled={submitting}>
              ✕
            </button>
          </li>
        ))}
      </ol>

      <label className="rg-fb-label">Feedback to the agent (optional — recorded to memory)</label>
      <textarea
        className="rg-textarea"
        placeholder="e.g. “Merge the two heading concepts into one” or “<head> and <body> should be separate units”…"
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
      />

      <div className="rg-actions">
        <button
          className="rg-btn ghost"
          disabled={!feedback.trim() || submitting}
          onClick={() => onRevise(feedback)}
          title="Re-run extraction using your feedback"
        >
          ↻ Re-extract with feedback
        </button>
        <button
          className="rg-btn primary"
          disabled={list.length === 0 || submitting}
          onClick={() => onApprove(list, feedback)}
        >
          {submitting ? "Working…" : "Approve & build units →"}
        </button>
      </div>
    </div>
  );
}

/* ── Per-image control: keep / drop, or regenerate with feedback ───────────── */
type ImgState = { url: string; keep: boolean };

function ImageControl({
  label,
  kind,
  title,
  text,
  state,
  onChange,
  onGenerate,
  disabled,
}: {
  label: string;
  kind: "explanation" | "analogy" | "scenario";
  title: string;
  text: string;
  state: ImgState;
  onChange: (s: ImgState) => void;
  onGenerate: GenerateImage;
  disabled: boolean;
}) {
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setErr(null);
    try {
      const url = await onGenerate(kind, title, text, feedback);
      onChange({ url, keep: true });
      setFeedback("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Image generation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`rg-img ${state.url && !state.keep ? "dropped" : ""}`}>
      <div className="rg-img-head">
        <span className="rg-img-label">{label}</span>
        {state.url && (
          <label className="rg-img-keep">
            <input
              type="checkbox"
              checked={state.keep}
              disabled={disabled || loading}
              onChange={(e) => onChange({ ...state, keep: e.target.checked })}
            />
            {state.keep ? "Keep this image" : "Dropped — won't be published"}
          </label>
        )}
      </div>

      {state.url ? (
        <div className={state.keep ? "" : "rg-img-faded"}>
          <Visual image={state.url} label={label} />
        </div>
      ) : (
        <div className="rg-img-none">No image — not everything needs one.</div>
      )}

      <div className="rg-img-actions">
        <input
          className="rg-img-fb"
          placeholder={state.url ? "Say what to change, then Regenerate (required)…" : "Optional: what to depict…"}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          disabled={disabled || loading}
        />
        <button
          className="rg-btn ghost sm"
          onClick={run}
          // Regenerating an existing image needs direction — require feedback.
          // Generating the first image (none yet) is allowed without it.
          disabled={disabled || loading || (!!state.url && !feedback.trim())}
          title={state.url && !feedback.trim() ? "Enter feedback first — say what to change" : ""}
        >
          {loading ? "Generating…" : state.url ? "↻ Regenerate" : "＋ Generate image"}
        </button>
      </div>
      {state.url && !feedback.trim() && (
        <div className="rg-hint sm">Add feedback above to enable regenerate.</div>
      )}
      {err && <div className="rg-img-err">{err}</div>}
    </div>
  );
}

/* ── Per-part content control: feedback → regenerate JUST this part ─────────── */
function PartControl({
  label, busy, disabled, onRun, onRemove,
}: {
  label: string;
  busy: boolean;
  disabled: boolean;
  onRun: (feedback: string) => void;
  onRemove?: () => void;
}) {
  const [feedback, setFeedback] = useState("");
  const go = () => {
    if (!feedback.trim()) return;
    onRun(feedback.trim());
    setFeedback("");
  };
  return (
    <div className="rg-part">
      <input
        className="rg-img-fb"
        placeholder={`Change the ${label} — e.g. reword, fix a fact, simpler…`}
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        disabled={disabled || busy}
      />
      <button
        className="rg-btn ghost sm"
        onClick={go}
        disabled={disabled || busy || !feedback.trim()}
        title={feedback.trim() ? `Regenerate only the ${label}` : "Enter feedback first — it's required"}
      >
        {busy ? "⏳ Regenerating…" : `↻ Regenerate ${label}`}
      </button>
      {onRemove && (
        <button
          className="rg-btn ghost sm"
          onClick={onRemove}
          disabled={disabled || busy}
          title="Remove this scenario from the unit"
        >
          🗑 Remove
        </button>
      )}
    </div>
  );
}

/* ── Gate 2: per-unit approve/reject + per-image keep/drop/regenerate ───────── */
type UnitImages = { explanation: ImgState; analogy: ImgState; scenarios: ImgState[] };
type UnitDecision = { status: "approved" | "rejected"; note: string; images: UnitImages };

const initImages = (u: UnitReviewItem): UnitImages => ({
  explanation: { url: u.explanation_image || "", keep: !!u.explanation_image },
  analogy: { url: u.analogy_image || "", keep: !!u.analogy_image },
  scenarios: (u.scenarios || []).map((s) => ({ url: s.image || "", keep: !!s.image })),
});

export function UnitsGate({
  units,
  onSubmit,
  onGenerateImage,
  onRegeneratePart,
  submitting,
}: {
  units: UnitReviewItem[];
  onSubmit: (reviews: Record<string, UnitReviewDecision>) => void;
  onGenerateImage: GenerateImage;
  onRegeneratePart: RegeneratePart;
  submitting: boolean;
}) {
  // The unit content shown in the gate. Held in state so a single unit can be
  // swapped in place after an in-place regeneration — no other card re-renders.
  const [unitsState, setUnitsState] = useState<UnitReviewItem[]>(units);

  const [reviews, setReviews] = useState<Record<string, UnitDecision>>(() =>
    Object.fromEntries(
      units.map((u) => [
        u.id,
        {
          status: u.clean ? "approved" : "rejected",
          note: "",
          images: initImages(u),
        } as UnitDecision,
      ]),
    ),
  );

  // Which part is mid-regeneration, keyed "unitId:part:index" so only that one
  // control shows a spinner. Errors are keyed by unit id.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [regenError, setRegenError] = useState<Record<string, string>>({});

  const partKey = (unitId: string, part: string, idx?: number) =>
    `${unitId}:${part}:${idx ?? ""}`;

  const set = (id: string, patch: Partial<UnitDecision>) =>
    setReviews((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  const setImg = (id: string, key: "explanation" | "analogy", s: ImgState) =>
    setReviews((r) => ({ ...r, [id]: { ...r[id], images: { ...r[id].images, [key]: s } } }));

  const setScenarioImg = (id: string, idx: number, s: ImgState) =>
    setReviews((r) => {
      const scenarios = r[id].images.scenarios.map((cur, i) => (i === idx ? s : cur));
      return { ...r, [id]: { ...r[id], images: { ...r[id].images, scenarios } } };
    });

  const approvedCount = Object.values(reviews).filter((r) => r.status === "approved").length;

  // Regenerate ONE PART of one unit in place: only that part hits the LLM; its
  // image auto-refreshes. Swap just that unit's card + resync its image choices.
  const runPart = async (
    u: UnitReviewItem,
    opts: { part: "explanation" | "analogy" | "quiz" | "scenario"; scenarioIndex?: number; op?: "regenerate" | "remove" | "add"; feedback: string },
  ) => {
    const key = partKey(u.id, opts.part, opts.scenarioIndex);
    setBusyKey(key);
    setRegenError((e) => ({ ...e, [u.id]: "" }));
    try {
      const fresh = await onRegeneratePart(u.id, opts);
      setUnitsState((prev) => prev.map((x) => (x.id === u.id ? { ...x, ...fresh } : x)));
      // Resync image choices to the unit's new part/scenario set (kept by default).
      setReviews((r) => ({ ...r, [u.id]: { ...r[u.id], images: initImages(fresh) } }));
    } catch (err) {
      setRegenError((e) => ({ ...e, [u.id]: err instanceof Error ? err.message : "Regeneration failed" }));
    } finally {
      setBusyKey(null);
    }
  };

  // Collapse the local ImgState → the wire shape ("" means dropped) and publish.
  const submit = () => {
    const out: Record<string, UnitReviewDecision> = {};
    for (const [id, r] of Object.entries(reviews)) {
      out[id] = {
        status: r.status,
        note: r.note,
        images: {
          explanation: r.images.explanation.keep ? r.images.explanation.url : "",
          analogy: r.images.analogy.keep ? r.images.analogy.url : "",
          scenarios: r.images.scenarios.map((s) => (s.keep ? s.url : "")),
        },
      };
    }
    onSubmit(out);
  };

  return (
    <div className="rg">
      <div className="rg-head">
        <div className="rg-kicker">Human gate 2 of 2 · Review generated units</div>
        <h2>Approve each unit, and keep the visuals that earn their place</h2>
        <p className="rg-lede">
          {unitsState.length} unit{unitsState.length === 1 ? "" : "s"} built. Approve the good ones and reject
          the rest. Every part is editable on its own — write feedback under a part and
          <b> regenerate just that part</b> (its image refreshes too). Visuals are optional:
          <b> keep</b>, <b>drop</b>, or regenerate any image.
        </p>
      </div>

      <div className="rg-list">
        {unitsState.map((u) => {
          const r = reviews[u.id];
          const busyUnit = busyKey?.startsWith(`${u.id}:`) ?? false;
          const dis = submitting || busyUnit;
          return (
            <div key={u.id} className={`rg-unit ${r.status} ${busyUnit ? "regenerating" : ""}`}>
              <div className="rg-unit-top">
                <div>
                  <div className="rg-unit-title">{u.title}</div>
                  <span className={`rg-badge ${u.clean ? "ok" : "warn"}`}>
                    {u.clean ? "✓ audit clean" : `⚠ ${u.flags.length} flag${u.flags.length === 1 ? "" : "s"}`}
                  </span>
                  <span className="rg-badge muted">{u.quiz_count} quiz Qs</span>
                </div>
                <div className="rg-toggle">
                  <button
                    className={`rg-seg ${r.status === "approved" ? "on" : ""}`}
                    onClick={() => set(u.id, { status: "approved" })}
                  >
                    Approve
                  </button>
                  <button
                    className={`rg-seg ${r.status === "rejected" ? "on danger" : ""}`}
                    onClick={() => set(u.id, { status: "rejected" })}
                  >
                    Reject
                  </button>
                </div>
              </div>

              <div className="rg-part-block">
                <p className="rg-unit-line"><b>Explanation</b> {u.explanation}</p>
                <ImageControl
                  label="Explanation visual" kind="explanation" title={u.title} text={u.explanation}
                  state={r.images.explanation} onChange={(s) => setImg(u.id, "explanation", s)}
                  onGenerate={onGenerateImage} disabled={dis}
                />
                <PartControl
                  label="explanation" disabled={submitting}
                  busy={busyKey === partKey(u.id, "explanation")}
                  onRun={(fb) => runPart(u, { part: "explanation", feedback: fb })}
                />
              </div>

              <div className="rg-part-block">
                <p className="rg-unit-line"><b>Analogy</b> {u.analogy}</p>
                <ImageControl
                  label="Analogy visual" kind="analogy" title={u.title} text={u.analogy}
                  state={r.images.analogy} onChange={(s) => setImg(u.id, "analogy", s)}
                  onGenerate={onGenerateImage} disabled={dis}
                />
                <PartControl
                  label="analogy" disabled={submitting}
                  busy={busyKey === partKey(u.id, "analogy")}
                  onRun={(fb) => runPart(u, { part: "analogy", feedback: fb })}
                />
              </div>

              {(u.scenarios || []).map((s, i) => (
                <div className="rg-part-block" key={i}>
                  <p className="rg-unit-line"><b>Scenario {i + 1}</b> {s.text}</p>
                  <ImageControl
                    label={`Scenario ${i + 1} visual`} kind="scenario" title={u.title} text={s.text}
                    state={r.images.scenarios[i]} onChange={(st) => setScenarioImg(u.id, i, st)}
                    onGenerate={onGenerateImage} disabled={dis}
                  />
                  <PartControl
                    label={`scenario ${i + 1}`} disabled={submitting}
                    busy={busyKey === partKey(u.id, "scenario", i)}
                    onRun={(fb) => runPart(u, { part: "scenario", scenarioIndex: i, op: "regenerate", feedback: fb })}
                    onRemove={() => runPart(u, { part: "scenario", scenarioIndex: i, op: "remove", feedback: "" })}
                  />
                </div>
              ))}

              <div className="rg-part-block">
                <p className="rg-unit-line"><b>Quiz</b> {u.quiz_count} question{u.quiz_count === 1 ? "" : "s"}</p>
                <PartControl
                  label="quiz" disabled={submitting}
                  busy={busyKey === partKey(u.id, "quiz")}
                  onRun={(fb) => runPart(u, { part: "quiz", feedback: fb })}
                />
              </div>

              {u.flags.length > 0 && (
                <ul className="rg-flags">
                  {u.flags.map((f, i) => (
                    <li key={i}><code>{f.criterion}</code> — {f.reason}</li>
                  ))}
                </ul>
              )}
              <textarea
                className="rg-textarea small"
                placeholder="General note for this unit (saved to the agent's memory for next run)…"
                value={r.note}
                onChange={(e) => set(u.id, { note: e.target.value })}
                disabled={busyUnit}
              />
              {regenError[u.id] && <div className="rg-img-err">{regenError[u.id]}</div>}
            </div>
          );
        })}
      </div>

      <div className="rg-actions">
        <button className="rg-btn primary" disabled={submitting || !!busyKey} onClick={() => submit()}>
          {submitting ? "Publishing…" : `Publish ${approvedCount} approved unit${approvedCount === 1 ? "" : "s"} →`}
        </button>
      </div>
    </div>
  );
}

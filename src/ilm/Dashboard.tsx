import { useEffect, useMemo, useState } from "react";
import type { RunHistory, RunRow } from "./types";

/* ══════════════════════════════════════════════════════════════════════
   DASHBOARD — run history / "how many ILMs have been built".

   Read-only view over the pipeline's own logs: GET /api/runs joins
   runs/runs.jsonl + runs/usage.jsonl by run_id (agent/run_history.py). No
   database — it reflects every past + future run for free.

   An "ILM built" = a run that finished (status "ok") and published >=1 unit.
   ══════════════════════════════════════════════════════════════════════ */

function fmtUsd(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  const digits = n !== 0 && Math.abs(n) < 1 ? 4 : 2;
  return "$" + n.toFixed(digits);
}
function fmtInt(n: number | null | undefined): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString("en-US");
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function shortModel(m: string | null): string {
  if (!m) return "—";
  return m.includes("/") ? m.split("/").slice(1).join("/") : m;
}
function statusInfo(r: RunRow): { cls: string; label: string } {
  if (r.built) return { cls: "ok", label: "✓ Published" };
  if (r.status === "cancelled") return { cls: "warn", label: "Cancelled" };
  if (r.status === "error") return { cls: "err", label: "Error" };
  if (r.status === "ok") return { cls: "muted", label: "0 published" };
  return { cls: "muted", label: r.status };
}

type StatusFilter = "all" | "built" | "cancelled" | "error";
type SortKey = "date" | "cost";

/* Single-series bar chart: lessons built per day. One hue (--indigo); the title
   names the series so no legend is needed. Text stays in ink tokens. */
function BuiltPerDayChart({ byDay }: { byDay: RunHistory["summary"]["by_day"] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!byDay.length) return null;
  const max = Math.max(...byDay.map((d) => d.built), 1);

  return (
    <div className="ilm-dash-card">
      <div className="ilm-dash-card-head">
        <h3>Lessons built per day</h3>
        <span className="ilm-dash-card-sub">peak {max} · {byDay.length} active day{byDay.length === 1 ? "" : "s"}</span>
      </div>
      <div className="ilm-dash-chart" role="img" aria-label="Bar chart of lessons built per day">
        {byDay.map((d, i) => {
          const pct = (d.built / max) * 100;
          const [, mm, dd] = d.date.split("-");
          return (
            <div
              key={d.date}
              className={`ilm-dash-barcol ${hover === i ? "hot" : ""}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {hover === i && (
                <div className="ilm-dash-tip">
                  <b>{d.date}</b>
                  <span>{d.built} lesson{d.built === 1 ? "" : "s"}</span>
                  {d.cost > 0 && <span>{fmtUsd(d.cost)}</span>}
                </div>
              )}
              <div className="ilm-dash-bartrack">
                <div className="ilm-dash-bar" style={{ height: `${Math.max(pct, 3)}%` }} />
                <span className="ilm-dash-barval">{d.built}</span>
              </div>
              <span className="ilm-dash-barlabel">{mm}/{dd}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Dashboard({ onClose }: { onClose: () => void }) {
  const [hist, setHist] = useState<RunHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDesc, setSortDesc] = useState(true);

  const load = () => {
    setLoading(true);
    setError(null);
    fetch("/api/runs")
      .then((r) => r.json())
      .then((d: RunHistory) => setHist(d))
      .catch(() => setError("Could not load run history. Is the backend running (python -m agent.server)?"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const rows = useMemo(() => {
    if (!hist) return [];
    let out = hist.runs;
    if (status === "built") out = out.filter((r) => r.built);
    else if (status === "cancelled") out = out.filter((r) => r.status === "cancelled");
    else if (status === "error") out = out.filter((r) => r.status === "error");
    const needle = q.trim().toLowerCase();
    if (needle) out = out.filter((r) => (r.doc || "").toLowerCase().includes(needle));
    const dir = sortDesc ? -1 : 1;
    out = [...out].sort((a, b) => {
      if (sortKey === "cost") return dir * ((a.cost_usd || 0) - (b.cost_usd || 0));
      return dir * ((a.started_at || "").localeCompare(b.started_at || ""));
    });
    return out;
  }, [hist, status, q, sortKey, sortDesc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDesc((d) => !d);
    else { setSortKey(key); setSortDesc(true); }
  };
  const sortCaret = (key: SortKey) => (sortKey === key ? (sortDesc ? " ▾" : " ▴") : "");

  const s = hist?.summary;
  const anyApprox = rows.some((r) => r.published_approx && r.built);

  return (
    <div className="ilm-dash">
      <div className="ilm-dash-head">
        <div>
          <div className="ilm-dash-kicker">Run history</div>
          <h1>Interactive Learning Materials built</h1>
          <p className="ilm-dash-lede">
            Every pipeline run, from your logs. A “lesson built” finished the pipeline and published at least one unit.
          </p>
        </div>
        <div className="ilm-dash-headbtns">
          <button className="ilm-dlbtn" onClick={load} title="Reload from the logs">↻ Refresh</button>
          <button className="ilm-newbtn" onClick={onClose}>← Back</button>
        </div>
      </div>

      {loading && <div className="ilm-dash-msg">Loading run history…</div>}
      {error && <div className="ingest-error">{error}</div>}

      {s && (
        <>
          <div className="ilm-dash-tiles">
            <div className="ilm-dash-tile primary">
              <span className="ilm-dash-label">Lessons built</span>
              <span className="ilm-dash-value">{fmtInt(s.lessons_built)}</span>
              <span className="ilm-dash-foot">of {fmtInt(s.total_runs)} total runs</span>
            </div>
            <div className="ilm-dash-tile">
              <span className="ilm-dash-label">Concepts published</span>
              <span className="ilm-dash-value">{fmtInt(s.concepts_published)}</span>
              <span className="ilm-dash-foot">across all lessons</span>
            </div>
            <div className="ilm-dash-tile">
              <span className="ilm-dash-label">Total cost</span>
              <span className="ilm-dash-value">{fmtUsd(s.total_cost_usd)}</span>
              <span className="ilm-dash-foot">{fmtInt(s.total_tokens)} tokens</span>
            </div>
            <div className="ilm-dash-tile">
              <span className="ilm-dash-label">Other runs</span>
              <span className="ilm-dash-value">{fmtInt((s.by_status.cancelled || 0) + (s.by_status.error || 0))}</span>
              <span className="ilm-dash-foot">{fmtInt(s.by_status.cancelled || 0)} cancelled · {fmtInt(s.by_status.error || 0)} errored</span>
            </div>
          </div>

          <BuiltPerDayChart byDay={s.by_day} />

          {/* Filters */}
          <div className="ilm-dash-filters">
            <input
              className="ilm-dash-search"
              placeholder="Search by document…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="ilm-dash-seg">
              {(["all", "built", "cancelled", "error"] as StatusFilter[]).map((f) => (
                <button
                  key={f}
                  className={`ilm-dash-segbtn ${status === f ? "on" : ""}`}
                  onClick={() => setStatus(f)}
                >
                  {f === "all" ? "All" : f[0].toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <span className="ilm-dash-count">{rows.length} run{rows.length === 1 ? "" : "s"}</span>
          </div>

          {/* Run table */}
          <div className="ilm-dash-tablewrap">
            <table className="ilm-dash-table">
              <thead>
                <tr>
                  <th className="sortable" onClick={() => toggleSort("date")}>Date{sortCaret("date")}</th>
                  <th>Document</th>
                  <th>Status</th>
                  <th>Units</th>
                  <th className="sortable" onClick={() => toggleSort("cost")}>Cost{sortCaret("cost")}</th>
                  <th>Model</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const st = statusInfo(r);
                  return (
                    <tr key={r.run_id}>
                      <td className="nowrap">{fmtDate(r.started_at)}</td>
                      <td className="doc">{r.doc || <span className="muted">—</span>}</td>
                      <td><span className={`ilm-dash-badge ${st.cls}`}>{st.label}</span></td>
                      <td
                        className="nowrap"
                        title={r.published_approx ? "Published count not recorded for this run — showing generated units" : ""}
                      >
                        {r.published_approx ? "~" : ""}{fmtInt(r.effective_published)}
                        <span className="muted"> / {fmtInt(r.generated_units)}</span>
                      </td>
                      <td className="nowrap">{fmtUsd(r.cost_usd)}</td>
                      <td className="muted nowrap">{shortModel(r.gen_model)}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="ilm-dash-empty">No runs match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {anyApprox && (
            <p className="ilm-dash-note">
              ~ marks runs from before published-count logging — the figure shown is generated units (a best-effort upper bound).
            </p>
          )}
        </>
      )}
    </div>
  );
}

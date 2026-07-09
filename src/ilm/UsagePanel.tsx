import { useEffect, useMemo, useState } from "react";
import type { ConceptUnitsFile, Usage, UsageCost, UsageRates } from "./types";

/* ══════════════════════════════════════════════════════════════════════
   USAGE PANEL — token & cost visibility for a completed run.

   Shows how many tokens / images this run consumed, how much money that cost
   (broken into text vs. image), the cost per concept unit, and a projection of
   what generating more units would cost — all derived from the run's usage
   snapshot (agent/llm.py) priced by agent/pricing.py. Cost is embedded in new
   runs (`usage.cost`); for older usage records with no embedded cost we fetch
   the live rates from /api/pricing and compute it in the browser.
   ══════════════════════════════════════════════════════════════════════ */

function fmtUsd(n: number): string {
  if (!isFinite(n)) return "$0";
  // Costs here are tiny (cents); keep enough precision to be meaningful.
  const digits = n !== 0 && Math.abs(n) < 1 ? 4 : 2;
  return "$" + n.toFixed(digits);
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

// Compute a cost breakdown from a usage snapshot + rate card (mirrors
// agent/pricing.estimate_cost so the fallback matches the backend).
function computeCost(usage: Usage, rates: UsageRates): UsageCost {
  const prompt = usage.chat_prompt_tokens ?? usage.prompt_tokens ?? 0;
  const completion = usage.chat_completion_tokens ?? usage.completion_tokens ?? 0;
  const images = usage.image_calls ?? 0;
  const textCost = (prompt / 1_000_000) * rates.input_per_mtok + (completion / 1_000_000) * rates.output_per_mtok;
  const imageCost = images * rates.image_per_call;
  return {
    currency: rates.currency || "USD",
    text_cost: textCost,
    image_cost: imageCost,
    total_cost: textCost + imageCost,
    rates,
  };
}

const PROJECTION_UNITS = [1, 5, 10, 25, 50];

export default function UsagePanel({ data }: { data: ConceptUnitsFile }) {
  const usage = data.usage;
  const [rates, setRates] = useState<UsageRates | null>(null);

  // If this run has no embedded cost, we need live rates to compute it.
  const needRates = !!usage && !usage.cost;
  useEffect(() => {
    if (!needRates) return;
    let alive = true;
    fetch("/api/pricing")
      .then((r) => r.json())
      .then((d: UsageRates) => { if (alive) setRates(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [needRates]);

  const cost: UsageCost | null = useMemo(() => {
    if (!usage) return null;
    if (usage.cost) return usage.cost;
    if (rates) return computeCost(usage, rates);
    return null;
  }, [usage, rates]);

  if (!usage) return null;

  const generated = Math.max(data.generated_units || data.units?.length || 0, 0);
  const perUnitTokens = generated ? usage.total_tokens / generated : usage.total_tokens;
  const perUnitCost = cost && generated ? cost.total_cost / generated : cost?.total_cost ?? 0;
  const r = cost?.rates;

  return (
    <div className="ilm-usage">
      <div className="ilm-usage-head">
        <h2>Token usage &amp; cost</h2>
        <span className="ilm-usage-sub">
          {generated} concept{generated === 1 ? "" : "s"} generated this run
          {r ? ` · ${r.gen_model}` : ""}
        </span>
      </div>

      {/* Headline stats */}
      <div className="ilm-usage-grid">
        <div className="ilm-usage-tile primary">
          <span className="ilm-usage-label">Total cost</span>
          <span className="ilm-usage-value">{cost ? fmtUsd(cost.total_cost) : "—"}</span>
          <span className="ilm-usage-foot">{fmtUsd(perUnitCost)} / concept</span>
        </div>
        <div className="ilm-usage-tile">
          <span className="ilm-usage-label">Total tokens</span>
          <span className="ilm-usage-value">{fmtInt(usage.total_tokens)}</span>
          <span className="ilm-usage-foot">{fmtInt(perUnitTokens)} / concept</span>
        </div>
        <div className="ilm-usage-tile">
          <span className="ilm-usage-label">Prompt tokens</span>
          <span className="ilm-usage-value">{fmtInt(usage.prompt_tokens)}</span>
          <span className="ilm-usage-foot">{usage.chat_calls} chat call{usage.chat_calls === 1 ? "" : "s"}</span>
        </div>
        <div className="ilm-usage-tile">
          <span className="ilm-usage-label">Completion tokens</span>
          <span className="ilm-usage-value">{fmtInt(usage.completion_tokens)}</span>
          <span className="ilm-usage-foot">{usage.image_calls} image{usage.image_calls === 1 ? "" : "s"}</span>
        </div>
      </div>

      {/* Cost breakdown */}
      {cost && (
        <div className="ilm-usage-breakdown">
          <div className="ilm-usage-bar">
            <span
              className="ilm-usage-bar-text"
              style={{ width: `${cost.total_cost ? (cost.text_cost / cost.total_cost) * 100 : 0}%` }}
              title={`Text (LLM): ${fmtUsd(cost.text_cost)}`}
            />
            <span
              className="ilm-usage-bar-img"
              style={{ width: `${cost.total_cost ? (cost.image_cost / cost.total_cost) * 100 : 0}%` }}
              title={`Images: ${fmtUsd(cost.image_cost)}`}
            />
          </div>
          <div className="ilm-usage-legend">
            <span><i className="dot text" /> Text (LLM) {fmtUsd(cost.text_cost)}</span>
            <span><i className="dot img" /> Images {fmtUsd(cost.image_cost)}</span>
          </div>
        </div>
      )}

      {/* Projection: what generating more would cost, at this run's per-concept rate */}
      {cost && generated > 0 && (
        <div className="ilm-usage-proj">
          <div className="ilm-usage-proj-title">
            Estimated cost to generate more — at {fmtUsd(perUnitCost)} &amp; {fmtInt(perUnitTokens)} tokens per concept
          </div>
          <table className="ilm-usage-table">
            <thead>
              <tr><th>Concepts</th><th>Est. tokens</th><th>Est. cost</th></tr>
            </thead>
            <tbody>
              {PROJECTION_UNITS.map((n) => (
                <tr key={n} className={n === generated ? "here" : ""}>
                  <td>{n}{n === generated ? " (this run)" : ""}</td>
                  <td>{fmtInt(perUnitTokens * n)}</td>
                  <td>{fmtUsd(perUnitCost * n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {r && (
        <p className="ilm-usage-rates">
          Rates: input {fmtUsd(r.input_per_mtok)} / output {fmtUsd(r.output_per_mtok)} per 1M tokens ·
          {" "}{fmtUsd(r.image_per_call)} / image ({r.image_model}). Estimates — actual billing may vary.
        </p>
      )}
    </div>
  );
}

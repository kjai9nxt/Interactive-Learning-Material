/* Types mirroring the agent's ConceptUnit schema (agent/models.py).
   The pipeline writes src/data/conceptUnits.json in exactly this shape. */

export interface MCQ {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  aspect: "recall" | "understanding" | "application" | "analysis";
}

export interface CodePlayground {
  language?: string;
  code?: string;
  html?: string;
  css?: string;
  js?: string;
}

export interface Scenario {
  text: string;
  visual_image?: string; // generated illustration (/ilm-images/… path)
  visual_html?: string; // legacy inline SVG (fallback)
  code_playground?: CodePlayground | null;
}

export interface ConceptUnit {
  id: string;
  title: string;
  summary: string;
  source_span: string;
  is_code_concept: boolean;
  explanation: { text: string; visual_image?: string; visual_diagram_html?: string };
  analogy: { text: string; visual_image?: string; visual_html?: string; grounding_check: string };
  scenarios: Scenario[];
  mini_quiz: { questions: MCQ[] };
  review: { status: string; reviewer?: string | null; notes?: string | null };
}

export interface AuditFlag {
  source: string;
  criterion: string;
  reason: string;
}

export interface RejectedUnit {
  id: string;
  title: string;
  flags: AuditFlag[];
}

/* Token/cost accounting (agent/llm.py usage snapshot + agent/pricing.py cost). */
export interface UsageRates {
  currency: string;
  gen_model: string;
  image_model: string;
  input_per_mtok: number;
  output_per_mtok: number;
  image_per_call: number;
}

export interface UsageCost {
  currency: string;
  text_cost: number;
  image_cost: number;
  total_cost: number;
  rates: UsageRates;
}

export interface Usage {
  chat_calls: number;
  image_calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  chat_prompt_tokens?: number;
  chat_completion_tokens?: number;
  image_prompt_tokens?: number;
  image_completion_tokens?: number;
  cost?: UsageCost;
}

export interface ConceptUnitsFile {
  run_id: string;
  doc: string;
  generator_model?: string;
  image_model?: string;
  usage?: Usage;
  generated_units: number;
  published_units: number;
  units: ConceptUnit[];
  rejected?: RejectedUnit[];
}

/* ── Human-in-the-loop review gates (backend pauses; UI collects a decision) ── */

// Gate 1: the proposed concept split, shown before any generation runs.
export interface ProposedConcept {
  id: string;
  title: string;
  summary: string;
  source_span: string;
  is_code_concept?: boolean;
}

// Gate 2: one built unit awaiting per-unit approval + per-image curation.
export interface UnitReviewItem {
  id: string;
  title: string;
  explanation: string;
  analogy: string;
  // AI-generated raster illustrations (data URLs) the reviewer keeps / drops /
  // regenerates in the gate.
  explanation_image?: string;
  analogy_image?: string;
  scenarios?: { text: string; image?: string }[];
  quiz_count: number;
  clean: boolean;
  flags: { criterion: string; reason: string }[];
  // Hidden fields the gate forwards so a single PART of this unit can be
  // regenerated in place (POST /api/regenerate-part) without touching anything else.
  summary?: string;
  source_span?: string;
  is_code_concept?: boolean;
}

// The decision returned per unit from Gate 2. `images` carries the kept image for
// each section ("" = dropped); scenarios is index-aligned.
export interface UnitReviewDecision {
  status: "approved" | "rejected";
  note: string;
  images: { explanation: string; analogy: string; scenarios: string[] };
}

export type GatePayload =
  | { kind: "partition"; concepts: ProposedConcept[] }
  | { kind: "units"; units: UnitReviewItem[] };

/* ── Run history (dashboard) — GET /api/runs joins runs.jsonl + usage.jsonl ─── */
export interface RunRow {
  run_id: string;
  doc: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_s: number | null;
  status: string;                 // "ok" | "cancelled" | "error" | "unknown"
  generated_units: number;
  published_units: number | null; // null for runs that predate the field
  effective_published: number;
  published_approx: boolean;      // true → published derived, not recorded
  built: boolean;                 // finished + >=1 published unit
  cost_usd: number | null;
  total_tokens: number | null;
  chat_calls: number | null;
  image_calls: number | null;
  gen_model: string | null;
  image_model: string | null;
}

export interface RunHistorySummary {
  lessons_built: number;
  total_runs: number;
  concepts_published: number;
  total_cost_usd: number;
  total_tokens: number;
  by_status: Record<string, number>;
  by_day: { date: string; built: number; cost: number }[];
}

export interface RunHistory {
  runs: RunRow[];
  summary: RunHistorySummary;
}

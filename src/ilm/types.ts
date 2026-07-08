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

export interface ConceptUnitsFile {
  run_id: string;
  doc: string;
  generator_model?: string;
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

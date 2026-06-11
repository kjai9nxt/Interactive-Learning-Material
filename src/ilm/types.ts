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
}

export interface Scenario {
  text: string;
  code_playground?: CodePlayground | null;
}

export interface ConceptUnit {
  id: string;
  title: string;
  summary: string;
  source_span: string;
  is_code_concept: boolean;
  explanation: { text: string; visual_diagram_html: string };
  analogy: { text: string; visual_html: string; grounding_check: string };
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

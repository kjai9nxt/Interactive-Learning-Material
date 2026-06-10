/* ── Shared types ─────────────────────────────────────────────────────── */

export interface QuizQuestion {
  type: string;
  badgeClass: string;
  q: string;
  opts: string[];
  correct: number;
  explanation: string;
}

export interface QuizScore {
  correct: number;
  total: number;
}

export type Theme = "light" | "dark";
export type DeviceSize = "mobile" | "tablet" | "desktop" | "full" | "custom";
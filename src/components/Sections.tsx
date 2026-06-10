import React from "react";
import type { QuizScore } from "../types";

/* ══════════════════════════════════════════════════════════════════════
   SECTION HEADER
   ══════════════════════════════════════════════════════════════════════ */

export function SectionHeader({ number, title, subtitle, sectionClass }: { number: string; title: string; subtitle: string; sectionClass: string }) {
  return (
    <div className={`sec-header ${sectionClass}`}>
      <div className="sec-meta">
        <span className="sec-num-badge">{number}</span>
        <span className="sec-num">Section</span>
      </div>
      <h2 className="sec-title">{title}</h2>
      <p className="sec-sub">{subtitle}</p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   CONTINUE BREAKER — between sections
   ══════════════════════════════════════════════════════════════════════ */

export function ContinueBreaker({ fromNum, fromTitle, toNum, toTitle, onContinue }: { fromNum: string; fromTitle: string; toNum: string; toTitle: string; onContinue: () => void }) {
  return (
    <div className="cont-breaker">
      <div className="cont-status">
        <span className="cont-check">✓</span>
        <span className="cont-status-text">Section {fromNum} complete — {fromTitle}</span>
      </div>
      <button className="cont-btn" onClick={onContinue}>
        <div className="cont-btn-inner">
          <div className="cont-btn-label">Continue to next section</div>
          <div className="cont-btn-title">
            <span className="cont-btn-num">{toNum}</span>
            <span className="cont-btn-name">{toTitle}</span>
          </div>
        </div>
        <span className="cont-btn-arrow">→</span>
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   COURSE COMPLETE — final card with score summary + section breakdown
   ══════════════════════════════════════════════════════════════════════ */

interface SectionScore {
  id: string;
  num: string;
  name: string;
  sectionClass: string;
  score: QuizScore;
}

interface CourseCompleteProps {
  sectionScores: SectionScore[];
}

export function CourseComplete({ sectionScores }: CourseCompleteProps) {
  const totalCorrect = sectionScores.reduce((s, x) => s + x.score.correct, 0);
  const totalQuestions = sectionScores.reduce((s, x) => s + x.score.total, 0);
  const totalWrong = totalQuestions - totalCorrect;
  const pct = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
  const pctClass = pct >= 80 ? "good" : pct >= 60 ? "mid" : "low";

  return (
    <div className="course-complete">
      <div className="cc-head">
        <div className="cc-star">★</div>
        <div>
          <div className="cc-title">Course complete!</div>
          <div className="cc-subtitle">You finished all 5 sections</div>
        </div>
      </div>

      <p className="cc-intro">
        You can now write media queries that target by type, size, orientation, and combine conditions with AND, NOT, and OR. Here's how you did on the mini-quizzes:
      </p>

      <div className="cc-score-card">
        <div className="cc-score-label">Your overall score</div>
        <div className="cc-score-big">
          <div className="cc-score-num">{totalCorrect}<span className="out"> / {totalQuestions}</span></div>
          <div className={`cc-score-pct ${pctClass}`}>{pct}%</div>
        </div>
        <div className="cc-bar-track">
          <div className="cc-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="cc-tally">
          <div className="cc-tally-item correct">
            <span className="cc-tally-icon">✓</span>
            <span><strong>{totalCorrect}</strong> correct</span>
          </div>
          <div className="cc-tally-item wrong">
            <span className="cc-tally-icon">✗</span>
            <span><strong>{totalWrong}</strong> wrong</span>
          </div>
        </div>
      </div>

      <div className="cc-breakdown">
        <div className="cc-breakdown-label">Section-by-section breakdown</div>
        <div className="cc-sections">
          {sectionScores.map((s) => (
            <div key={s.id} className={`cc-sec ${s.sectionClass}`}>
              <div className="cc-sec-num">§{s.num}</div>
              <div className="cc-sec-name">{s.name}</div>
              <div className="cc-sec-score">{s.score.correct}<span className="out"> / {s.score.total}</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
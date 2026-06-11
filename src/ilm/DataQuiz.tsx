import React, { useState, useRef } from "react";
import type { MCQ } from "./types";
import type { QuizScore } from "../types";

/* Data-driven mini-quiz — renders the agent's MCQ[] with the same look &
   feel as the reference TopicQuiz (confetti on correct, reveal + explanation).
   Each question carries its aspect (recall/understanding/application/analysis)
   and difficulty as a badge. */

const CONFETTI_COLORS = ["#4f46e5", "#818cf8", "#9333ea", "#c084fc", "#0891b2", "#22d3ee", "#059669", "#34d399", "#d97706", "#fbbf24", "#db2777", "#f472b6"];

const ASPECT_BADGE: Record<string, string> = {
  recall: "badge-recall",
  understanding: "badge-understanding",
  application: "badge-application",
  analysis: "badge-analysis",
};

interface Props {
  questions: MCQ[];
  sectionLabel: string;
  onComplete: (score: QuizScore) => void;
}

export default function DataQuiz({ questions, sectionLabel, onComplete }: Props) {
  const [qIdx, setQIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [confetti, setConfetti] = useState<Array<{ id: number; left: number; tx: number; ty: number; color: string; delay: number }>>([]);
  const idCounter = useRef(0);

  if (questions.length === 0) return null;
  const q = questions[qIdx];
  const total = questions.length;

  const burstConfetti = (originX: number) => {
    const pieces = Array.from({ length: 22 }, () => {
      idCounter.current += 1;
      return {
        id: idCounter.current,
        left: originX + (Math.random() - 0.5) * 60,
        tx: (Math.random() - 0.5) * 280,
        ty: 120 + Math.random() * 80,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        delay: Math.random() * 0.12,
      };
    });
    setConfetti(pieces);
    window.setTimeout(() => setConfetti([]), 1500);
  };

  const handlePick = (idx: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (revealed) return;
    setSelected(idx);
    setRevealed(true);
    if (idx === q.correct_index) {
      setScore((s) => s + 1);
      const container = e.currentTarget.closest(".topic-quiz") as HTMLElement | null;
      const originX = container ? container.getBoundingClientRect().width / 2 : 200;
      burstConfetti(originX);
    }
  };

  const handleNext = () => {
    if (qIdx + 1 >= total) {
      setDone(true);
      window.setTimeout(() => onComplete({ correct: score, total }), 600);
    } else {
      setQIdx((i) => i + 1);
      setSelected(null);
      setRevealed(false);
    }
  };

  if (done) {
    const pct = Math.round((score / total) * 100);
    return (
      <div className="topic-quiz">
        <div className="tq-done">
          <div className="tq-done-icon">✓</div>
          <div className="tq-done-title">Mini-quiz complete</div>
          <div className="tq-done-score">You scored <strong>{score} / {total}</strong> ({pct}%)</div>
        </div>
      </div>
    );
  }

  return (
    <div className="topic-quiz">
      {confetti.map((c) => (
        <span key={c.id} className="confetti-piece" style={{ left: `${c.left}px`, top: "50%", background: c.color, ["--cx" as any]: `${c.tx}px`, ["--cy" as any]: `${c.ty}px`, animationDelay: `${c.delay}s` }} />
      ))}
      <div className="tq-head">
        <div className="tq-icon">?</div>
        <div>
          <div className="tq-title">Check your understanding</div>
          <div className="tq-sub">{sectionLabel} · Question {qIdx + 1} of {total}</div>
        </div>
      </div>
      <div className="tq-progress-track">
        <div className="tq-progress-bar" style={{ width: `${((qIdx + (revealed ? 1 : 0)) / total) * 100}%` }} />
      </div>
      <div className="tq-card" key={qIdx}>
        <div className="tq-badges">
          <span className={`tq-badge ${ASPECT_BADGE[q.aspect] || ""}`}>{q.aspect}</span>
          <span className={`tq-badge badge-diff-${q.difficulty}`}>{q.difficulty}</span>
        </div>
        <div className="tq-text">{q.question}</div>
        <div className="tq-options">
          {q.options.map((opt, i) => {
            let cls = "tq-option";
            if (revealed) {
              cls += " disabled";
              if (i === q.correct_index) cls += " correct";
              else if (i === selected) cls += " wrong";
            }
            const letter = String.fromCharCode(65 + i);
            return (
              <div key={i} className={cls} onClick={(e) => handlePick(i, e)}>
                <span className="tq-opt-letter">{letter}</span>
                <span>{opt}</span>
              </div>
            );
          })}
        </div>
        {revealed && (
          <>
            <div className="tq-explanation">{q.explanation}</div>
            <div className="tq-actions">
              <button className="tq-next" onClick={handleNext}>{qIdx + 1 >= total ? "Finish quiz" : "Next question"} →</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

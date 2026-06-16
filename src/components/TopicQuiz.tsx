import React, { useState, useRef } from "react";
import { TOPIC_QUIZZES } from "../data/quizData";
import type { QuizScore } from "../types";

/* ══════════════════════════════════════════════════════════════════════
   TOPIC QUIZ — confetti on correct, shake on wrong, reports score on done
   ══════════════════════════════════════════════════════════════════════ */

const CONFETTI_COLORS = ["#4f46e5", "#818cf8", "#9333ea", "#c084fc", "#0891b2", "#22d3ee", "#059669", "#34d399", "#d97706", "#fbbf24", "#db2777", "#f472b6"];

interface Props {
  topicKey: string;
  sectionLabel: string;
  onComplete: (score: QuizScore) => void;
}

export default function TopicQuiz({ topicKey, sectionLabel, onComplete }: Props) {
  const questions = TOPIC_QUIZZES[topicKey] || [];
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
    if (idx === q.correct) {
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
          <div className="tq-done-title">Topic quiz complete</div>
          <div className="tq-done-score">You scored <strong>{score} / {total}</strong> ({pct}%)</div>
        </div>
      </div>
    );
  }

  return (
    <div className="topic-quiz">
      {confetti.map((c) => (
        <span key={c.id} className="confetti-piece" style={{ left: `${c.left}px`, top: "50%", background: c.color, "--cx": `${c.tx}px`, "--cy": `${c.ty}px`, animationDelay: `${c.delay}s` } as React.CSSProperties} />
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
        <span className={`tq-badge ${q.badgeClass}`}>{q.type}</span>
        <div className="tq-text">{q.q}</div>
        <div className="tq-options">
          {q.opts.map((opt, i) => {
            let cls = "tq-option";
            if (revealed) {
              cls += " disabled";
              if (i === q.correct) cls += " correct";
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
            <div className="tq-explanation" dangerouslySetInnerHTML={{ __html: q.explanation }} />
            <div className="tq-actions">
              <button className="tq-next" onClick={handleNext}>{qIdx + 1 >= total ? "Finish quiz" : "Next question"} →</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
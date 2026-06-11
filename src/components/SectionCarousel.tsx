import React, { useState } from "react";

/* ══════════════════════════════════════════════════════════════════════
   SECTION CAROUSEL — chevron arrows + dot navigation
   ══════════════════════════════════════════════════════════════════════ */

const ChevronLeft = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);
const ChevronRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

export interface CarouselSlide {
  label: string;
  body: React.ReactNode;
}

interface Props {
  slides: CarouselSlide[];
  sectionLabel: string;
  onComplete: () => void;
  completed: boolean;
}

export default function SectionCarousel({ slides, sectionLabel, onComplete, completed }: Props) {
  const [idx, setIdx] = useState(0);
  const [visited, setVisited] = useState<Set<number>>(new Set([0]));
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const last = slides.length - 1;

  const goTo = (i: number) => {
    setDirection(i > idx ? "forward" : "back");
    setIdx(i);
    setVisited((v) => new Set(v).add(i));
  };

  const current = slides[idx];

  return (
    <div className="carousel">
      <div className="carousel-header">
        <div className="carousel-step">
          <span className="carousel-step-tag">{sectionLabel} · Topic {idx + 1}</span>
          <span className="carousel-step-label">{current.label}</span>
        </div>
        <span className="carousel-counter">{idx + 1} / {slides.length}</span>
      </div>

      <div className="carousel-stage">
        <div className={`carousel-slide slide-content ${direction === "back" ? "reverse" : ""}`} key={idx}>
          {current.body}
        </div>
      </div>

      <div className="carousel-controls">
        <button
          className="carousel-chevron"
          disabled={idx === 0}
          onClick={() => goTo(idx - 1)}
          aria-label="Previous topic"
        >
          <ChevronLeft />
        </button>

        <div className="carousel-dots">
          {slides.map((_, i) => (
            <button
              key={i}
              className={`carousel-dot ${i === idx ? "active" : visited.has(i) ? "visited" : ""}`}
              onClick={() => goTo(i)}
              aria-label={`Topic ${i + 1}`}
            />
          ))}
        </div>

        {idx < last ? (
          <button className="carousel-chevron" onClick={() => goTo(idx + 1)} aria-label="Next topic">
            <ChevronRight />
          </button>
        ) : completed ? (
          <button className="carousel-action completed" disabled>✓ Finished</button>
        ) : (
          <button className="carousel-action" onClick={onComplete}>Take quiz ↓</button>
        )}
      </div>
    </div>
  );
}
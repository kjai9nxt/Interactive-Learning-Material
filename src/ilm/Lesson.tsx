import { useState, useRef } from "react";
import type { QuizScore } from "../types";
import type { ConceptUnitsFile } from "./types";
import { SectionHeader, ContinueBreaker, CourseComplete } from "../components/Sections";
import SectionCarousel from "../components/SectionCarousel";
import { buildUnitSlides } from "./ConceptUnitView";
import DataQuiz from "./DataQuiz";

/* Renders a set of Concept Units as a gated interactive lesson — each unit is a
   carousel (explanation → analogy → scenarios), then its mini-quiz, then a
   "continue" breaker, exactly like the original sample lesson. */

const pad = (n: number) => String(n + 1).padStart(2, "0");
const SECTION_CLASSES = ["sec-1", "sec-2", "sec-3", "sec-4", "sec-5"];
const sectionClassFor = (i: number) => SECTION_CLASSES[i % SECTION_CLASSES.length];

export default function Lesson({ data }: { data: ConceptUnitsFile }) {
  const units = data.units || [];
  const [unlocked, setUnlocked] = useState<number>(0);
  const [carouselDone, setCarouselDone] = useState<Record<string, boolean>>({});
  const [quizDone, setQuizDone] = useState<Record<string, boolean>>({});
  const [scores, setScores] = useState<Record<string, QuizScore>>({});
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const completeCarousel = (id: string) => setCarouselDone((p) => ({ ...p, [id]: true }));
  const completeQuiz = (id: string, score: QuizScore) => {
    setScores((p) => ({ ...p, [id]: score }));
    setQuizDone((p) => ({ ...p, [id]: true }));
  };
  const advanceSection = (toIdx: number, toId: string) => {
    setUnlocked((u) => Math.max(u, toIdx));
    window.setTimeout(() => {
      sectionRefs.current[toId]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  const completedCount = units.filter((u) => quizDone[u.id]).length;
  const allDone = units.length > 0 && completedCount === units.length;
  const sectionScores = units.map((u, i) => ({
    id: u.id, num: pad(i), name: u.title,
    sectionClass: sectionClassFor(i),
    score: scores[u.id] || { correct: 0, total: 0 },
  }));

  if (units.length === 0) return null;

  return (
    <div className="page">
      {units.map((unit, i) => {
        if (i > unlocked) return null;
        const sc = sectionClassFor(i);
        const isLast = i === units.length - 1;
        return (
          <div key={unit.id} ref={(el) => { sectionRefs.current[unit.id] = el; }}>
            <SectionHeader number={pad(i)} title={unit.title} subtitle={unit.summary} sectionClass={sc} />
            <div className={sc}>
              <SectionCarousel
                slides={buildUnitSlides(unit)}
                sectionLabel={`§${pad(i)}`}
                onComplete={() => completeCarousel(unit.id)}
                completed={!!carouselDone[unit.id]}
              />
            </div>
            {carouselDone[unit.id] && !quizDone[unit.id] && (
              <DataQuiz
                questions={unit.mini_quiz.questions}
                sectionLabel={`Section ${pad(i)} · ${unit.title}`}
                onComplete={(s) => completeQuiz(unit.id, s)}
              />
            )}
            {quizDone[unit.id] && !isLast && unlocked <= i && (
              <ContinueBreaker
                fromNum={pad(i)} fromTitle={unit.title}
                toNum={pad(i + 1)} toTitle={units[i + 1].title}
                onContinue={() => advanceSection(i + 1, units[i + 1].id)}
              />
            )}
          </div>
        );
      })}
      {allDone && (
        <CourseComplete
          sectionScores={sectionScores}
          intro={`You've worked through all ${units.length} concepts from "${data.doc}". Here's how you did on the mini-quizzes:`}
        />
      )}
    </div>
  );
}

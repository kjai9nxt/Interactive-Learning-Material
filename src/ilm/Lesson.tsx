import { useState, useRef } from "react";
import type { QuizScore } from "../types";
import type { ConceptUnitsFile } from "./types";
import { SectionHeader, ContinueBreaker, CourseComplete, LockedPreview } from "../components/Sections";
import { UnitContent } from "./ConceptUnitView";
import DataQuiz from "./DataQuiz";

/* Renders a set of Concept Units as a gated reading lesson. Within a unit, all
   content (explanation → analogy → scenarios) is laid out vertically and read by
   scrolling — no carousel / click-to-reveal, which kept the best teaching
   (analogies, scenarios) hidden and added cognitive load. Between units the
   pacing gate stays: attempt the mini-quiz, then click Continue to unlock the
   next unit. The next unit shows as a visible, dimmed "locked" preview. */

const pad = (n: number) => String(n + 1).padStart(2, "0");
const SECTION_CLASSES = ["sec-1", "sec-2", "sec-3", "sec-4", "sec-5"];
const sectionClassFor = (i: number) => SECTION_CLASSES[i % SECTION_CLASSES.length];

export default function Lesson({ data }: { data: ConceptUnitsFile }) {
  const units = data.units || [];
  const [unlocked, setUnlocked] = useState<number>(0);
  const [quizDone, setQuizDone] = useState<Record<string, boolean>>({});
  const [scores, setScores] = useState<Record<string, QuizScore>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const toggleCollapsed = (id: string) =>
    setCollapsed((p) => ({ ...p, [id]: !p[id] }));

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
        if (i > unlocked) {
          // Show a single visible, dimmed lock for the immediate next unit while
          // the current unit's quiz is still pending (once it's done, the
          // ContinueBreaker below is the forward affordance, so skip the lock).
          const currentQuizDone = !!quizDone[units[unlocked]?.id];
          if (i === unlocked + 1 && !currentQuizDone) {
            return (
              <LockedPreview
                key={unit.id}
                number={pad(i)}
                title={unit.title}
                hint="Attempt the mini-quiz above, then continue to unlock this section."
              />
            );
          }
          return null;
        }
        const sc = sectionClassFor(i);
        const isLast = i === units.length - 1;
        const isCollapsed = !!collapsed[unit.id];
        return (
          <div key={unit.id} ref={(el) => { sectionRefs.current[unit.id] = el; }}>
            <SectionHeader
              number={pad(i)}
              title={unit.title}
              subtitle={unit.summary}
              sectionClass={sc}
              collapsed={isCollapsed}
              onToggle={() => toggleCollapsed(unit.id)}
            />
            {!isCollapsed && (
              <div className={sc}>
                <UnitContent unit={unit} />
              </div>
            )}
            {!isCollapsed && !quizDone[unit.id] && (
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

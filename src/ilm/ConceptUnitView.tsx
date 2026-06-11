import type { ConceptUnit, Scenario } from "./types";
import type { CarouselSlide } from "../components/SectionCarousel";
import CodePlayground from "../components/CodePlayground";

/* Turns one Concept Unit into carousel slides (explanation → analogy →
   scenarios), mirroring the original sample lesson. Inline SVG/HTML visuals
   come straight from the agent and are injected with dangerouslySetInnerHTML —
   they are produced under the eval guardrail (self-contained markup, no scripts). */

function Visual({ html, label }: { html: string; label: string }) {
  if (!html || !html.trim()) return null;
  return (
    <figure className="ilm-visual" aria-label={label}>
      <div className="ilm-visual-inner" dangerouslySetInnerHTML={{ __html: html }} />
    </figure>
  );
}

function ScenarioBody({ s }: { s: Scenario }) {
  const cp = s.code_playground;
  const hasWebPlayground = cp && (cp.html || cp.css);
  const hasCodeBlock = cp && cp.code && !hasWebPlayground;
  return (
    <div>
      <p className="ilm-scenario-text">{s.text}</p>
      {hasWebPlayground && <CodePlayground initialHtml={cp!.html || ""} initialCss={cp!.css || ""} />}
      {hasCodeBlock && <pre className="ilm-code"><code>{cp!.code}</code></pre>}
    </div>
  );
}

export function buildUnitSlides(unit: ConceptUnit): CarouselSlide[] {
  const slides: CarouselSlide[] = [
    {
      label: "Explanation",
      body: (
        <div>
          <h4>What it is</h4>
          <p className="ilm-explanation">{unit.explanation.text}</p>
          <Visual html={unit.explanation.visual_diagram_html} label={`${unit.title} diagram`} />
        </div>
      ),
    },
    {
      label: "Analogy",
      body: (
        <div className="ilm-analogy-slide">
          <h4>Think of it like this</h4>
          <p className="ilm-analogy-text">{unit.analogy.text}</p>
          <Visual html={unit.analogy.visual_html} label={`${unit.title} analogy`} />
        </div>
      ),
    },
  ];

  unit.scenarios.forEach((s, i) => {
    slides.push({
      label: unit.scenarios.length > 1 ? `In practice — ${i + 1}` : "In practice",
      body: (
        <div>
          <h4>See it in action</h4>
          <ScenarioBody s={s} />
        </div>
      ),
    });
  });

  return slides;
}

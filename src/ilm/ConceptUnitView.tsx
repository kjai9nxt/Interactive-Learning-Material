/* eslint-disable react-refresh/only-export-components --
   This module's public export is buildUnitSlides() (a slide-data builder), not a
   hot-reloadable component; Visual/ScenarioBody are internal helpers. Fast Refresh
   has nothing to refresh here, so the rule doesn't apply. */
import type { ConceptUnit, Scenario } from "./types";
import type { CarouselSlide } from "../components/SectionCarousel";
import CodePlayground from "../components/CodePlayground";
import CodeRunner from "../components/CodeRunner";

/* Turns one Concept Unit into carousel slides (explanation → analogy →
   scenarios), mirroring the original sample lesson. Inline SVG/HTML visuals
   come straight from the agent and are injected with dangerouslySetInnerHTML —
   they are produced under the eval guardrail (self-contained markup, no scripts). */

// Web languages get the live iframe preview; everything else (python, java,
// c++, …) gets an editable runner that executes server-side.
const WEB_LANGS = new Set(["html", "css", "js", "javascript", "web"]);

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
  const lang = (cp?.language || "").trim().toLowerCase();
  // Route by language FIRST: a concept is only "web" when its language is a web
  // language (or, with no language given, only html/css markup is present). This
  // stops a Python/Java snippet from ever rendering in the HTML iframe playground.
  const isWeb = WEB_LANGS.has(lang) || (!lang && (!!cp?.html || !!cp?.css) && !cp?.code);
  const hasWebPlayground = !!cp && isWeb && (!!cp.html || !!cp.css || !!cp.code);
  // Any non-web language with code → editable + server-run code runner.
  const hasRunnableCode = !!cp && !!cp.code && !isWeb;
  return (
    <div>
      <p className="ilm-scenario-text">{s.text}</p>
      {s.visual_html && <Visual html={s.visual_html} label="Scenario illustration" />}
      {hasWebPlayground && (
        <CodePlayground
          initialHtml={cp!.html || (lang === "html" ? cp!.code || "" : "")}
          initialCss={cp!.css || (lang === "css" ? cp!.code || "" : "")}
          initialJs={cp!.js || (lang === "js" || lang === "javascript" ? cp!.code || "" : "")}
        />
      )}
      {hasRunnableCode && <CodeRunner initialCode={cp!.code || ""} language={lang || "python"} />}
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

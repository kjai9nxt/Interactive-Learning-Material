/* eslint-disable react-refresh/only-export-components --
   This module's public export is buildUnitSlides() (a slide-data builder), not a
   hot-reloadable component; Visual/ScenarioBody are internal helpers. Fast Refresh
   has nothing to refresh here, so the rule doesn't apply. */
import { useLayoutEffect, useRef } from "react";
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

export function Visual({ image, html, label }: { image?: string; html?: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);

  // The injected SVGs come from the agent, which sometimes emits a viewBox that
  // is smaller than the markup it actually draws (e.g. a third box at x=428
  // width=160 ends at 588 but the viewBox is only 520 wide). The overflowing
  // part is then clipped, so diagrams look "half". Here we measure the SVG's
  // real content bounds via getBBox() and grow the viewBox to fit, then drop the
  // fixed width/height so the corrected viewBox governs responsive scaling.
  // This self-heals any generator overflow — current and future — for free.
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const svg = root.querySelector("svg");
    if (!svg) return;
    let bbox: DOMRect;
    try {
      bbox = (svg as SVGGraphicsElement).getBBox();
    } catch {
      return; // not yet laid out / not measurable
    }
    if (!bbox.width || !bbox.height) return;

    const pad = 6;
    const minX = Math.min(0, bbox.x) - pad;
    const minY = Math.min(0, bbox.y) - pad;
    const width = Math.max(bbox.x + bbox.width, 0) - minX + pad;
    const height = Math.max(bbox.y + bbox.height, 0) - minY + pad;

    const cur = (svg.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
    const fits =
      cur.length === 4 &&
      minX >= cur[0] - 0.5 &&
      minY >= cur[1] - 0.5 &&
      minX + width <= cur[0] + cur[2] + 0.5 &&
      minY + height <= cur[1] + cur[3] + 0.5;

    if (!fits) {
      svg.setAttribute(
        "viewBox",
        `${minX.toFixed(1)} ${minY.toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)}`,
      );
      // Re-pin the intrinsic size to the corrected box so the existing
      // `max-width:100%; height:auto` CSS shrinks-to-fit without upscaling,
      // and the aspect ratio matches the content we just measured.
      svg.setAttribute("width", width.toFixed(1));
      svg.setAttribute("height", height.toFixed(1));
    }
  }, [html]);

  // Preferred path: an AI-generated raster illustration (data URL or /ilm-images
  // path). Legacy units carry inline-SVG `html` instead, handled below. (Declared
  // after the hook so hooks always run in the same order — rules-of-hooks.)
  if (image && image.trim()) {
    return (
      <figure className="ilm-visual" aria-label={label}>
        <img className="ilm-visual-img" src={image} alt={label} loading="lazy" />
      </figure>
    );
  }

  if (!html || !html.trim()) return null;
  return (
    <figure className="ilm-visual" aria-label={label}>
      <div ref={ref} className="ilm-visual-inner" dangerouslySetInnerHTML={{ __html: html }} />
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
      {(s.visual_image || s.visual_html) && (
        <Visual image={s.visual_image} html={s.visual_html} label="Scenario illustration" />
      )}
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

/* Stacked, scroll-based rendering of one Concept Unit — explanation, analogy,
   and scenarios are all laid out vertically and fully visible (no carousel /
   click-to-reveal). This is the low-friction "reading" layout; interactivity is
   reserved for the code playgrounds and the mini-quiz, not for revealing text. */
export function UnitContent({ unit }: { unit: ConceptUnit }) {
  const scenarios = unit.scenarios || [];
  return (
    <div className="ilm-unit">
      <section className="ilm-block">
        <div className="ilm-block-label">What it is</div>
        <p className="ilm-explanation">{unit.explanation.text}</p>
        <Visual image={unit.explanation.visual_image} html={unit.explanation.visual_diagram_html} label={`${unit.title} diagram`} />
      </section>

      <section className="ilm-block ilm-analogy">
        <div className="ilm-block-label">Think of it like this</div>
        <p className="ilm-analogy-text">{unit.analogy.text}</p>
        <Visual image={unit.analogy.visual_image} html={unit.analogy.visual_html} label={`${unit.title} analogy`} />
      </section>

      {scenarios.length > 0 && (
        <section className="ilm-block">
          <div className="ilm-block-label">In practice</div>
          <div className="ilm-scenarios">
            {scenarios.map((s, i) => (
              <div className="ilm-scenario" key={i}>
                {scenarios.length > 1 && <div className="ilm-scenario-num">{i + 1}</div>}
                <div className="ilm-scenario-body">
                  <ScenarioBody s={s} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* Legacy carousel slide builder — kept so the click-through layout can still be
   A/B'd against the scroll layout if needed. Not used by Lesson anymore. */
export function buildUnitSlides(unit: ConceptUnit): CarouselSlide[] {
  const slides: CarouselSlide[] = [
    {
      label: "Explanation",
      body: (
        <div>
          <h4>What it is</h4>
          <p className="ilm-explanation">{unit.explanation.text}</p>
          <Visual image={unit.explanation.visual_image} html={unit.explanation.visual_diagram_html} label={`${unit.title} diagram`} />
        </div>
      ),
    },
    {
      label: "Analogy",
      body: (
        <div className="ilm-analogy-slide">
          <h4>Think of it like this</h4>
          <p className="ilm-analogy-text">{unit.analogy.text}</p>
          <Visual image={unit.analogy.visual_image} html={unit.analogy.visual_html} label={`${unit.title} analogy`} />
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

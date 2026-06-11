import { useState, useEffect } from "react";
import "./Styles.css";
import "./ilm/ilm.css";
import type { Theme } from "./types";
import type { ConceptUnitsFile } from "./ilm/types";
import ThemeToggle from "./components/ThemeToggle";
import Ingest from "./ilm/Ingest";
import Lesson from "./ilm/Lesson";

/* ══════════════════════════════════════════════════════════════════════
   ILM APP — controller. Shows the Ingest screen, then renders the generated
   Concept Units as an interactive lesson. The agent pipeline runs behind
   /api/generate (python -m agent.server).
   ══════════════════════════════════════════════════════════════════════ */

function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    const saved = window.localStorage.getItem("ilm-theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });
  useEffect(() => {
    try { window.localStorage.setItem("ilm-theme", theme); } catch { /* ignore */ }
  }, [theme]);

  const [data, setData] = useState<ConceptUnitsFile | null>(null);

  const units = data?.units || [];
  const rejected = data?.rejected || [];
  const docTitle = data ? data.doc.replace(/\.md$/, "").replace(/[_-]/g, " ") : "";

  return (
    <div className={`mq-root theme-${theme}`}>
      <div className="mq-progress">
        <div className="mq-progress-logo">
          Interactive Learning Material {data && <span>· {data.doc}</span>}
        </div>
        <div style={{ flex: 1 }} />
        {data && (
          <button className="ilm-newbtn" onClick={() => setData(null)}>← New material</button>
        )}
        <ThemeToggle theme={theme} onToggle={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} />
      </div>

      {!data ? (
        <Ingest onResult={setData} />
      ) : (
        <>
          <div className="hero">
            <div className="hero-orbs"><span className="hero-orb" /><span className="hero-orb" /><span className="hero-orb" /></div>
            <div className="hero-tag">
              AI-generated · Eval-governed · Human-approved{data.generator_model ? ` · ${data.generator_model}` : ""}
            </div>
            <h1>Learn <span className="gradient">{docTitle}</span>, interactively</h1>
            <p className="lede">
              {units.length} concept{units.length === 1 ? "" : "s"} passed the eval gate and shipped.
              {rejected.length > 0 && ` ${rejected.length} more were generated but flagged by the audit and held back.`}
            </p>
            {rejected.length > 0 && (
              <div className="ilm-rejected">
                <strong>Held back by the eval gate ({rejected.length}):</strong>
                <ul>
                  {rejected.map((r) => (
                    <li key={r.id}>
                      {r.title}
                      {r.flags && r.flags.length > 0 && (
                        <span className="ilm-rejected-reason"> — {r.flags[0].criterion}: {r.flags[0].reason}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {units.length > 0
            ? <Lesson key={data.run_id} data={data} />
            : <div className="ilm-empty"><h1>No units passed the eval gate</h1>
                <p>Every generated unit was flagged by the audit. Try a clearer source document.</p></div>}
        </>
      )}
    </div>
  );
}

export default App;

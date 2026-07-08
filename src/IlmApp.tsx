import { useState, useEffect } from "react";
import "./Styles.css";
import "./ilm/ilm.css";
import type { Theme } from "./types";
import type { ConceptUnitsFile } from "./ilm/types";
import ThemeToggle from "./components/ThemeToggle";
import Ingest from "./ilm/Ingest";
import Lesson from "./ilm/Lesson";
import { buildLessonHtml } from "./ilm/exportHtml";

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

  // Export the generated + approved output as a JSON file the user can save and
  // reuse (same shape the renderer consumes / the backend publishes). Serializes
  // the full result object in the browser — no server round-trip needed.
  const downloadJson = () => {
    if (!data) return;
    const slug = data.doc.replace(/\.md$/, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const fname = `ilm_${slug || "lesson"}_${data.run_id || "output"}.json`;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Export the generated + approved output as a self-contained HTML lesson —
  // one .html file (styling inlined, images embedded as data URLs, interactive
  // quiz) that opens in any browser with no React app or server.
  const downloadHtml = async () => {
    if (!data) return;
    const slug = data.doc.replace(/\.md$/, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const fname = `ilm_${slug || "lesson"}_${data.run_id || "output"}.html`;
    const html = await buildLessonHtml(data);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`mq-root theme-${theme}`}>
      <div className="mq-progress">
        <div className="mq-progress-logo">
          Interactive Learning Material {data && <span>· {data.doc}</span>}
        </div>
        <div style={{ flex: 1 }} />
        {data && (
          <button className="ilm-dlbtn" onClick={downloadHtml} title="Download the lesson as a standalone HTML file">
            ↓ Export HTML
          </button>
        )}
        {data && (
          <button className="ilm-dlbtn" onClick={downloadJson} title="Download the generated Concept Units as JSON">
            ↓ Export JSON
          </button>
        )}
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

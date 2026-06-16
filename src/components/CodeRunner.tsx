import { useState, useRef, useEffect } from "react";

/* ══════════════════════════════════════════════════════════════════════
   CODE RUNNER — editable + runnable playground for NON-web languages
   (Python, Java, C++, Go, Rust, …). Web languages (html/css/js) use the
   iframe-based CodePlayground instead.

   Execution happens on the local Flask backend (POST /api/run), which shells
   out to the toolchain installed on this machine. Python always works; other
   languages work if their compiler/interpreter is installed.
   ══════════════════════════════════════════════════════════════════════ */

// Friendly label + icon per language (everything else falls back to a generic chip).
const LANG_META: Record<string, { label: string; icon: string }> = {
  python: { label: "Python", icon: "Py" },
  java: { label: "Java", icon: "Jv" },
  c: { label: "C", icon: "C" },
  cpp: { label: "C++", icon: "C++" },
  csharp: { label: "C#", icon: "C#" },
  go: { label: "Go", icon: "Go" },
  rust: { label: "Rust", icon: "Rs" },
  ruby: { label: "Ruby", icon: "Rb" },
  php: { label: "PHP", icon: "Php" },
  kotlin: { label: "Kotlin", icon: "Kt" },
  swift: { label: "Swift", icon: "Sw" },
  typescript: { label: "TypeScript", icon: "Ts" },
  javascript: { label: "JavaScript", icon: "JS" },
  bash: { label: "Bash", icon: "Sh" },
};

// Common aliases → canonical language name.
const LANG_ALIASES: Record<string, string> = {
  py: "python", py3: "python", python3: "python",
  "c++": "cpp", cc: "cpp",
  cs: "csharp", "c#": "csharp",
  golang: "go", rs: "rust", rb: "ruby",
  ts: "typescript", js: "javascript", node: "javascript",
  shell: "bash", sh: "bash",
};

const normalizeLang = (lang: string) => {
  const l = (lang || "").trim().toLowerCase();
  return LANG_ALIASES[l] || l;
};

// Full set the backend knows how to run; the dropdown is narrowed at runtime to
// the toolchains actually installed on this machine (fetched from /api/health),
// so we never offer e.g. Java when the JDK isn't present.
const ALL_RUNNABLE = ["python", "javascript", "java", "cpp", "c", "go", "rust", "ruby", "php", "bash"];

interface Props {
  initialCode: string;
  language: string;
}

type RunState = "idle" | "loading" | "done" | "error";

export default function CodeRunner({ initialCode, language }: Props) {
  const initialLang = normalizeLang(language);
  const [lang, setLang] = useState(initialLang || "python");
  // Languages actually installed on the backend — drives the dropdown options.
  const [langs, setLangs] = useState<string[]>(ALL_RUNNABLE);
  const meta = LANG_META[lang] || { label: lang ? lang.toUpperCase() : "Code", icon: "</>" };

  const [code, setCode] = useState(initialCode);
  const [state, setState] = useState<RunState>("idle");
  const [output, setOutput] = useState("");
  const [isError, setIsError] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Ask the backend which toolchains are installed; only offer those. Keep the
  // concept's own language in the list even if uninstalled, so the user sees it
  // (running it then returns a clear "not installed" message).
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => {
        const inst: string[] = d.installed_languages || [];
        if (inst.length) {
          const opts = inst.includes(initialLang) || !initialLang ? inst : [initialLang, ...inst];
          setLangs(opts);
          if (!opts.includes(lang)) setLang(opts[0]);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tab key inserts spaces instead of moving focus, so the editor feels real.
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = code.slice(0, start) + "    " + code.slice(end);
      setCode(next);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 4; });
    }
  };

  const handleRun = async () => {
    setState("loading");
    setOutput("");
    setIsError(false);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: lang, code }),
      });
      const text = await res.text();
      if (!text) throw new Error("Empty response — is the backend (python -m agent.server) running?");
      const data = JSON.parse(text);
      if (data.error && !data.stderr && !data.stdout) {
        setOutput(data.error);
        setIsError(true);
      } else {
        const combined = [
          data.error ? `${data.error}:` : "",
          data.stdout || "",
          data.stderr || "",
        ].filter(Boolean).join("\n");
        setOutput(combined || "(no output)");
        setIsError(Boolean(data.error) || (typeof data.exit_code === "number" && data.exit_code !== 0));
      }
      setState("done");
    } catch (err) {
      setOutput(err instanceof Error ? err.message : String(err));
      setIsError(true);
      setState("error");
    }
  };

  const handleReset = () => { setCode(initialCode); setOutput(""); setState("idle"); setIsError(false); };

  // Auto-grow the editor to fit its content.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 420) + "px";
  }, [code]);

  return (
    <div className="cr">
      <div className="cr-top">
        <label className="cr-lang">
          <span className="cr-lang-icon">{meta.icon}</span>
          <select
            className="cr-lang-select"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            title="Run this code as…"
          >
            {langs.map((l) => (
              <option key={l} value={l}>{LANG_META[l]?.label || l}</option>
            ))}
          </select>
        </label>
        <div className="cr-tools">
          <button className="cr-tool" title="Reset" onClick={handleReset}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
          </button>
        </div>
      </div>
      <textarea
        ref={taRef}
        className="cr-editor"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={onKeyDown}
        spellCheck={false}
        wrap="off"
      />
      <div className="cr-foot">
        <button className="cr-run" onClick={handleRun} disabled={state === "loading"}>
          {state === "loading"
            ? <><span className="cr-spinner" /> Running…</>
            : <><span className="cr-run-icon">▶</span> Run Code</>}
        </button>
        <span className="cr-hint">Runs locally via the agent backend</span>
      </div>
      {(state === "done" || state === "error") && (
        <div className={`cr-output ${isError ? "is-error" : ""}`}>
          <div className="cr-output-head">{isError ? "Error" : "Output"}</div>
          <pre className="cr-output-body">{output}</pre>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import type { DeviceSize } from "../types";

/* ══════════════════════════════════════════════════════════════════════
   CODE PLAYGROUND — HTML/CSS/JS tabs + device size selector
   ══════════════════════════════════════════════════════════════════════ */

const SIZE_PRESETS: Record<Exclude<DeviceSize, "custom">, { width: number | null; label: string; icon: string }> = {
  mobile: { width: 375, label: "Mobile", icon: "📱" },
  tablet: { width: 768, label: "Tablet", icon: "📲" },
  desktop: { width: 1280, label: "Desktop", icon: "🖥" },
  full: { width: null, label: "Full", icon: "↔" },
};

interface Props {
  initialHtml: string;
  initialCss: string;
  initialJs?: string;
}

type LogEntry = { level: "log" | "info" | "warn" | "error"; text: string };

export default function CodePlayground({ initialHtml, initialCss, initialJs = "" }: Props) {
  const [html, setHtml] = useState(initialHtml);
  const [css, setCss] = useState(initialCss);
  const [js, setJs] = useState(initialJs);
  // Default to the JS tab when the example ships JS, else CSS.
  const [tab, setTab] = useState<"html" | "css" | "js">(initialJs.trim() ? "js" : "css");
  const [srcDoc, setSrcDoc] = useState("");
  const [hasRun, setHasRun] = useState(false);
  // Bumped on every Run so the iframe is force-remounted (see key={runId}).
  // Without this, clicking Run again with unedited code produces a byte-identical
  // srcDoc — React skips the DOM update, the iframe never reloads, and the run
  // silently no-ops (console clears but nothing re-executes). Remounting gives
  // each run a fresh JS realm, so no stale state or re-declaration errors carry over.
  const [runId, setRunId] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [deviceSize, setDeviceSize] = useState<DeviceSize>("full");
  const [customWidth, setCustomWidth] = useState(700);
  // Console: capture console.* / errors from the iframe so JS output is visible.
  const [showConsole, setShowConsole] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const settingsRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!showSettings) return;
    const onClick = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setShowSettings(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [showSettings]);

  // Listen for console messages forwarded from THIS playground's iframe only.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (iframeRef.current && e.source !== iframeRef.current.contentWindow) return;
      const d = e.data;
      if (d && d.__ilmConsole) setLogs((prev) => [...prev, { level: d.level, text: d.text }]);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Capture script injected into the preview so console.* and runtime errors
  // surface in our own console panel (the iframe has no visible devtools).
  const CONSOLE_HOOK = `<script>(function(){
    var ser=function(a){try{return typeof a==='object'?JSON.stringify(a):String(a)}catch(e){return String(a)}};
    var send=function(level,args){parent.postMessage({__ilmConsole:true,level:level,text:Array.prototype.map.call(args,ser).join(' ')},'*')};
    ['log','info','warn','error'].forEach(function(m){var o=console[m];console[m]=function(){send(m==='log'?'log':m,arguments);if(o)o.apply(console,arguments)}});
    window.addEventListener('error',function(e){send('error',[(e.error&&e.error.stack)||e.message])});
    window.addEventListener('unhandledrejection',function(e){send('error',['Uncaught (in promise) '+ser(e.reason)])});
  })();</scr` + `ipt>`;

  const buildDoc = () => `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>html,body{margin:0;padding:0;font-family:system-ui,sans-serif;} ${css}</style>
</head><body>${html}${CONSOLE_HOOK}<script>${js}</script></body></html>`;

  const handleRun = () => { setLogs([]); setSrcDoc(buildDoc()); setHasRun(true); setRunId((n) => n + 1); };
  const handleReset = () => { setHtml(initialHtml); setCss(initialCss); setJs(initialJs); setLogs([]); };

  const currentValue = tab === "html" ? html : tab === "css" ? css : js;
  const currentSetter = tab === "html" ? setHtml : tab === "css" ? setCss : setJs;
  const previewWidth: number | null = deviceSize === "custom" ? customWidth : SIZE_PRESETS[deviceSize].width;

  return (
    <div className="pg">
      <div className="pg-top">
        <div className="pg-tabs">
          {(["html", "css", "js"] as const).map((t) => (
            <button key={t} className={`pg-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
              <span className={`pg-tab-icon icon-${t}`}>{t === "html" ? "5" : t === "css" ? "3" : "JS"}</span>
              <span>{t.toUpperCase()}</span>
            </button>
          ))}
        </div>
        <div className="pg-tools" ref={settingsRef}>
          <button title="Display size" className={`pg-tool ${showSettings ? "active" : ""}`} onClick={() => setShowSettings((s) => !s)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          <button title="Reset" className="pg-tool" onClick={handleReset}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
          </button>
          <button title="Open in new tab" className="pg-tool" onClick={() => { const w = window.open(); if (w) { w.document.write(buildDoc()); w.document.close(); } }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </button>
          {showSettings && (
            <div className="pg-settings">
              <div className="pg-settings-head">
                <span className="pg-settings-title">Preview Settings</span>
                <button className="pg-settings-close" onClick={() => setShowSettings(false)}>×</button>
              </div>
              <div className="pg-settings-body">
                <label className="pg-console-toggle">
                  <input type="checkbox" checked={showConsole} onChange={(e) => setShowConsole(e.target.checked)} />
                  <span className="pg-console-box">{showConsole ? "✓" : ""}</span>
                  <span>Console</span>
                  <span className="pg-console-hint">Show console.log output below the preview</span>
                </label>
                <div className="pg-settings-sub">Presets</div>
                <div className="pg-size-grid">
                  {(Object.keys(SIZE_PRESETS) as Array<keyof typeof SIZE_PRESETS>).map((key) => {
                    const p = SIZE_PRESETS[key];
                    return (
                      <button key={key} className={`pg-size-btn ${deviceSize === key ? "active" : ""}`} onClick={() => setDeviceSize(key)}>
                        <span className="pg-size-btn-icon">{p.icon}</span>
                        <span className="pg-size-btn-name">{p.label}</span>
                        <span className="pg-size-btn-w">{p.width ? `${p.width}px` : "Full"}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="pg-custom">
                  <div className="pg-settings-sub">Custom width</div>
                  <div className="pg-custom-label">
                    <span>{deviceSize === "custom" ? "Active" : "Drag to use"}</span>
                    <span className="pg-custom-val">{customWidth}px</span>
                  </div>
                  <input type="range" min={320} max={1440} step={10} value={customWidth} onChange={(e) => { setCustomWidth(+e.target.value); setDeviceSize("custom"); }} />
                  <div className="pg-custom-marks"><span>320</span><span>768</span><span>1280</span><span>1440</span></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="pg-body">
        <div className="pg-editor-wrap">
          <textarea className="pg-editor" value={currentValue} onChange={(e) => currentSetter(e.target.value)} spellCheck={false} wrap="off" />
        </div>
        <div className="pg-preview-area">
          <div className="pg-preview-size">{previewWidth ? `Preview: ${previewWidth}px` : "Preview: Full width"}</div>
          <div className="pg-preview-wrapper">
            <div className="pg-preview-frame" style={{ width: previewWidth ? `${previewWidth}px` : "100%" }}>
              {hasRun ? (
                <iframe key={runId} ref={iframeRef} className="pg-iframe" title="preview" srcDoc={srcDoc} sandbox="allow-same-origin allow-scripts" />
              ) : (
                <div className="pg-preview-empty">
                  <div className="pg-preview-empty-icon">▶</div>
                  <div className="pg-preview-empty-text">Click <strong>Run Code</strong> to see the output</div>
                </div>
              )}
            </div>
          </div>
          {showConsole && hasRun && (
            <div className="pg-console">
              <div className="pg-console-bar">
                <span className="pg-console-title">Console</span>
                <button className="pg-console-clear" onClick={() => setLogs([])}>Clear</button>
              </div>
              <div className="pg-console-body">
                {logs.length === 0 ? (
                  <div className="pg-console-empty">No console output. Use <code>console.log(...)</code> in the JS tab.</div>
                ) : (
                  logs.map((l, i) => (
                    <div key={i} className={`pg-console-line lvl-${l.level}`}>
                      <span className="pg-console-caret">›</span>
                      <span className="pg-console-text">{l.text}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="pg-foot">
        <button className="pg-run" onClick={handleRun}><span className="pg-run-icon">▶</span> Run Code</button>
      </div>
    </div>
  );
}
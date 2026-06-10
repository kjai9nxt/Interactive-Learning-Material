import React, { useState } from "react";

/* ══════════════════════════════════════════════════════════════════════
   SVG ILLUSTRATIONS — use CSS vars (via style) so they adapt to theme

   These four scenes use:
     var(--svg-ink)       → outline / strokes (text2 in each theme)
     var(--svg-ink-light) → subtle dashes
     var(--svg-text)      → main labels
     var(--svg-surface)   → container fills
     var(--svg-surface2)  → secondary surface
     var(--indigo) / var(--purple) / etc → accents (theme-aware, stay vibrant)
   ══════════════════════════════════════════════════════════════════════ */

export const FilterScene = () => (
  <svg viewBox="0 0 220 140" width="220" height="140" xmlns="http://www.w3.org/2000/svg">
    {/* Three device icons walking up */}
    <g opacity="0.85">
      <rect x="20" y="14" width="14" height="22" rx="2" fill="none" style={{ stroke: "var(--svg-ink)" }} strokeWidth="1.6"/>
      <rect x="44" y="10" width="20" height="28" rx="2.5" fill="none" style={{ stroke: "var(--svg-ink)" }} strokeWidth="1.6"/>
      <rect x="74" y="16" width="26" height="20" rx="2" fill="none" style={{ stroke: "var(--svg-ink)" }} strokeWidth="1.6"/>
    </g>
    {/* Arrows down */}
    <g style={{ stroke: "var(--svg-ink-light)" }} strokeWidth="1.4" strokeLinecap="round" fill="none" opacity="0.6">
      <path d="M27 42 L27 50"/><path d="M54 42 L54 50"/><path d="M87 42 L87 50"/>
      <path d="M25 48 L27 50 L29 48"/><path d="M52 48 L54 50 L56 48"/><path d="M85 48 L87 50 L89 48"/>
    </g>
    {/* Funnel/filter */}
    <path d="M14 56 L110 56 L78 92 L78 110 L46 110 L46 92 Z" style={{ fill: "var(--indigo-soft)", stroke: "var(--indigo)" }} strokeWidth="1.8" strokeLinejoin="round"/>
    <text x="62" y="78" textAnchor="middle" fontSize="9" fontFamily="JetBrains Mono, monospace" style={{ fill: "var(--indigo)" }} fontWeight="600">@media</text>
    {/* Output single device */}
    <rect x="52" y="118" width="20" height="14" rx="2" style={{ fill: "var(--indigo)" }} opacity="0.9"/>
    {/* Right side labels */}
    <line x1="130" y1="40" x2="200" y2="40" style={{ stroke: "var(--svg-ink-light)" }} strokeWidth="1" opacity="0.4"/>
    <text x="130" y="36" fontSize="9" fontFamily="JetBrains Mono, monospace" style={{ fill: "var(--svg-ink-light)" }} letterSpacing="0.5">INPUT</text>
    <text x="130" y="58" fontSize="10" fontFamily="Inter, sans-serif" style={{ fill: "var(--svg-text)" }} fontWeight="600">All devices</text>
    <line x1="130" y1="92" x2="200" y2="92" style={{ stroke: "var(--svg-ink-light)" }} strokeWidth="1" opacity="0.4"/>
    <text x="130" y="88" fontSize="9" fontFamily="JetBrains Mono, monospace" style={{ fill: "var(--indigo)" }} letterSpacing="0.5">OUTPUT</text>
    <text x="130" y="110" fontSize="10" fontFamily="Inter, sans-serif" style={{ fill: "var(--svg-text)" }} fontWeight="600">Only matches</text>
  </svg>
);

export const VaultScene = () => (
  <svg viewBox="0 0 220 140" width="220" height="140" xmlns="http://www.w3.org/2000/svg">
    <rect x="20" y="14" width="180" height="116" rx="6" style={{ fill: "var(--svg-surface)", stroke: "var(--svg-ink)" }} strokeWidth="2"/>
    <rect x="32" y="26" width="156" height="92" rx="4" style={{ fill: "var(--svg-surface2)" }} stroke="none"/>
    <circle cx="110" cy="72" r="28" fill="none" style={{ stroke: "var(--svg-ink)" }} strokeWidth="2"/>
    <circle cx="110" cy="72" r="20" fill="none" style={{ stroke: "var(--svg-ink-light)" }} strokeWidth="1" strokeDasharray="2 3"/>
    <circle cx="110" cy="72" r="4" style={{ fill: "var(--svg-text)" }}/>
    <line x1="110" y1="72" x2="110" y2="52" style={{ stroke: "var(--purple)" }} strokeWidth="2.2" strokeLinecap="round"/>
    {[0, 60, 120, 180, 240, 300].map((deg, i) => {
      const rad = (deg * Math.PI) / 180;
      const x1 = 110 + 30 * Math.cos(rad - Math.PI/2);
      const y1 = 72 + 30 * Math.sin(rad - Math.PI/2);
      const x2 = 110 + 33 * Math.cos(rad - Math.PI/2);
      const y2 = 72 + 33 * Math.sin(rad - Math.PI/2);
      return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} style={{ stroke: "var(--svg-ink)" }} strokeWidth="1.2"/>;
    })}
    <circle cx="60" cy="44" r="9" style={{ fill: "var(--purple-soft)", stroke: "var(--purple)" }} strokeWidth="1.5"/>
    <text x="60" y="48" textAnchor="middle" fontSize="11">🔑</text>
    <circle cx="160" cy="44" r="9" style={{ fill: "var(--purple-soft)", stroke: "var(--purple)" }} strokeWidth="1.5"/>
    <text x="160" y="48" textAnchor="middle" fontSize="11">👆</text>
    <rect x="100" y="105" width="20" height="6" rx="2" style={{ fill: "var(--svg-text)" }}/>
    <text x="110" y="128" textAnchor="middle" fontSize="10" fontFamily="JetBrains Mono, monospace" style={{ fill: "var(--svg-ink-light)" }} letterSpacing="2" fontWeight="600">KEY · AND · FINGERPRINT</text>
  </svg>
);

export const FlipScene = () => (
  <svg viewBox="0 0 220 140" width="220" height="140" xmlns="http://www.w3.org/2000/svg">
    <rect x="14" y="30" width="80" height="80" rx="8" style={{ fill: "var(--emerald-soft)", stroke: "var(--emerald)" }} strokeWidth="1.5"/>
    <rect x="126" y="30" width="80" height="80" rx="8" style={{ fill: "var(--red-soft)", stroke: "var(--red)" }} strokeWidth="1.5"/>
    <text x="54" y="50" textAnchor="middle" fontSize="9" fontFamily="JetBrains Mono, monospace" style={{ fill: "var(--emerald)" }} fontWeight="700" letterSpacing="1">ORIGINAL</text>
    <text x="54" y="80" textAnchor="middle" fontSize="20" style={{ fill: "var(--emerald)" }} fontWeight="700">TRUE</text>
    <path d="M40 90 L52 100 L70 78" style={{ stroke: "var(--emerald)" }} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    <text x="166" y="50" textAnchor="middle" fontSize="9" fontFamily="JetBrains Mono, monospace" style={{ fill: "var(--red)" }} fontWeight="700" letterSpacing="1">AFTER NOT</text>
    <text x="166" y="80" textAnchor="middle" fontSize="20" style={{ fill: "var(--red)" }} fontWeight="700">FALSE</text>
    <path d="M154 86 L178 102 M178 86 L154 102" style={{ stroke: "var(--red)" }} strokeWidth="2.5" strokeLinecap="round"/>
    <circle cx="110" cy="70" r="16" style={{ fill: "var(--svg-surface)", stroke: "var(--purple)" }} strokeWidth="2"/>
    <text x="110" y="73" textAnchor="middle" fontSize="9" fontFamily="JetBrains Mono, monospace" style={{ fill: "var(--purple)" }} fontWeight="700">NOT</text>
    <path d="M94 70 L102 66 L102 74 Z" style={{ fill: "var(--purple)" }}/>
    <path d="M126 70 L118 66 L118 74 Z" style={{ fill: "var(--purple)" }}/>
    <text x="110" y="128" textAnchor="middle" fontSize="10" fontFamily="JetBrains Mono, monospace" style={{ fill: "var(--svg-ink-light)" }} letterSpacing="1">FLIPS THE ANSWER</text>
  </svg>
);

export const TicketsScene = () => (
  <svg viewBox="0 0 220 140" width="220" height="140" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(14, 24)">
      <path d="M2 0 L78 0 L78 12 A4 4 0 0 0 78 20 L78 32 A4 4 0 0 0 78 40 L78 52 L2 52 L2 40 A4 4 0 0 0 2 32 L2 20 A4 4 0 0 0 2 12 Z" style={{ fill: "var(--pink-soft)", stroke: "var(--pink)" }} strokeWidth="1.5"/>
      <text x="40" y="14" textAnchor="middle" fontSize="8" fontFamily="JetBrains Mono, monospace" style={{ fill: "var(--pink)" }} fontWeight="700" letterSpacing="0.5">DISCOUNT</text>
      <text x="40" y="32" textAnchor="middle" fontSize="14">🎓</text>
      <text x="40" y="46" textAnchor="middle" fontSize="9" fontFamily="Inter, sans-serif" style={{ fill: "var(--svg-text)" }} fontWeight="600">Student</text>
    </g>
    <circle cx="110" cy="50" r="14" style={{ fill: "var(--svg-surface)", stroke: "var(--pink)" }} strokeWidth="2"/>
    <text x="110" y="53" textAnchor="middle" fontSize="10" fontFamily="JetBrains Mono, monospace" style={{ fill: "var(--pink)" }} fontWeight="700">OR</text>
    <g transform="translate(128, 24)">
      <path d="M2 0 L78 0 L78 12 A4 4 0 0 0 78 20 L78 32 A4 4 0 0 0 78 40 L78 52 L2 52 L2 40 A4 4 0 0 0 2 32 L2 20 A4 4 0 0 0 2 12 Z" style={{ fill: "var(--pink-soft)", stroke: "var(--pink)" }} strokeWidth="1.5"/>
      <text x="40" y="14" textAnchor="middle" fontSize="8" fontFamily="JetBrains Mono, monospace" style={{ fill: "var(--pink)" }} fontWeight="700" letterSpacing="0.5">DISCOUNT</text>
      <text x="40" y="32" textAnchor="middle" fontSize="14">🧓</text>
      <text x="40" y="46" textAnchor="middle" fontSize="9" fontFamily="Inter, sans-serif" style={{ fill: "var(--svg-text)" }} fontWeight="600">Senior</text>
    </g>
    <g transform="translate(70, 90)">
      <path d="M0 12 L60 12 L60 4 L80 14 L60 24 L60 16 L0 16 Z" style={{ fill: "var(--emerald)" }} opacity="0.9"/>
      <text x="40" y="40" textAnchor="middle" fontSize="10" fontFamily="JetBrains Mono, monospace" style={{ fill: "var(--svg-ink-light)" }} letterSpacing="1">EITHER GRANTS ENTRY</text>
    </g>
  </svg>
);

/* ══════════════════════════════════════════════════════════════════════
   INTERACTIVE ANALOGY WIDGETS
   ══════════════════════════════════════════════════════════════════════ */

export function DeviceFilterDemo() {
  const devices = [{ name: "Phone", w: 375, icon: "📱" }, { name: "Tablet", w: 768, icon: "📲" }, { name: "Desktop", w: 1280, icon: "🖥" }];
  const rules = [
    { id: "max600", label: "max-width: 600px", test: (w: number) => w <= 600 },
    { id: "min800", label: "min-width: 800px", test: (w: number) => w >= 800 },
    { id: "max1000", label: "max-width: 1000px", test: (w: number) => w <= 1000 },
  ];
  const [ruleId, setRuleId] = useState(rules[0].id);
  const rule = rules.find((r) => r.id === ruleId)!;
  return (
    <div className="ana-demo">
      <div className="ana-demo-row">
        <label className="ana-demo-label">Pick a media query rule:</label>
        <select className="ana-select" value={ruleId} onChange={(e) => setRuleId(e.target.value)}>
          {rules.map((r) => <option key={r.id} value={r.id}>@media ({r.label}) {`{ … }`}</option>)}
        </select>
      </div>
      <div className="ana-devices">
        {devices.map((d) => {
          const match = rule.test(d.w);
          return (
            <div key={d.name} className={`ana-device ${match ? "match" : "nomatch"}`}>
              <div className="ana-device-icon">{d.icon}</div>
              <div className="ana-device-name">{d.name}</div>
              <div className="ana-device-w">{d.w}px</div>
              <div className="ana-device-result">{match ? "✓ matches" : "✗ skipped"}</div>
            </div>
          );
        })}
      </div>
      <p className="ana-demo-hint">The browser checks each device against your rule. Only matching devices get the CSS inside the block.</p>
    </div>
  );
}

export function VaultDemo() {
  const [key, setKey] = useState(false);
  const [finger, setFinger] = useState(false);
  const open = key && finger;
  return (
    <div className="ana-demo">
      <div className="vault-row">
        <button className={`toggle-btn ${key ? "on" : ""}`} onClick={() => setKey(!key)}>
          <span className="t-emoji">🔑</span><span className="t-label">Key</span><span className="t-state">{key ? "ON" : "OFF"}</span>
        </button>
        <div className="vault-op">AND</div>
        <button className={`toggle-btn ${finger ? "on" : ""}`} onClick={() => setFinger(!finger)}>
          <span className="t-emoji">👆</span><span className="t-label">Fingerprint</span><span className="t-state">{finger ? "ON" : "OFF"}</span>
        </button>
      </div>
      <div className={`vault-result ${open ? "open" : "locked"}`}>
        <div className="vault-icon">{open ? "🔓" : "🔒"}</div>
        <div className="vault-text">{open ? "Vault OPEN" : "Vault LOCKED"}</div>
      </div>
      <p className="ana-demo-hint">Both switches must be ON for the vault to open — that's how <code>and</code> works.</p>
    </div>
  );
}

export function NotDemo() {
  const [condTrue, setCondTrue] = useState(true);
  const negated = !condTrue;
  return (
    <div className="ana-demo">
      <div className="not-row">
        <div className="not-card">
          <div className="not-card-label">Original condition</div>
          <div className="not-toggle">
            <button className={`mini-toggle ${condTrue ? "on" : ""}`} onClick={() => setCondTrue(!condTrue)}><span className={`mini-knob ${condTrue ? "on" : ""}`} /></button>
            <span className={`not-val ${condTrue ? "true" : "false"}`}>{condTrue ? "TRUE" : "FALSE"}</span>
          </div>
        </div>
        <div className="not-arrow"><div className="not-arrow-label">NOT</div><div className="not-arrow-icon">↦</div></div>
        <div className="not-card">
          <div className="not-card-label">After NOT</div>
          <div className="not-toggle"><span className={`not-val ${negated ? "true" : "false"}`}>{negated ? "TRUE" : "FALSE"}</span></div>
        </div>
      </div>
      <p className="ana-demo-hint">Toggle the original. <code>not</code> always flips it — TRUE becomes FALSE, and FALSE becomes TRUE.</p>
    </div>
  );
}

export function TicketsDemo() {
  const [student, setStudent] = useState(false);
  const [senior, setSenior] = useState(false);
  const granted = student || senior;
  return (
    <div className="ana-demo">
      <div className="vault-row">
        <button className={`toggle-btn ${student ? "on" : ""}`} onClick={() => setStudent(!student)}>
          <span className="t-emoji">🎓</span><span className="t-label">Student</span><span className="t-state">{student ? "YES" : "NO"}</span>
        </button>
        <div className="vault-op">OR</div>
        <button className={`toggle-btn ${senior ? "on" : ""}`} onClick={() => setSenior(!senior)}>
          <span className="t-emoji">🧓</span><span className="t-label">Senior</span><span className="t-state">{senior ? "YES" : "NO"}</span>
        </button>
      </div>
      <div className={`vault-result ${granted ? "open" : "locked"}`}>
        <div className="vault-icon">{granted ? "🎟" : "❌"}</div>
        <div className="vault-text">{granted ? "Discount GRANTED" : "Discount DENIED"}</div>
      </div>
      <p className="ana-demo-hint">Either switch being ON is enough — that's the comma, one match is all you need.</p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   ANALOGY BLOCK wrapper
   ══════════════════════════════════════════════════════════════════════ */

export function AnalogyBlock({ illustration, tagline, children }: { illustration: React.ReactNode; tagline: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="analogy-wrap">
      <div className="analogy-head">Analogy</div>
      <div className="analogy-illustration">{illustration}</div>
      <div className="analogy-tagline">{tagline}</div>
      <div className="analogy-interactive">{children}</div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   ORIENTATION VISUAL — also lives here as a visual aid
   ══════════════════════════════════════════════════════════════════════ */

export function OrientationVisual() {
  const [mode, setMode] = useState<"portrait" | "landscape">("portrait");
  return (
    <div className="orient-stage">
      <div className="orient-toggle">
        <div className="orient-toggle-inner">
          <button className={mode === "portrait" ? "active" : ""} onClick={() => setMode("portrait")}>portrait</button>
          <button className={mode === "landscape" ? "active" : ""} onClick={() => setMode("landscape")}>landscape</button>
        </div>
      </div>
      <div className="orient-display">
        <div className={`orient-device ${mode}`}>
          <div className="orient-content tall" /><div className="orient-content" /><div className="orient-content" /><div className="orient-content" />
        </div>
      </div>
      <div className="orient-formula">{mode === "portrait" ? <>height &gt; width &nbsp;→&nbsp; <strong>portrait</strong></> : <>width &gt; height &nbsp;→&nbsp; <strong>landscape</strong></>}</div>
      <div className="orient-cards">
        <div className={`oc ${mode === "portrait" ? "active" : ""}`}><h5>Portrait</h5><p>Tall orientation. Most phones held upright. Best for vertical scrolling.</p></div>
        <div className={`oc ${mode === "landscape" ? "active" : ""}`}><h5>Landscape</h5><p>Wide orientation. Most laptops, TVs, phones turned sideways. Better for video and side-by-side layouts.</p></div>
      </div>
    </div>
  );
}
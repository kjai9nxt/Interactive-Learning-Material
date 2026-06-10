import React, { useState } from "react";

/* ══════════════════════════════════════════════════════════════════════
   REAL-WORLD INTERACTIVE DEMOS

   Each demo shows a working mini-UI that responds to device-size controls,
   simulating real CSS media query behavior. Students can toggle widths and
   immediately see how the layout adapts.
   ══════════════════════════════════════════════════════════════════════ */

type Size = "mobile" | "tablet" | "desktop";
type Orient = "portrait" | "landscape";

const SIZE_PX: Record<Size, number> = { mobile: 360, tablet: 600, desktop: 820 };

/* ── Reusable shell ──────────────────────────────────────────────────── */

interface DemoShellProps {
  label: string;
  title: string;
  desc: React.ReactNode;
  controls: React.ReactNode;
  frameWidth: number | string;
  code: React.ReactNode;
  children: React.ReactNode;
}

function DemoShell({ label, title, desc, controls, frameWidth, code, children }: DemoShellProps) {
  const [showCode, setShowCode] = useState(false);
  return (
    <div className="rw-card">
      <div className="rw-head">
        <div className="rw-label">{label}</div>
        <div className="rw-title">{title}</div>
        <div className="rw-desc">{desc}</div>
      </div>
      <div className="rw-controls">{controls}</div>
      <div className="rw-stage">
        <div className="rw-frame" style={{ width: typeof frameWidth === "number" ? `${frameWidth}px` : frameWidth }}>
          {children}
        </div>
      </div>
      <button className={`rw-code-toggle ${showCode ? "open" : ""}`} onClick={() => setShowCode((s) => !s)}>
        <span>{showCode ? "Hide" : "View"} the CSS that makes this work</span>
        <span className="rw-code-toggle-arrow">›</span>
      </button>
      <div className={`rw-code-block ${showCode ? "open" : ""}`}>
        <div className="rw-code-bar">
          <div className="rw-code-dots"><span /><span /><span /></div>
          <span className="rw-code-lang">css</span>
        </div>
        <pre className="rw-code-pre">{code}</pre>
      </div>
    </div>
  );
}

/* ── Size selector ───────────────────────────────────────────────────── */

function SizeButtons({ size, setSize }: { size: Size; setSize: (s: Size) => void }) {
  return (
    <>
      <span className="rw-controls-label">TRY:</span>
      {(["mobile", "tablet", "desktop"] as const).map((s) => (
        <button key={s} className={`rw-size-btn ${size === s ? "active" : ""}`} onClick={() => setSize(s)}>
          <span>{s === "mobile" ? "📱" : s === "tablet" ? "📲" : "🖥"}</span>
          {s.charAt(0).toUpperCase() + s.slice(1)}
          <span className="rw-size-px">{SIZE_PX[s]}px</span>
        </button>
      ))}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   1. HAMBURGER NAV (Section 1 — Media Query intro)
   ══════════════════════════════════════════════════════════════════════ */

export function HamburgerNavDemo() {
  const [size, setSize] = useState<Size>("desktop");
  const [menuOpen, setMenuOpen] = useState(false);
  const narrow = size === "mobile";

  const code = (
    <>
      <span className="cmt">{`/* Hides the full menu on phones, shows hamburger instead */`}</span>
      {"\n"}
      <span className="sel">.nav-menu</span>{" { "}<span className="prop">display</span>{": "}<span className="val">flex</span>{"; }"}
      {"\n"}
      <span className="sel">.hamburger</span>{" { "}<span className="prop">display</span>{": "}<span className="val">none</span>{"; }"}
      {"\n\n"}
      <span className="kw">@media</span>{" ("}<span className="prop">max-width</span>{": "}<span className="val">600px</span>{") {"}
      {"\n  "}
      <span className="sel">.nav-menu</span>{" { "}<span className="prop">display</span>{": "}<span className="val">none</span>{"; }"}
      {"\n  "}
      <span className="sel">.hamburger</span>{" { "}<span className="prop">display</span>{": "}<span className="val">block</span>{"; }"}
      {"\n}"}
    </>
  );

  return (
    <DemoShell
      label="In real projects"
      title="Responsive navigation bar"
      desc={<>When the screen is narrower than 600px, the full menu collapses into a hamburger icon. Pick a device size and watch the nav adapt.</>}
      controls={<SizeButtons size={size} setSize={setSize} />}
      frameWidth={SIZE_PX[size]}
      code={code}
    >
      <nav className="mock-nav">
        <span className="mock-logo">Acme Co.</span>
        {narrow ? (
          <button className="mock-hamburger" onClick={() => setMenuOpen((o) => !o)}>☰</button>
        ) : (
          <ul className="mock-menu">
            <li>Home</li><li>Products</li><li>About</li><li>Contact</li>
          </ul>
        )}
      </nav>
      {narrow && menuOpen && (
        <ul style={{ listStyle: "none", padding: "10px 18px", margin: 0, background: "#f8fafc", borderBottom: "1px solid #eee" }}>
          {["Home", "Products", "About", "Contact"].map((i) => (
            <li key={i} style={{ padding: "6px 0", fontSize: 12.5, color: "#444" }}>{i}</li>
          ))}
        </ul>
      )}
      <div className="mock-body">
        <h3>Welcome</h3>
        Same content, different layout — the navigation reshapes itself based on the viewport width.
      </div>
    </DemoShell>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   2. PRINT STYLES (Section 2 — Types)
   ══════════════════════════════════════════════════════════════════════ */

export function PrintStylesDemo() {
  const [view, setView] = useState<"screen" | "print">("screen");

  const code = (
    <>
      <span className="cmt">{`/* Hide noise when printing the page */`}</span>
      {"\n"}
      <span className="kw">@media</span>{" "}<span className="val">print</span>{" {"}
      {"\n  "}
      <span className="sel">.ads</span>{", "}<span className="sel">.nav</span>{", "}<span className="sel">.sidebar</span>{" { "}<span className="prop">display</span>{": "}<span className="val">none</span>{"; }"}
      {"\n  "}
      <span className="sel">body</span>{" { "}<span className="prop">background</span>{": "}<span className="val">#fff</span>{"; "}<span className="prop">color</span>{": "}<span className="val">#000</span>{"; }"}
      {"\n}"}
    </>
  );

  return (
    <DemoShell
      label="In real projects"
      title="Print-only styles for articles"
      desc={<>News sites use <code>@media print</code> to strip ads and navigation so only the article prints. Toggle between Screen view and Print preview.</>}
      controls={
        <>
          <span className="rw-controls-label">VIEW:</span>
          <button className={`rw-size-btn ${view === "screen" ? "active" : ""}`} onClick={() => setView("screen")}>🖥 Screen</button>
          <button className={`rw-size-btn ${view === "print" ? "active" : ""}`} onClick={() => setView("print")}>🖨 Print</button>
        </>
      }
      frameWidth="100%"
      code={code}
    >
      <div className={`mock-print-page ${view === "print" ? "printed" : ""}`}>
        <div className="mock-nav-fake"><span>Home</span><span>World</span><span>Tech</span><span>Sport</span></div>
        <div className="mock-print-ad">ADVERTISEMENT — Buy widgets at 50% off!</div>
        <h3 style={{ fontSize: 16, color: "#222", marginBottom: 6, fontWeight: 700 }}>The future of responsive design</h3>
        <div style={{ fontSize: 11.5, color: "#777", marginBottom: 8 }}>By Jane Doe · 5 min read</div>
        <div style={{ fontSize: 12.5, color: "#444", lineHeight: 1.6 }}>
          Media queries have transformed how websites adapt to different devices. By targeting specific media types and features, designers create experiences that work everywhere — even when printed.
        </div>
        <div className="mock-print-ad" style={{ marginTop: 10 }}>ADVERTISEMENT — Subscribe today!</div>
      </div>
    </DemoShell>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   3. RESPONSIVE GRID (Section 3 — Width)
   ══════════════════════════════════════════════════════════════════════ */

export function ResponsiveGridDemo() {
  const [size, setSize] = useState<Size>("desktop");
  const cols = size === "mobile" ? 1 : size === "tablet" ? 2 : 3;

  const code = (
    <>
      <span className="cmt">{`/* Bootstrap / Tailwind-style breakpoints */`}</span>
      {"\n"}
      <span className="sel">.grid</span>{" { "}<span className="prop">display</span>{": "}<span className="val">grid</span>{"; "}<span className="prop">grid-template-columns</span>{": "}<span className="val">1fr</span>{"; }"}
      {"\n\n"}
      <span className="kw">@media</span>{" ("}<span className="prop">min-width</span>{": "}<span className="val">600px</span>{") {"}
      {"\n  "}
      <span className="sel">.grid</span>{" { "}<span className="prop">grid-template-columns</span>{": "}<span className="val">repeat(2, 1fr)</span>{"; }"}
      {"\n}"}
      {"\n\n"}
      <span className="kw">@media</span>{" ("}<span className="prop">min-width</span>{": "}<span className="val">900px</span>{") {"}
      {"\n  "}
      <span className="sel">.grid</span>{" { "}<span className="prop">grid-template-columns</span>{": "}<span className="val">repeat(3, 1fr)</span>{"; }"}
      {"\n}"}
    </>
  );

  const items = [
    { title: "Notebook", price: "$24" },
    { title: "Backpack", price: "$48" },
    { title: "Headphones", price: "$129" },
    { title: "Coffee Mug", price: "$12" },
    { title: "Desk Lamp", price: "$36" },
    { title: "Pen Set", price: "$18" },
  ];

  return (
    <DemoShell
      label="In real projects"
      title="Responsive product grid"
      desc={<>Frameworks like Bootstrap use <code>min-width</code> queries to shift from 1 column on mobile, to 2 on tablets, to 3+ on desktops. Same HTML — different layouts.</>}
      controls={<SizeButtons size={size} setSize={setSize} />}
      frameWidth={SIZE_PX[size]}
      code={code}
    >
      <div className="mock-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {items.map((item, i) => (
          <div className="mock-card" key={i}>
            <div className="mock-card-img"></div>
            <div className="mock-card-title">{item.title}</div>
            <div className="mock-card-price">{item.price}</div>
          </div>
        ))}
      </div>
    </DemoShell>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   4. VIDEO PLAYER ORIENTATION (Section 4 — Orientation)
   ══════════════════════════════════════════════════════════════════════ */

export function VideoOrientationDemo() {
  const [orient, setOrient] = useState<Orient>("portrait");
  const isLandscape = orient === "landscape";

  const code = (
    <>
      <span className="cmt">{`/* Video grows to fill the screen on landscape */`}</span>
      {"\n"}
      <span className="sel">.video-player</span>{" { "}<span className="prop">height</span>{": "}<span className="val">200px</span>{"; }"}
      {"\n\n"}
      <span className="kw">@media</span>{" ("}<span className="prop">orientation</span>{": "}<span className="val">landscape</span>{") {"}
      {"\n  "}
      <span className="sel">.video-player</span>{" { "}<span className="prop">height</span>{": "}<span className="val">100vh</span>{"; "}<span className="prop">width</span>{": "}<span className="val">100vw</span>{"; }"}
      {"\n}"}
    </>
  );

  return (
    <DemoShell
      label="In real projects"
      title="Video player full-screen on rotate"
      desc={<>YouTube and similar players use <code>orientation: landscape</code> to fill the screen the moment you turn your phone sideways. Toggle below to see the effect.</>}
      controls={
        <>
          <span className="rw-controls-label">DEVICE:</span>
          <button className={`rw-size-btn ${orient === "portrait" ? "active" : ""}`} onClick={() => setOrient("portrait")}>📱 Portrait</button>
          <button className={`rw-size-btn ${orient === "landscape" ? "active" : ""}`} onClick={() => setOrient("landscape")}>📲 Landscape</button>
        </>
      }
      frameWidth={isLandscape ? 640 : 360}
      code={code}
    >
      <div className="mock-nav">
        <span className="mock-logo">▶ VidApp</span>
        <span style={{ fontSize: 12, color: "#999" }}>⚙</span>
      </div>
      <div className={`mock-video ${isLandscape ? "fullscreen" : ""}`} style={{ height: isLandscape ? 220 : 140 }}>
      </div>
      {!isLandscape && (
        <div className="mock-body">
          <h3>How Media Queries Work</h3>
          <div>Watch this 4-minute introduction to responsive design.</div>
        </div>
      )}
    </DemoShell>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   5. DASHBOARD SIDEBAR (Section 5 — AND)
   ══════════════════════════════════════════════════════════════════════ */

export function DashboardSidebarDemo() {
  const [size, setSize] = useState<Size>("desktop");
  const [orient, setOrient] = useState<Orient>("landscape");
  // Sidebar shows only when ≥ 600px AND landscape
  const showSidebar = SIZE_PX[size] >= 600 && orient === "landscape";

  const code = (
    <>
      <span className="cmt">{`/* Sidebar appears only on big landscape screens */`}</span>
      {"\n"}
      <span className="sel">.sidebar</span>{" { "}<span className="prop">display</span>{": "}<span className="val">none</span>{"; }"}
      {"\n\n"}
      <span className="kw">@media</span>{" ("}<span className="prop">min-width</span>{": "}<span className="val">600px</span>{") "}<span className="kw">and</span>{" ("}<span className="prop">orientation</span>{": "}<span className="val">landscape</span>{") {"}
      {"\n  "}
      <span className="sel">.sidebar</span>{" { "}<span className="prop">display</span>{": "}<span className="val">block</span>{"; "}<span className="prop">width</span>{": "}<span className="val">200px</span>{"; }"}
      {"\n}"}
    </>
  );

  return (
    <DemoShell
      label="In real projects"
      title="Dashboard sidebar (AND operator)"
      desc={<>A common dashboard pattern: the sidebar only shows when the screen is large enough <strong>AND</strong> held in landscape. Both conditions must be true.</>}
      controls={
        <>
          <span className="rw-controls-label">SIZE:</span>
          {(["mobile", "tablet", "desktop"] as const).map((s) => (
            <button key={s} className={`rw-size-btn ${size === s ? "active" : ""}`} onClick={() => setSize(s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
          <span className="rw-controls-label" style={{ marginLeft: 10 }}>ORIENT:</span>
          <button className={`rw-size-btn ${orient === "portrait" ? "active" : ""}`} onClick={() => setOrient("portrait")}>Portrait</button>
          <button className={`rw-size-btn ${orient === "landscape" ? "active" : ""}`} onClick={() => setOrient("landscape")}>Landscape</button>
        </>
      }
      frameWidth={SIZE_PX[size]}
      code={code}
    >
      <div className="mock-sidebar-layout" style={{ gridTemplateColumns: showSidebar ? "150px 1fr" : "1fr" }}>
        {showSidebar && (
          <div className="mock-sidebar">
            <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 12.5 }}>Menu</div>
            <div className="mock-sidebar-item active">📊 Dashboard</div>
            <div className="mock-sidebar-item">📁 Projects</div>
            <div className="mock-sidebar-item">👥 Team</div>
            <div className="mock-sidebar-item">⚙ Settings</div>
          </div>
        )}
        <div className="mock-main">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Dashboard</h3>
          <div style={{ fontSize: 11.5, color: "#666", marginBottom: 10 }}>Welcome back. Here's your overview.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ background: "#f1f5f9", padding: 10, borderRadius: 6 }}>
              <div style={{ fontSize: 10.5, color: "#64748b", fontWeight: 600 }}>USERS</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>1,284</div>
            </div>
            <div style={{ background: "#f1f5f9", padding: 10, borderRadius: 6 }}>
              <div style={{ fontSize: 10.5, color: "#64748b", fontWeight: 600 }}>REVENUE</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>$48k</div>
            </div>
          </div>
          {!showSidebar && (
            <div style={{ marginTop: 12, fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>
              {orient !== "landscape" ? "↳ Rotate to landscape" : "↳ Use a bigger screen"} to reveal the sidebar.
            </div>
          )}
        </div>
      </div>
    </DemoShell>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   6. COMPACT NAV (Section 5 — comma / OR)
   ══════════════════════════════════════════════════════════════════════ */

export function CompactNavDemo() {
  const [size, setSize] = useState<Size>("desktop");
  const [orient, setOrient] = useState<Orient>("landscape");
  // Compact mode if small width OR portrait
  const compact = SIZE_PX[size] < 600 || orient === "portrait";

  const code = (
    <>
      <span className="cmt">{`/* Compact nav on small screens OR portrait tablets */`}</span>
      {"\n"}
      <span className="sel">.nav</span>{" { "}<span className="prop">padding</span>{": "}<span className="val">16px 24px</span>{"; "}<span className="prop">font-size</span>{": "}<span className="val">15px</span>{"; }"}
      {"\n\n"}
      <span className="kw">@media</span>{" ("}<span className="prop">max-width</span>{": "}<span className="val">600px</span>{"), ("}<span className="prop">orientation</span>{": "}<span className="val">portrait</span>{") {"}
      {"\n  "}
      <span className="sel">.nav</span>{" { "}<span className="prop">padding</span>{": "}<span className="val">8px 12px</span>{"; "}<span className="prop">font-size</span>{": "}<span className="val">13px</span>{"; }"}
      {"\n}"}
    </>
  );

  return (
    <DemoShell
      label="In real projects"
      title="Compact nav (comma / OR operator)"
      desc={<>The nav becomes compact whenever the screen is narrow <strong>OR</strong> the device is in portrait. Either condition triggers it — that's what the comma means.</>}
      controls={
        <>
          <span className="rw-controls-label">SIZE:</span>
          {(["mobile", "tablet", "desktop"] as const).map((s) => (
            <button key={s} className={`rw-size-btn ${size === s ? "active" : ""}`} onClick={() => setSize(s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
          <span className="rw-controls-label" style={{ marginLeft: 10 }}>ORIENT:</span>
          <button className={`rw-size-btn ${orient === "portrait" ? "active" : ""}`} onClick={() => setOrient("portrait")}>Portrait</button>
          <button className={`rw-size-btn ${orient === "landscape" ? "active" : ""}`} onClick={() => setOrient("landscape")}>Landscape</button>
        </>
      }
      frameWidth={SIZE_PX[size]}
      code={code}
    >
      <div className="mock-nav" style={{ padding: compact ? "8px 12px" : "16px 24px", fontSize: compact ? 13 : 15 }}>
        <span className="mock-logo" style={{ fontSize: compact ? 13 : 15 }}>Acme</span>
        <ul className="mock-menu" style={{ gap: compact ? 10 : 22 }}>
          <li style={{ fontSize: compact ? 11.5 : 13 }}>Home</li>
          <li style={{ fontSize: compact ? 11.5 : 13 }}>Products</li>
          <li style={{ fontSize: compact ? 11.5 : 13 }}>About</li>
          <li style={{ fontSize: compact ? 11.5 : 13 }}>Contact</li>
        </ul>
      </div>
      <div className="mock-body">
        <div style={{ display: "inline-block", padding: "4px 10px", borderRadius: 100, fontSize: 11, fontWeight: 600, background: compact ? "var(--warm-soft)" : "var(--green-bg)", color: compact ? "var(--warm)" : "var(--green)" }}>
          {compact ? "Compact mode active" : "Standard mode"}
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
          The matching condition: {orient === "portrait" ? "portrait" : `width ${SIZE_PX[size]}px`}.
        </div>
      </div>
    </DemoShell>
  );
}
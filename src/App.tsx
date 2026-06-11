import { useState, useEffect, useRef } from "react";
import "./Styles.css";
import type { Theme, QuizScore } from "./types";
import ThemeToggle from "./components/ThemeToggle";
import SectionCarousel from "./components/SectionCarousel";
import type { CarouselSlide } from "./components/SectionCarousel";
import CodePlayground from "./components/CodePlayground";
import TopicQuiz from "./components/TopicQuiz";
import { SectionHeader, ContinueBreaker, CourseComplete } from "./components/Sections";
import {
  FilterScene, VaultScene, FlipScene, TicketsScene,
  DeviceFilterDemo, VaultDemo, NotDemo, TicketsDemo,
  AnalogyBlock, OrientationVisual,
} from "./components/Analogies";
import {
  HamburgerNavDemo, PrintStylesDemo, ResponsiveGridDemo,
  VideoOrientationDemo, DashboardSidebarDemo, CompactNavDemo,
} from "./components/RealWorldDemos";

/* ══════════════════════════════════════════════════════════════════════
   MAIN APP — orchestrates the 5 sections with theme + score tracking
   ══════════════════════════════════════════════════════════════════════ */

function App() {
  /* Theme state — persists to localStorage; falls back to OS preference */
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    const saved = window.localStorage.getItem("mq-theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });
  useEffect(() => {
    try { window.localStorage.setItem("mq-theme", theme); } catch { /* ignore */ }
  }, [theme]);

  /* Section flow state */
  const [unlocked, setUnlocked] = useState<number>(0);
  const [carouselDone, setCarouselDone] = useState<Record<string, boolean>>({});
  const [quizDone, setQuizDone] = useState<Record<string, boolean>>({});
  const [scores, setScores] = useState<Record<string, QuizScore>>({});
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const completeCarousel = (key: string) => setCarouselDone((p) => ({ ...p, [key]: true }));
  const completeQuiz = (key: string, score: QuizScore) => {
    setScores((p) => ({ ...p, [key]: score }));
    setQuizDone((p) => ({ ...p, [key]: true }));
  };
  const advanceSection = (toIdx: number, toId: string) => {
    setUnlocked((u) => Math.max(u, toIdx));
    window.setTimeout(() => {
      sectionRefs.current[toId]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  const completedCount = ["s1", "s2", "s3", "s4", "s5"].filter((k) => quizDone[k]).length;
  const progressPct = Math.round((completedCount / 5) * 100);

  /* ── Section 1 slides ──────────────────────────────────── */
  const section1Slides: CarouselSlide[] = [
    {
      label: "Core idea — what it does",
      body: (
        <div>
          <h4>What it does</h4>
          <p>A <strong>media query</strong> tells the browser: "only apply these styles when the device matches certain conditions" — like viewport width, screen orientation, or output medium (screen vs print).</p>
          <p>This single feature is the foundation of <strong>responsive design</strong>. Without it, every device would see the exact same layout.</p>
        </div>
      ),
    },
    {
      label: "The basic syntax",
      body: (
        <div>
          <h4>The basic syntax</h4>
          <p>Every media query starts with <code>@media</code>, followed by conditions, then a CSS block in curly braces:</p>
          <div className="syntax-box">
            <span className="kw">@media</span> <span className="val">screen</span> <span className="kw">and</span> (<span className="prop">max-width</span>: <span className="val">600px</span>) {"{"}
            {"\n  "}<span className="sel">body</span> {"{"} <span className="prop">background</span>: <span className="val">lightblue</span>; {"}"}
            {"\n"}{"}"}
          </div>
          <p>Read it aloud: "On a <em>screen</em> that's at most 600px wide, make the body background light blue."</p>
        </div>
      ),
    },
    {
      label: "Analogy — a filter at the door",
      body: (
        <AnalogyBlock illustration={<FilterScene />} tagline={<>Think of <code>@media</code> as a <strong>filter at the door</strong>. Every device walks up; only the ones matching your condition get the CSS inside.</>}>
          <DeviceFilterDemo />
        </AnalogyBlock>
      ),
    },
    {
      label: "In real projects — responsive nav",
      body: <HamburgerNavDemo />,
    },
  ];

  /* ── Section 2 slides ──────────────────────────────────── */
  const section2Slides: CarouselSlide[] = [
    {
      label: "Four media types",
      body: (
        <div>
          <h4>What is a media type?</h4>
          <p>The <strong>media type</strong> is the category of device. CSS recognizes four:</p>
          <ul className="bullets">
            <li><code>screen</code> — phones, tablets, laptops, desktops (anything with a display)</li>
            <li><code>print</code> — printers, and the browser's print preview</li>
            <li><code>tv</code> — televisions with low resolution and limited scrolling</li>
            <li><code>all</code> — every device (this is the default)</li>
          </ul>
          <div className="note"><strong>Default:</strong> if you omit the type, <code>all</code> is assumed, so the query applies everywhere.</div>
        </div>
      ),
    },
    {
      label: "Targeting a single type",
      body: (
        <div>
          <h4>Targeting a single type</h4>
          <p>Place the type right after <code>@media</code>:</p>
          <div className="syntax-box">
            <span className="kw">@media</span> <span className="val">print</span> {"{"}
            {"\n  "}<span className="sel">.ads</span> {"{"} <span className="prop">display</span>: <span className="val">none</span>; {"}"}
            {"\n"}{"}"}
          </div>
          <p>This hides ads when the page is printed.</p>
        </div>
      ),
    },
    {
      label: "Try it yourself",
      body: (
        <div>
          <h4>Try it yourself</h4>
          <p>The heading is blue on screen, but green when printed. Click <strong>Run Code</strong>. Then change <code>print</code> to <code>screen</code> and run again.</p>
          <CodePlayground
            initialHtml={`<h1 class="heading">New Delhi</h1>
<p>
  New Delhi is the capital of India.
  It hosts the Rashtrapati Bhavan,
  Parliament House, and the Supreme Court.
</p>`}
            initialCss={`.heading { color: blue; }

@media print {
  .heading { color: green; }
}`}
          />
          <div className="note">Use your browser's <strong>Print Preview</strong> (Ctrl/Cmd+P) on the popped-out preview to see the print version.</div>
        </div>
      ),
    },
    {
      label: "In real projects — print styles",
      body: <PrintStylesDemo />,
    },
  ];

  /* ── Section 3 slides ──────────────────────────────────── */
  const section3Slides: CarouselSlide[] = [
    {
      label: "Three width features",
      body: (
        <div>
          <h4>Three width features</h4>
          <p>Width-based features let you write CSS that fires only when the viewport is a certain size:</p>
          <ul className="bullets">
            <li><code>width</code> — exact viewport width (rarely used)</li>
            <li><code>min-width: N</code> — fires when viewport is N or wider (good for "desktop and up")</li>
            <li><code>max-width: N</code> — fires when viewport is N or narrower (good for "tablet and below")</li>
          </ul>
        </div>
      ),
    },
    {
      label: "Examples",
      body: (
        <div>
          <h4>Examples</h4>
          <div className="syntax-box">
            <span className="cmt">{`/* Background changes only on narrow screens */`}</span>{"\n"}
            <span className="kw">@media</span> (<span className="prop">max-width</span>: <span className="val">600px</span>) {"{"}
            {"\n  "}<span className="sel">body</span> {"{"} <span className="prop">background</span>: <span className="val">tomato</span>; {"}"}
            {"\n"}{"}"}{"\n\n"}
            <span className="cmt">{`/* And on wider screens, a different color */`}</span>{"\n"}
            <span className="kw">@media</span> (<span className="prop">min-width</span>: <span className="val">900px</span>) {"{"}
            {"\n  "}<span className="sel">body</span> {"{"} <span className="prop">background</span>: <span className="val">skyblue</span>; {"}"}
            {"\n"}{"}"}
          </div>
        </div>
      ),
    },
    {
      label: "Try it — resize the preview",
      body: (
        <div>
          <h4>Try it</h4>
          <p>Open the playground's settings (the gear icon) and switch between <strong>Mobile</strong>, <strong>Tablet</strong>, and <strong>Desktop</strong> — the background should change.</p>
          <CodePlayground
            initialHtml={`<div class="card">
  <h2>Resize me</h2>
  <p>Change the display size in settings to see the background swap.</p>
</div>`}
            initialCss={`body { margin: 0; padding: 20px; font-family: sans-serif; }
.card { background: white; padding: 20px; border-radius: 8px; }

@media (max-width: 600px) {
  body { background: tomato; }
}

@media (min-width: 900px) {
  body { background: skyblue; }
}`}
          />
        </div>
      ),
    },
    {
      label: "In real projects — responsive grid",
      body: <ResponsiveGridDemo />,
    },
  ];

  /* ── Section 4 slides ──────────────────────────────────── */
  const section4Slides: CarouselSlide[] = [
    {
      label: "Portrait vs landscape",
      body: (
        <div>
          <h4>Two orientations</h4>
          <p>The <code>orientation</code> media feature has two values:</p>
          <ul className="bullets">
            <li><code>portrait</code> — height is greater than width (tall, like a phone held upright)</li>
            <li><code>landscape</code> — width is greater than height (wide, like a phone on its side or most laptops)</li>
          </ul>
        </div>
      ),
    },
    {
      label: "Visual — rotate the device",
      body: <OrientationVisual />,
    },
    {
      label: "Try it — orientation styles",
      body: (
        <div>
          <h4>The syntax</h4>
          <p>Place it inside parentheses, like other media features:</p>
          <CodePlayground
            initialHtml={`<div class="card">
  <h2>Rotate me</h2>
  <p>Open in full screen and rotate your device — or resize the preview to switch orientations.</p>
</div>`}
            initialCss={`body { margin: 0; padding: 20px; font-family: sans-serif; background: #f1f5f9; }
.card { background: white; padding: 20px; border-radius: 8px; }

@media (orientation: portrait) {
  body { background: #fde68a; }
}

@media (orientation: landscape) {
  body { background: #bae6fd; }
}`}
          />
        </div>
      ),
    },
    {
      label: "In real projects — video player",
      body: <VideoOrientationDemo />,
    },
  ];

  /* ── Section 5 slides — one per operator ───────────────── */
  const section5Slides: CarouselSlide[] = [
    {
      label: "AND operator — both must match",
      body: (
        <div>
          <h4>The AND operator</h4>
          <p>The <code>and</code> keyword joins two requirements. Both have to be true for the block to fire.</p>
          <div className="syntax-box">
            <span className="kw">@media</span> <span className="val">screen</span> <span className="kw">and</span> (<span className="prop">min-width</span>: <span className="val">600px</span>) <span className="kw">and</span> (<span className="prop">orientation</span>: <span className="val">landscape</span>) {"{"}
            {"\n  "}<span className="cmt">{`/* fires only on screens at least 600px wide AND in landscape */`}</span>
            {"\n"}{"}"}
          </div>
          <div className="note"><strong>Important:</strong> when using <code>and</code>, you must specify a single media type (like <code>screen</code>) at the start.</div>
          <AnalogyBlock illustration={<VaultScene />} tagline={<>Like a <strong>two-factor vault</strong>: you need BOTH the key AND the fingerprint. Either alone won't open it.</>}>
            <VaultDemo />
          </AnalogyBlock>
          <DashboardSidebarDemo />
        </div>
      ),
    },
    {
      label: "NOT operator — flips the meaning",
      body: (
        <div>
          <h4>The NOT operator</h4>
          <p>The <code>not</code> keyword negates the whole media query. If the conditions match, the block does NOT apply, and vice versa.</p>
          <div className="syntax-compare">
            <div className="sc-card wrong"><div className="sc-head">✗ Invalid</div><pre>{`@media not (min-width: 600px) {
  /* missing media type */
}`}</pre></div>
            <div className="sc-card right"><div className="sc-head">✓ Valid</div><pre>{`@media not screen and (min-width: 600px) {
  /* fires on everything EXCEPT screens ≥ 600px */
}`}</pre></div>
          </div>
          <div className="note"><strong>Rule:</strong> <code>not</code> always requires a media type after it.</div>
          <AnalogyBlock illustration={<FlipScene />} tagline={<>A <strong>flip-switch</strong>: <code>not</code> takes whatever the result would be and reverses it.</>}>
            <NotDemo />
          </AnalogyBlock>
        </div>
      ),
    },
    {
      label: "Comma (OR) — any match works",
      body: (
        <div>
          <h4>The comma (OR)</h4>
          <p>A comma between queries means <strong>OR</strong>. If <em>any</em> of the comma-separated queries matches, the block fires.</p>
          <div className="syntax-box">
            <span className="kw">@media</span> (<span className="prop">max-width</span>: <span className="val">600px</span>), (<span className="prop">orientation</span>: <span className="val">portrait</span>) {"{"}
            {"\n  "}<span className="cmt">{`/* fires if narrow OR if portrait — either one is enough */`}</span>
            {"\n"}{"}"}
          </div>
          <AnalogyBlock illustration={<TicketsScene />} tagline={<>Like a <strong>discount eligible to seniors or students</strong>: either qualifier alone gets you in.</>}>
            <TicketsDemo />
          </AnalogyBlock>
          <CompactNavDemo />
        </div>
      ),
    },
  ];

  const sectionScores = [
    { id: "s1", num: "01", name: "Media Query", sectionClass: "sec-1", score: scores.s1 || { correct: 0, total: 0 } },
    { id: "s2", num: "02", name: "Media Types", sectionClass: "sec-2", score: scores.s2 || { correct: 0, total: 0 } },
    { id: "s3", num: "03", name: "Width Features", sectionClass: "sec-3", score: scores.s3 || { correct: 0, total: 0 } },
    { id: "s4", num: "04", name: "Orientation", sectionClass: "sec-4", score: scores.s4 || { correct: 0, total: 0 } },
    { id: "s5", num: "05", name: "Operators", sectionClass: "sec-5", score: scores.s5 || { correct: 0, total: 0 } },
  ];

  return (
    <div className={`mq-root theme-${theme}`}>
      <div className="mq-progress">
        <div className="mq-progress-logo">CSS Media Queries <span>· interactive lesson</span></div>
        <div className="mq-progress-bar"><div className="mq-progress-fill" style={{ width: `${progressPct}%` }} /></div>
        <div className="mq-progress-num">{progressPct}%</div>
        <ThemeToggle theme={theme} onToggle={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} />
      </div>

      <div className="hero">
        <div className="hero-orbs"><span className="hero-orb" /><span className="hero-orb" /><span className="hero-orb" /></div>
        <div className="hero-tag">Web · CSS · Responsive</div>
        <h1>Build layouts that <span className="gradient">adapt to any device</span></h1>
        <p className="lede">Learn the CSS feature that powers every responsive website — through guided concepts, live playgrounds, and real-world UI you can interact with.</p>
      </div>

      <div className="page">
        {/* SECTION 01 */}
        <div ref={(el) => { sectionRefs.current["s1"] = el; }}>
          <SectionHeader number="01" title="What is a Media Query?" subtitle="Apply CSS rules conditionally — based on the device viewing your page." sectionClass="sec-1" />
          <div className="sec-1">
            <SectionCarousel slides={section1Slides} sectionLabel="§01" onComplete={() => completeCarousel("s1")} completed={!!carouselDone["s1"]} />
          </div>
          {carouselDone["s1"] && !quizDone["s1"] && <TopicQuiz topicKey="topic1" sectionLabel="Section 01 · Media Query" onComplete={(s) => completeQuiz("s1", s)} />}
          {quizDone["s1"] && unlocked < 1 && <ContinueBreaker fromNum="01" fromTitle="Media Query" toNum="02" toTitle="Types of Media" onContinue={() => advanceSection(1, "s2")} />}
        </div>

        {/* SECTION 02 */}
        {unlocked >= 1 && (
          <div ref={(el) => { sectionRefs.current["s2"] = el; }}>
            <SectionHeader number="02" title="Types of Media" subtitle="Target screens, printers, TVs — or all devices at once." sectionClass="sec-2" />
            <div className="sec-2">
              <SectionCarousel slides={section2Slides} sectionLabel="§02" onComplete={() => completeCarousel("s2")} completed={!!carouselDone["s2"]} />
            </div>
            {carouselDone["s2"] && !quizDone["s2"] && <TopicQuiz topicKey="topic2" sectionLabel="Section 02 · Media Types" onComplete={(s) => completeQuiz("s2", s)} />}
            {quizDone["s2"] && unlocked < 2 && <ContinueBreaker fromNum="02" fromTitle="Types of Media" toNum="03" toTitle="Width Features" onContinue={() => advanceSection(2, "s3")} />}
          </div>
        )}

        {/* SECTION 03 */}
        {unlocked >= 2 && (
          <div ref={(el) => { sectionRefs.current["s3"] = el; }}>
            <SectionHeader number="03" title="Width Features" subtitle="The most-used conditions in responsive design: min-width and max-width." sectionClass="sec-3" />
            <div className="sec-3">
              <SectionCarousel slides={section3Slides} sectionLabel="§03" onComplete={() => completeCarousel("s3")} completed={!!carouselDone["s3"]} />
            </div>
            {carouselDone["s3"] && !quizDone["s3"] && <TopicQuiz topicKey="topic3" sectionLabel="Section 03 · Width Features" onComplete={(s) => completeQuiz("s3", s)} />}
            {quizDone["s3"] && unlocked < 3 && <ContinueBreaker fromNum="03" fromTitle="Width Features" toNum="04" toTitle="Orientation" onContinue={() => advanceSection(3, "s4")} />}
          </div>
        )}

        {/* SECTION 04 */}
        {unlocked >= 3 && (
          <div ref={(el) => { sectionRefs.current["s4"] = el; }}>
            <SectionHeader number="04" title="Orientation" subtitle="Detect whether the device is held tall or wide." sectionClass="sec-4" />
            <div className="sec-4">
              <SectionCarousel slides={section4Slides} sectionLabel="§04" onComplete={() => completeCarousel("s4")} completed={!!carouselDone["s4"]} />
            </div>
            {carouselDone["s4"] && !quizDone["s4"] && <TopicQuiz topicKey="topic4" sectionLabel="Section 04 · Orientation" onComplete={(s) => completeQuiz("s4", s)} />}
            {quizDone["s4"] && unlocked < 4 && <ContinueBreaker fromNum="04" fromTitle="Orientation" toNum="05" toTitle="Operators — AND, NOT, OR" onContinue={() => advanceSection(4, "s5")} />}
          </div>
        )}

        {/* SECTION 05 */}
        {unlocked >= 4 && (
          <div ref={(el) => { sectionRefs.current["s5"] = el; }}>
            <SectionHeader number="05" title="Operators" subtitle="Combine multiple conditions: AND (and), OR (comma), NOT." sectionClass="sec-5" />
            <div className="sec-5">
              <SectionCarousel slides={section5Slides} sectionLabel="§05" onComplete={() => completeCarousel("s5")} completed={!!carouselDone["s5"]} />
            </div>
            {carouselDone["s5"] && !quizDone["s5"] && <TopicQuiz topicKey="topic5" sectionLabel="Section 05 · Operators" onComplete={(s) => completeQuiz("s5", s)} />}
            {quizDone["s5"] && <CourseComplete sectionScores={sectionScores} />}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
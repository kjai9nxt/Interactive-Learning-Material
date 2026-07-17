/* Standalone HTML export for a generated lesson.
   Turns a ConceptUnitsFile into ONE self-contained .html document the user can
   open in any browser or host anywhere — no React app, no server. Styling is
   inlined and images are embedded as data URLs (fetched at export time).

   Goal: the downloaded file looks and behaves like the in-app reading material.
   The CSS below is ported from src/Styles.css + src/ilm/ilm.css (dark theme) and
   the markup/JS mirror Lesson.tsx / ConceptUnitView.tsx / DataQuiz.tsx /
   CodePlayground.tsx:
     • Gated sections — a unit's mini-quiz must be attempted before the next
       unlocks (locked preview → continue breaker → next section), then a
       course-complete score card at the end.
     • One-question-at-a-time mini-quiz with progress bar, aspect/difficulty
       badges, reveal + explanation, confetti on correct, and a Next button.
     • Tabbed HTML/CSS/JS code playground with a live iframe preview + console.
     • Non-web code (Python/Java/…) is shown as a read-only block, since running
       it needs the backend server which a static file doesn't have.

   Additive: does not touch the JSON export or the in-app renderer. */

import type { ConceptUnitsFile, ConceptUnit, Scenario, MCQ, CodePlayground } from "./types";

const WEB_LANGS = new Set(["html", "css", "js", "javascript", "web"]);
const SECTION_CLASSES = ["sec-1", "sec-2", "sec-3", "sec-4", "sec-5"];
const sectionClassFor = (i: number) => SECTION_CLASSES[i % SECTION_CLASSES.length];
const pad = (n: number) => String(n + 1).padStart(2, "0");

// Mirror DataQuiz's ASPECT_BADGE map so the badge colors match the live quiz.
const ASPECT_BADGE: Record<string, string> = {
  recall: "badge-recall",
  understanding: "badge-understanding",
  application: "badge-application",
  analysis: "badge-analysis",
};

// Escape for text nodes / textarea content.
function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
// Escape for use inside a double-quoted HTML attribute.
function escAttr(s: string): string {
  return esc(s).replace(/"/g, "&quot;");
}
// Light inline markdown: `code` spans → <code>. Applied AFTER escaping so the
// source text can't inject markup.
function inlineText(s: string): string {
  return esc(s).replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`);
}

// Collect every image reference so we can inline them all in one pass.
function collectImageSrcs(data: ConceptUnitsFile): string[] {
  const out = new Set<string>();
  for (const u of data.units || []) {
    if (u.explanation?.visual_image) out.add(u.explanation.visual_image);
    if (u.analogy?.visual_image) out.add(u.analogy.visual_image);
    for (const s of u.scenarios || []) if (s.visual_image) out.add(s.visual_image);
  }
  return [...out];
}

// Resolve a possibly root-relative src ("/ilm-images/…") to an absolute URL
// against the current page, so the fetch targets the right origin and a fallback
// URL still works when the exported file is opened elsewhere.
function absUrl(src: string): string {
  try {
    return typeof location !== "undefined" && location.href ? new URL(src, location.href).href : src;
  } catch {
    return src;
  }
}

async function toDataUrl(src: string): Promise<string | null> {
  try {
    const res = await fetch(absUrl(src));
    if (!res.ok) return null;
    const blob = await res.blob();
    // A dev server can answer a MISSING asset with its SPA fallback (index.html,
    // HTTP 200). That's not an image — don't embed HTML markup as a picture.
    if (blob.type && !blob.type.startsWith("image/")) return null;
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export interface InlineResult {
  map: Record<string, string>;
  failed: string[];
}

// Inline every image as a data URL. A src that can't be fetched falls back to its
// ABSOLUTE url (so it still loads while the app is running) instead of a
// root-relative path (which breaks in a standalone file), and is reported in
// `failed` so the caller can warn the user rather than shipping silent gaps.
async function inlineImages(data: ConceptUnitsFile): Promise<InlineResult> {
  const srcs = collectImageSrcs(data);
  const map: Record<string, string> = {};
  const failed: string[] = [];
  await Promise.all(
    srcs.map(async (src) => {
      const dataUrl = await toDataUrl(src);
      if (dataUrl) {
        map[src] = dataUrl;
      } else {
        map[src] = absUrl(src);
        failed.push(src);
      }
    }),
  );
  return { map, failed };
}

function visualHtml(src: string | undefined, images: Record<string, string>, label: string): string {
  if (!src || !src.trim()) return "";
  const resolved = images[src] || src;
  return `<figure class="ilm-visual"><img class="ilm-visual-img" src="${escAttr(resolved)}" alt="${escAttr(label)}" loading="lazy"></figure>`;
}

// ── Code playground ────────────────────────────────────────────────────────
// Web code → tabbed editor + live iframe preview + console (mirrors CodePlayground).
// Non-web code → read-only block (can't run without the backend).
function playgroundHtml(cp: CodePlayground): string {
  const lang = (cp.language || "").trim().toLowerCase();
  const isWeb = WEB_LANGS.has(lang) || (!lang && (!!cp.html || !!cp.css) && !cp.code);

  if (isWeb) {
    const html = cp.html || (lang === "html" ? cp.code || "" : "");
    const css = cp.css || (lang === "css" ? cp.code || "" : "");
    const js = cp.js || (lang === "js" || lang === "javascript" ? cp.code || "" : "");
    const hasJs = !!js.trim();
    // Initial code is stashed in data-* attrs (attribute-escaped); the embedded
    // script hydrates each playground's editor state from them.
    return (
      `<div class="pg" data-html="${escAttr(html)}" data-css="${escAttr(css)}" data-js="${escAttr(js)}" data-start="${hasJs ? "js" : "css"}">` +
        `<div class="pg-top">` +
          `<div class="pg-tabs">` +
            `<button class="pg-tab" type="button" data-tab="html"><span class="pg-tab-icon icon-html">5</span><span>HTML</span></button>` +
            `<button class="pg-tab" type="button" data-tab="css"><span class="pg-tab-icon icon-css">3</span><span>CSS</span></button>` +
            `<button class="pg-tab" type="button" data-tab="js"><span class="pg-tab-icon icon-js">JS</span><span>JS</span></button>` +
          `</div>` +
          `<div class="pg-tools">` +
            `<button class="pg-tool pg-reset" type="button" title="Reset">&#8635;</button>` +
            `<button class="pg-tool pg-newtab" type="button" title="Open in new tab">&#8599;</button>` +
          `</div>` +
        `</div>` +
        `<div class="pg-body">` +
          `<div class="pg-editor-wrap"><textarea class="pg-editor" spellcheck="false" wrap="off"></textarea></div>` +
          `<div class="pg-preview-area">` +
            `<div class="pg-preview-size">Preview: Full width</div>` +
            `<div class="pg-preview-wrapper"><div class="pg-preview-frame">` +
              `<div class="pg-preview-empty"><div class="pg-preview-empty-icon">&#9654;</div><div class="pg-preview-empty-text">Click <strong>Run Code</strong> to see the output</div></div>` +
            `</div></div>` +
            `<div class="pg-console" hidden>` +
              `<div class="pg-console-bar"><span class="pg-console-title">Console</span><button class="pg-console-clear" type="button">Clear</button></div>` +
              `<div class="pg-console-body"></div>` +
            `</div>` +
          `</div>` +
        `</div>` +
        `<div class="pg-foot"><button class="pg-run" type="button"><span class="pg-run-icon">&#9654;</span> Run Code</button></div>` +
      `</div>`
    );
  }

  // Non-web code can't run in a static file — read-only labelled block styled
  // like the in-app CodeRunner shell.
  const code = cp.code || "";
  if (!code.trim()) return "";
  const label = (lang || "code").toUpperCase();
  return (
    `<div class="cr">` +
      `<div class="cr-top"><span class="cr-lang"><span class="cr-lang-icon">${esc(label.slice(0, 4))}</span>${esc(label)}</span></div>` +
      `<pre class="cr-editor">${esc(code)}</pre>` +
      `<div class="cr-foot"><span class="cr-hint">Run this in your own environment — a standalone file can't execute ${esc(lang || "this")} code.</span></div>` +
    `</div>`
  );
}

function scenarioHtml(s: Scenario, images: Record<string, string>): string {
  const parts = [`<p>${inlineText(s.text)}</p>`];
  parts.push(visualHtml(s.visual_image, images, "Scenario illustration"));
  if (s.code_playground) parts.push(playgroundHtml(s.code_playground));
  return parts.join("");
}

function quizHtml(questions: MCQ[], sectionLabel: string): string {
  if (!questions || questions.length === 0) return "";
  const cards = questions
    .map((q) => {
      const aspectCls = ASPECT_BADGE[q.aspect] || "";
      const opts = (q.options || [])
        .map(
          (o, i) =>
            `<div class="tq-option" data-i="${i}"><span class="tq-opt-letter">${String.fromCharCode(65 + i)}</span><span>${esc(o)}</span></div>`,
        )
        .join("");
      return (
        `<div class="tq-card" data-correct="${q.correct_index}" hidden>` +
          `<div class="tq-badges">` +
            `<span class="tq-badge ${aspectCls}">${esc(q.aspect)}</span>` +
            `<span class="tq-badge badge-diff-${esc(q.difficulty)}">${esc(q.difficulty)}</span>` +
          `</div>` +
          `<div class="tq-text">${inlineText(q.question)}</div>` +
          `<div class="tq-options">${opts}</div>` +
          `<div class="tq-explanation" hidden>${inlineText(q.explanation || "")}</div>` +
          `<div class="tq-actions" hidden><button class="tq-next" type="button"></button></div>` +
        `</div>`
      );
    })
    .join("");
  return (
    `<div class="topic-quiz" data-total="${questions.length}">` +
      `<div class="tq-head">` +
        `<div class="tq-icon">?</div>` +
        `<div><div class="tq-title">Check your understanding</div>` +
        `<div class="tq-sub">${escAttr(sectionLabel)} &middot; Question <span class="tq-cur">1</span> of ${questions.length}</div></div>` +
      `</div>` +
      `<div class="tq-progress-track"><div class="tq-progress-bar"></div></div>` +
      `<div class="tq-cards">${cards}</div>` +
      `<div class="tq-done" hidden><div class="tq-done-icon">&#10003;</div><div class="tq-done-title">Mini-quiz complete</div><div class="tq-done-score"></div></div>` +
    `</div>`
  );
}

function unitHtml(unit: ConceptUnit, index: number, total: number, images: Record<string, string>): string {
  const num = pad(index);
  const sc = sectionClassFor(index);
  const isLast = index === total - 1;
  const scenarios = unit.scenarios || [];
  const quizTotal = unit.mini_quiz?.questions?.length || 0;

  const scenarioSection =
    scenarios.length > 0
      ? `<section class="ilm-block"><div class="ilm-block-label">In practice</div><div class="ilm-scenarios">` +
        scenarios
          .map(
            (s, i) =>
              `<div class="ilm-scenario">${scenarios.length > 1 ? `<div class="ilm-scenario-num">${i + 1}</div>` : ""}<div class="ilm-scenario-body">${scenarioHtml(s, images)}</div></div>`,
          )
          .join("") +
        `</div></section>`
      : "";

  const secHeader =
    `<div class="sec-header ${sc}">` +
      `<div class="sec-meta"><span class="sec-num-badge">${num}</span><span class="sec-num">Section</span></div>` +
      `<h2 class="sec-title">${esc(unit.title)}</h2>` +
      (unit.summary ? `<p class="sec-sub">${esc(unit.summary)}</p>` : "") +
    `</div>`;

  const content =
    `<div class="${sc}"><div class="ilm-unit">` +
      `<section class="ilm-block"><div class="ilm-block-label">What it is</div><p class="ilm-explanation">${inlineText(unit.explanation.text)}</p>${visualHtml(unit.explanation.visual_image, images, unit.title + " diagram")}</section>` +
      `<section class="ilm-block ilm-analogy"><div class="ilm-block-label">Think of it like this</div><p class="ilm-analogy-text">${inlineText(unit.analogy.text)}</p>${visualHtml(unit.analogy.visual_image, images, unit.title + " analogy")}</section>` +
      scenarioSection +
    `</div></div>`;

  const quiz = quizHtml(unit.mini_quiz?.questions || [], `Section ${num} · ${unit.title}`);

  // Continue breaker (hidden until this unit's quiz is done); absent on the last unit.
  const nextNum = pad(index + 1);
  const continueBreaker = isLast
    ? ""
    : `<div class="cont-breaker" hidden>` +
        `<div class="cont-status"><span class="cont-check">&#10003;</span><span class="cont-status-text">Section ${num} complete &mdash; ${esc(unit.title)}</span></div>` +
        `<button class="cont-btn" type="button"><div class="cont-btn-inner"><div class="cont-btn-label">Continue to next section</div><div class="cont-btn-title"><span class="cont-btn-num">${nextNum}</span><span class="cont-btn-name" data-next-title></span></div></div><span class="cont-btn-arrow">&rarr;</span></button>` +
      `</div>`;

  // Locked preview for THIS unit (shown when it is the immediate next, still-locked
  // section). The full view is toggled by the gating script.
  const lockedPreview =
    `<div class="locked-preview" hidden>` +
      `<div class="locked-preview-row"><span class="locked-preview-lock">&#128274;</span>` +
      `<div class="locked-preview-meta"><span class="locked-preview-num">Section ${num}</span><span class="locked-preview-title">${esc(unit.title)}</span></div></div>` +
      `<p class="locked-preview-hint">Attempt the mini-quiz above, then continue to unlock this section.</p>` +
    `</div>`;

  return (
    `<section class="unit-wrap" data-index="${index}" data-num="${num}" data-title="${escAttr(unit.title)}" data-sec="${sc}" data-quiz-total="${quizTotal}">` +
      lockedPreview +
      `<div class="unit-full">${secHeader}${content}${quiz}${continueBreaker}</div>` +
    `</section>`
  );
}

const STYLE = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:var(--font);font-size:15.5px;line-height:1.65}
.mq-root{
  --font:'Inter',system-ui,-apple-system,sans-serif;
  --mono:'JetBrains Mono',Menlo,monospace;
  --code-bg:#050814;--code-bg2:#10162a;--code-text:#e8ecfb;
  --bg:#080b18;--surface:#10162a;--surface2:#1a2240;--surface3:#232b4e;
  --border:rgba(255,255,255,0.08);--border2:rgba(255,255,255,0.14);
  --text:#e8ecfb;--text2:#a8b3d1;--text3:#697294;
  --indigo:#818cf8;--indigo2:#6366f1;--indigo-soft:rgba(129,140,248,0.15);
  --cyan:#22d3ee;--cyan2:#67e8f9;--cyan-soft:rgba(34,211,238,0.12);
  --purple:#c084fc;--purple-soft:rgba(192,132,252,0.14);
  --amber:#fbbf24;--amber-soft:rgba(251,191,36,0.14);
  --emerald:#34d399;--emerald-soft:rgba(52,211,153,0.14);
  --pink:#f472b6;--pink-soft:rgba(244,114,182,0.13);
  --red:#f87171;--red-soft:rgba(248,113,113,0.14);
  --svg-text:#e8ecfb;
  background:var(--bg);color:var(--text);min-height:100vh;
}
@keyframes fadeup{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes slideup{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
@keyframes pop{0%{opacity:0;transform:scale(0.92)}60%{opacity:1;transform:scale(1.03)}100%{opacity:1;transform:scale(1)}}
@keyframes shimmer{0%{background-position:-200% 50%}100%{background-position:200% 50%}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes wiggle{0%,100%{transform:rotate(0)}25%{transform:rotate(-3deg)}75%{transform:rotate(3deg)}}
@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
@keyframes confetti{0%{transform:translate(0,0) rotate(0);opacity:1}100%{transform:translate(var(--cx),var(--cy)) rotate(720deg);opacity:0}}

/* Hero */
.hero{padding:4rem 2rem 3rem;text-align:center;position:relative;overflow:hidden;border-bottom:1px solid var(--border);background:radial-gradient(ellipse at top,#1a2240 0%,var(--bg) 65%)}
.hero-orbs{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.hero-orb{position:absolute;border-radius:50%;filter:blur(60px);opacity:.4;animation:float 7s ease-in-out infinite}
.hero-orb:nth-child(1){top:-20px;left:15%;width:180px;height:180px;background:var(--indigo);animation-delay:0s}
.hero-orb:nth-child(2){top:30%;right:12%;width:220px;height:220px;background:var(--purple);animation-delay:1.5s}
.hero-orb:nth-child(3){bottom:-40px;left:40%;width:200px;height:200px;background:var(--cyan);opacity:.25;animation-delay:3s}
.hero>*{position:relative;z-index:1}
.hero-tag{display:inline-flex;align-items:center;gap:8px;background:var(--indigo-soft);border:1px solid rgba(99,102,241,0.25);color:var(--indigo);font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;padding:6px 14px;border-radius:999px;margin-bottom:1.2rem}
.hero-tag::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--indigo);box-shadow:0 0 8px var(--indigo)}
.hero h1{font-size:clamp(2rem,5vw,3rem);line-height:1.12;margin-bottom:1rem;color:var(--text);letter-spacing:-0.025em;font-weight:700}
.hero h1 .gradient{background:linear-gradient(120deg,var(--indigo) 0%,var(--cyan) 50%,var(--purple) 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.hero p.lede{color:var(--text2);max-width:560px;margin:0 auto;font-size:1rem}

/* Page + section header */
.page{max-width:900px;margin:0 auto;padding:3rem 2rem 5rem;text-align:left}
.sec-header{margin:2.5rem 0 1.5rem;padding:1.5rem 1.75rem 1.75rem;background:linear-gradient(135deg,var(--surface) 0%,var(--surface2) 100%);border:1px solid var(--border);border-radius:14px;position:relative;overflow:hidden;animation:fadeup .5s ease}
.sec-header::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--accent-from,var(--indigo)),var(--accent-to,var(--cyan)))}
.unit-wrap:first-child .sec-header{margin-top:0}
.sec-meta{display:flex;align-items:center;gap:12px;margin-bottom:10px}
.sec-num-badge{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;background:var(--accent-soft,var(--indigo-soft));color:var(--accent-from,var(--indigo));font-family:var(--mono);font-size:12px;font-weight:700}
.sec-num{font-family:var(--mono);font-size:11px;font-weight:600;letter-spacing:.18em;color:var(--accent-from,var(--indigo));text-transform:uppercase}
.sec-title{font-size:1.7rem;font-weight:700;color:var(--text);line-height:1.18;letter-spacing:-0.025em;margin-bottom:6px}
.sec-sub{font-size:.94rem;color:var(--text2);max-width:600px}
.sec-1{--accent-from:var(--indigo);--accent-to:var(--cyan);--accent-soft:var(--indigo-soft)}
.sec-2{--accent-from:var(--purple);--accent-to:var(--pink);--accent-soft:var(--purple-soft)}
.sec-3{--accent-from:var(--cyan);--accent-to:var(--emerald);--accent-soft:var(--cyan-soft)}
.sec-4{--accent-from:var(--amber);--accent-to:var(--pink);--accent-soft:var(--amber-soft)}
.sec-5{--accent-from:var(--pink);--accent-to:var(--purple);--accent-soft:var(--pink-soft)}
.locked-preview{margin:1.75rem 0 1rem;padding:1.1rem 1.5rem 1.25rem;background:var(--surface);border:1px dashed var(--border2);border-radius:14px;opacity:.6}
.locked-preview-row{display:flex;align-items:center;gap:12px}
.locked-preview-lock{font-size:1.1rem;line-height:1;filter:grayscale(0.3)}
.locked-preview-meta{display:flex;flex-direction:column;gap:2px}
.locked-preview-num{font-family:var(--mono);font-size:11px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--text2)}
.locked-preview-title{font-size:1.05rem;font-weight:700;color:var(--text);line-height:1.2}
.locked-preview-hint{margin:8px 0 0 34px;font-size:.85rem;color:var(--text2)}

/* Unit content blocks */
.ilm-unit{display:flex;flex-direction:column;gap:22px;margin:8px 0 4px}
.ilm-block{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:22px 24px}
.ilm-block-label{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.6;margin-bottom:10px}
.ilm-explanation,.ilm-analogy-text{font-size:16px;line-height:1.7;margin:0}
.ilm-analogy{background:linear-gradient(135deg,rgba(79,70,229,0.10),rgba(147,51,234,0.06));border-color:rgba(129,140,248,0.35)}
.ilm-analogy-text{font-style:italic}
.ilm-visual{margin:16px 0 0;display:flex;justify-content:center}
.ilm-visual-img{width:auto;max-width:min(360px,100%);max-height:320px;height:auto;object-fit:contain;display:block;border:1px solid var(--border);border-radius:12px;background:rgba(255,255,255,0.04)}
.ilm-scenarios{display:flex;flex-direction:column;gap:14px}
.ilm-scenario{display:flex;gap:14px;align-items:flex-start}
.ilm-scenario-num{flex:0 0 auto;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-weight:700;font-size:13px;background:rgba(129,140,248,0.2);color:var(--text)}
.ilm-scenario-body{flex:1;min-width:0}
.ilm-scenario-body p{margin:2px 0 8px;line-height:1.6}
p code,.tq-explanation code{font-family:var(--mono);font-size:.9em;background:rgba(148,163,184,0.16);padding:1px 6px;border-radius:4px}

/* Topic quiz */
.topic-quiz{background:linear-gradient(135deg,var(--surface) 0%,var(--surface2) 100%);border:1px solid var(--border);border-radius:14px;padding:1.6rem 1.75rem;margin:1.25rem 0;animation:fadeup .5s ease;position:relative;overflow:hidden}
.topic-quiz::before{content:"";position:absolute;top:-80px;right:-80px;width:240px;height:240px;background:radial-gradient(circle,var(--amber-soft) 0%,transparent 70%);pointer-events:none}
.tq-head{display:flex;align-items:center;gap:14px;margin-bottom:1.25rem;position:relative}
.tq-icon{width:42px;height:42px;border-radius:11px;background:var(--amber-soft);color:var(--amber);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;flex-shrink:0;border:1px solid rgba(217,119,6,0.25)}
.tq-title{font-size:1.08rem;font-weight:700;color:var(--text);letter-spacing:-0.01em}
.tq-sub{font-size:.82rem;color:var(--text3);margin-top:2px;font-family:var(--mono);letter-spacing:.04em}
.tq-progress-track{background:var(--surface3);border-radius:100px;height:5px;overflow:hidden;margin-bottom:1.25rem}
.tq-progress-bar{height:100%;width:0;background:linear-gradient(90deg,var(--amber),var(--pink));border-radius:100px;transition:width .4s}
.tq-card{animation:fadeup .35s ease;position:relative}
.tq-badges{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.tq-badge{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:4px 11px;border-radius:100px;display:inline-block;font-family:var(--mono);color:#fff}
.badge-recall{background:#0891b2}.badge-understanding{background:#4f46e5}.badge-application{background:#059669}.badge-analysis{background:#9333ea}
.badge-diff-easy{background:#16a34a}.badge-diff-medium{background:#d97706}.badge-diff-hard{background:#db2777}
.tq-text{font-size:1.02rem;font-weight:600;color:var(--text);margin-bottom:1.1rem;line-height:1.5}
.tq-options{display:flex;flex-direction:column;gap:8px}
.tq-option{border:1.5px solid var(--border);border-radius:8px;padding:.8rem 1rem;cursor:pointer;display:flex;align-items:flex-start;gap:12px;transition:all .2s;font-size:.88rem;color:var(--text2);background:var(--surface)}
.tq-option:hover:not(.disabled){border-color:var(--indigo);background:var(--indigo-soft);color:var(--text);transform:translateX(3px)}
.tq-option.correct{border-color:var(--emerald);background:var(--emerald-soft);color:var(--emerald);animation:pop .35s ease}
.tq-option.wrong{border-color:var(--red);background:var(--red-soft);color:var(--red);animation:shake .35s ease}
.tq-option.disabled{cursor:default}
.tq-opt-letter{width:26px;height:26px;border-radius:6px;background:var(--surface3);border:1px solid var(--border2);display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:700;flex-shrink:0;font-family:var(--mono);color:var(--text)}
.tq-option.correct .tq-opt-letter{background:var(--emerald);border-color:var(--emerald);color:#fff}
.tq-option.wrong .tq-opt-letter{background:var(--red);border-color:var(--red);color:#fff}
.tq-explanation{margin-top:1.1rem;padding:.95rem 1.1rem;background:var(--surface2);border-radius:8px;font-size:.87rem;color:var(--text2);border-left:3px solid var(--cyan);animation:fadeup .3s ease;line-height:1.6}
.tq-actions{margin-top:1.1rem;display:flex;justify-content:flex-end}
.tq-next{background:linear-gradient(135deg,var(--amber) 0%,var(--pink) 100%);color:#fff;border:none;border-radius:7px;padding:8px 20px;font-size:.87rem;font-weight:700;cursor:pointer;font-family:var(--font);transition:all .2s;display:inline-flex;align-items:center;gap:6px;box-shadow:0 4px 14px -4px rgba(217,119,6,0.4)}
.tq-next:hover{transform:translateY(-1px);box-shadow:0 8px 22px -4px rgba(217,119,6,0.55)}
.tq-done{padding:1.5rem 0 .5rem;text-align:center;animation:pop .4s ease}
.tq-done-icon{width:54px;height:54px;border-radius:50%;background:var(--emerald-soft);color:var(--emerald);display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700;margin:0 auto .75rem;border:1px solid rgba(5,150,105,0.3)}
.tq-done-title{font-size:1.15rem;font-weight:700;color:var(--text);margin-bottom:6px}
.tq-done-score{font-family:var(--mono);font-size:.9rem;color:var(--text2)}
.tq-done-score strong{color:var(--emerald);font-size:1.05rem}
.confetti-piece{position:absolute;pointer-events:none;width:7px;height:12px;border-radius:2px;animation:confetti 1.3s cubic-bezier(0.34,1.56,0.64,1) forwards;z-index:5}

/* Continue breaker */
.cont-breaker{background:linear-gradient(135deg,var(--surface) 0%,var(--surface2) 100%);border:1px solid var(--border);border-radius:14px;padding:1.4rem 1.6rem;margin:2.5rem 0;display:flex;flex-direction:column;gap:1rem;box-shadow:0 8px 22px -10px rgba(0,0,0,0.25);animation:slideup .5s ease;position:relative;overflow:hidden}
.cont-breaker::before{content:"";position:absolute;top:-80px;right:-80px;width:260px;height:260px;background:radial-gradient(circle,var(--indigo-soft) 0%,transparent 70%);pointer-events:none}
.cont-status{display:flex;align-items:center;gap:12px;padding-bottom:1rem;border-bottom:1px dashed var(--border);position:relative}
.cont-check{width:30px;height:30px;border-radius:50%;background:var(--emerald);color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;flex-shrink:0;animation:pop .4s ease}
.cont-status-text{font-family:var(--mono);font-size:12px;color:var(--text2);letter-spacing:0.02em}
.cont-btn{display:flex;justify-content:space-between;align-items:center;gap:16px;background:linear-gradient(135deg,var(--indigo) 0%,var(--purple) 100%);color:#fff;border:none;border-radius:12px;padding:1.2rem 1.5rem;cursor:pointer;font-family:var(--font);text-align:left;transition:all .25s;width:100%;position:relative;box-shadow:0 6px 18px -6px rgba(99,102,241,0.5)}
.cont-btn:hover{transform:translateY(-2px);box-shadow:0 14px 32px -8px rgba(99,102,241,0.6)}
.cont-btn-inner{flex:1;min-width:0}
.cont-btn-label{font-family:var(--mono);font-size:10.5px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,0.8);margin-bottom:3px}
.cont-btn-title{display:flex;align-items:baseline;gap:10px}
.cont-btn-num{font-family:var(--mono);font-size:13px;font-weight:600;color:rgba(255,255,255,0.85)}
.cont-btn-name{font-size:1.2rem;font-weight:700;letter-spacing:-0.015em}
.cont-btn-arrow{font-size:1.5rem;font-weight:300;transition:transform .25s;flex-shrink:0}
.cont-btn:hover .cont-btn-arrow{transform:translateX(8px)}

/* Course complete */
.course-complete{background:linear-gradient(135deg,var(--surface) 0%,var(--surface2) 100%);border:1px solid var(--border);border-radius:16px;padding:2rem;margin:2.5rem 0;position:relative;overflow:hidden;box-shadow:0 12px 32px -10px rgba(0,0,0,0.2);animation:slideup .55s ease}
.course-complete::before{content:"";position:absolute;top:-100px;right:-100px;width:320px;height:320px;background:radial-gradient(circle,var(--emerald-soft) 0%,transparent 70%);pointer-events:none}
.cc-head{display:flex;align-items:center;gap:14px;margin-bottom:1rem;position:relative}
.cc-star{width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,var(--amber),var(--pink));color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:0 8px 20px -6px rgba(217,119,6,0.5);animation:pop .5s ease,wiggle 2.5s ease-in-out infinite 1s}
.cc-title{font-size:1.5rem;font-weight:700;color:var(--text);letter-spacing:-0.025em;line-height:1.2}
.cc-subtitle{font-size:.92rem;color:var(--text2);margin-top:3px}
.cc-intro{color:var(--text2);margin-bottom:1.5rem;position:relative;max-width:580px}
.cc-score-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:1.5rem 1.75rem;margin-bottom:1.25rem;position:relative}
.cc-score-label{font-family:var(--mono);font-size:10.5px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--text3);margin-bottom:8px}
.cc-score-big{display:flex;align-items:baseline;gap:14px;margin-bottom:1rem}
.cc-score-num{font-size:3rem;font-weight:700;color:var(--text);letter-spacing:-0.04em;font-family:var(--mono);line-height:1}
.cc-score-num .out{color:var(--text3);font-size:1.8rem}
.cc-score-pct{font-family:var(--mono);font-size:1rem;font-weight:700;padding:6px 14px;border-radius:100px}
.cc-score-pct.good{background:var(--emerald-soft);color:var(--emerald)}
.cc-score-pct.mid{background:var(--amber-soft);color:var(--amber)}
.cc-score-pct.low{background:var(--red-soft);color:var(--red)}
.cc-bar-track{height:10px;background:var(--surface2);border-radius:100px;overflow:hidden;margin-bottom:1rem}
.cc-bar-fill{height:100%;background:linear-gradient(90deg,var(--emerald),var(--cyan),var(--indigo));background-size:200% 100%;border-radius:100px;animation:shimmer 3s linear infinite;transition:width .8s cubic-bezier(0.65,0,0.35,1)}
.cc-tally{display:flex;gap:18px;font-family:var(--mono);font-size:.88rem}
.cc-tally-item{display:inline-flex;align-items:center;gap:6px;color:var(--text2)}
.cc-tally-item.correct strong{color:var(--emerald);font-size:1.05rem}
.cc-tally-item.wrong strong{color:var(--red);font-size:1.05rem}
.cc-tally-icon{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;font-size:11px;font-weight:700}
.cc-tally-item.correct .cc-tally-icon{background:var(--emerald-soft);color:var(--emerald)}
.cc-tally-item.wrong .cc-tally-icon{background:var(--red-soft);color:var(--red)}
.cc-breakdown-label{font-family:var(--mono);font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--text3);margin-bottom:.75rem}
.cc-sections{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}
.cc-sec{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:.85rem 1rem;display:flex;flex-direction:column;gap:4px;position:relative;overflow:hidden}
.cc-sec::before{content:"";position:absolute;top:0;left:0;bottom:0;width:3px;background:var(--accent-from,var(--indigo))}
.cc-sec-num{font-family:var(--mono);font-size:10.5px;font-weight:600;letter-spacing:.12em;color:var(--accent-from,var(--indigo));text-transform:uppercase}
.cc-sec-name{font-size:.82rem;font-weight:600;color:var(--text)}
.cc-sec-score{font-family:var(--mono);font-size:.88rem;font-weight:700;color:var(--text);margin-top:2px}
.cc-sec-score .out{color:var(--text3);font-weight:500}

/* Code playground (web) */
.pg{background:var(--code-bg);border-radius:10px;overflow:hidden;margin:1rem 0;box-shadow:0 8px 24px -10px rgba(0,0,0,0.5);position:relative;border:1px solid var(--border)}
.pg-top{display:flex;justify-content:space-between;align-items:center;background:var(--code-bg2);border-bottom:1px solid rgba(255,255,255,0.06);border-radius:10px 10px 0 0}
.pg-tabs{display:flex}
.pg-tab{background:transparent;border:none;padding:11px 16px;display:flex;align-items:center;gap:8px;cursor:pointer;color:#94a3b8;font-family:var(--font);font-size:12.5px;font-weight:600;transition:all .2s;border-bottom:2px solid transparent}
.pg-tab:hover{color:#fff;background:rgba(255,255,255,0.03)}
.pg-tab.active{color:#fff;background:var(--code-bg)}
.pg-tab-icon{width:22px;height:22px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:11px;font-weight:700;color:#fff;flex-shrink:0}
.icon-html{background:#e34c26}.icon-css{background:#2965f1}.icon-js{background:#f0db4f;color:#000}
.pg-tools{display:flex;gap:2px;padding:5px 10px}
.pg-tool{background:transparent;border:none;color:#94a3b8;cursor:pointer;padding:5px 9px;border-radius:6px;transition:all .15s;font-size:15px;line-height:1}
.pg-tool:hover{background:rgba(255,255,255,0.08);color:#fff}
.pg-body{display:grid;grid-template-columns:1fr 1fr}
.pg-editor-wrap{background:var(--code-bg);border-right:1px solid rgba(255,255,255,0.06);display:flex}
.pg-editor{width:100%;background:transparent;border:none;outline:none;padding:14px 16px;font-family:var(--mono);font-size:12.5px;line-height:1.65;color:var(--code-text);resize:vertical;tab-size:2;white-space:pre;overflow:auto;min-height:200px}
.pg-preview-area{background:var(--code-bg2);display:flex;flex-direction:column}
.pg-preview-size{background:rgba(0,0,0,0.25);border-bottom:1px solid rgba(255,255,255,0.07);padding:5px 10px;text-align:center;font-family:var(--mono);font-size:10.5px;color:#cbd5e1;letter-spacing:.04em}
.pg-preview-wrapper{flex:1;display:flex;justify-content:center;align-items:flex-start;padding:10px;min-height:240px}
.pg-preview-frame{background:#fff;border-radius:4px;overflow:hidden;display:flex;flex-direction:column;width:100%}
.pg-iframe{width:100%;flex:1;border:none;background:#fff;min-height:220px}
.pg-preview-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;padding:1.5rem;text-align:center;color:#94a3b8;font-size:.82rem;gap:10px;min-height:220px;background:rgba(255,255,255,0.02)}
.pg-preview-empty-icon{width:44px;height:44px;border-radius:50%;background:rgba(99,102,241,0.18);color:var(--indigo);display:flex;align-items:center;justify-content:center;font-size:16px;padding-left:3px}
.pg-preview-empty-text strong{color:var(--indigo)}
.pg-console{border-top:1px solid rgba(255,255,255,0.08);background:#0b1020;display:flex;flex-direction:column;max-height:180px}
.pg-console-bar{display:flex;align-items:center;justify-content:space-between;padding:5px 10px;background:rgba(0,0,0,0.25);border-bottom:1px solid rgba(255,255,255,0.07)}
.pg-console-title{font-family:var(--mono);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#cbd5e1;font-weight:700}
.pg-console-clear{background:transparent;border:1px solid rgba(148,163,184,0.3);color:#94a3b8;border-radius:5px;font-size:10.5px;padding:2px 8px;cursor:pointer}
.pg-console-body{overflow-y:auto;padding:4px 0;font-family:var(--mono);font-size:12px;line-height:1.5}
.pg-console-empty{padding:10px 12px;color:#94a3b8;font-size:11.5px}
.pg-console-line{display:flex;gap:8px;padding:2px 12px;border-bottom:1px solid rgba(255,255,255,0.04);white-space:pre-wrap;word-break:break-word}
.pg-console-caret{color:#64748b}
.pg-console-text{color:#e2e8f0;flex:1}
.pg-console-line.lvl-error .pg-console-text{color:#fca5a5}
.pg-console-line.lvl-error{background:rgba(239,68,68,0.08)}
.pg-console-line.lvl-warn .pg-console-text{color:#fcd34d}
.pg-foot{display:flex;justify-content:flex-end;padding:9px 14px;background:var(--code-bg2);border-top:1px solid rgba(255,255,255,0.06);border-radius:0 0 10px 10px}
.pg-run{background:linear-gradient(135deg,var(--indigo) 0%,var(--purple) 100%);color:#fff;border:none;border-radius:100px;padding:7px 18px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:var(--font);display:flex;align-items:center;gap:7px;transition:all .2s;box-shadow:0 4px 14px -4px rgba(99,102,241,0.45)}
.pg-run:hover{transform:translateY(-1px);box-shadow:0 8px 22px -4px rgba(99,102,241,0.55)}
.pg-run-icon{font-size:9px;padding-left:1px}
@media (max-width:700px){.pg-body{grid-template-columns:1fr}.pg-editor-wrap{border-right:none;border-bottom:1px solid rgba(255,255,255,0.06)}}

/* Non-web code (read-only) */
.cr{margin:14px 0 0;border:1px solid rgba(148,163,184,0.22);border-radius:12px;overflow:hidden;background:#0b1020}
.cr-top{display:flex;align-items:center;padding:8px 12px;background:rgba(148,163,184,0.08);border-bottom:1px solid rgba(148,163,184,0.18)}
.cr-lang{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:.3px;color:#e2e8f0}
.cr-lang-icon{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 6px;border-radius:6px;font-size:11px;font-weight:800;background:linear-gradient(135deg,var(--indigo),var(--purple));color:#fff}
.cr-editor{display:block;width:100%;padding:14px 16px;margin:0;background:#0b1020;color:#e2e8f0;font-family:var(--mono);font-size:13px;line-height:1.6;tab-size:4;white-space:pre;overflow:auto;max-height:420px}
.cr-foot{display:flex;align-items:center;padding:10px 12px;border-top:1px solid rgba(148,163,184,0.18);background:rgba(148,163,184,0.05)}
.cr-hint{font-size:11px;color:#8a93a8}

footer.doc{text-align:center;color:var(--text3);font-size:12px;margin:2rem 0 4rem}
`;

// Embedded runtime: gating + one-at-a-time quiz + live playground. Kept as a
// plain concatenated string (no template literals) so it can be inlined safely.
const SCRIPT = `
(function(){
  var CONFETTI=['#4f46e5','#818cf8','#9333ea','#c084fc','#0891b2','#22d3ee','#059669','#34d399','#d97706','#fbbf24','#db2777','#f472b6'];
  var wraps=Array.prototype.slice.call(document.querySelectorAll('.unit-wrap'));
  var total=wraps.length;
  var unlocked=0;
  var quizDone={};
  var scores={};

  function apply(){
    wraps.forEach(function(w){
      var idx=parseInt(w.getAttribute('data-index'),10);
      var full=w.querySelector('.unit-full');
      var lock=w.querySelector('.locked-preview');
      var open=idx<=unlocked;
      full.hidden=!open;
      // Show a dimmed preview only for the immediate next section while the
      // current section's quiz is still pending.
      var showLock=(!open && idx===unlocked+1 && !quizDone[unlocked]);
      if(lock) lock.hidden=!showLock;
      // Continue breaker appears once THIS section's quiz is done (not last).
      var cont=w.querySelector('.cont-breaker');
      if(cont) cont.hidden=!(open && quizDone[idx]);
    });
    maybeComplete();
  }

  function onQuizDone(idx,correct,tot){
    quizDone[idx]=true; scores[idx]={correct:correct,total:tot};
    // A quiz-less section auto-completes; ensure its breaker shows.
    apply();
  }

  // Continue → unlock next section and scroll to it.
  document.querySelectorAll('.cont-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
      var w=btn.closest('.unit-wrap');
      var idx=parseInt(w.getAttribute('data-index'),10);
      unlocked=Math.max(unlocked,idx+1);
      apply();
      var next=wraps[idx+1];
      if(next) setTimeout(function(){ next.scrollIntoView({behavior:'smooth',block:'start'}); },80);
    });
  });
  // Fill each breaker's "next" title.
  wraps.forEach(function(w){
    var idx=parseInt(w.getAttribute('data-index'),10);
    var nt=w.querySelector('[data-next-title]');
    if(nt && wraps[idx+1]) nt.textContent=wraps[idx+1].getAttribute('data-title');
  });

  // ── Mini-quiz (one question at a time) ──
  document.querySelectorAll('.topic-quiz').forEach(function(quiz){
    var wrap=quiz.closest('.unit-wrap');
    var uidx=parseInt(wrap.getAttribute('data-index'),10);
    var tot=parseInt(quiz.getAttribute('data-total'),10)||0;
    var cards=Array.prototype.slice.call(quiz.querySelectorAll('.tq-card'));
    var bar=quiz.querySelector('.tq-progress-bar');
    var curEl=quiz.querySelector('.tq-cur');
    var doneEl=quiz.querySelector('.tq-done');
    var cur=0, score=0;

    if(cards.length===0){ onQuizDone(uidx,0,0); return; }
    cards[0].hidden=false;

    function setBar(answered){ bar.style.width=(((cur+(answered?1:0))/tot)*100)+'%'; }
    setBar(false);

    function confetti(){
      var w=quiz.clientWidth||300; var originX=w/2;
      for(var k=0;k<22;k++){
        var p=document.createElement('span');
        p.className='confetti-piece';
        p.style.left=(originX+(Math.random()-0.5)*60)+'px';
        p.style.top='50%';
        p.style.background=CONFETTI[Math.floor(Math.random()*CONFETTI.length)];
        p.style.setProperty('--cx',((Math.random()-0.5)*280)+'px');
        p.style.setProperty('--cy',(120+Math.random()*80)+'px');
        p.style.animationDelay=(Math.random()*0.12)+'s';
        quiz.appendChild(p);
      }
      setTimeout(function(){ quiz.querySelectorAll('.confetti-piece').forEach(function(el){el.remove();}); },1500);
    }

    cards.forEach(function(card){
      var correct=parseInt(card.getAttribute('data-correct'),10);
      var opts=card.querySelectorAll('.tq-option');
      var explain=card.querySelector('.tq-explanation');
      var actions=card.querySelector('.tq-actions');
      var nextBtn=card.querySelector('.tq-next');
      nextBtn.textContent=(cur+1>=tot?'Finish quiz':'Next question')+' \\u2192';

      opts.forEach(function(opt){
        opt.addEventListener('click',function(){
          if(card.classList.contains('answered')) return;
          card.classList.add('answered');
          var chosen=parseInt(opt.getAttribute('data-i'),10);
          opts.forEach(function(o,i){
            o.classList.add('disabled');
            if(i===correct) o.classList.add('correct');
            else if(i===chosen) o.classList.add('wrong');
          });
          if(chosen===correct){ score++; confetti(); }
          if(explain) explain.hidden=false;
          if(actions) actions.hidden=false;
          setBar(true);
        });
      });

      nextBtn.addEventListener('click',function(){
        // Re-label in case this is the last card.
        if(cur+1>=tot){
          cards.forEach(function(c){c.hidden=true;});
          var pct=tot?Math.round((score/tot)*100):0;
          doneEl.querySelector('.tq-done-score').innerHTML='You scored <strong>'+score+' / '+tot+'</strong> ('+pct+'%)';
          doneEl.hidden=false;
          bar.style.width='100%';
          onQuizDone(uidx,score,tot);
        } else {
          cards[cur].hidden=true;
          cur++;
          cards[cur].hidden=false;
          if(curEl) curEl.textContent=String(cur+1);
          setBar(false);
        }
      });
    });
  });

  // ── Course complete ──
  function maybeComplete(){
    var allDone=total>0 && wraps.every(function(w){ return quizDone[parseInt(w.getAttribute('data-index'),10)]; });
    var existing=document.getElementById('course-complete');
    if(!allDone){ if(existing) existing.remove(); return; }
    if(existing) return;
    var totalCorrect=0, totalQ=0;
    wraps.forEach(function(w){ var i=parseInt(w.getAttribute('data-index'),10); var s=scores[i]||{correct:0,total:0}; totalCorrect+=s.correct; totalQ+=s.total; });
    var totalWrong=totalQ-totalCorrect;
    var pct=totalQ>0?Math.round((totalCorrect/totalQ)*100):0;
    var pctClass=pct>=80?'good':(pct>=60?'mid':'low');
    var rows=wraps.map(function(w){
      var i=parseInt(w.getAttribute('data-index'),10); var s=scores[i]||{correct:0,total:0};
      return '<div class="cc-sec '+w.getAttribute('data-sec')+'"><div class="cc-sec-num">\\u00a7'+w.getAttribute('data-num')+'</div><div class="cc-sec-name">'+w.getAttribute('data-title')+'</div><div class="cc-sec-score">'+s.correct+'<span class="out"> / '+s.total+'</span></div></div>';
    }).join('');
    var cc=document.createElement('div');
    cc.id='course-complete'; cc.className='course-complete';
    cc.innerHTML='<div class="cc-head"><div class="cc-star">\\u2605</div><div><div class="cc-title">Course complete!</div><div class="cc-subtitle">You finished all '+total+' sections</div></div></div>'+
      '<p class="cc-intro">Here\\u2019s how you did on the mini-quizzes:</p>'+
      '<div class="cc-score-card"><div class="cc-score-label">Your overall score</div>'+
      '<div class="cc-score-big"><div class="cc-score-num">'+totalCorrect+'<span class="out"> / '+totalQ+'</span></div><div class="cc-score-pct '+pctClass+'">'+pct+'%</div></div>'+
      '<div class="cc-bar-track"><div class="cc-bar-fill" style="width:'+pct+'%"></div></div>'+
      '<div class="cc-tally"><div class="cc-tally-item correct"><span class="cc-tally-icon">\\u2713</span><span><strong>'+totalCorrect+'</strong> correct</span></div><div class="cc-tally-item wrong"><span class="cc-tally-icon">\\u2717</span><span><strong>'+totalWrong+'</strong> wrong</span></div></div></div>'+
      '<div class="cc-breakdown"><div class="cc-breakdown-label">Section-by-section breakdown</div><div class="cc-sections">'+rows+'</div></div>';
    var page=document.querySelector('.page'); page.appendChild(cc);
    setTimeout(function(){ cc.scrollIntoView({behavior:'smooth',block:'start'}); },80);
  }

  // ── Web code playgrounds ──
  document.querySelectorAll('.pg').forEach(function(pg){
    var initial={ html:pg.getAttribute('data-html')||'', css:pg.getAttribute('data-css')||'', js:pg.getAttribute('data-js')||'' };
    var state={ html:initial.html, css:initial.css, js:initial.js };
    var tab=pg.getAttribute('data-start')||'css';
    var editor=pg.querySelector('.pg-editor');
    var tabs=pg.querySelectorAll('.pg-tab');
    var frameWrap=pg.querySelector('.pg-preview-frame');
    var consoleBox=pg.querySelector('.pg-console');
    var consoleBody=pg.querySelector('.pg-console-body');
    var runId=0;

    function selectTab(t){
      tab=t;
      tabs.forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-tab')===t); });
      editor.value=state[t];
    }
    tabs.forEach(function(b){ b.addEventListener('click',function(){ selectTab(b.getAttribute('data-tab')); }); });
    editor.addEventListener('input',function(){ state[tab]=editor.value; });

    function buildDoc(){
      var hook='<scr'+'ipt>(function(){var ser=function(a){try{return typeof a===\\'object\\'?JSON.stringify(a):String(a)}catch(e){return String(a)}};'+
        'var send=function(l,args){parent.postMessage({__pg:true,id:'+runId+',level:l,text:Array.prototype.map.call(args,ser).join(\\' \\')},\\'*\\')};'+
        '[\\'log\\',\\'info\\',\\'warn\\',\\'error\\'].forEach(function(m){var o=console[m];console[m]=function(){send(m===\\'log\\'?\\'log\\':m,arguments);if(o)o.apply(console,arguments)}});'+
        'window.addEventListener(\\'error\\',function(e){send(\\'error\\',[(e.error&&e.error.stack)||e.message])});'+
        '})();</scr'+'ipt>';
      return '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"/>'+
        '<style>html,body{margin:0;padding:0;font-family:system-ui,sans-serif;} '+state.css+'</style></head><body>'+
        state.html+hook+'<scr'+'ipt>'+state.js+'</scr'+'ipt></body></html>';
    }

    window.addEventListener('message',function(e){
      var d=e.data; if(!d||!d.__pg||d.id!==runId) return;
      var line=document.createElement('div'); line.className='pg-console-line lvl-'+d.level;
      line.innerHTML='<span class="pg-console-caret">\\u203a</span><span class="pg-console-text"></span>';
      line.querySelector('.pg-console-text').textContent=d.text;
      consoleBody.appendChild(line);
    });

    function run(){
      runId++;
      consoleBody.innerHTML='';
      var doc=buildDoc();
      frameWrap.innerHTML='';
      var f=document.createElement('iframe');
      f.className='pg-iframe'; f.setAttribute('title','preview'); f.setAttribute('sandbox','allow-scripts allow-same-origin');
      frameWrap.appendChild(f);
      f.srcdoc=doc;
      consoleBox.hidden=false;
      hasRun=true;
    }
    var runBtn=pg.querySelector('.pg-run'); if(runBtn) runBtn.addEventListener('click',run);
    var clearBtn=pg.querySelector('.pg-console-clear'); if(clearBtn) clearBtn.addEventListener('click',function(){ consoleBody.innerHTML=''; });
    var resetBtn=pg.querySelector('.pg-reset'); if(resetBtn) resetBtn.addEventListener('click',function(){ state.html=initial.html;state.css=initial.css;state.js=initial.js; editor.value=state[tab]; });
    var newTabBtn=pg.querySelector('.pg-newtab'); if(newTabBtn) newTabBtn.addEventListener('click',function(){ var w=window.open(); if(w){ w.document.write(buildDoc()); w.document.close(); } });

    selectTab(tab);
  });

  apply();
})();
`;

export interface LessonExport {
  html: string;
  /** Images that could not be embedded (fell back to an absolute URL). */
  missingImages: number;
}

/** Build a self-contained, interactive HTML document for the lesson. Returns the
 *  HTML plus how many images couldn't be embedded, so the caller can warn. */
export async function buildLessonHtml(data: ConceptUnitsFile): Promise<LessonExport> {
  const { map: images, failed } = await inlineImages(data);
  const units = data.units || [];
  const docTitle = (data.doc || "Lesson").replace(/\.md$/i, "").replace(/[_-]/g, " ");
  const body = units.map((u, i) => unitHtml(u, i, units.length, images)).join("\n");
  const tag =
    "AI-generated · Eval-governed · Human-approved" +
    (data.generator_model ? ` · ${esc(data.generator_model)}` : "");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(docTitle)} — Interactive Lesson</title>
<style>${STYLE}</style>
</head>
<body>
<div class="mq-root theme-dark">
<header class="hero">
<div class="hero-orbs"><span class="hero-orb"></span><span class="hero-orb"></span><span class="hero-orb"></span></div>
<div class="hero-tag">${tag}</div>
<h1>Learn <span class="gradient">${esc(docTitle)}</span>, interactively</h1>
<p class="lede">${units.length} concept${units.length === 1 ? "" : "s"} passed the eval gate and shipped.</p>
</header>
<div class="page">
${body}
</div>
<footer class="doc">Generated interactive lesson · ${esc(data.run_id || "")}</footer>
</div>
<script>${SCRIPT}<\/script>
</body>
</html>`;
  return { html, missingImages: failed.length };
}

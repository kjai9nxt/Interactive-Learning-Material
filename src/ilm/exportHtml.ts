/* Standalone HTML export for a generated lesson.
   Turns a ConceptUnitsFile into ONE self-contained .html document the user can
   open in any browser or host anywhere — no React app, no server. Styling is
   inlined and images are embedded as data URLs (fetched at export time).

   Interactivity, all vanilla JS embedded in the file (works fully offline):
     • Sequential gated units — a unit's mini-quiz must be attempted before the
       next unit unlocks (mirrors the in-app Lesson gating).
     • Editable + live-run web code playground (HTML/CSS/JS) — edit the code and
       the preview iframe updates.
     • Non-web code (Python/Java/…) is shown as a read-only block, since running
       it needs the backend server which a static file doesn't have.

   Additive: does not touch the JSON export or the in-app renderer. */

import type { ConceptUnitsFile, ConceptUnit, Scenario, MCQ, CodePlayground } from "./types";

const WEB_LANGS = new Set(["html", "css", "js", "javascript", "web"]);

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

async function toDataUrl(src: string): Promise<string | null> {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
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

// A failed fetch keeps the original src (that one image just won't be portable
// rather than breaking the whole export).
async function inlineImages(data: ConceptUnitsFile): Promise<Record<string, string>> {
  const srcs = collectImageSrcs(data);
  const map: Record<string, string> = {};
  await Promise.all(
    srcs.map(async (src) => {
      const dataUrl = await toDataUrl(src);
      map[src] = dataUrl || src;
    }),
  );
  return map;
}

function visualHtml(src: string | undefined, images: Record<string, string>, label: string): string {
  if (!src || !src.trim()) return "";
  const resolved = images[src] || src;
  return `<figure class="visual"><img src="${escAttr(resolved)}" alt="${escAttr(label)}" loading="lazy"></figure>`;
}

function editor(label: string, cls: string, value: string): string {
  return (
    `<label class="pg-field"><span>${label}</span>` +
    `<textarea class="${cls}" spellcheck="false" rows="6">${esc(value)}</textarea></label>`
  );
}

function codeBlockHtml(cp: CodePlayground): string {
  const lang = (cp.language || "").trim().toLowerCase();
  const isWeb = WEB_LANGS.has(lang) || (!lang && (!!cp.html || !!cp.css) && !cp.code);

  if (isWeb) {
    const html = cp.html || (lang === "html" ? cp.code || "" : "");
    const css = cp.css || (lang === "css" ? cp.code || "" : "");
    const js = cp.js || (lang === "js" || lang === "javascript" ? cp.code || "" : "");
    // Editable panes for whatever parts exist (HTML always present so there's
    // something to edit). The embedded script live-runs them into the iframe.
    const editors = [
      editor("HTML", "pg-html", html),
      css || html ? editor("CSS", "pg-css", css) : "",
      js || html ? editor("JS", "pg-js", js) : "",
    ].filter(Boolean).join("");
    return (
      `<div class="playground" data-kind="web">` +
      `<div class="pg-label">Try it — edit the code, the preview updates live</div>` +
      `<div class="pg-editors">${editors}</div>` +
      `<button class="pg-run" type="button">Run ▶</button>` +
      `<iframe class="pg-preview" sandbox="allow-scripts" title="Live preview"></iframe>` +
      `</div>`
    );
  }

  // Non-web code can't run in a static file — read-only labelled block.
  const code = cp.code || "";
  if (!code.trim()) return "";
  return (
    `<div class="playground" data-kind="static">` +
    `<div class="pg-label">Code${lang ? ` · ${esc(lang)}` : ""} — run this in your own environment</div>` +
    `<pre><code>${esc(code)}</code></pre>` +
    `</div>`
  );
}

function scenarioHtml(s: Scenario, images: Record<string, string>): string {
  const parts = [`<p class="scenario-text">${inlineText(s.text)}</p>`];
  parts.push(visualHtml(s.visual_image, images, "Scenario illustration"));
  if (s.code_playground) parts.push(codeBlockHtml(s.code_playground));
  return parts.join("");
}

function quizHtml(questions: MCQ[]): string {
  if (!questions || questions.length === 0) return "";
  const qs = questions
    .map((q) => {
      const opts = (q.options || [])
        .map((o, i) => `<button class="q-opt" type="button" data-i="${i}">${esc(o)}</button>`)
        .join("");
      const explain = q.explanation
        ? `<div class="q-explain" hidden>${inlineText(q.explanation)}</div>`
        : "";
      return (
        `<div class="quiz-q" data-correct="${q.correct_index}">` +
        `<p class="q-text">${inlineText(q.question)}</p>` +
        `<div class="q-options">${opts}</div>` +
        explain +
        `</div>`
      );
    })
    .join("");
  return `<div class="block quiz"><div class="label">Check your understanding</div>${qs}</div>`;
}

function unitHtml(unit: ConceptUnit, index: number, total: number, images: Record<string, string>): string {
  const num = String(index + 1).padStart(2, "0");
  const isLast = index === total - 1;
  const scenarios = unit.scenarios || [];
  const quizTotal = unit.mini_quiz?.questions?.length || 0;

  const scenarioSection =
    scenarios.length > 0
      ? `<div class="block"><div class="label">In practice</div>` +
        scenarios
          .map(
            (s, i) =>
              `<div class="scenario">${scenarios.length > 1 ? `<div class="scenario-num">${i + 1}</div>` : ""}<div class="scenario-body">${scenarioHtml(s, images)}</div></div>`,
          )
          .join("") +
        `</div>`
      : "";

  const continueBtn = isLast
    ? ""
    : `<div class="continue" hidden><button class="continue-btn" type="button">Continue to the next section →</button></div>`;

  const lockView = `<div class="lock-view" hidden>🔒 <span class="lock-num">${num}</span> ${esc(unit.title)}<div class="lock-hint">Attempt the quiz in the previous section, then continue to unlock this.</div></div>`;

  const fullView =
    `<div class="full-view">` +
    `<h2><span class="unit-num">${num}</span> ${esc(unit.title)}</h2>` +
    (unit.summary ? `<p class="summary">${inlineText(unit.summary)}</p>` : "") +
    `<div class="block"><div class="label">What it is</div><p>${inlineText(unit.explanation.text)}</p>${visualHtml(unit.explanation.visual_image, images, unit.title + " diagram")}</div>` +
    `<div class="block analogy"><div class="label">Think of it like this</div><p>${inlineText(unit.analogy.text)}</p>${visualHtml(unit.analogy.visual_image, images, unit.title + " analogy")}</div>` +
    scenarioSection +
    quizHtml(unit.mini_quiz?.questions || []) +
    continueBtn +
    `</div>`;

  return `<section class="unit" data-index="${index}" data-quiz-total="${quizTotal}">${lockView}${fullView}</section>`;
}

const STYLE = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#0b1120;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;line-height:1.65}
.wrap{max-width:820px;margin:0 auto;padding:40px 20px 80px}
header.doc{text-align:center;margin-bottom:40px}
header.doc .tag{display:inline-block;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#818cf8;background:rgba(129,140,248,.12);border:1px solid rgba(129,140,248,.3);border-radius:999px;padding:5px 12px;margin-bottom:14px}
header.doc h1{font-size:32px;margin:0 0 8px;font-weight:700}
header.doc .meta{color:#94a3b8;font-size:14px}
.unit{background:#111a2e;border:1px solid rgba(148,163,184,.16);border-radius:16px;padding:26px 26px 30px;margin-bottom:28px}
.unit h2{font-size:24px;margin:0 0 6px;display:flex;align-items:baseline;gap:10px}
.unit-num{color:#818cf8;font-size:15px;font-weight:700}
.summary{color:#94a3b8;margin:0 0 18px;font-size:15px}
.lock-view{color:#64748b;font-size:18px;font-weight:600}
.lock-num{color:#818cf8}
.lock-hint{font-size:13px;font-weight:400;margin-top:6px;color:#64748b}
.block{margin-top:22px}
.label{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#818cf8;font-weight:700;margin-bottom:8px}
.block.analogy{background:rgba(129,140,248,.07);border-left:3px solid #818cf8;border-radius:8px;padding:14px 16px}
.visual{margin:14px 0}
.visual img{max-width:100%;max-height:340px;border-radius:10px;display:block}
.scenario{display:flex;gap:12px;margin-top:14px}
.scenario-num{flex:0 0 26px;height:26px;border-radius:50%;background:rgba(129,140,248,.18);color:#c7d2fe;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center}
.scenario-body{flex:1;min-width:0}
.scenario-text{margin:0 0 8px}
pre{background:#020617;border:1px solid rgba(148,163,184,.16);border-radius:10px;padding:14px;overflow:auto;font-size:13px}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.92em}
p code{background:rgba(148,163,184,.16);padding:1px 5px;border-radius:4px}
.playground{margin:12px 0}
.pg-label{font-size:12px;color:#94a3b8;margin-bottom:6px}
.pg-editors{display:flex;flex-direction:column;gap:10px}
.pg-field{display:flex;flex-direction:column;gap:4px}
.pg-field span{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#818cf8;font-weight:700}
.pg-field textarea{width:100%;background:#020617;color:#e2e8f0;border:1px solid rgba(148,163,184,.2);border-radius:8px;padding:10px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.5;resize:vertical}
.pg-run{margin:10px 0;padding:8px 16px;border-radius:8px;border:1px solid rgba(16,185,129,.45);background:rgba(16,185,129,.16);color:#e2e8f0;font-weight:600;font-size:13px;cursor:pointer}
.pg-run:hover{background:rgba(16,185,129,.3)}
.pg-preview{width:100%;min-height:200px;border:1px solid rgba(148,163,184,.2);border-radius:10px;background:#fff}
.quiz .quiz-q{margin-top:16px}
.q-text{font-weight:600;margin:0 0 10px}
.q-options{display:flex;flex-direction:column;gap:8px}
.q-opt{text-align:left;padding:11px 14px;border-radius:9px;border:1px solid rgba(148,163,184,.24);background:#0b1120;color:#e2e8f0;font-size:14px;cursor:pointer;transition:background .15s}
.q-opt:hover:not(:disabled){background:rgba(129,140,248,.14)}
.q-opt:disabled{cursor:default;opacity:.9}
.q-opt.correct{border-color:#10b981;background:rgba(16,185,129,.18)}
.q-opt.wrong{border-color:#ef4444;background:rgba(239,68,68,.16)}
.q-explain{margin-top:10px;padding:10px 12px;background:rgba(148,163,184,.1);border-radius:8px;font-size:14px;color:#cbd5e1}
.continue{margin-top:22px;text-align:center}
.continue-btn{padding:11px 22px;border-radius:10px;border:1px solid rgba(129,140,248,.5);background:rgba(129,140,248,.18);color:#e2e8f0;font-weight:600;font-size:14px;cursor:pointer}
.continue-btn:hover{background:rgba(129,140,248,.32)}
footer.doc{text-align:center;color:#64748b;font-size:12px;margin-top:40px}
`;

// Embedded runtime: gating + quiz + live playground. Kept as an IIFE string.
const SCRIPT = `
(function(){
  var units = Array.prototype.slice.call(document.querySelectorAll('.unit'));
  var unlocked = 0;

  function apply(){
    units.forEach(function(sec){
      var idx = parseInt(sec.getAttribute('data-index'),10);
      var full = sec.querySelector('.full-view');
      var lock = sec.querySelector('.lock-view');
      var open = idx <= unlocked;
      if (full) full.hidden = !open;
      if (lock) lock.hidden = open;
    });
  }

  function maybeShowContinue(sec){
    var total = parseInt(sec.getAttribute('data-quiz-total'),10) || 0;
    var answered = sec.querySelectorAll('.quiz-q.answered').length;
    var cont = sec.querySelector('.continue');
    if (cont && answered >= total) cont.hidden = false;
  }

  // Quiz interactivity
  document.querySelectorAll('.quiz-q').forEach(function(q){
    var correct = parseInt(q.getAttribute('data-correct'),10);
    var opts = q.querySelectorAll('.q-opt');
    var explain = q.querySelector('.q-explain');
    opts.forEach(function(opt){
      opt.addEventListener('click', function(){
        if (q.classList.contains('answered')) return;
        q.classList.add('answered');
        var chosen = parseInt(opt.getAttribute('data-i'),10);
        opts.forEach(function(o,i){
          if (i===correct) o.classList.add('correct');
          else if (i===chosen) o.classList.add('wrong');
          o.disabled = true;
        });
        if (explain) explain.hidden = false;
        var sec = q.closest('.unit');
        if (sec) maybeShowContinue(sec);
      });
    });
  });

  // Continue → unlock next unit
  document.querySelectorAll('.continue-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      var sec = btn.closest('.unit');
      var idx = parseInt(sec.getAttribute('data-index'),10);
      unlocked = Math.max(unlocked, idx + 1);
      apply();
      var next = units[idx + 1];
      if (next) setTimeout(function(){ next.scrollIntoView({behavior:'smooth', block:'start'}); }, 60);
    });
  });

  // Units with no quiz can continue immediately
  units.forEach(function(sec){ maybeShowContinue(sec); });
  apply();

  // Editable, live-running web playgrounds
  document.querySelectorAll('.playground[data-kind="web"]').forEach(function(pg){
    var h = pg.querySelector('.pg-html'), c = pg.querySelector('.pg-css'), j = pg.querySelector('.pg-js');
    var frame = pg.querySelector('.pg-preview');
    function run(){
      var doc = '<style>' + (c ? c.value : '') + '</style>\\n' +
                (h ? h.value : '') + '\\n' +
                '<scr' + 'ipt>' + (j ? j.value : '') + '</scr' + 'ipt>';
      frame.srcdoc = doc;
    }
    [h,c,j].forEach(function(t){ if (t) t.addEventListener('input', run); });
    var runbtn = pg.querySelector('.pg-run');
    if (runbtn) runbtn.addEventListener('click', run);
    run();
  });
})();
`;

/** Build a self-contained, interactive HTML document string for the lesson. */
export async function buildLessonHtml(data: ConceptUnitsFile): Promise<string> {
  const images = await inlineImages(data);
  const units = data.units || [];
  const docTitle = (data.doc || "Lesson").replace(/\.md$/i, "").replace(/[_-]/g, " ");
  const body = units.map((u, i) => unitHtml(u, i, units.length, images)).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(docTitle)} — Interactive Lesson</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
<header class="doc">
<div class="tag">Interactive Learning Material</div>
<h1>${esc(docTitle)}</h1>
<div class="meta">${units.length} concept${units.length === 1 ? "" : "s"}${data.generator_model ? " · " + esc(data.generator_model) : ""}</div>
</header>
<main>
${body}
</main>
<footer class="doc">Generated interactive lesson · ${esc(data.run_id || "")}</footer>
</div>
<script>${SCRIPT}<\/script>
</body>
</html>`;
}

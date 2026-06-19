"""Shared visual-design spec for AI-generated SVG diagrams.

The frontend injects these SVGs inline and renders them on a dark OR light theme,
so colors MUST come from the theme's CSS variables (via the `style` attribute,
exactly like the hand-crafted reference scenes). Hardcoded colors like #f8f9fa
look broken on the opposite theme — never use them.

Imported by skill2 (analogy visual) and skill3 (explanation diagram).
"""
from __future__ import annotations

VISUAL_SPEC = """VISUAL — build a SIMPLE, clean, self-contained inline SVG (no <script>, no
external assets, no images). Aim for "instantly clear at a glance", not detailed.
It must look good on BOTH a dark and a light background, so DO NOT hardcode colors
— use the theme CSS variables through the `style` attribute, exactly as shown.

Canvas: <svg viewBox="0 0 520 220" width="520" height="220"
  xmlns="http://www.w3.org/2000/svg" font-family="Inter, system-ui, sans-serif"> ... </svg>
(the renderer scales it to fit). Use a vertical column layout (viewBox 360x300)
instead if the steps read more naturally top-to-bottom.

LAYOUT — this is the rule that kills overlap. Use ONE simple track:
- A single LEFT-TO-RIGHT ROW of 3-4 cards (input -> step -> result), connected by
  arrows. (Or a single TOP-TO-BOTTOM COLUMN.) Never a dense graph or a 2-D web.
- Every label lives CENTERED INSIDE its own card. Do NOT place free-floating text
  on the canvas, across arrows, or between cards — text only ever sits inside a card.
- Size each card to FIT its text: width ~= (longest line length x 9) + 24, and at
  least 110 wide; height >= 56 (use 72 if it has a second line). Keep labels SHORT
  (1-3 words, <= ~16 characters) so they fit — shorten the label, never shrink the
  card to crowd it.
- Leave a CLEAR GAP of >= 36px between adjacent cards (that gap holds the arrow).
- Keep every element >= 16px inside the viewBox edges. At most ONE small caption
  line under a card title, inside the same card, >= 20px below the title baseline.

Theme variables you MUST use (set them via style="...", not fill="..."):
  --svg-text      main labels / important text
  --svg-ink       outlines, strokes, arrows
  --svg-ink-light faint helper strokes, secondary text
  --svg-surface   card fill
  --svg-surface2  secondary / nested card fill
  --indigo        primary accent  (highlight the ONE key card)
  --indigo-soft   soft indigo fill behind the accent
EVERY <text> MUST carry an explicit fill via style (style="fill:var(--svg-text)"
for labels, or var(--indigo)/var(--svg-ink-light) for accents). A <text> with no
fill defaults to black and is INVISIBLE on the dark theme — never emit one.

INTERACTIVITY — wrap each card (its rect AND its label together) in
<g class="ilm-node"> ... </g>, one group per card. The renderer makes these
hover-interactive (hovering a card highlights it and dims the rest). Arrows/
connectors between cards stay OUTSIDE the groups.

Example card (rect + centered label grouped) and a connector arrow:
  <g class="ilm-node">
    <rect x="24" y="74" width="130" height="64" rx="10"
          style="fill:var(--svg-surface);stroke:var(--svg-ink)" stroke-width="1.6"/>
    <text x="89" y="111" text-anchor="middle" font-size="14" font-weight="600"
          style="fill:var(--svg-text)">Input</text>
  </g>
  <line x1="154" y1="106" x2="196" y2="106" style="stroke:var(--svg-ink)"
        stroke-width="1.8" marker-end="url(#a)"/>
  define one arrowhead (unique id per diagram so multiple diagrams never collide):
  <defs><marker id="arr-X" markerWidth="9" markerHeight="9" refX="6" refY="3"
    orient="auto"><path d="M0,0 L0,6 L8,3 z" style="fill:var(--svg-ink)"/></marker></defs>

Quality bar:
- Show the concept's flow simply: input -> what happens -> result (or before ->
  after). 3-4 cards is ideal; never more than 5.
- Use the indigo accent on the ONE most important card only.
- Readable fonts: titles >= 13, captions >= 11.
- Monospace (font-family="JetBrains Mono, monospace") only for code/identifiers.
- Prefer FEWER, larger, well-spaced cards over a crowded diagram. If it feels
  busy, remove a card. Simplicity and zero overlap beat completeness."""

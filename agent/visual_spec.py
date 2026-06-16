"""Shared visual-design spec for AI-generated SVG diagrams.

The frontend injects these SVGs inline and renders them on a dark OR light theme,
so colors MUST come from the theme's CSS variables (via the `style` attribute,
exactly like the hand-crafted reference scenes). Hardcoded colors like #f8f9fa
look broken on the opposite theme — never use them.

Imported by skill2 (analogy visual) and skill3 (explanation diagram).
"""
from __future__ import annotations

VISUAL_SPEC = """VISUAL — build a clear, polished, self-contained inline SVG (no <script>, no
external assets, no images). It must look good on BOTH a dark and a light
background, so DO NOT hardcode colors — use the theme CSS variables through the
`style` attribute, exactly as shown.

Canvas: <svg viewBox="0 0 440 240" width="440" height="240"
  xmlns="http://www.w3.org/2000/svg" font-family="Inter, system-ui, sans-serif"> ... </svg>
(the renderer scales it to fit; keep height <= 260).

Theme variables you MUST use (set them via style="...", not fill="..."):
  --svg-text      main labels / important text
  --svg-ink       outlines, strokes, arrows
  --svg-ink-light faint helper strokes, secondary text, dashes
  --svg-surface   primary box fill
  --svg-surface2  secondary / nested box fill
  --indigo        primary accent  (highlight the key element)
  --indigo-soft   soft indigo fill behind the accent
  --purple        secondary accent
  --purple-soft   soft purple fill
Example shapes:
  <rect x="20" y="20" width="160" height="70" rx="8"
        style="fill:var(--svg-surface);stroke:var(--svg-ink)" stroke-width="1.6"/>
  <text x="100" y="58" text-anchor="middle" font-size="13" font-weight="600"
        style="fill:var(--svg-text)">label</text>
  <line x1="180" y1="55" x2="240" y2="55" style="stroke:var(--svg-ink)"
        stroke-width="1.8" marker-end="url(#a)"/>
  define one arrowhead:
  <defs><marker id="a" markerWidth="9" markerHeight="9" refX="6" refY="3"
    orient="auto"><path d="M0,0 L0,6 L8,3 z" style="fill:var(--svg-ink)"/></marker></defs>

Quality bar (match the hand-crafted reference scenes):
- Actually MODEL the concept's mechanics — show inputs, the transformation, and
  outputs / before-and-after, with labelled parts and directional arrows. Not a
  single box with a title.
- Use the indigo accent to draw the eye to the most important element.
- 4-9 labelled elements; readable font sizes (>=11).
- Use unique `id`s if you define markers/gradients, so multiple diagrams on the
  page never collide (e.g. id="arr-<concept-slug>").
- Monospace (font-family="JetBrains Mono, monospace") only for code/identifiers.

NO OVERLAP — lay it out on a grid and keep clear spacing (text overlapping other
text or spilling off-canvas is the #1 defect; avoid it):
- Keep EVERY element fully inside the viewBox with >=12px padding from all edges.
- Leave >=22px of vertical space between separate text lines; never stack two
  <text> elements closer than 18px vertically or let their characters touch.
- A label belongs to ONE shape: place it centered inside a box that is tall/wide
  enough for it, or just outside the shape with a gap — never across another shape
  or arrow. Size each box to fit its text (roughly 8px per character wide,
  >=24px tall); do not cram long text into a small box.
- Estimate text width (~chars x fontSize x 0.6) and ensure neighbouring labels do
  not collide; shorten labels or move them rather than overlapping.
- Space the 4-9 elements evenly across the 440x240 canvas with clear gutters
  between columns/rows; prefer fewer, well-spaced elements over a crowded diagram."""

"""Shared visual-design spec for AI-generated SVG diagrams.

The frontend injects these SVGs inline and renders them on a dark OR light theme,
so colors MUST come from the theme's CSS variables (via the `style` attribute,
exactly like the hand-crafted reference scenes). Hardcoded colors like #f8f9fa
look broken on the opposite theme — never use them.

Imported by skill2 (analogy visual) and skill3 (explanation diagram).
"""
from __future__ import annotations

VISUAL_SPEC = """VISUAL — build a COLORFUL, illustrative, self-contained inline SVG (no <script>,
no external assets, no <image>). It should feel like a friendly infographic, not a
plain box-and-arrow flowchart. Aim for "instantly clear AND visually appealing".
Each card is COLOR-CODED and carries a SIMPLE FLAT ICON that depicts the thing it
names, so the learner SEES the analogy, not just reads labels in boxes.
It must look good on BOTH a dark and a light background, so DO NOT hardcode colors
— use the theme CSS variables through the `style` attribute, exactly as shown.

Canvas: <svg viewBox="0 0 W H" width="W" height="H"
  xmlns="http://www.w3.org/2000/svg" font-family="Inter, system-ui, sans-serif"> ... </svg>
(the renderer scales it to fit). ~520x220 is a good starting size for a 3-card row,
or ~360x300 for a vertical column when the steps read top-to-bottom.

CRITICAL — the viewBox MUST contain every element. After you place the cards,
arrows and captions, set W and H so the RIGHTMOST/BOTTOMMOST edge of any element
is still >= 16px inside the viewBox (i.e. W >= last card's x+width + 16, similarly
for H). If three 160-wide cards with gaps reach x=588, then W must be >= ~604 —
do NOT leave W at 520 and let the last card spill off the edge. Content drawn
outside the viewBox is CLIPPED and the diagram looks cut in half. Widen the
viewBox to fit the content; never crop the content to fit a fixed viewBox.

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

COLOR — this is what makes it appealing. Give EACH card its OWN accent color from
the palette below (cycle through them left-to-right so adjacent cards differ). A
colored card = soft fill + matching solid stroke + matching-colored icon + a title
in --svg-text. Use the SOFT variant for the card fill and the SOLID variant for the
stroke and icon, e.g. a card: style="fill:var(--amber-soft);stroke:var(--amber)".

Theme variables you MUST use (set them via style="...", not fill="..."):
  --svg-text      main labels / titles (always readable on both themes)
  --svg-ink       neutral outlines + arrows + connector lines
  --svg-ink-light faint helper strokes, secondary caption text
  --svg-surface   neutral/plain card fill (use sparingly)
Accent pairs — pick a DIFFERENT one per card (solid for stroke+icon, -soft for fill):
  --indigo  / --indigo-soft     (use this on the ONE most important "concept" card)
  --cyan    / --cyan-soft
  --emerald / --emerald-soft
  --amber   / --amber-soft
  --purple  / --purple-soft
  --pink    / --pink-soft
EVERY <text> MUST carry an explicit fill via style. Titles use fill:var(--svg-text);
captions use fill:var(--svg-ink-light); a colored mini-label may use its card accent.
A <text> with no fill defaults to black and is INVISIBLE on the dark theme — never
emit one.

ICONS — each card MUST contain ONE simple, flat pictogram of the real-world thing
it represents, drawn from basic SVG primitives (<rect>, <circle>, <line>, <path>,
<polygon>) in the card's accent color (style="fill:var(--cyan)" or stroke for line
art). Keep it ~28-36px, sitting ABOVE or LEFT of the title inside the card, clearly
inside the card edges. Examples of "depict the thing, don't just label it":
  newspaper -> a rect with 3 short horizontal lines (a masthead bar on top);
  envelope  -> a rect with a triangular flap (a "V" path) on top;
  box/array -> 3 small squares in a row; database -> stacked ellipses;
  function  -> a rounded box with an arrow passing through; clock -> circle + 2 hands.
Pick the clearest everyday icon for THIS analogy; it does not need to be perfect,
just instantly recognizable.

GRADIENTS & POLISH (optional but encouraged) — you MAY define a soft linearGradient
in <defs> and use it as a fill for the hero card or a header band, and add rx>=10
rounded corners everywhere. Keep it tasteful; never let polish hurt readability.

INTERACTIVITY — wrap each card (its rect AND its label together) in
<g class="ilm-node"> ... </g>, one group per card. The renderer makes these
hover-interactive (hovering a card highlights it and dims the rest). Arrows/
connectors between cards stay OUTSIDE the groups.

Example color-coded card (rect + flat icon + centered title, grouped) and arrow:
  <g class="ilm-node">
    <rect x="24" y="64" width="150" height="92" rx="12"
          style="fill:var(--amber-soft);stroke:var(--amber)" stroke-width="1.6"/>
    <!-- newspaper icon, in the card's accent -->
    <rect x="86" y="78" width="26" height="20" rx="2"
          style="fill:none;stroke:var(--amber)" stroke-width="1.8"/>
    <line x1="90" y1="84" x2="108" y2="84" style="stroke:var(--amber)" stroke-width="1.6"/>
    <line x1="90" y1="90" x2="108" y2="90" style="stroke:var(--amber)" stroke-width="1.6"/>
    <text x="99" y="122" text-anchor="middle" font-size="14" font-weight="600"
          style="fill:var(--svg-text)">Newspaper</text>
    <text x="99" y="140" text-anchor="middle" font-size="11"
          style="fill:var(--svg-ink-light)">Front page</text>
  </g>
  <line x1="174" y1="110" x2="210" y2="110" style="stroke:var(--svg-ink)"
        stroke-width="1.8" marker-end="url(#a)"/>
  define one arrowhead (unique id per diagram so multiple diagrams never collide):
  <defs><marker id="arr-X" markerWidth="9" markerHeight="9" refX="6" refY="3"
    orient="auto"><path d="M0,0 L0,6 L8,3 z" style="fill:var(--svg-ink)"/></marker></defs>

Quality bar:
- Show the concept's flow simply: input -> what happens -> result (or before ->
  after). 3-4 cards is ideal; never more than 5.
- COLOR every card with a distinct accent + soft fill; reserve --indigo for the ONE
  most important "concept" card so it reads as the punchline.
- Every card has a recognizable flat ICON of the thing it names — never a bare
  box with only text. The icon is what makes it feel illustrated, not diagrammed.
- Readable fonts: titles >= 13, captions >= 11.
- Monospace (font-family="JetBrains Mono, monospace") only for code/identifiers.
- Prefer FEWER, larger, well-spaced cards over a crowded diagram. Give cards room
  for the icon AND the label (>= 88 tall when both are present). If it feels busy,
  remove a card. Zero overlap and clear color-coding beat completeness."""

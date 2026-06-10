import type { QuizQuestion } from "../types";

/* ════════════════════════════════════════════════════════════════════════
   QUIZ DATA — per-topic, following the formula:
     1 recall + 1 tell-it-apart + 1 apply + 1 why/analysis + (optional) 1 scenario
   Simple topics: 3 questions (recall + tell-apart + apply)
   Complex topics: 4 questions (adds why/analysis or scenario)
   ════════════════════════════════════════════════════════════════════════ */

export const TOPIC_QUIZZES: Record<string, QuizQuestion[]> = {
  /* ── Topic 1: Media Query basics — 3 questions ──────────── */
  topic1: [
    {
      type: "Recall", badgeClass: "badge-recall",
      q: "What is the main purpose of a CSS media query?",
      opts: [
        "To define new HTML elements",
        "To apply different CSS based on device characteristics",
        "To minify CSS files for production",
        "To load external font files",
      ],
      correct: 1,
      explanation: "<strong>Answer: B.</strong> Media queries let you apply different CSS rules depending on the device — viewport width, device type, orientation, and more. This is the core mechanism behind responsive design.",
    },
    {
      type: "Tell it apart", badgeClass: "badge-distinguish",
      q: "How does a media query differ from a regular CSS rule?",
      opts: [
        "It uses JavaScript instead of CSS",
        "It always applies — there is no difference",
        "It wraps CSS in a condition that only fires on matching devices",
        "It can only be written inside HTML files",
      ],
      correct: 2,
      explanation: "<strong>Answer: C.</strong> A regular CSS rule applies everywhere. A media query wraps rules in a condition (like <code>max-width: 600px</code>) so the styles only apply when the device matches.",
    },
    {
      type: "Apply", badgeClass: "badge-apply",
      q: "Which syntax correctly applies styles when the screen is at least 768px wide?",
      opts: [
        "@media screen (min-width: 768px) { … }",
        "@media screen and (min-width: 768px) { … }",
        "@media: screen min-width 768px { … }",
        "@media (screen, min-width: 768px) { … }",
      ],
      correct: 1,
      explanation: "<strong>Answer: B.</strong> The valid syntax is <code>@media</code> + media type + <code>and</code> + a feature expression in parentheses. The keyword <code>and</code> is required to combine the type with the feature.",
    },
  ],

  /* ── Topic 2: Media Types — 3 questions ─────────────────── */
  topic2: [
    {
      type: "Recall", badgeClass: "badge-recall",
      q: "If you write @media (max-width: 600px) { … } without specifying a media type, which type is assumed by default?",
      opts: ["screen", "print", "all", "none"],
      correct: 2,
      explanation: "<strong>Answer: all.</strong> When the media type is omitted, it defaults to <code>all</code> — meaning the query applies across every device category (screen, print, tv, etc.).",
    },
    {
      type: "Tell it apart", badgeClass: "badge-distinguish",
      q: "What's the practical difference between @media screen and @media print?",
      opts: [
        "They behave identically",
        "screen targets visual displays; print targets printers and print preview",
        "screen is faster; print is slower",
        "print only works on mobile devices",
      ],
      correct: 1,
      explanation: "<strong>Answer: B.</strong> <code>screen</code> covers phones, tablets, laptops, and desktops. <code>print</code> applies only when the page is printed — useful for hiding navigation, ads, and sidebars from the paper version.",
    },
    {
      type: "Apply", badgeClass: "badge-apply",
      q: "Which media query correctly targets a printer to hide ads?",
      opts: [
        "@media (print: yes) { .ads { display: none; } }",
        "@media print { .ads { display: none; } }",
        "@media @printer { .ads { display: none; } }",
        "@media output: print { .ads { display: none; } }",
      ],
      correct: 1,
      explanation: "<strong>Answer: B.</strong> <code>print</code> is itself the media type — used directly after <code>@media</code>. Inside the block, you can hide elements that shouldn't appear on paper.",
    },
  ],

  /* ── Topic 3: Width Features — 4 questions ──────────────── */
  topic3: [
    {
      type: "Recall", badgeClass: "badge-recall",
      q: "What does @media (min-width: 768px) { … } mean?",
      opts: [
        "Apply styles only when viewport is exactly 768px",
        "Apply styles when viewport is 768px or wider",
        "Apply styles when viewport is 768px or narrower",
        "Apply styles only on mobile devices",
      ],
      correct: 1,
      explanation: "<strong>Answer: B.</strong> <code>min-width</code> means 'at least this wide'. So <code>min-width: 768px</code> fires when the viewport is 768px or any larger size.",
    },
    {
      type: "Tell it apart", badgeClass: "badge-distinguish",
      q: "What is the difference between max-width: 768px and min-width: 768px?",
      opts: [
        "They check the same thing — both fire at exactly 768px",
        "max-width fires when viewport ≤ 768px; min-width fires when viewport ≥ 768px",
        "max-width is for desktops, min-width is for mobiles",
        "min-width only works inside an and operator",
      ],
      correct: 1,
      explanation: "<strong>Answer: B.</strong> <code>max-width</code> means 'at most' — fires on smaller screens. <code>min-width</code> means 'at least' — fires on larger screens. They're opposite-facing thresholds.",
    },
    {
      type: "Apply", badgeClass: "badge-apply",
      q: "To target screens that are AT MOST 600px wide, which query is correct?",
      opts: [
        "@media (min-width: 600px) { … }",
        "@media (max-width: 600px) { … }",
        "@media (width <= 600px) { … }",
        "@media width:600px-less { … }",
      ],
      correct: 1,
      explanation: "<strong>Answer: B.</strong> <code>max-width: 600px</code> reads as 'the maximum width is 600px' — so the rule fires when the viewport is 600px or smaller.",
    },
    {
      type: "Why / Analysis", badgeClass: "badge-analysis",
      q: "Why do many designers prefer min-width (mobile-first) over max-width (desktop-first)?",
      opts: [
        "min-width is faster to compile",
        "It starts with the simplest layout (mobile) and progressively adds complexity for larger screens",
        "max-width is deprecated in modern CSS",
        "min-width is the only one supported on phones",
      ],
      correct: 1,
      explanation: "<strong>Answer: B.</strong> Mobile-first uses <code>min-width</code> to layer enhancements as the screen grows. This is generally more maintainable than starting with a complex desktop layout and shrinking it down.",
    },
  ],

  /* ── Topic 4: Orientation — 3 questions ─────────────────── */
  topic4: [
    {
      type: "Recall", badgeClass: "badge-recall",
      q: "A device is in PORTRAIT orientation when…",
      opts: [
        "Width equals height",
        "Height is greater than width",
        "Width is greater than height",
        "The screen is rotated sideways",
      ],
      correct: 1,
      explanation: "<strong>Answer: B.</strong> Portrait = tall. The viewport height is greater than the width — like holding a phone upright. Landscape is the opposite.",
    },
    {
      type: "Tell it apart", badgeClass: "badge-distinguish",
      q: "When does (orientation: landscape) match instead of (orientation: portrait)?",
      opts: [
        "Whenever the device is a laptop",
        "Whenever the viewport's width is greater than its height",
        "Only when the user rotates a phone",
        "Only on touchscreens",
      ],
      correct: 1,
      explanation: "<strong>Answer: B.</strong> Orientation is purely about the viewport's width vs height ratio — not the device type. A wide browser window on a laptop matches <code>landscape</code> just as a sideways phone does.",
    },
    {
      type: "Apply", badgeClass: "badge-apply",
      q: "How would you target only landscape devices?",
      opts: [
        "@media landscape { … }",
        "@media (orientation: landscape) { … }",
        "@media (rotate: 90) { … }",
        "@media: orientation landscape { … }",
      ],
      correct: 1,
      explanation: "<strong>Answer: B.</strong> <code>orientation</code> is a media feature, not a media type. The valid values are <code>portrait</code> and <code>landscape</code>, written inside parentheses.",
    },
  ],

  /* ── Topic 5: Operators — 4 questions (complex topic) ──── */
  topic5: [
    {
      type: "Recall", badgeClass: "badge-recall",
      q: "Which operator combines conditions with strict AND logic (both must be true)?",
      opts: [", (comma)", "and", "not", "or"],
      correct: 1,
      explanation: "<strong>Answer: and.</strong> The <code>and</code> operator requires every condition in the chain to be true. The comma is OR, and <code>not</code> negates the whole query.",
    },
    {
      type: "Tell it apart", badgeClass: "badge-distinguish",
      q: "What is the difference between `and` and `,` (comma) in a media query?",
      opts: [
        "They behave the same way",
        "and = both must be true; comma = either is enough (OR)",
        "and = either one; comma = both required",
        "comma is only used between media types",
      ],
      correct: 1,
      explanation: "<strong>Answer: B.</strong> <code>and</code> requires every condition to hold (AND). The comma is logical OR — if any of the queries matches, the block fires.",
    },
    {
      type: "Why / Analysis", badgeClass: "badge-analysis",
      q: "Why is @media not (min-width: 600px) { … } considered invalid?",
      opts: [
        "not can only be used with max-width",
        "The not operator requires a media type to be specified",
        "not is not a real CSS operator",
        "min-width can't be inside parentheses",
      ],
      correct: 1,
      explanation: "<strong>Answer: B.</strong> When using <code>not</code>, you must include a media type. The correct form: <code>@media not screen and (min-width: 600px)</code>.",
    },
    {
      type: "Scenario", badgeClass: "badge-scenario",
      q: "You want a yellow background when the screen is in landscape OR at least 600px wide. Which query is correct?",
      opts: [
        "@media (orientation: landscape) and (min-width: 600px) { … }",
        "@media (orientation: landscape), (min-width: 600px) { … }",
        "@media not (orientation: portrait) and not (max-width: 599px) { … }",
        "@media (orientation: portrait) (min-width: 600px) { … }",
      ],
      correct: 1,
      explanation: "<strong>Answer: B.</strong> The comma operator gives you OR logic — the styles apply if either condition is true. Option A would need BOTH to match.",
    },
  ],
};
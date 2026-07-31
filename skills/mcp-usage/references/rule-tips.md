# Rule-specific remediation tips

Generic `remediate` guidance is usually sufficient, but the rules below need human-quality judgment. Apply these conventions on top of the tool's output.

## image-alt (and related image rules)

Write alt text that conveys only the **informative content** of the image — not where it appears or what surrounds it.

- Describe the message, not the decoration. For a hero image with overlaid text "Book Your Journey", the alt is `Book Your Journey`, not "Hero banner showing a scenic train and the text 'Book Your Journey'".
- Never repeat text already rendered adjacent to the image (captions, headings, card titles, fares, dates). Screen reader users would hear it twice.
- For images composed of meaningful sub-elements (e.g. service icons in an SVG), describe those elements specifically. If the source asset has comments identifying its parts, open it and use them.
- Purely decorative images take an empty alt (`alt=""`) so assistive tech skips them.

## color-contrast

- The fix is almost always a color value change, not markup. Adjust the foreground or background to meet the contrast ratio in the guidance (4.5:1 for normal text, 3:1 for large text).
- Prefer adjusting the design token / CSS variable that drives the color rather than hard-coding a one-off value, so the fix holds across the design system.
- Do not "fix" by enlarging text unless the design genuinely calls for large text — that changes layout, not just contrast.

## button-name / link-name

- An actionable element must expose an accessible name. For icon-only buttons/links, add visually hidden text or an `aria-label` describing the action ("Close dialog", "Search"), not the icon ("X icon").
- Prefer real text content; use `aria-label` only when visible text is not feasible.

## label (form fields)

- Associate every input with a programmatic label via `<label for>`, wrapping `<label>`, or `aria-labelledby`. Placeholder text is not a label.
- The label should match the visible prompt so voice-control users can target it by name.

## Keyboard IGT rules (from `igt`)

These come from the keyboard IGT, not axe-core, and their rule IDs are IGT-specific. Fixes are usually structural rather than attribute-level.

- **`keyboard-inaccessible`** — the element cannot be reached by Tab. Prefer making it a natively focusable element (`<button>`, `<a href>`, real form control) over bolting `tabindex="0"` onto a `<div>`. If it must stay a `<div>`, it needs `tabindex="0"`, a correct `role`, and keyboard event handlers (Enter/Space) — not just a click handler.
- **`focus-indicator-missing`** — focus is invisible. Never resolve this by suppressing the finding; restore a visible indicator with `:focus-visible` styling that meets 3:1 contrast against the adjacent background. Watch for a global `outline: none` reset as the root cause — fix it there, not per-component.
- **`focus-on-hidden-item`** — a hidden or off-screen element is still in the tab order. Remove it from the tree (`display: none`), or use `hidden` / `inert` on the container, rather than `visibility` tricks that leave it focusable. Common in closed menus, off-canvas drawers, and carousel slides.
- **`contrast-link-infocus-4.5-1`** — the control meets contrast at rest but not on hover/focus. Fix the hover/focus token, not the resting one; this is easy to miss because a static scan passes.

`aiReasoning` on these issues explains the AI's inference and will sometimes admit uncertainty about DOM it could not fully resolve (e.g. a label whose associated input it did not see). Read it as a lead, confirm in the code, then fix.

## Advanced Rules findings (`isAdvanced: true`)

Advanced Rules use screenshots, computer vision, and LLMs, so these findings are probabilistic and often about *quality* rather than a binary conformance failure. Verify each against the rendered UI before changing code.

- **Pseudo-headings** — text styled to look like a heading but marked up as a `<p>`/`<div>`/`<span>`. The fix is real heading markup at the correct level, not `role="heading"` bolted on, and not restyling the text to look less heading-like.
- **Unhelpful alt text** — the image has *an* `alt`, so axe-core passes, but the text is uninformative (`"image"`, `"photo"`, a filename, or duplicated adjacent text). Apply the image-alt conventions above; this is the finding those conventions exist for.
- **Text contrast** — cases axe-core cannot compute, e.g. text over a gradient, image, or video background. Fix the design (solid backing, scrim, token change) rather than nudging a single hex value until a checker passes.

If a finding is genuinely wrong for your UI, say so and move on — do not contort the code to satisfy it. Persistent noise is a signal to pass `advancedRules: "precise"` on the next scan, or `"disabled"` for a purely deterministic one. Both are per-scan, so no restart is needed; `AXE_ADVANCED_RULES` sets the default when you want it to stick across every scan.

If the response's `advancedRules` block reports a `value` of `disabled` with `source` `unavailable` or `tier_locked`, Advanced Rules are not enabled for this account and none of these findings will ever appear — the absence is a licensing state, not a clean bill of health. A `source` of `org_policy_locked` means a fixed org policy overrode the preset you asked for.

## General principles

- Fix the root cause in shared components, not each instance, when a violation repeats across the page.
- Re-run `analyze` after fixes; some changes (especially contrast and ARIA) can introduce new violations elsewhere.
- Contrast and target-size results depend on viewport. The default scan viewport is **1000×1080**; re-check responsive breakpoints with `viewportWidth`/`viewportHeight` (e.g. 375×812) before calling a page clean.

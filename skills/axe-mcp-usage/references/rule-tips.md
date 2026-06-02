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

## General principles

- Fix the root cause in shared components, not each instance, when a violation repeats across the page.
- Re-run `analyze` after fixes; some changes (especially contrast and ARIA) can introduce new violations elsewhere.

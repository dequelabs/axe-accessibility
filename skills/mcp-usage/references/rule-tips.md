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

## Guided-test rules (from `analyze` with `igtTools`)

These come from guided tests, not axe-core, and their rule IDs are IGT-specific. Fixes are usually structural rather than attribute-level. The tool that produced an issue is in its `manifestGuide`.

### Keyboard (`manifestGuide: "keyboard"`)

- **`keyboard-inaccessible`** — the element cannot be reached by Tab. Prefer making it a natively focusable element (`<button>`, `<a href>`, real form control) over bolting `tabindex="0"` onto a `<div>`. If it must stay a `<div>`, it needs `tabindex="0"`, a correct `role`, and keyboard event handlers (Enter/Space) — not just a click handler.
- **`focus-indicator-missing`** — focus is invisible. Never resolve this by suppressing the finding; restore a visible indicator with `:focus-visible` styling that meets 3:1 contrast against the adjacent background. Watch for a global `outline: none` reset as the root cause — fix it there, not per-component.
- **`focus-on-hidden-item`** — a hidden or off-screen element is still in the tab order. Remove it from the tree (`display: none`), or use `hidden` / `inert` on the container, rather than `visibility` tricks that leave it focusable. Common in closed menus, off-canvas drawers, and carousel slides.
- **`contrast-link-infocus-4.5-1`** — the control meets contrast at rest but not on hover/focus. Fix the hover/focus token, not the resting one; this is easy to miss because a static scan passes.

- **`keyboard-trap`** — focus enters an element and cannot leave by keyboard. It also halts the run (`terminatedReason: "keyboard-trap"`), so elements after the trap were **not tested**. Fix the trap, then re-run the keyboard test before calling the page clean.

### Interactive elements (`manifestGuide: "interactive-elements"`)

- **`aria-role-missing`** — the element behaves like a control but exposes no role, or the wrong one. Replace it with the native element (`<button>`, `<a href>`, `<input type="checkbox">`) — that gives the role, focusability, and keyboard behavior at once. Add a `role` only when a native element is genuinely impossible, and then also add the `tabindex` and key handlers that role implies. A `role` on its own is a fix in name only.
- **`aria-name-missing-incorrect`** — the accessible name is missing, or it doesn't describe the control's purpose. Name the action or destination ("Save settings", "Toggle notifications"), not the visual ("toggle", "icon", "click here"). Prefer visible text; use `aria-label`/`aria-labelledby` only when visible text isn't feasible, and keep the visible label as the start of the accessible name so voice-control users can target it.
- **State findings** — a toggle, expander, or tab must expose its state (`aria-pressed`, `aria-expanded`, `aria-selected`, `aria-checked`) and **update it** when the state changes. A static attribute that never changes is the usual bug.
- The same element often fails both this test and the keyboard test (a clickable `<div>` gets `aria-role-missing` *and* `keyboard-inaccessible`). Converting it to a native element fixes both — apply one fix, not two.

### Modal (`manifestGuide: "aria-modal"`)

These issues arrive with an empty `source`. Find the dialog through `selector` before remediating — see the field mapping.

- **`custom-dialog`** — something looks and acts like a modal dialog but lacks dialog semantics. Prefer the native `<dialog>` element opened with `showModal()`, which provides the role, modality, `Esc` handling, and inert background. Otherwise use `role="dialog"` (or `alertdialog` for confirmations), `aria-modal="true"`, and `aria-labelledby` pointing at the dialog's heading.
- **`focus-modal-none`** — opening the modal leaves focus behind on the page. On open, move focus into the dialog: to the first meaningful control, or to the heading (`tabindex="-1"`) when the content should be read first. Never move it to a destructive action like "Delete".
- **`focus-modal-moves-outside`** — Tab escapes the modal into the page behind it. Make the background inert (`inert` on the page container, or the native `<dialog>` with `showModal()`) rather than hand-writing a Tab-key trap, which is easy to get wrong with shadow DOM and dynamic content.
- **Dismissal and focus restoration** — `Esc` and a visible close control must close the modal, and focus must return to the control that opened it. These are assessed only when the run used `modalTriggerSelector`. `terminatedReason: "dismissibility-unavailable"` means they were **not tested**, so don't report them as passing.
- A `terminatedReason` of `modal-not-detected`, `trigger-not-resolved`, or `modal-selector-not-resolved` means nothing was assessed. Check the selector the user gave you rather than reporting the modal as clean.

`aiReasoning` on guided-test issues explains the AI's inference and will sometimes admit uncertainty about DOM it could not fully resolve (e.g. a label whose associated input it did not see). Read it as a lead, confirm in the code, then fix.

## Advanced Rules findings (`isAdvanced: true`)

Advanced Rules use screenshots, computer vision, and LLMs, so these findings are probabilistic and often about *quality* rather than a binary conformance failure. Verify each against the rendered UI before changing code.

Their rule IDs carry an **`advanced/`** prefix, so they are identifiable by rule ID as well as by `isAdvanced`. Field shape is identical to an axe-core issue.

- **`advanced/text-contrast`** — contrast cases axe-core cannot compute, e.g. text over a gradient, image, or video background. Fix the design (solid backing, scrim, token change) rather than nudging a single hex value until a checker passes.
- **`advanced/css-focus-visible`** — a control's focus indicator is hidden by CSS. Same fix discipline as the keyboard guided test's `focus-indicator-missing`: restore a visible `:focus-visible` style meeting 3:1 contrast, and look for a global `outline: none` reset as the root cause rather than patching one component. These two findings often co-occur — remediate the shared cause once rather than both reports separately.
- **Pseudo-headings** — text styled to look like a heading but marked up as a `<p>`/`<div>`/`<span>`. The fix is real heading markup at the correct level, not `role="heading"` bolted on, and not restyling the text to look less heading-like.
- **Unhelpful alt text** — the image has *an* `alt`, so axe-core passes, but the text is uninformative (`"image"`, `"photo"`, a filename, or duplicated adjacent text). Apply the image-alt conventions above; this is the finding those conventions exist for.

If a finding is genuinely wrong for your UI, say so and move on — do not contort the code to satisfy it. Persistent noise is a signal to pass `advancedRules: "precise"` on the next scan, or `"disabled"` for a purely deterministic one. Both are per-scan, so no restart is needed; `AXE_ADVANCED_RULES` sets the default when you want it to stick across every scan.

If the response's `advancedRules` block reports a `value` of `disabled` with `source` `unavailable` or `tier_locked`, Advanced Rules are not enabled for this account and none of these findings will ever appear — the absence is a licensing state, not a clean bill of health. A `source` of `org_policy_locked` means a fixed org policy overrode the preset you asked for.

## General principles

- Fix the root cause in shared components, not each instance, when a violation repeats across the page.
- Re-run `analyze` after fixes; some changes (especially contrast and ARIA) can introduce new violations elsewhere.
- Contrast and target-size results depend on viewport. The default scan viewport is **1000×1080**; re-check responsive breakpoints with `viewportWidth`/`viewportHeight` (e.g. 375×812) before calling a page clean.

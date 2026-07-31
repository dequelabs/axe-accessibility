# Canonical workflow text

Embed the section below into the target file. Replace `analyze` / `igt` / `remediate` with the target's tool-naming convention (see `targets.md`). Keep the structure intact — especially the batching rule and the field mapping, which are the two things agents get wrong.

---

## Accessibility Testing and Remediation Workflow

### MANDATORY WORKFLOW — DO NOT DEVIATE

This workflow applies to ANY UI code generation or modification — not only when accessibility is explicitly requested. Whenever you create, modify, or refactor user-facing UI (new components, new pages, edits to existing components), follow this exact workflow before considering the task complete.

The Axe MCP Server provides three tools: `analyze` (scan a page), `igt` (keyboard testing), and `remediate` (batched AI fix guidance).

#### 1. Analysis phase

When checking pages for accessibility issues:

- Use the Axe MCP `analyze` tool to scan the page. Do NOT manually identify accessibility issues.
- Always provide the complete URL being analyzed (scheme, host, and port — e.g. `http://localhost:3000/path`).
- Read the issues from the response's **`data`** array. The response is `{ data: [...issues], pageUrl, advancedRules }`.
- To scope a scan to one component, pass `selector` (a CSS string, or an array to cross iframe/shadow-DOM boundaries). A selector that matches nothing fails the whole scan.
- For pages behind a login, pass `before` steps (`click` / `fill` / `waitFor`). For environment-routing or session cookies, pass `cookies` — these are set before navigation, so unlike `before` they can affect how the first request is routed. Put secrets ONLY in a `fill` step's `value` or a cookie's `value`, never in a selector or a cookie name.
- Optionally pass `screenshot: { format: "png" }` to get the viewport back as an image. Do this deliberately, not on every scan — images cost a lot of tokens. The capture is from just before the scan started; never claim an element "looks fine" or "wasn't flagged" based on the screenshot.
- Default scan viewport is 1000×1080. Set `viewportWidth`/`viewportHeight` to check other breakpoints; contrast and target-size results depend on it.
- When the user names an Advanced Rules confidence level — "run the scan with thorough advanced rules", "disable advanced rules" — pass it as `advancedRules`: `"precise"` | `"balanced"` | `"thorough"` | `"disabled"`. It is per scan and takes precedence over the server's `AXE_ADVANCED_RULES`. If the parameter is missing from the tool's schema, Advanced Rules are not enabled for this account (the server hides it in that case) — report that rather than retrying.
- Read the response's `advancedRules` block to see what was actually applied. A `source` of `org_policy_locked` means a fixed org policy overrode your request; `tier_locked` or `unavailable` means no `isAdvanced` findings can appear at all, so do not report their absence as a clean result.

#### 2. Remediation phase

- Call `remediate` **ONCE with all issues from that scan in a single batched `issues` array** (max 25 per call). Do NOT call `remediate` once per issue.
- Send EVERY issue instance, each with its own `id`. Do NOT collapse issues that share a rule. Guidance is generated per issue and tailored to the element you send, and a single rule spans very different situations — three `color-contrast` violations on a disabled control, a badge on a brand color, and text over a hero image need three different fixes. Collapsing them yields guidance that fits one site and misfits the rest.
- Map each issue as follows:
  - `id` — a unique string you invent (e.g. `color-contrast-0`). REQUIRED; used to correlate results back to inputs.
  - `pageUrl` — the analyze response's top-level `pageUrl`.
  - `rule` — the issue's `rule`.
  - `elementHtml` — the issue's **`source`** (the element's HTML, not its selector).
  - `remediation` — the issue's **`summary`** (where the actionable detail lives) plus `description` and `helpText` for context.
- Do NOT pass the issue's own `remediation` field into this parameter. On an analyze issue, `remediation` is an OBJECT of raw axe check data (`{any, all, none}`), not the string the tool expects.
- Correlate results back by `id` and check each entry's `status`. A batch can partially fail; a failed entry has `error` instead of `remediation`.
- Review the guidance before changing code. `code_fix` is a suggested snippet based only on the element HTML you sent — adapt it to the real component instead of pasting it.
- `remediate` consumes AI credits **per issue in the batch**, not per call. Batching is the tool's contract, not a discount — cost scales with the number of issues sent. When a scan returns a lot of issues (more than ~30), report the count to the user before remediating rather than spending unprompted.
- If asked to reduce cost, first narrow scope (critical/serious impact only, or one region). Only then collapse repeated instances, grouping by rule + **normalized** element identity: strip positional indices from the selector path (`:nth-child(7)` -> `:nth-child(n)`). Do NOT group on the raw selector (unique per element) or raw source (too strict). For content-dependent rules — `image-alt`, `link-name`, `button-name`, `label`, `frame-title` — also require matching `src`/text/`href`, since N cards with N different images share one normalized selector but need N different names. Always state what was collapsed.

#### 3. Verification phase

After applying fixes:

- Re-run `analyze` on the same URL to confirm the issues are resolved.
- Confirm zero violations before considering the task complete. If issues remain, repeat the loop.

#### 4. Keyboard testing (when the UI is interactive)

`analyze` cannot detect focus order, focus traps, or focus visibility. For menus, dialogs, custom widgets, and forms, also run:

```
igt({ url, igtTools: ["keyboard"] })
```

Issues are at `data.keyboard.issues`. They have a DIFFERENT shape from analyze issues — `help`, `summary`, `impact`, `rule`, `selector`, `source`, `manifestGuide`, `aiReasoning`, with no `description`/`helpText`. Map `remediation` from `summary` + `help` + `aiReasoning`. Their `rule` values are IGT IDs (`keyboard-inaccessible`, `focus-indicator-missing`, ...), not axe-core rules — pass them through unchanged. They can go into the same batched `remediate` call.

### Workflow example

```
1. analyze          -> read issues from response.data
2. ONE remediate    -> every issue instance in one batched array, correlate results by id
3. apply fixes to source
4. analyze          -> verify
5. repeat until zero violations
6. igt (keyboard) for interactive UI
```

### Enforcement

- NEVER skip the `remediate` tool when fixing accessibility issues.
- NEVER call `remediate` once per issue — it is a batched tool.
- ALWAYS use `analyze` and `remediate` as specified, and `igt` for interactive UI.

### Trusting findings: deterministic vs. AI-derived

Not all findings carry the same weight — check the flags on each issue:

- **`isAdvanced: false`** — deterministic axe-core. The engine is tuned for zero false positives; treat these as authoritative and never hand-author or contradict them.
- **`isAdvanced: true`** — from Advanced Rules, which use screenshots, computer vision, and LLMs to catch what axe-core cannot (pseudo-headings, unhelpful alt text, some contrast issues). These are strong signals but probabilistic. Verify against the actual UI or code before changing anything; a finding you have genuinely assessed as a false positive should be reported, not worked around.
- **`isNeedsReview: true`** — needs human judgment; `impact` may be null with the estimate in `potentialImpact`.
- **`isBestPractice: true`** — not a WCAG failure. Fix when cheap; never block on it.

`aiReasoning` on `igt` issues is likewise AI-generated — a lead to confirm in code, not ground truth.

### Image alt text

When remediating an image without alt text, describe ONLY the informative content of the image itself — not its surrounding context, and never repeat text already rendered adjacent to the image. For images composed of meaningful sub-elements (e.g. icons inside an SVG), inspect the asset and describe those specific elements. Use `alt=""` for purely decorative images.

---

## Project-specific note pattern (optional)

When a repo has asset conventions worth encoding, append a concrete rule, for example:

> Images sourced from `public/<dir>/*.svg` carry meaning via overlaid icons identified by `<!-- ... -->` comments in the SVG. When writing alt text for such an `<img>`, open the SVG, read the comments, and describe only those elements — do not repeat adjacent card text.

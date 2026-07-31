---
name: mcp-usage
description: This skill should be used whenever the Axe MCP Server tools (analyze, igt, remediate) are available and the task involves accessibility, a11y, WCAG conformance, keyboard navigation, or "fix accessibility issues" on web UI. It teaches the correct analyze/igt -> remediate -> verify workflow, the exact field mapping between the tools, batching rules, and credit-aware usage. Trigger phrases include "check accessibility", "scan for a11y issues", "fix accessibility violations", "make this accessible", "axe scan", "test keyboard accessibility", "check tab order".
---

# Using the Axe MCP Server effectively

Deque's Axe MCP Server exposes three tools:

- **`analyze`** — scan a URL with the real Axe DevTools engine (axe-core rules plus Advanced Rules).
- **`igt`** — run Automated Intelligent Guided Tests; currently the **keyboard** IGT, which tabs the page and reports keyboard operability issues.
- **`remediate`** — get AI fix guidance for a **batch** of issues from either tool.

The tools may appear under a client-specific prefix (for example `mcp__axe-mcp-server__analyze` in Claude Code, `mcp_axe-mcp-server_analyze` in Copilot). Match whatever naming the host client uses; the behavior is identical.

## Core workflow: analyze -> remediate -> verify

Apply this loop whenever creating, modifying, or auditing user-facing UI — not only when accessibility is explicitly requested:

1. **Analyze.** Call `analyze` with the complete URL of the page (including scheme and port, e.g. `http://localhost:3000/checkout`). Never pass a partial path. Do not manually inspect the DOM for issues — the tool is the source of truth.
2. **Remediate.** Collect **all** issues from that one scan and send them in **one batched `remediate` call** (up to 25 issues). Send every instance — do **not** collapse issues that share a rule. Apply the returned guidance to the source code. Do not invent fixes without consulting `remediate`.
3. **Verify.** Re-run `analyze` on the same URL and confirm zero violations before considering the task complete. If issues remain, repeat.

Add a keyboard pass with `igt` when the UI has interactive elements (menus, dialogs, custom widgets, forms) — see "Keyboard testing with `igt`" below. `analyze` does not cover focus order, focus traps, or focus visibility.

## `remediate` is batched, not per-issue

This is the single most common source of error. `remediate` takes **one `issues` array** (min 1, **max 25**) and returns one result per issue:

```
remediate({ issues: [
  { id: "color-contrast-0", pageUrl, rule, elementHtml, remediation },
  { id: "image-alt-0",      pageUrl, rule, elementHtml, remediation }
]})
```

- **`id` is required** and is a string you invent, unique within the call (convention: rule ID + counter). It exists only so results can be correlated back to inputs — match on it rather than on array position.
- **`pageUrl` is per-issue and optional.** Pass it when you have it; it improves the guidance.
- **Never call `remediate` once per issue.** One call per `analyze`/`igt` pass.
- More than 25 issues: split into sequential batches of 25.

### Send every instance — do not collapse by rule

Guidance is generated **per issue**, tailored to the specific element you sent. Two violations of the same rule usually need different fixes: `color-contrast` on a disabled button, a badge on a brand background, and body text over a hero image are one rule and three different remediations. Collapsing them to one representative throws that away and gives you guidance that fits one site and misfits the others.

So: give every issue its own entry with its own `id`, even when the `rule` repeats. Let the tool tailor each one.

When a violation does trace back to one shared component, that is a fact about where to **apply** the fix — not a reason to ask for less guidance.

### Economizing, when asked

Cost scales with issue count, so collapsing repeats is the lever when the user wants to spend less — and for large pages that may be a common request. Do it **only** when the user asks or when a scan is big enough that you should ask them first (more than ~30 issues: report the count and rule breakdown, let them choose). Prefer narrowing scope (critical/serious only, or one region) over collapsing, since that costs no guidance quality.

When you do collapse, the key is **`rule` + normalized element identity**:

- Do **not** match on raw `selector` — axe emits a unique one per element, so exact matching collapses nothing (23 `target-size` issues on a real page gave 23 distinct selectors).
- Do **not** match on raw `source` — per-instance attributes make it too strict (those same 23 issues had 23 distinct sources) and it says nothing about tree position.
- **Normalize the selector path**: strip positional indices (`:nth-child(7)` -> `:nth-child(n)`), then group. That collapsed 23 `target-size` -> 19, 8 `link-name` -> 6, 4 `image-alt` -> 2 on the same page.

**Content-dependent rules need more than element identity.** Twelve cards with twelve different images share one normalized selector but need twelve *different* alt strings. For `image-alt`, `link-name`/`button-name`, `label`, and `frame-title`, additionally require the content-bearing part (`src`, text, `href`) to match. Structural and style rules (`color-contrast`, `target-size`, `aria-*`) are safe on element identity alone.

Always state what you collapsed (`47 issues -> 18 requests, 29 collapsed across 6 components`) — a silent collapse is indistinguishable from a clean scan.

See **`references/cost-control.md`** for the full recipe, the measured collapse table, representative selection, and how to apply collapsed results.

Each result is `{ id, status: "ok" | "error", remediation | error }`. On success, `remediation` contains `general_description`, `remediation` (the steps), and `code_fix` (a suggested corrected snippet — review it, do not paste it blindly, since it reflects only the element HTML you sent, not your framework or component structure). **Check `status` per issue** — a batch can partially fail, and a failed entry carries `error` instead of `remediation`.

## Field mapping (tool output -> remediate input)

`analyze` returns `{ data: [...issues], pageUrl, advancedRules }` — the issues are under **`data`**, not `issues`.

| remediate field | From an `analyze` issue | From an `igt` issue |
|---|---|---|
| `id` | invented by you, unique in the batch | invented by you, unique in the batch |
| `pageUrl` | the response's top-level `pageUrl` | the response's top-level `pageUrl` |
| `rule` | the issue's `rule` | the issue's `rule` |
| `elementHtml` | the issue's `source` | the issue's `source` |
| `remediation` | `summary` + `description` + `helpText` | `summary` + `help` + `aiReasoning` (when non-null) |

Anchor the `remediation` text on **`summary`** — that is where the per-issue actionable detail lives ("Fix any of the following: ..."). `description`/`helpText` are generic rule-level text and only add context.

> **Name collision — read this.** An `analyze` issue *also* has a field called `remediation`, and it is an **object** (`{any, all, none}` of raw axe check results), not the string `remediate` wants. Never pass `issue.remediation` through as the `remediation` argument. Build that string from `summary`/`description`/`helpText` as above.

See `references/field-mapping.md` for the full issue shape and a worked batched example.

## Reading `analyze` results

Beyond the remediation fields, each issue carries flags that should change how you treat it:

- **`isAdvanced`** — the finding came from **Advanced Rules** (screenshots + computer vision + LLMs), not deterministic axe-core. These catch things axe-core cannot (pseudo-headings, unhelpful alt text, some contrast cases) but are **probabilistic**: verify an advanced finding against the actual UI before changing code, and it is legitimate to conclude one is a false positive.
- **`isNeedsReview`** — needs human judgment; `impact` may be null with the estimate in `potentialImpact`.
- **`isBestPractice`** — not a WCAG failure. Fix when cheap; never block on it unless explicitly requested.
- `impact`, `selector` (an array — an iframe/shadow path, not a CSS string), `tags` (WCAG/EN-301-549/RGAA mappings), `helpUrl`.

**Deterministic vs. probabilistic:** axe-core findings (`isAdvanced: false`) are deterministic and tuned for zero false positives — treat them as authoritative and never hand-author or contradict them. Advanced findings are AI-derived and are strong signals, not verdicts. This distinction matters when a "zero violations" goal will not converge: an advanced finding you have genuinely assessed as a false positive should be reported and set aside, not fixed by contorting the code.

The response's `advancedRules` block reports the resolved setting, e.g. `{ "value": "balanced", "source": "org_default" }`. If it reads `{ "value": "disabled", "source": "unavailable" }`, the organization is not entitled to Advanced Rules (or the entitlement lookup failed) — the scan ran axe-core only, so **no `isAdvanced` findings will appear at all**. Check this block before concluding a page has no advanced findings. The preset comes from the `advancedRules` parameter when you pass one, otherwise the server's `AXE_ADVANCED_RULES` default, otherwise the organization's setting — and `source` tells you which applied.

## Scoping and setup parameters on `analyze`

- **`selector`** — scope the scan to a region instead of the whole page. A single CSS string for a top-frame element (`"#main"`), or an **array to traverse iframe / shadow-DOM boundaries** (`["iframe#checkout", "#form"]`). Use it when working on one component. Note it **fails the scan** if nothing matches (`Selector did not match any element on the page`), so only use selectors you have confirmed exist.
- **`cookies`** — injected into the browser context **before** navigation, so they ride the very first request. Use for environment-routing cookies (staging/feature-branch selectors an edge layer reads) or a pre-authenticated session cookie. Each needs `name`, `value`, `domain` (leading dot to share across subdomains); optional `path`, `sameSite`, `secure`, `httpOnly`, `expires`.
- **`before`** — `click` / `fill` / `waitFor` steps that run **after** navigation, to log in or reach a view. Available on `igt` too.
- **`viewportWidth` / `viewportHeight`** — default is **1000×1080**. Set both explicitly to test responsive breakpoints (e.g. 375×812 for mobile); contrast and target-size results genuinely differ by viewport.
- **`screenshot`** — an **object**, not a boolean: `{ format: "png" | "jpeg" }` (default `png`). Returns the viewport as an MCP image content block alongside the report. Request it **deliberately, not on every scan** — images are expensive in tokens. Capture is best-effort and never fails a scan; if it times out, the results still return with a note.
- **`advancedRules`** — per-scan confidence preset: `"precise"` (highest confidence, fewest findings), `"balanced"`, `"thorough"` (lowest confidence, most findings), or `"disabled"` for a purely deterministic axe-core scan. Overrides the server's `AXE_ADVANCED_RULES` default for this scan only.
- **`chromePath`** — npm distribution only; overrides `AXE_CHROME_PATH`. Rejected under Docker.

**Pass `advancedRules` when the user asks for it.** A request like "run a11y analysis with thorough advanced rules" or "scan with advanced rules disabled" maps directly onto this parameter. Note that it may not appear in the tool's advertised JSON schema, so you will not necessarily discover it by inspecting the tool — it is accepted regardless. Confirm it took effect by reading the response's `advancedRules` block, which reports the resolved value and its source.

**Reading a screenshot honestly:** the image is the page as it looked *the moment before* `axe.run()` started. On SPAs, re-renders, `useEffect` work, animations, and in-flight requests mean the DOM axe actually scanned can differ from the picture. Do not describe an element as visible-but-not-flagged based on the screenshot — that skew, not a missed violation, is the usual explanation.

`cookies` vs. `before`: cookies influence **how the initial request is routed**; `before` cannot, because it runs after the page has already loaded.

**Secrets rule (both `before` and `cookies`):** selectors and cookie **names** appear in server logs and error messages. Only a `fill` step's `value` and a cookie's `value` are treated as sensitive and never logged. Put passwords, tokens, and session values there — never in a selector or a cookie name.

## Keyboard testing with `igt`

```
igt({ url, igtTools: ["keyboard"] })
```

Returns `{ data: { keyboard: { status, issues, igtElements } }, pageUrl }`. A `terminatedReason` is present if the run stopped early — check it before trusting coverage.

The keyboard IGT finds what `analyze` structurally cannot: elements unreachable by keyboard, focus traps, missing or insufficient focus indicators, wrong ARIA roles on interactive elements, and elements that submit on focus.

**Its issues have a different shape from `analyze` issues:** `help`, `summary`, `impact`, `rule`, `selector`, `source`, `manifestGuide`, `aiReasoning`. There is **no `description` or `helpText`** — map `help` + `summary` (+ `aiReasoning` where non-null) into `remediation`.

Its `rule` values are **IGT rule IDs, not axe-core rule IDs** — e.g. `keyboard-inaccessible`, `focus-indicator-missing`, `focus-on-hidden-item`, `contrast-link-infocus-4.5-1`. Pass them to `remediate` as-is; do not try to translate them to axe rules.

`aiReasoning` is AI-generated and sometimes reasons about elements it cannot fully see (it will say so). Read it as a lead to confirm in the code, not as ground truth. `igt` findings can be batched into the same `remediate` call as `analyze` findings.

## Credit and output awareness

- `remediate` consumes AI credits from the organization's allocation, **per issue in the batch** — not per call. Batching is the tool's contract, not a discount: cost scales with how many issues you send, so 25 issues in one call costs about 25 times one issue. Never call it speculatively or to "explore" — only for real issues returned by `analyze`/`igt`.
- Because cost tracks issue count, a large page is a genuine spend decision. When a scan returns a lot of issues (say more than ~30), tell the user the count before remediating rather than working through hundreds of issues unprompted.
- `analyze` does not consume remediation credits, so re-running it to verify is cheap and expected.
- **Both scan tools can return very large payloads** — a real-world page can produce ~85KB from `analyze` and several hundred KB from `igt` (whose `igtElements` inventory dominates). This can exceed a client's tool-result limit. Mitigate by scoping `analyze` with `selector`, and when reading a spilled result file, extract just the issue fields you need rather than re-reading the whole payload.

## Rule-specific guidance

Some rules need judgment beyond the generic fix guidance. The most important is image alt text: describe only the informative content of the image, not its surrounding context, and never repeat text already present near the image. Consult `references/rule-tips.md` for `image-alt`, `color-contrast`, `link-name`/`button-name`, form labeling, the keyboard IGT rules, and Advanced Rules findings before applying fixes for those.

## Additional resources

- **`references/field-mapping.md`** — full `analyze` and `igt` issue shapes, and a complete batched analyze -> remediate -> apply example.
- **`references/rule-tips.md`** — per-rule remediation nuances.
- **`references/cost-control.md`** — economizing on credits: the `rule` + normalized-element dedup key, which rules are unsafe to collapse, and how to report and apply collapsed results.

To set up the server, generate agent instructions, or run the loop automatically, use the companion skills: `/axe-accessibility:mcp-setup`, `/axe-accessibility:mcp-generate-instructions`, and `/axe-accessibility:mcp-audit`.

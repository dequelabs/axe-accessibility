---
name: mcp-usage
description: This skill should be used whenever the Axe MCP Server tools (analyze, remediate) are available and the task involves accessibility, a11y, WCAG conformance, keyboard navigation, modal dialogs, accessible names and roles, or "fix accessibility issues" on web UI. It teaches the correct analyze -> remediate -> verify workflow, guided tests (keyboard, interactive elements, modal) through analyze's igtTools, the exact field mapping between the tools, batching rules, and credit-aware usage. Trigger phrases include "check accessibility", "scan for a11y issues", "fix accessibility violations", "make this accessible", "axe scan", "test keyboard accessibility", "check tab order", "check focus traps", "test my modal", "check the dialog's focus handling", "audit accessible names and roles", "check my custom controls".
---

# Using the Axe MCP Server effectively

Deque's Axe MCP Server exposes two tools:

- **`analyze`** — scan a URL with the real Axe DevTools engine (axe-core rules plus Advanced Rules). On request, it also runs **guided tests** against the same page in the same call through its `igtTools` parameter: `keyboard`, `interactive-elements`, and `modal`.
- **`remediate`** — get AI fix guidance for a **batch** of issues, from the axe scan and guided tests alike.

Some servers also list a standalone **`igt`** tool titled "IGT (Deprecated)". It is kept only for backward compatibility. **Do not call it** — pass `igtTools` to `analyze` instead.

The tools may appear under a client-specific prefix (for example `mcp__axe-mcp-server__analyze` in Claude Code, `mcp_axe-mcp-server_analyze` in Copilot). Match whatever naming the host client uses; the behavior is identical.

### When this guidance and the server disagree, the server wins

The shapes and parameters described here are those of **server 1.6.0**. The bundled
config tracks `axe-mcp-server@^1.6.0`, so the running server may be a newer 1.x
release. That matters because the server builds its own tool descriptions and input
schemas at startup, from the account's entitlements — `advancedRules` and `igtTools`
are both dropped from the published schema when unavailable, and the `igtTools` enum
narrows to the tools the account actually has.

So treat the live tool description and schema as authoritative, and this file as
guidance for reading what comes back:

- A parameter described here but absent from the schema means the account is not
  entitled to it, not that the server is old. Do not pass it.
- If a response does not match the shapes below, re-read the tool's own description
  before assuming the call failed.
- `serverInfo.version` in the MCP `initialize` response reports the running version if
  you need to check it.

## Core workflow: analyze -> remediate -> verify

Apply this loop whenever creating, modifying, or auditing user-facing UI — not only when accessibility is explicitly requested:

1. **Analyze.** Call `analyze` with the complete URL of the page (including scheme and port, e.g. `http://localhost:3000/checkout`). Never pass a partial path. Do not manually inspect the DOM for issues — the tool is the source of truth.
2. **Remediate.** Collect **all** issues from that one scan and send them in **one batched `remediate` call** (up to 25 issues). Send every instance — do **not** collapse issues that share a rule. Apply the returned guidance to the source code. Do not invent fixes without consulting `remediate`.
3. **Verify.** Re-run `analyze` on the same URL and confirm zero violations before considering the task complete. If issues remain, repeat.

**Guided tests run only when the user asks for what they cover** — keyboard operability, accessible names/roles/states of controls, or modal behavior. They use AI and consume credits, so never add `igtTools` by default, and never add it to the loop's verification scans on your own. When a request does call for one, see "Guided tests" below. When the user has not asked but the UI clearly warrants one (a new dialog, a custom widget), you may *suggest* the relevant test and its cost — do not run it unprompted.

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
- **`elementHtml` must be non-empty on every entry.** A single empty value fails the **whole** batch. Modal guided-test issues come back with `source: ""` — rebuild their HTML from `selector` first (see the field mapping).
- **Never call `remediate` once per issue.** One call per `analyze` pass, covering its axe and guided-test issues together.
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

`analyze` returns `{ data: [...issues], pageUrl, advancedRules }` — the issues are under **`data`**, not `issues`. With `igtTools`, `data` becomes `{ axe: [...issues], igt: { "<tool>": {...} } }`.

| remediate field | From an axe issue | From a guided-test issue |
|---|---|---|
| `id` | invented by you, unique in the batch | invented by you, unique in the batch |
| `pageUrl` | the response's top-level `pageUrl` | the response's top-level `pageUrl` |
| `rule` | the issue's `rule` | the issue's `rule` |
| `elementHtml` | the issue's `source` | the issue's `source`; **if empty, the element's HTML found via `selector`** |
| `remediation` | `summary` + `description` + `helpText` | `summary` + `help` + `aiReasoning` (when non-null) |

Anchor the `remediation` text on **`summary`** — that is where the per-issue actionable detail lives ("Fix any of the following: ..."). `description`/`helpText` are generic rule-level text and only add context.

> **Name collision — read this.** An `analyze` issue *also* has a field called `remediation`, and it is an **object** (`{any, all, none}` of raw axe check results), not the string `remediate` wants. Never pass `issue.remediation` through as the `remediation` argument. Build that string from `summary`/`description`/`helpText` as above.

See `references/field-mapping.md` for the full issue shape and a worked batched example.

## Reading `analyze` results

Beyond the remediation fields, each issue carries flags that should change how you treat it:

- **`isAdvanced`** — the finding came from **Advanced Rules** (screenshots + computer vision + LLMs), not deterministic axe-core. These catch things axe-core cannot (pseudo-headings, unhelpful alt text, some contrast cases) but are **probabilistic**: verify an advanced finding against the actual UI before changing code, and it is legitimate to conclude one is a false positive. Their `rule` IDs are namespaced with an **`advanced/`** prefix (e.g. `advanced/text-contrast`, `advanced/css-focus-visible`), so you can spot them by rule ID as well as by the flag. Otherwise they carry exactly the same fields as axe-core issues, so the `remediate` mapping is unchanged.
- **`isNeedsReview`** — needs human judgment; `impact` may be null with the estimate in `potentialImpact`.
- **`isBestPractice`** — not a WCAG failure. Fix when cheap; never block on it unless explicitly requested.
- `impact`, `selector` (an array — an iframe/shadow path, not a CSS string), `tags` (WCAG/EN-301-549/RGAA mappings), `helpUrl`.

**Deterministic vs. probabilistic:** axe-core findings (`isAdvanced: false`) are deterministic and tuned for zero false positives — treat them as authoritative and never hand-author or contradict them. Advanced findings are AI-derived and are strong signals, not verdicts. This distinction matters when a "zero violations" goal will not converge: an advanced finding you have genuinely assessed as a false positive should be reported and set aside, not fixed by contorting the code.

Every response carries an `advancedRules` block reporting what was actually applied and why — `{ value, source }`. **Read `source` before concluding anything about advanced findings**, because several values mean "none will ever appear":

| `source` | meaning |
|---|---|
| `tool_arg` | your `advancedRules` parameter won |
| `env_var` | the server's `AXE_ADVANCED_RULES` won |
| `org_default` | the organization's configured policy applied |
| `org_policy_locked` | org policy is fixed; your override was **rejected** — the policy value applied instead |
| `tier_locked` | free tier; Advanced Rules cannot be enabled by any means |
| `unavailable` | not enabled for this caller, or the entitlement lookup failed |

Precedence is: `advancedRules` parameter > `AXE_ADVANCED_RULES` > org policy — except that a **fixed** org policy beats any override, and the free-tier gate beats everything.

So `{ "value": "disabled", "source": "unavailable" }` or `"tier_locked"` means the scan ran axe-core only and contains **no `isAdvanced` findings at all**. That absence is a licensing state, not a clean bill of health. And `"org_policy_locked"` means your requested preset did not take effect — worth surfacing rather than assuming it did.

## Scoping and setup parameters on `analyze`

- **`selector`** — scope the scan to a region instead of the whole page. A single CSS string for a top-frame element (`"#main"`), or an **array to traverse iframe / shadow-DOM boundaries** (`["iframe#checkout", "#form"]`). Use it when working on one component. Note it **fails the scan** if nothing matches (`Selector did not match any element on the page`), so only use selectors you have confirmed exist.
- **`cookies`** — injected into the browser context **before** navigation, so they ride the very first request. Use for environment-routing cookies (staging/feature-branch selectors an edge layer reads) or a pre-authenticated session cookie. Each needs `name`, `value`, `domain` (leading dot to share across subdomains); optional `path`, `sameSite`, `secure`, `httpOnly`, `expires`.
- **`before`** — `click` / `fill` / `waitFor` steps that run **after** navigation, to log in or reach a view. Guided tests run on the page state `before` leaves behind. When the server advertises it, a `{ action: "wait", ms }` step pauses for a fixed time. Use it only when nothing observable marks readiness — prefer `waitFor` on a real selector. Each step is capped at 5000ms and the total across steps at 10000ms. Going over either rejects the request.
- **`viewportWidth` / `viewportHeight`** — default is **1000×1080**. Set both explicitly to test responsive breakpoints (e.g. 375×812 for mobile); contrast and target-size results genuinely differ by viewport.
- **`screenshot`** — an **object**, not a boolean: `{}` for a PNG, or `{ format: "jpeg" }`. It returns the viewport as an MCP image content block alongside the report. Request it **only when the user asks to see or save the page** — images are expensive in tokens. Capture is best-effort and never fails a scan; if it times out, the results still return with a note. It covers the visible viewport only, so pass a tall `viewportHeight` (e.g. `4096`) to capture more of the page.
  - **`save: true`** writes the image to disk under a server-chosen name (`AXE_SCREENSHOT_DIR`, default OS temp). **`saveTo: "/abs/path.png"`** writes to an **absolute** path (relative paths are rejected; a directory gets a generated filename). The written path comes back in the response's `messages`.
  - **`inline: false`** (only together with a save) drops the image block from the response. It returns just the path and saves the image tokens on the next turn, which is the right choice when the client doesn't render images or the user only wants the file. If the save fails, the image is returned inline anyway so the capture isn't lost.
  - Under Docker, a saved file lands inside the container and needs a mounted volume to reach the host.
- **`advancedRules`** — per-scan confidence preset: `"precise"` (90%, fewest findings), `"balanced"` (70%), `"thorough"` (50%, most findings), or `"disabled"` for a purely deterministic axe-core scan. The percentage strings `"90%"` / `"70%"` / `"50%"` are accepted as aliases, and input is trimmed and lowercased. An unrecognized value is a validation error, not a silent fallback. Takes precedence over the server's `AXE_ADVANCED_RULES`.
- **`chromePath`** — npm distribution only; overrides `AXE_CHROME_PATH`. Rejected under Docker.
- **`igtTools`, `includeSelectors`, `modalTriggerSelector`, `modalSelector`, `interactive`/`sessionID`/`selectedIDs`** — guided-test parameters; see "Guided tests" below.

**Pass `advancedRules` when the user asks for it.** A request like "run a11y analysis with thorough advanced rules" or "scan with advanced rules disabled" maps directly onto this parameter.

**It is conditionally advertised.** The server removes `advancedRules` from `analyze`'s published schema when Advanced Rules are not enabled for the caller — so on an unentitled or free-tier account the parameter is absent from the tool definition and passing it is silently ignored (no validation error, because the field is not in the schema). `igtTools` works the same way: its enum lists only the guided tests the account is entitled to, and the whole parameter disappears when none are. A missing parameter almost always reflects the account's entitlement rather than an old server, so do not conclude the feature was removed. If you need to rule the version out, `serverInfo.version` in the MCP `initialize` response reports what is running.

**Reading a screenshot honestly:** the image is the page as it looked *the moment before* `axe.run()` started. On SPAs, re-renders, `useEffect` work, animations, and in-flight requests mean the DOM axe actually scanned can differ from the picture. Do not describe an element as visible-but-not-flagged based on the screenshot — that skew, not a missed violation, is the usual explanation.

`cookies` vs. `before`: cookies influence **how the initial request is routed**; `before` cannot, because it runs after the page has already loaded.

**Secrets rule (both `before` and `cookies`):** selectors and cookie **names** appear in server logs and error messages. Only a `fill` step's `value` and a cookie's `value` are treated as sensitive and never logged. Put passwords, tokens, and session values there — never in a selector or a cookie name.

## Guided tests (`igtTools` on `analyze`)

Guided tests are Intelligent Guided Tests (IGT) that drive the page the way a tester would, with AI judging the results. They find what a static scan structurally cannot. They run **after** the axe scan, in the same browser and the same call:

```
analyze({ url, igtTools: ["keyboard"] })
```

| `igtTools` entry | Run it when the user asks about | Finds |
|---|---|---|
| `keyboard` | keyboard access, tab order, focus traps, focus visibility | unreachable elements, focus traps, missing/insufficient focus indicators, wrong ARIA roles, elements that submit on focus |
| `interactive-elements` | accessible names, roles, or states of buttons, links, and custom controls | missing or incorrect accessible name, role, or state |
| `modal` | a dialog/modal's accessibility, focus handling, or dismissal | missing dialog semantics, focus not moved into the modal, focus escaping it, failed dismissal, focus not restored |

**Request only what the user asked for.** Each guided test uses AI and consumes credits. Do not add one by default, do not add all three "for completeness", and do not re-run them on every verification round. "Check keyboard accessibility" means `["keyboard"]`, not all three. Each tool may appear in the array once.

**Entitlement shows in the schema.** The `igtTools` enum lists only the tests this account can run, and the parameter is absent when it can run none. If the user asks for a test the schema does not offer, say it is not enabled for their account rather than calling the deprecated `igt` tool.

**Reading the result** (full shapes in `references/field-mapping.md`):

1. **Upgrade prompt first.** If `data.igt.upgradeRequired === true`, the account is on the free tier. Relay `data.igt.message` to the user and stop there for guided tests — there are no per-tool results. `data.axe` is still a normal scan; process it.
2. **Then each tool independently.** `data.igt.<tool>.status` is `"complete"` (with `issues`, `igtElements`) or `"error"` (with `error`, reported as "the `<tool>` test failed: `<error>`"). A per-tool error never fails the call or affects `data.axe`.
3. **Count issues with `issues.length`.** `igtElements` is everything processed, not a list of problems. Report elements with `analysisFailed: true` separately, as elements that could not be analyzed.
4. **Read `terminatedReason`** if present — the run ended early and results may be partial (`keyboard-trap`, `insufficient-credits`, `modal-not-detected`, ...). It is not an error.

**Issue shape:** `help`, `summary`, `impact`, `rule`, `selector`, `source`, `manifestGuide`, `aiReasoning`. There is **no `description` or `helpText`** — map `summary` + `help` (+ `aiReasoning` where non-null) into `remediation`. `rule` values are **IGT rule IDs** (`keyboard-inaccessible`, `aria-name-missing-incorrect`, `focus-modal-none`, ...), not axe-core ones. Pass them to `remediate` as-is. Guided-test issues go in the **same** batched `remediate` call as `data.axe` issues.

`aiReasoning` is AI-generated and sometimes reasons about elements it cannot fully see (it will say so). Read it as a lead to confirm in the code, not as ground truth.

### Targeting the `modal` test

The modal test needs to know which dialog to test. Use **only selectors the user gave you** — ask if they did not.

- **`modalTriggerSelector`** (preferred) — the control that opens the modal. The test clicks it, so it can also assess **dismissal and focus restoration**.
- **`modalSelector`** — the modal element itself. Use it alone when there is no trigger to name (the modal is open at load, or a `before` step opens it). Without a trigger, the run checks **structure only**: it always ends with `terminatedReason: "dismissibility-unavailable"`. An empty `issues` list then does not show the modal can be dismissed or restores focus — say so.
- **Both** — pass `modalSelector` alongside the trigger when you know the modal element. It is a fallback in case the test cannot identify the opened modal on its own. A run that needed the fallback is weaker evidence, and the result does not say whether it was used. Do not pass a trigger for a modal that is already open, because clicking the trigger usually closes it.
- Either selector can be an array to traverse iframes/shadow DOM, like `selector`. Both require `"modal"` in `igtTools`.

Modal issues come back with **`source: ""`**. Rebuild `elementHtml` from the `selector` before remediating, or the whole batch fails.

### Scoping the `interactive-elements` test

- **`includeSelectors`** — an array of CSS selectors that limits which detected controls the test analyzes (e.g. `["#checkout-form button"]`). This is distinct from `selector`, which scopes the axe scan. It requires `"interactive-elements"` in `igtTools`.
- **Phased selection** lets the user pick elements before any credits are spent. It is available only when `igtTools` is exactly `["interactive-elements"]` and the schema lists `interactive`. Call 1, with `interactive: true`, returns `status: "needs_selection"` plus `candidates` (`vnodeId`, `role`, `name`, `selector`) and `componentGroups`. Present those to the user. Call 2 passes `sessionID` and the chosen `selectedIDs` (vnodeIds), and it returns results for just those elements, with **no `data.axe`**. A session can be resumed **once** and expires after a few idle minutes (`session_expired`). Offer this when the page has many controls and the user cares about only some of them.

## Credit and output awareness

- **Two things spend AI credits: `remediate` and guided tests.** A plain `analyze` does not.
- `remediate` consumes AI credits from the organization's allocation, **per issue in the batch** — not per call. Batching is the tool's contract, not a discount: cost scales with how many issues you send, so 25 issues in one call costs about 25 times one issue. Never call it speculatively or to "explore" — only for real issues returned by `analyze`.
- **Guided tests (`igtTools`) consume credits too**, on every call that includes them. Request only the tests the user asked for, and don't repeat them on verification rounds unless the user wants the guided test re-checked. If a run ends with `terminatedReason: "insufficient-credits"`, tell the user rather than retrying.
- Because cost tracks issue count, a large page is a genuine spend decision. When a scan returns a lot of issues (say more than ~30), tell the user the count before remediating rather than working through hundreds of issues unprompted.
- `analyze` without `igtTools` does not consume credits, so re-running it to verify is cheap and expected.
- On a free-tier account, `remediate` returns `data.upgradeRequired: true` with a `message` instead of results. Relay the message rather than treating it as an empty batch.
- **Scans can return very large payloads** — a real-world page can produce ~85KB from a plain `analyze`, and guided tests add their `igtElements` inventory on top. This can exceed a client's tool-result limit. Mitigate by scoping `analyze` with `selector`, and when reading a spilled result file, extract just the issue fields you need rather than re-reading the whole payload.

## Rule-specific guidance

Some rules need judgment beyond the generic fix guidance. The most important is image alt text: describe only the informative content of the image, not its surrounding context, and never repeat text already present near the image. Consult `references/rule-tips.md` for `image-alt`, `color-contrast`, `link-name`/`button-name`, form labeling, the guided-test rules (keyboard, interactive elements, modal), and Advanced Rules findings before applying fixes for those.

## Additional resources

- **`references/field-mapping.md`** — full `analyze` and guided-test response and issue shapes, the upgrade-prompt and empty-`source` cases, phased selection, and a complete batched analyze -> remediate -> apply example.
- **`references/rule-tips.md`** — per-rule remediation nuances.
- **`references/cost-control.md`** — economizing on credits: the `rule` + normalized-element dedup key, which rules are unsafe to collapse, and how to report and apply collapsed results.

To set up the server, generate agent instructions, or run the loop automatically, use the companion skills: `/axe-accessibility:mcp-setup`, `/axe-accessibility:mcp-generate-instructions`, and `/axe-accessibility:mcp-audit`.

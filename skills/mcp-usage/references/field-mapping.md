# Tool output -> remediate field mapping

All shapes below are the wire format of Axe MCP Server 1.6.0, the release this guidance was written against. The bundled config tracks `^1.6.0`, so a running 1.x server may be newer. The server generates its own tool descriptions and schemas at runtime, so those are authoritative if they ever disagree with this file — check `serverInfo.version` from `initialize` to see what is running.

## `analyze` response

```
{
  "data": [ ...issues ],          // NOTE: issues live under `data`, not `issues`. With `igtTools`, `data` is `{ axe, igt }` — see "Guided tests" below
  "pageUrl": "https://example.com",
  "advancedRules": { "value": "balanced", "source": "org_default" }
}
```

`advancedRules` reports the **resolved** preset and which input won. `source` is one of `tool_arg`, `env_var`, `org_default`, `org_policy_locked` (fixed org policy rejected your override), `tier_locked` (free tier — cannot be enabled), or `unavailable` (not enabled for this caller, or the entitlement lookup failed). Precedence is parameter > `AXE_ADVANCED_RULES` > org policy, except a fixed policy and the free-tier gate override everything. A `value` of `disabled` with `tier_locked`/`unavailable` means the scan was axe-core only and contains no `isAdvanced` findings — a licensing state, not a clean page.

Note that on accounts where Advanced Rules are not enabled, the server also **removes `advancedRules` from `analyze`'s published input schema**, so the parameter is absent from the tool definition and passing it is ignored without error.

When `analyze` is called with `screenshot` set (e.g. `{}` or `{ format: "jpeg" }`), the response also carries an **MCP image content block** beside this JSON. The image shows the viewport immediately before `axe.run()` started, so on SPAs it can disagree with what axe actually scanned — treat it as context, not evidence about which elements were tested. With `save: true` or `saveTo`, the written path is reported in a top-level `messages` array (`"Screenshot saved to /abs/path.png"`); with `inline: false` on top of a successful save, the image block is omitted.

### Shape of an `analyze` issue

Every issue carries all of these fields:

- `rule` — the axe rule ID, e.g. `color-contrast`, `image-alt`, `button-name`, `label`, `link-name`.
- `source` — the HTML snippet of the violating element. **This is what `remediate.elementHtml` wants.**
- `summary` — the per-issue actionable detail, e.g. `"Fix any of the following:\n  aria-label attribute does not exist or is empty\n  ..."`. **Anchor `remediate.remediation` on this.**
- `description` — generic rule-level statement of what the rule checks ("Ensure buttons have discernible text").
- `helpText` — generic rule-level guidance ("Buttons must have discernible text").
- `helpUrl` — Deque University link for the rule.
- `impact` — `minor` | `moderate` | `serious` | `critical`, or `null` when needs-review.
- `potentialImpact` — estimated impact when `impact` is null.
- `selector` — an **array** forming a path (frame/shadow traversal), e.g. `["#player", "#movie_player"]`. Not a CSS string.
- `tags` — standards mappings, e.g. `["cat.aria", "wcag2a", "wcag412", "EN-301-549", "RGAAv4"]`.
- `isAdvanced` — true when the finding came from Advanced Rules (AI/CV) rather than deterministic axe-core.
- `isNeedsReview`, `isManual`, `isBestPractice` — triage flags.
- `remediation` — **an object**, not a string: `{ any: [], all: [], none: [...] }` of raw axe check results.
- `createdAt` — ISO timestamp.

> **The `remediation` trap.** The issue's own `remediation` is axe check data (`{any, all, none}`). The `remediation` field `remediate` expects is a **string you compose**. Passing the object through is the most common failure. Compose the string from `summary` + `description` + `helpText`.

## Guided tests: `analyze` with `igtTools`

Guided tests (Intelligent Guided Tests, IGT) run through **`analyze`**, not a separate tool. The standalone `igt` tool is deprecated — do not call it.

```
analyze({ url, igtTools: ["keyboard", "interactive-elements", "modal"] })
```

Passing `igtTools` changes the shape of `data` from an array to an object:

```
{
  "data": {
    "axe": [ ...analyze issues ],                    // same issues as a plain scan
    "igt": {
      "keyboard":             { "status": "complete", "issues": [...], "igtElements": [...] },
      "interactive-elements": { "status": "complete", "issues": [...], "igtElements": [...] },
      "modal":                { "status": "complete", "issues": [...], "igtElements": [...] }
    }
  },
  "pageUrl": "http://localhost:3000/",
  "advancedRules": { "value": "balanced", "source": "org_default" }
}
```

There is one `data.igt` entry per tool you requested, keyed by tool name. Without `igtTools`, `data` is the plain array described above — so check `Array.isArray(data)` before reading it.

### Check for the upgrade prompt first

On a free-tier account, `data.igt` is **not** keyed by tool. It is a single upgrade prompt:

```
"igt": { "upgradeRequired": true, "tool": "igt", "reason": "enterprise-feature", "message": "...", "upgradeUrl": "https://axe.deque.com" }
```

Test `data.igt.upgradeRequired === true` **before** reading any tool key. When it is set, relay `data.igt.message` to the user and do not report guided-test results — there are none. `data.axe` is unaffected and should be processed normally.

### Then read each tool's entry independently

Every tool entry has the same shape. Check `status` first:

| `status` | Carries | What to do |
|---|---|---|
| `"complete"` | `issues`, `igtElements`, optional `terminatedReason` | Read the issues. |
| `"error"` | `error` (string) | Report "the `<tool>` test failed: `<error>`". It does **not** make the call an error and does not affect `data.axe` or the other tools. |

Phased selection adds three more statuses on `interactive-elements` only — see "Phased selection" below.

- **The issue count is `issues.length`.** `igtElements` is every element the test processed — an inventory, **not** a list of issues. Report entries with `analysisFailed: true` separately, as elements that could not be analyzed.
- **`terminatedReason`**, when present, means the run ended before every step completed, so results may be partial. It is not an error. Report it with the result:

| tool | possible `terminatedReason` |
|---|---|
| any | `insufficient-credits`, `subscription-missing` |
| `keyboard` | `keyboard-trap` — a focus trap halted the run |
| `interactive-elements` | (none of its own) |
| `modal` | `modal-not-detected`, `modal-dismiss-failed`, `trigger-not-resolved`, `modal-selector-not-resolved`, `modal-selector-not-visible`, `modal-fallback-not-resolved`, `modal-fallback-not-visible`, and the **expected** `dismissibility-unavailable` / `focus-restoration-unavailable` |

A `modal` run without `modalTriggerSelector` **always** ends with `dismissibility-unavailable`. That is expected, not a failure — but it means an empty `issues` list says nothing about dismissal or focus restoration. Report it as a structural check only.

If the organization has machine learning disabled in its settings, every requested tool comes back as `status: "error"` explaining that guided tests require ML.

### Shape of a guided-test issue

All three tools emit the same issue shape. **It differs from `analyze` issues — fewer fields, and no `description`/`helpText`:**

- `rule` — an **IGT** rule ID, not an axe-core one. Pass it to `remediate` unchanged. Known IDs (not exhaustive):
  - `keyboard`: `keyboard-inaccessible`, `focus-indicator-missing`, `focus-on-hidden-item`, `contrast-link-infocus-4.5-1`, `keyboard-trap`
  - `interactive-elements`: `aria-role-missing`, `aria-name-missing-incorrect`
  - `modal`: `custom-dialog`, `focus-modal-none`, `focus-modal-moves-outside`
- `help` — short statement of the failure ("Keyboard focus is not placed on opened modal").
- `summary` — the fuller description of what is wrong.
- `source` — the element's HTML. Maps to `elementHtml`. **Can be an empty string — see the warning below.**
- `selector` — array, as with `analyze`.
- `impact` — same scale.
- `manifestGuide` — which guided test produced it: `"keyboard"`, `"interactive-elements"`, or **`"aria-modal"`** for the modal tool (not `"modal"`).
- `aiReasoning` — AI explanation of why this is a problem, or `null` (it is `null` for deterministic rules, and can be `null` even for AI-adjudicated ones). Often the most useful text for `remediate`; fold it in when non-null. It may openly reason about DOM it cannot fully resolve — treat it as a lead to confirm, not fact.

> **Empty `source` breaks the whole batch.** `modal` issues come back with `source: ""`. `remediate` rejects the **entire call** — not just that entry — if any `elementHtml` is empty (`issues[N].element_html must be a non-empty string`). Before batching, for every issue whose `source` is empty, find the element at its `selector` in the source code (or the rendered DOM) and send that element's real HTML as `elementHtml`. For a modal, send the dialog container with its contents. If you cannot find it, leave that issue out of the batch and report it separately. Never send `""`.

`igtElements` entries are small objects — `vnodeId`, `selector`, `tagName`, and, when known, `role`, `accessibleName`, `states`, `analysisFailed`. They help answer tab-order and inventory questions. Ignore them otherwise.

### Phased selection (`interactive-elements` only)

Phased selection lets the user choose which elements the `interactive-elements` test analyzes, so credits are not spent on elements they do not care about. It is available only when `igtTools` is **exactly** `["interactive-elements"]`.

1. `analyze({ url, igtTools: ["interactive-elements"], interactive: true })` — runs the axe scan and detects candidates **without** AI analysis:

   ```
   "igt": { "interactive-elements": {
     "status": "needs_selection",
     "sessionID": "...",
     "candidates": [ { "vnodeId": 3, "role": "link", "name": "Home", "state": [], "selector": [...] }, ... ],
     "componentGroups": { "intelligent": [ { "id": 0, "role": "link", "vnodeIds": [3, 4, 5] } ], "role": [...] }
   } }
   ```

   Show the candidates to the user and let them choose. `componentGroups` groups repeated components so the user can pick a whole group at once.
2. `analyze({ url, igtTools: ["interactive-elements"], sessionID, selectedIDs: [<vnodeId>, ...] })` — resumes the same paused run and returns `status: "complete"` for exactly those elements. **`data.axe` is absent on this call**, because the axe results came back on call 1. Every parameter other than `url`, `igtTools`, `sessionID`, and `selectedIDs` is ignored.

- `status: "invalid_selection"` (with `unknownIDs`) — a selected ID was not offered. The session stays paused; retry with offered IDs only.
- `status: "session_expired"` — the session is unknown, has timed out (a few minutes idle), or **was already resumed**. Each session can be resumed once. Start over with `interactive: true`.

## Building a `remediate` call

One call, all issues from one scan — `analyze` issues and guided-test issues together — `id` on each:

```
remediate({
  issues: [
    {
      id:          "<unique string you invent, e.g. rule + counter>",
      pageUrl:     <response .pageUrl>,          // optional but recommended
      rule:        <issue.rule>,
      elementHtml: <issue.source>,                // never "" — see the empty-source warning above
      remediation: <issue.summary> + " " + <issue.description> + " " + <issue.helpText>
                   // guided-test issue: <issue.summary> + " " + <issue.help> + " " + <issue.aiReasoning, when non-null>
    },
    ...up to 25
  ]
})
```

Response:

```
{
  "data": [
    { "id": "button-name-0", "status": "ok",
      "remediation": { "general_description": "...", "remediation": "...", "code_fix": "..." } },
    { "id": "image-alt-3", "status": "error", "error": { "code": "...", "message": "..." } }
  ]
}
```

Correlate by `id`, not by position. Check `status` on every entry — batches can partially fail.

On a free-tier account, `remediate` returns an upgrade prompt **instead of the array**: `{ "data": { "upgradeRequired": true, "tool": "remediate", "reason": "enterprise-feature", "message": "...", "upgradeUrl": "..." } }`. Check `data.upgradeRequired === true` before iterating, and relay `data.message` to the user. `code_fix` is a suggested snippet derived only from the `elementHtml` you sent; adapt it to the real component rather than pasting it.

## Worked example

1. `analyze({ url: "https://dequeuniversity.com/demo/mars" })` returns (abridged):

```json
{
  "pageUrl": "https://dequeuniversity.com/demo/mars",
  "advancedRules": { "value": "balanced", "source": "org_default" },
  "data": [
    {
      "rule": "button-name",
      "source": "<button class=\"ui-datepicker-trigger\" type=\"button\">\n</button>",
      "summary": "Fix any of the following:\n  Element does not have inner text that is visible to screen readers\n  aria-label attribute does not exist or is empty",
      "description": "Ensure buttons have discernible text",
      "helpText": "Buttons must have discernible text",
      "impact": "critical",
      "isAdvanced": false,
      "remediation": { "any": [], "all": [], "none": [] }
    },
    {
      "rule": "html-has-lang",
      "source": "<html class=\" js no-flexbox\">",
      "summary": "Fix any of the following:\n  The <html> element does not have a lang attribute",
      "description": "Ensure every HTML document has a lang attribute",
      "helpText": "<html> element must have a lang attribute",
      "impact": "serious",
      "isAdvanced": false,
      "remediation": { "any": [], "all": [], "none": [] }
    }
  ]
}
```

2. One batched `remediate` call for **both** issues:

```json
{
  "issues": [
    {
      "id": "button-name-0",
      "pageUrl": "https://dequeuniversity.com/demo/mars",
      "rule": "button-name",
      "elementHtml": "<button class=\"ui-datepicker-trigger\" type=\"button\">\n</button>",
      "remediation": "Fix any of the following: Element does not have inner text that is visible to screen readers; aria-label attribute does not exist or is empty. Ensure buttons have discernible text. Buttons must have discernible text."
    },
    {
      "id": "html-has-lang-0",
      "pageUrl": "https://dequeuniversity.com/demo/mars",
      "rule": "html-has-lang",
      "elementHtml": "<html class=\" js no-flexbox\">",
      "remediation": "Fix any of the following: The <html> element does not have a lang attribute. Ensure every HTML document has a lang attribute."
    }
  ]
}
```

3. Returns, in the same call:

```json
{
  "data": [
    { "id": "button-name-0", "status": "ok", "remediation": {
        "general_description": "The button element lacks discernible text or an accessible name...",
        "remediation": "Add an accessible name to the button by providing visible text inside the button, or by adding a meaningful aria-label...",
        "code_fix": "<button class=\"ui-datepicker-trigger\" type=\"button\" aria-label=\"Open calendar\"></button>" } },
    { "id": "html-has-lang-0", "status": "ok", "remediation": {
        "general_description": "The <html> element is missing the required lang attribute...",
        "remediation": "Add a lang attribute to the <html> element that reflects the primary language...",
        "code_fix": "<html lang=\"en\" class=\" js no-flexbox\">" } }
  ]
}
```

4. Apply each `code_fix` to the responsible source file (adapting to the real component), then re-run `analyze` on the same URL to confirm the issues are gone.

### Guided-test variant

When the user asked for a modal check, `analyze({ url, igtTools: ["modal"], modalTriggerSelector: "#open-modal" })` returns, among others:

```json
{ "rule": "focus-modal-none", "help": "Keyboard focus is not placed on opened modal",
  "summary": "When the modal dialog is activated, keyboard focus is not placed on/in it.",
  "impact": "serious", "selector": ["body > div#overlay:nth-of-type(1) > div#dlg.modal:nth-of-type(1)"],
  "source": "", "manifestGuide": "aria-modal", "aiReasoning": null }
```

`source` is empty, so find `#dlg` in the code and send its real HTML. It goes in the **same** `remediate` batch as the `data.axe` issues:

```json
{
  "id": "focus-modal-none-0",
  "pageUrl": "http://localhost:3000/",
  "rule": "focus-modal-none",
  "elementHtml": "<div id=\"dlg\" class=\"modal\"><h2>Are you sure?</h2><p>This cannot be undone.</p><button>Confirm</button></div>",
  "remediation": "When the modal dialog is activated, keyboard focus is not placed on/in it. Keyboard focus is not placed on opened modal."
}
```

Verify with the same `analyze` call — the same `igtTools`, which costs credits again — only if the user wants the guided test re-checked. Otherwise, verify the `data.axe` side with a plain `analyze`.

## Common mistakes

- **Calling `remediate` once per issue.** It is batched — one call per scan, up to 25 issues. (Credits are charged per issue either way, so this wastes round-trips rather than credits, but it contradicts the tool's contract.)
- **Collapsing issues that share a rule.** Guidance is per issue and tailored to the element sent; one rule spans very different fixes. Send every instance with its own `id`.
- **Omitting `id`.** It is required on every issue in the batch and must be unique within the call.
- **Passing `issue.remediation` as `remediation`.** That field is an object of axe check data. Compose the string from `summary`/`description`/`helpText`.
- **Reading issues from `response.issues`.** They are under `response.data`.
- **Using `selector` for `elementHtml`.** `remediate` needs the element's HTML (`source`); `selector` is an array path anyway.
- **Ignoring per-issue `status`.** A batch can partially fail; a failed entry has `error`, not `remediation`.
- **Mapping guided-test issues as if they were `analyze` issues.** They have no `description`/`helpText`; use `summary` + `help` + `aiReasoning`.
- **Sending a guided-test issue with an empty `source`.** One empty `elementHtml` fails the whole `remediate` call. Rebuild it from `selector` first.
- **Reading `data.igt.keyboard` without checking `data.igt.upgradeRequired`.** On free tier there is no `keyboard` key; relay the upgrade message instead.
- **Treating `igtElements.length` as the issue count.** It is the processed-element inventory; the count is `issues.length`.
- **Calling the standalone `igt` tool.** It is deprecated. Pass `igtTools` to `analyze`.
- Passing a relative path or a URL without scheme/port to `analyze` — always pass the full URL.

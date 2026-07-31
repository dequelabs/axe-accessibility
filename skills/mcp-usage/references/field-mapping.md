# Tool output -> remediate field mapping

All shapes below are the actual wire format of Axe MCP Server 1.4.0.

## `analyze` response

```
{
  "data": [ ...issues ],          // NOTE: issues live under `data`, not `issues`
  "pageUrl": "https://example.com",
  "advancedRules": { "value": "balanced", "source": "org_default" }
}
```

`advancedRules` reports the **resolved** preset and where it came from — the per-scan `advancedRules` parameter if you passed one, else the server's `AXE_ADVANCED_RULES`, else the organization default. `{"value": "disabled", "source": "unavailable"}` means Advanced Rules are not entitled on the account — the scan was axe-core only and contains no `isAdvanced` findings.

When `analyze` is called with `screenshot: { format: "png" | "jpeg" }`, the response also carries an **MCP image content block** beside this JSON. The image shows the viewport immediately before `axe.run()` started, so on SPAs it can disagree with what axe actually scanned — treat it as context, not evidence about which elements were tested.

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

## `igt` response

```
{
  "data": { "keyboard": { "status": "complete", "issues": [...], "igtElements": [...] } },
  "pageUrl": "https://example.com"
}
```

`terminatedReason` appears on the tool block when the run stopped early (absent or `null` on a clean run). `igtElements` is a large inventory of every element walked — useful for tab-order questions, but it is what makes `igt` payloads huge; ignore it unless you need it.

### Shape of an `igt` issue

**Different from `analyze` issues — fewer fields, and no `description`/`helpText`:**

- `rule` — an **IGT** rule ID, not an axe-core one: `keyboard-inaccessible`, `focus-indicator-missing`, `focus-on-hidden-item`, `contrast-link-infocus-4.5-1`.
- `help` — short statement of the failure ("Control text lacks 4.5:1 contrast ratio on hover or focus").
- `summary` — the fuller description of what is wrong.
- `source` — the element's HTML. Maps to `elementHtml`.
- `selector` — array, as with `analyze`.
- `impact` — same scale.
- `manifestGuide` — which IGT produced it, e.g. `"keyboard"`.
- `aiReasoning` — AI explanation of why this is a problem, or `null`. Often the most useful text for `remediate`; fold it in when non-null. It may openly reason about DOM it cannot fully resolve — treat it as a lead to confirm, not fact.

## Building a `remediate` call

One call, all issues from one scan, `id` on each:

```
remediate({
  issues: [
    {
      id:          "<unique string you invent, e.g. rule + counter>",
      pageUrl:     <response .pageUrl>,          // optional but recommended
      rule:        <issue.rule>,
      elementHtml: <issue.source>,
      remediation: <issue.summary> + " " + <issue.description> + " " + <issue.helpText>
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

Correlate by `id`, not by position. Check `status` on every entry — batches can partially fail. `code_fix` is a suggested snippet derived only from the `elementHtml` you sent; adapt it to the real component rather than pasting it.

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

## Common mistakes

- **Calling `remediate` once per issue.** It is batched — one call per scan, up to 25 issues. (Credits are charged per issue either way, so this wastes round-trips rather than credits, but it contradicts the tool's contract.)
- **Collapsing issues that share a rule.** Guidance is per issue and tailored to the element sent; one rule spans very different fixes. Send every instance with its own `id`.
- **Omitting `id`.** It is required on every issue in the batch and must be unique within the call.
- **Passing `issue.remediation` as `remediation`.** That field is an object of axe check data. Compose the string from `summary`/`description`/`helpText`.
- **Reading issues from `response.issues`.** They are under `response.data`.
- **Using `selector` for `elementHtml`.** `remediate` needs the element's HTML (`source`); `selector` is an array path anyway.
- **Ignoring per-issue `status`.** A batch can partially fail; a failed entry has `error`, not `remediation`.
- **Mapping `igt` issues as if they were `analyze` issues.** They have no `description`/`helpText`; use `help` + `summary` + `aiReasoning`.
- Passing a relative path or a URL without scheme/port to `analyze` — always pass the full URL.

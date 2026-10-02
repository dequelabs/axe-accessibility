---
name: mcp-audit
description: This skill should be used when the user asks to "audit accessibility", "fix all a11y issues on this page", "run the accessibility loop", "remediate accessibility until clean", "scan and fix localhost", "audit keyboard accessibility", "audit and fix my modal", or runs /axe-accessibility:mcp-audit. It drives the Axe MCP analyze -> remediate -> apply -> verify loop on a URL, applying fixes each round until violations reach zero or a round cap is hit, plus guided tests (keyboard, interactive elements, modal) when the user asks for them.
argument-hint: "<url> [max-rounds] (default url: detected localhost, default rounds: 5)"
allowed-tools: Bash, Read, Edit, Write, Glob, Grep
---

# Run the accessibility audit loop

Take a page from "has violations" to "zero violations" by iterating the Axe MCP workflow and applying real code fixes each round. This skill assumes the Axe MCP Server is already connected (`/axe-accessibility:mcp-setup`) and the `analyze` and `remediate` tools are available. (Ignore a standalone `igt` tool if the server lists one — it is deprecated; guided tests run through `analyze`.)

## Inputs

- **URL** (`$1`): the full URL to audit (scheme + host + port + path). If omitted, detect a running dev server: check `package.json` scripts and common ports (3000, 5173, 8080, 4321) and confirm the URL with the user before scanning. Never scan a partial path.
- **Max rounds** (`$2`): iteration cap, default **5**. The loop stops at zero violations or when this cap is reached, whichever comes first.
- **Guided tests**: only those the user's request names or clearly implies — "audit keyboard accessibility" means `keyboard`, "fix my modal" means `modal`, "check accessible names on the controls" means `interactive-elements`. A plain "audit this page" means **none**. Guided tests consume credits; see "Guided tests" below.

Reaching the page:

- **Behind a login or interaction:** pass `before` steps (`click` / `fill` / `waitFor`) to `analyze`. Put secrets only in a `fill` step's `value`, never in a selector.
- **Behind environment routing or a session cookie:** pass `cookies` instead — they are set *before* navigation, so they can influence how the first request is routed, which `before` cannot. Secrets go in a cookie's `value`, never its `name`.
- **Auditing one component rather than a whole page:** pass `selector` to scope the scan. Confirm the selector actually exists first — a non-matching selector fails the entire scan.

## The loop

Repeat until zero violations or the round cap:

1. **Analyze.** Call `analyze` with the full URL. Record the top-level `pageUrl` and the issue list from the response's **`data`** array (not `issues`). On a round that runs guided tests, `data` is `{ axe, igt }` instead — take the axe issues from `data.axe` and read guided-test issues as described below. If zero issues on round 1, report "already clean" and stop.
2. **Triage before remediating.** Keep every issue instance — do **not** collapse issues that share a rule. Remediation guidance is generated per issue and tailored to the element sent, and one rule covers wildly different situations (three `color-contrast` violations on a disabled control, a badge, and text over a hero image need three different fixes). Separate the list by flag instead:
   - `isAdvanced: true` — AI/computer-vision finding, probabilistic. **Confirm it against the actual code or UI before remediating.** A genuine false positive should be reported, not fixed.
   - `isNeedsReview: true` — needs human judgment; surface to the user rather than auto-fixing when the call is a design decision.
   - `isBestPractice: true` — not a WCAG failure. Fix when cheap; never let it block "clean".
3. **Remediate in one batched call.** Send **all** issues from this round in a **single** `remediate` call (max 25 per call; split into sequential batches if more). One call per round, never one per issue.

   **Check the count first.** Credits are consumed per issue, not per call, so a round with 200 issues costs roughly 200 issues' worth across 8 batches. If round 1 returns more than ~30 issues, report the count and the rule breakdown to the user and confirm before remediating — offering the two levers below so they choose the spend. Do not silently work through hundreds of issues.

   - **Collapse repeated instances**: group by `rule` + **normalized** element identity — strip positional indices from the `selector` path (`:nth-child(7)` -> `:nth-child(n)`) and group on that. Do not group on the raw `selector` (unique per element, collapses nothing) or the raw `source` (per-instance attributes make it too strict). For content-dependent rules — `image-alt`, `link-name`/`button-name`, `label`, `frame-title` — also require the content-bearing part (`src`, text, `href`) to match, since N cards with N different images share one normalized selector but need N different names. Send two or three representatives per large group rather than exactly one, and **report what you collapsed** (`47 issues -> 18 requests, 29 collapsed across 6 components`). Full recipe in the `mcp-usage` skill's `references/cost-control.md`.
   - `id` = a unique string you invent per issue (e.g. `color-contrast-0`) — required, used to correlate results back
   - `pageUrl` = the analyze response's `pageUrl`
   - `rule` = issue `rule`
   - `elementHtml` = issue `source` — **never empty**. One empty `elementHtml` fails the whole batch, and modal guided-test issues arrive with `source: ""`, so rebuild those from `selector` first.
   - `remediation` = issue `summary` + `description` + `helpText` (guided-test issues: `summary` + `help` + `aiReasoning` when non-null)

   Do **not** pass the issue's own `remediation` field — it is an object of raw axe check data, not the string this parameter expects.

   If the response is `data.upgradeRequired: true` instead of a results array, the account is on the free tier: relay `data.message`, stop the loop, and report the scan's findings without fixes.
4. **Apply fixes to source.** Correlate each result back by `id` and check its `status` — a batch can partially fail, and a failed entry carries `error` instead of `remediation`. For each success, locate the responsible code (use Grep/Glob to find the component rendering the element) and apply the guidance. `code_fix` is a suggested snippet derived only from the element HTML sent — adapt it to the real component rather than pasting it. When several issues turn out to share one component, fix the root cause there rather than patching each call site — but note that this is a conclusion about *where the edit goes*, reached after reading the per-issue guidance. It is not a reason to have sent fewer issues. Apply image-alt and other judgment-heavy rules per the conventions in the `mcp-usage` skill's `references/rule-tips.md`.
5. **Re-analyze (verify).** Re-run `analyze` on the same URL. If zero, stop and report success. Otherwise continue to the next round with the remaining issues.

Track issue counts per round so progress is visible (e.g. `round 1: 7 -> round 2: 2 -> round 3: 0`).

## Guided tests (only when requested)

`analyze` alone cannot see focus order, focus traps, focus visibility, whether a control's name/role/state is right, or how a modal handles focus. Guided tests can, but they use AI and **consume credits**. So run them **only** when the user's request asks for what they cover (see Inputs). Never add them because the page "looks interactive". If the page clearly warrants one the user didn't ask for, mention it in the final report as a suggestion, with its cost.

Run the requested tests on **round 1**, in the same call as the axe scan, so their issues join that round's batch:

```
analyze({ url, igtTools: ["keyboard"] })
analyze({ url, igtTools: ["modal"], modalTriggerSelector: "<selector the user gave>" })
```

For `modal`, use a trigger or modal selector the user named — ask if they did not. Without a trigger, dismissal and focus restoration go untested (`terminatedReason: "dismissibility-unavailable"`).

Read the results in this order:

1. **`data.igt.upgradeRequired === true`** — free tier. Relay `data.igt.message`, continue the loop on `data.axe` alone, and say guided tests were not run.
2. **Each `data.igt.<tool>.status`** — `"error"` means report "the `<tool>` test failed: `<error>`" and carry on. `"complete"` means use its `issues` (count with `issues.length`, not `igtElements`).
3. **`terminatedReason`** — results may be partial. After a `keyboard-trap`, elements past the trap were never tested. After `insufficient-credits`, stop running guided tests.

Guided-test issues have a **different shape** — `help`, `summary`, `impact`, `rule`, `selector`, `source`, `manifestGuide`, `aiReasoning`, with no `description`/`helpText` — so map `remediation` from `summary` + `help` + `aiReasoning`. Their `rule` values are IGT IDs (`keyboard-inaccessible`, `aria-name-missing-incorrect`, `focus-modal-none`, ...); pass them through as-is. Batch them into the **same** `remediate` call as the axe issues.

**Verification rounds use a plain `analyze`**, with no `igtTools`. Re-running the guided tests costs credits again, so do it once at the end, and only if the user wants the guided findings re-checked — ask before doing it. Report guided-test results by tool in the final summary, including any that errored, terminated early, or were tier-locked.

## Stopping and reporting

- **Clean:** report zero violations and the number of rounds taken.
- **Cap hit:** stop, list the remaining violations with their rules and elements, and explain that the cap was reached. Do not loop indefinitely.
- **Stuck (no progress):** if a round resolves nothing (same count as the prior round), stop early and surface the unresolved violations — they likely need design decisions or manual judgment rather than another pass.

## Guardrails

- Apply only accessibility fixes guided by `remediate`. Do not refactor unrelated code or change behavior beyond what the violation requires.
- Re-running a plain `analyze` is free. Re-running `remediate` for an already-fixed element, or re-running guided tests, spends credits — only remediate issues present in the latest scan, and only re-run guided tests when asked.
- Do not request `screenshot` on the loop's scans. It costs significant tokens per round and adds nothing to remediation; use it only if the user explicitly wants to see the page (and use `save`/`saveTo` with `inline: false` if they only want the file).
- After the loop, briefly summarize the code changes made so the user can review them before committing.

For the full issue shapes, field mapping, and rule-specific remediation nuances, the `mcp-usage` skill's references apply directly.

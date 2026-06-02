---
name: audit
description: This skill should be used when the user asks to "audit accessibility", "fix all a11y issues on this page", "run the accessibility loop", "remediate accessibility until clean", "scan and fix localhost", or runs /axe-mcp:audit. It drives the axe MCP analyze -> remediate -> apply -> verify loop on a URL, applying fixes each round until violations reach zero or a round cap is hit.
argument-hint: "<url> [max-rounds] (default url: detected localhost, default rounds: 5)"
allowed-tools: Bash, Read, Edit, Write, Glob, Grep
---

# Run the accessibility audit loop

Take a page from "has violations" to "zero violations" by iterating the axe MCP workflow and applying real code fixes each round. This skill assumes the axe MCP Server is already connected (`/axe-mcp:setup`) and the `analyze` and `remediate` tools are available.

## Inputs

- **URL** (`$1`): the full URL to audit (scheme + host + port + path). If omitted, detect a running dev server: check `package.json` scripts and common ports (3000, 5173, 8080, 4321) and confirm the URL with the user before scanning. Never scan a partial path.
- **Max rounds** (`$2`): iteration cap, default **5**. The loop stops at zero violations or when this cap is reached, whichever comes first.

If the target is behind auth or an interaction, gather the steps and pass them to `analyze` via its `before` array (`click` / `fill` / `waitFor`); put secrets only in `fill` `value`, never in selectors.

## The loop

Repeat until zero violations or the round cap:

1. **Analyze.** Call `analyze` with the full URL. Record the returned `pageUrl` and the list of issues. If zero issues on round 1, report "already clean" and stop.
2. **Remediate each unique violation.** For every distinct issue, call `remediate` once with the mapped fields:
   - `pageUrl` = analyze response `pageUrl`
   - `rule` = issue `rule`
   - `elementHtml` = issue `source`
   - `remediation` = issue `description` + " " + `helpText`
   Deduplicate first — if the same `rule` + `source` appears many times, remediate it once and apply the fix to the shared source (each `remediate` call costs credits).
3. **Apply fixes to source.** Locate the responsible code (use Grep/Glob to find the component rendering the element) and apply the remediation guidance. Fix the root cause in shared components rather than per-instance when a violation repeats. Apply image-alt and other judgment-heavy rules per the conventions in the `axe-mcp-usage` skill's `references/rule-tips.md`.
4. **Re-analyze (verify).** Re-run `analyze` on the same URL. If zero, stop and report success. Otherwise continue to the next round with the remaining issues.

Track issue counts per round so progress is visible (e.g. `round 1: 7 -> round 2: 2 -> round 3: 0`).

## Stopping and reporting

- **Clean:** report zero violations and the number of rounds taken.
- **Cap hit:** stop, list the remaining violations with their rules and elements, and explain that the cap was reached. Do not loop indefinitely.
- **Stuck (no progress):** if a round resolves nothing (same count as the prior round), stop early and surface the unresolved violations — they likely need design decisions or manual judgment rather than another pass.

## Guardrails

- Apply only accessibility fixes guided by `remediate`. Do not refactor unrelated code or change behavior beyond what the violation requires.
- Re-running `analyze` is cheap (no remediation credits); re-running `remediate` for an already-fixed element wastes credits — only remediate violations present in the latest analyze pass.
- After the loop, briefly summarize the code changes made so the user can review them before committing.

For field-mapping details and rule-specific remediation nuances, the `axe-mcp-usage` skill's references apply directly.

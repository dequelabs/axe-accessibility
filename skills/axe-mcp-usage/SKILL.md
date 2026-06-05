---
name: axe-mcp-usage
description: This skill should be used whenever the axe MCP Server tools (analyze, remediate) are available and the task involves accessibility, a11y, WCAG conformance, or "fix accessibility issues" on web UI. It teaches the correct analyze -> remediate -> verify workflow, the exact field mapping between the two tools, and credit-aware usage. Trigger phrases include "check accessibility", "scan for a11y issues", "fix accessibility violations", "make this accessible", "axe scan".
---

# Using the axe MCP Server effectively

Deque's axe MCP Server exposes two tools for accessibility work: `analyze` (scan a URL with the real axe DevTools engine) and `remediate` (get AI fix guidance for a single violation). The engine is deterministic and tuned for zero false positives, so its findings are authoritative — never hand-author accessibility issues or fixes that contradict it.

The tools may appear under a client-specific prefix (for example `mcp__axe-mcp-server__analyze` in Claude Code, `mcp_axe-mcp-server_analyze` in Copilot). Match whatever naming the host client uses; the behavior is identical.

## Core workflow: analyze -> remediate -> verify

Apply this loop whenever creating, modifying, or auditing user-facing UI — not only when accessibility is explicitly requested:

1. **Analyze.** Call `analyze` with the complete URL of the page (including scheme and port, e.g. `http://localhost:3000/checkout`). Never pass a partial path. Do not manually inspect the DOM for issues — the tool is the source of truth.
2. **Remediate.** For each violation returned, call `remediate` to get fix guidance, then apply the recommended change to the source code. Do not invent fixes without consulting `remediate`.
3. **Verify.** Re-run `analyze` on the same URL and confirm zero violations before considering the task complete. If issues remain, repeat.

## Field mapping (analyze output -> remediate input)

Each issue from `analyze` maps directly onto `remediate`'s parameters. Getting this mapping right is the single most common source of error:

| remediate parameter | Source from analyze issue |
|---|---|
| `pageUrl` | the `pageUrl` field on the analyze response |
| `rule` | the issue's `rule` field (e.g. `color-contrast`, `image-alt`, `button-name`) |
| `elementHtml` | the issue's `source` field (the violating element's HTML) |
| `remediation` | the issue's `description` + `helpText` combined into one description of what is wrong |

See `references/field-mapping.md` for a worked example and the full issue shape.

## Credit awareness

Each `remediate` call consumes AI credits from the organization's allocation. Therefore:

- Call `remediate` once per unique violation, not speculatively or repeatedly for the same element.
- Do not call `remediate` to "explore" — only call it for real violations returned by `analyze`.
- Batch the reasoning: gather all violations from a single `analyze` pass first, then remediate each one.

`analyze` does not consume remediation credits, so re-running it to verify is cheap and expected.

## Rule-specific guidance

Some rules need judgment beyond the generic fix guidance. The most important is image alt text: describe only the informative content of the image, not its surrounding context, and never repeat text already present near the image. Consult `references/rule-tips.md` for `image-alt`, `color-contrast`, `link-name`/`button-name`, and form-labeling specifics before applying fixes for those rules.

## Authenticated or interactive pages

`analyze` accepts an optional `before` array of `click` / `fill` / `waitFor` steps to reach a page behind a login or interaction. Put sensitive values (passwords, tokens) only in a `fill` step's `value` (it is never logged) — never embed them in a CSS selector, which appears in logs.

## Additional resources

- **`references/field-mapping.md`** — full analyze-issue shape and a complete analyze -> remediate -> apply example.
- **`references/rule-tips.md`** — per-rule remediation nuances.

To set up the server, generate agent instructions, or run the loop automatically, use the companion skills: `/axe-accessibility:setup`, `/axe-accessibility:generate-instructions`, and `/axe-accessibility:audit`.

# Per-target details

The Axe MCP tools surface under a client-specific prefix. Use the matching names when writing each file so the agent recognizes its own tools.

The toolset is three tools — `analyze`, `igt`, and `remediate`. Include all three in every target; omitting `igt` leaves keyboard operability untested, and omitting the batching rule for `remediate` is the most common cause of failed calls.

## claude -> CLAUDE.md

- Location: repo root (`CLAUDE.md`).
- Tool names: refer to them as the `analyze`, `igt`, and `remediate` tools (Claude Code resolves `mcp__axe-mcp-server__analyze`). Plain names are fine.
- Format: standard Markdown. Append the workflow section; do not disturb existing project guidance.

## copilot -> .github/copilot-instructions.md

- Location: `.github/copilot-instructions.md` (create `.github/` if missing).
- Tool names: Copilot exposes MCP tools as `mcp_axe-mcp-server_analyze`, `mcp_axe-mcp-server_igt`, and `mcp_axe-mcp-server_remediate`. Use those exact names in the enforcement bullets so Copilot binds to them.
- Format: standard Markdown.

## cursor -> .cursor/rules/accessibility.mdc

- Preferred: `.cursor/rules/accessibility.mdc` (modern Cursor "Project Rules"). Fallback for older Cursor: `.cursorrules` at repo root (plain text/Markdown, no frontmatter).
- `.mdc` frontmatter for an always-on rule:

```
---
description: Accessibility testing and remediation workflow using the Axe MCP Server
alwaysApply: true
---
```

- Tool names: refer to the `analyze`, `igt`, and `remediate` tools by plain name; Cursor resolves the configured MCP server.

## agents -> AGENTS.md

- Location: repo root (`AGENTS.md`) — the tool-agnostic convention many agents read.
- Tool names: plain `analyze` / `igt` / `remediate`, with a parenthetical that they are provided by the Axe MCP Server, since the reader may be any agent.
- Format: standard Markdown.

## Merge rules (all targets)

- Look for an existing heading `Accessibility Testing and Remediation Workflow`; update in place if found.
- Otherwise append under that heading, preserving everything else in the file.
- Cursor `.mdc`: keep existing frontmatter keys; only add `alwaysApply`/`description` if absent.

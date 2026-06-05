# Per-target details

The axe MCP tools surface under a client-specific prefix. Use the matching names when writing each file so the agent recognizes its own tools.

## claude -> CLAUDE.md

- Location: repo root (`CLAUDE.md`).
- Tool names: refer to them as the `analyze` and `remediate` tools (Claude Code resolves `mcp__axe-mcp-server__analyze`). Plain names are fine.
- Format: standard Markdown. Append the workflow section; do not disturb existing project guidance.

## copilot -> .github/copilot-instructions.md

- Location: `.github/copilot-instructions.md` (create `.github/` if missing).
- Tool names: Copilot exposes MCP tools as `mcp_axe-mcp-server_analyze` and `mcp_axe-mcp-server_remediate`. Use those exact names in the enforcement bullets so Copilot binds to them.
- Format: standard Markdown.

## cursor -> .cursor/rules/accessibility.mdc

- Preferred: `.cursor/rules/accessibility.mdc` (modern Cursor "Project Rules"). Fallback for older Cursor: `.cursorrules` at repo root (plain text/Markdown, no frontmatter).
- `.mdc` frontmatter for an always-on rule:

```
---
description: Accessibility testing and remediation workflow using the axe MCP Server
alwaysApply: true
---
```

- Tool names: refer to the `analyze` and `remediate` tools by plain name; Cursor resolves the configured MCP server.

## agents -> AGENTS.md

- Location: repo root (`AGENTS.md`) — the tool-agnostic convention many agents read.
- Tool names: plain `analyze` / `remediate`, with a parenthetical that they are provided by the axe MCP Server, since the reader may be any agent.
- Format: standard Markdown.

## Merge rules (all targets)

- Look for an existing heading `Accessibility Testing and Remediation Workflow`; update in place if found.
- Otherwise append under that heading, preserving everything else in the file.
- Cursor `.mdc`: keep existing frontmatter keys; only add `alwaysApply`/`description` if absent.

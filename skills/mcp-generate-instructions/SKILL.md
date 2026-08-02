---
name: mcp-generate-instructions
description: This skill should be used when the user asks to "generate accessibility instructions", "add axe instructions to my repo", "bake a11y into my coding agent", "create copilot-instructions for accessibility", "set up CLAUDE.md for axe", or runs /axe-accessibility:mcp-generate-instructions. It writes or updates agent-instruction files (CLAUDE.md, .github/copilot-instructions.md, Cursor rules, or AGENTS.md) that enforce the Axe MCP analyze/igt -> remediate -> verify workflow.
argument-hint: "[targets] (optional: claude | copilot | cursor | agents | all)"
allowed-tools: AskUserQuestion, Bash, Glob, Read, Edit, Write
---

# Generate accessibility agent instructions

Produce agent-instruction files that make a coding agent automatically run Deque's Axe MCP analyze -> remediate -> verify workflow whenever it touches UI. The goal is the same effect as a hand-written `copilot-instructions.md`: every UI change is checked and fixed against the axe engine before it is considered done.

## Step 1 — Determine targets

Targets and their files:

| Target | File |
|---|---|
| `claude` | `CLAUDE.md` (repo root) |
| `copilot` | `.github/copilot-instructions.md` |
| `cursor` | `.cursor/rules/accessibility.mdc` (fallback `.cursorrules`) |
| `agents` | `AGENTS.md` (repo root) |

If `$1` specifies targets (`claude`, `copilot`, `cursor`, `agents`, or `all`), use them. Otherwise detect what already exists in the repo with Glob (`CLAUDE.md`, `.github/copilot-instructions.md`, `.cursor/**`, `.cursorrules`, `AGENTS.md`) and confirm the set with `AskUserQuestion` — default to the files already present, offering to add others.

## Step 2 — Compose the content

Use the canonical workflow text in `references/workflow-template.md` as the body. Adapt the tool-name references per target — see `references/targets.md` for each target's tool-naming convention and any file-format specifics (e.g. Cursor `.mdc` frontmatter).

Keep these intact across all targets — they are the parts that change agent behavior:

- the mandatory analyze -> remediate -> verify loop
- **the `remediate` batching rule** (one call per scan, `id` on every issue) — the most common cause of failed tool calls
- **the field mapping**, including reading issues from `response.data` and never passing an issue's own `remediation` object into the `remediation` parameter
- the deterministic (`isAdvanced: false`) vs. AI-derived (`isAdvanced: true`) trust distinction
- the `igt` keyboard section and its different issue shape
- the credit-aware note and the image-alt guidance

## Step 2a — Refresh outdated sections

When updating a file that already has an axe workflow section, check for guidance written against the pre-1.3.0 tool contract and correct it rather than appending alongside it. Tell-tale signs:

- a per-issue `remediate` call, or "call `remediate` once per violation"
- a flat `remediate({pageUrl, rule, elementHtml, remediation})` signature with no `id` and no `issues` array
- reading issues from `response.issues` instead of `response.data`
- `remediation` mapped from only `description` + `helpText`, with no mention of `summary`
- no mention of `igt`
- a blanket claim that all findings are deterministic / zero-false-positive

Replace those in place — leaving them causes calls the server will reject.

## Step 3 — Write without clobbering

For each target file:

1. If the file does not exist, create it with the composed content.
2. If it exists, **merge** rather than overwrite. Read it first. If it already contains an axe/accessibility workflow section (look for a heading like "Accessibility Testing and Remediation Workflow"), update that section in place. Otherwise append the section under a clear heading, preserving all existing content.
3. Never delete unrelated instructions the user already maintains.

Show the user a brief diff/summary of what was added or changed per file.

## Step 4 — Tailor to the repo (optional but recommended)

Inspect the repo to make the instructions concrete:

- Detect the dev-server URL and start command (check `package.json` scripts, `README`, framework config) and reference the real localhost URL in the analysis step.
- If the repo has project-specific asset conventions worth encoding (e.g. SVGs whose meaningful parts are identified by comments), add a short project-specific note mirroring the pattern in `references/workflow-template.md`. Ask the user before inventing project-specific rules.

## Step 5 — Close out

Summarize which files were written/updated and remind the user that:

- The instructions only take effect for agents that read them (Copilot reads `.github/copilot-instructions.md`, Claude Code reads `CLAUDE.md`, etc.).
- The Axe MCP Server must be connected (`/axe-accessibility:mcp-setup`) for the workflow to function.
- `/axe-accessibility:mcp-audit <url>` runs the same loop on demand.

## Additional resources

- **`references/workflow-template.md`** — the canonical mandatory-workflow text to embed.
- **`references/targets.md`** — per-target file paths, tool-naming conventions, and format notes.

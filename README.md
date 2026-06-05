# Axe Accessibility (Claude Code plugin)

Deque's accessibility toolkit for coding agents — get set up fast and teach your coding agent to ship accessible UI.

**v1 focuses on the [axe MCP Server](https://docs.deque.com/devtools-server/4.0.0/en/axe-mcp-server)** and its `analyze` and `remediate` tools, wrapped in a smooth onboarding + usage workflow. The plugin is the umbrella for Deque's agent-facing accessibility capabilities; more will be added over time.

- **Wire up the server** for your IDE/MCP client, with your choice of authentication (API key or OAuth 2.0).
- **Teach your agent** to run the mandatory **analyze → remediate → verify** loop on every UI change.
- **Audit on demand** — analyze a page, remediate each violation, and re-verify until automated accessibility violations hit zero.

## What's included

| Component | Type | What it does |
|---|---|---|
| `mcp-usage` | Skill (auto) | Background knowledge so any agent calls `analyze`/`remediate` correctly (field mapping, credit awareness, the workflow). Loads automatically on accessibility tasks. |
| `/axe-accessibility:mcp-setup` | Skill (command) | Interactive setup: pick auth (API key or OAuth), configure your client, verify the connection. |
| `/axe-accessibility:mcp-generate-instructions` | Skill (command) | Generate/merge agent-instruction files (`CLAUDE.md`, `.github/copilot-instructions.md`, Cursor rules, `AGENTS.md`) that enforce the workflow. |
| `/axe-accessibility:mcp-audit` | Skill (command) | Drive the loop on a URL: analyze → remediate → apply → re-verify until 0 violations or a round cap. |
| `.mcp.json` | MCP server | Ships an auth-agnostic axe MCP Server entry (Docker) that works with either API key or OAuth. |

## Prerequisites

- **Docker** installed and running (the default distro is `dequesystems/axe-mcp-server:latest`). An npm distro alternative is documented in the setup skill.
- An **active axe subscription** that includes axe MCP Server.
- For **OAuth**: Node.js 22 LTS+ (the bundled config calls `npx @deque/axe-auth`).

## Installation

Run locally for development:

```
claude --plugin-dir /path/to/axe-accessibility
```

Install from the Deque-hosted marketplace (this repo doubles as one):

```
/plugin marketplace add dequelabs/axe-accessibility
/plugin install axe-accessibility
```

Once accepted into Anthropic's community marketplace, users can also:

```
/plugin marketplace add anthropics/claude-plugins-community
/plugin install axe-accessibility@claude-community
```

## Publishing

Two distribution paths, not mutually exclusive:

1. **Self-hosted marketplace** — push this repo under `dequelabs`; `.claude-plugin/marketplace.json` makes it installable immediately via `/plugin marketplace add`.
2. **Anthropic community marketplace** — run `claude plugin validate .` (the review pipeline runs the same check plus automated safety screening), then submit at [claude.ai/settings/plugins/submit](https://claude.ai/settings/plugins/submit) or [platform.claude.com/plugins/submit](https://platform.claude.com/plugins/submit). Approved plugins are pinned by commit SHA in `anthropics/claude-plugins-community` and synced nightly. The curated `claude-plugins-official` marketplace is selected by Anthropic at its discretion (no application).

## Quick start

1. `/axe-accessibility:mcp-setup` — choose API key or OAuth and connect the server. Verify with `/mcp`.
2. `/axe-accessibility:mcp-generate-instructions all` — bake the workflow into your repo's agent instructions.
3. `/axe-accessibility:mcp-audit http://localhost:3000` — analyze, remediate, and verify until clean.

## Authentication

Two mechanisms are supported; choose during `/axe-accessibility:mcp-setup`:

- **API key** — create one at the [axe Account Portal](https://axe.deque.com) (API Keys → "axe MCP Server" product), then export `AXE_API_KEY`.
- **OAuth 2.0** — `npx -y @deque/axe-auth login` (browser PKCE flow; tokens stored in the OS keychain with auto-refresh).

The bundled `.mcp.json` is **auth-agnostic**: it mints an OAuth token and passes **exactly one** credential — the OAuth `AXE_ACCESS_TOKEN` if you're logged in, otherwise `AXE_API_KEY`. (The server rejects having both set, so the config never passes both.) Set `AXE_SERVER_URL` for private cloud / on-prem deployments.

> **Note:** Each `remediate` call consumes AI credits from your organization's allocation. `analyze` does not, so re-verifying is cheap.

## License

MIT © Deque Systems, Inc.

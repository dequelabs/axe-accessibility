# Axe Accessibility (Claude Code plugin)

Deque's accessibility toolkit for coding agents — get set up fast and teach your coding agent to ship accessible UI.

**v1 focuses on the [Axe MCP Server](https://docs.deque.com/devtools-server/4.0.0/en/axe-mcp-server)** and its `analyze`, `igt`, and `remediate` tools, wrapped in a smooth onboarding + usage workflow. The plugin is the umbrella for Deque's agent-facing accessibility capabilities; more will be added over time.

- **Wire up the server** for your IDE/MCP client — your choice of distribution (npm or Docker) and authentication (API key or OAuth 2.0).
- **Teach your agent** to run the mandatory **analyze → remediate → verify** loop on every UI change, with correct batching and field mapping.
- **Audit on demand** — analyze a page, batch-remediate the violations, and re-verify until automated accessibility violations hit zero.
- **Test the keyboard** — run the keyboard Intelligent Guided Test for focus order, focus traps, and focus visibility, which a static scan cannot see.

## What's included

| Component | Type | What it does |
|---|---|---|
| `mcp-usage` | Skill (auto) | Background knowledge so any agent calls `analyze`/`igt`/`remediate` correctly (field mapping, batching, credit awareness, the workflow). Loads automatically on accessibility tasks. |
| `/axe-accessibility:mcp-setup` | Skill (command) | Interactive setup: pick distribution (npm or Docker) and auth (API key or OAuth), configure your client, verify the connection. |
| `/axe-accessibility:mcp-generate-instructions` | Skill (command) | Generate/merge agent-instruction files (`CLAUDE.md`, `.github/copilot-instructions.md`, Cursor rules, `AGENTS.md`) that enforce the workflow. |
| `/axe-accessibility:mcp-audit` | Skill (command) | Drive the loop on a URL: analyze → batched remediate → apply → re-verify until 0 violations or a round cap, plus an optional keyboard pass. |
| `.mcp.json` | MCP server | Ships a distribution- and auth-agnostic Axe MCP Server entry (npm) that works with either API key or OAuth. |

## Prerequisites

- An **[Axe DevTools for Web](https://www.deque.com/axe/devtools/pricing/)** subscription — the Bundle plan includes Axe MCP Server access. Without it, the tools will fail to authenticate.
- **One runtime**, depending on distribution:
  - **npm (default):** Node.js **>= 22.19.0**, plus a one-time `npx playwright install chromium`. The bundled config runs `npx -y axe-mcp-server`, which does **not** download a browser for you — without Chromium, scans fail with `Chromium is not installed` and the exact command to run.
  - **Docker:** Docker installed and running. The server is the public image `dequesystems/axe-mcp-server:latest`, pulled automatically on first launch (no `docker login` required).
- For **OAuth** on either distribution: Node.js 22 LTS+ (the config calls `npx @deque/axe-auth`).

## Distributions

The plugin defaults to **npm**, which is the lower-friction path for local development:

| | npm (default) | Docker |
|---|---|---|
| Command | `npx -y axe-mcp-server` | `docker run … dequesystems/axe-mcp-server:latest` |
| Requires | Node >= 22.19.0 | Docker daemon running |
| Browser | one-time `npx playwright install chromium` | bundled in the image |
| Reaching `localhost` | direct | needs `--add-host=host.docker.internal:host-gateway`, and a dev server bound to `0.0.0.0` |
| Updates | automatic per start | re-pull the image |
| `AXE_CHROME_PATH` | supported | **fails at startup** |
| Best for | local development | isolation, CI images, no Node toolchain |

> The npm package is **`axe-mcp-server`** — unscoped. `@deque/axe-mcp-server` does not exist; only the auth CLI is scoped (`@deque/axe-auth`).

Run `/axe-accessibility:mcp-setup` to configure either one, for any supported client. Full snippets for all four distribution × auth combinations are in `skills/mcp-setup/references/client-configs.md`.

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

- **API key** — create one at the [Axe Account Portal](https://axe.deque.com) (API Keys → "Axe MCP Server" product), then export `AXE_API_KEY`.
- **OAuth 2.0** — `npx -y @deque/axe-auth login` (browser PKCE flow; tokens stored in the OS keychain with auto-refresh).

The bundled `.mcp.json` is **auth-agnostic**: it mints an OAuth token and passes **exactly one** credential — the OAuth `AXE_ACCESS_TOKEN` if you're logged in, otherwise `AXE_API_KEY`. The server rejects having both set, so the config unsets the API key when a token is present. Set `AXE_SERVER_URL` for private cloud / on-prem deployments; see `client-configs.md` for the full environment-variable table (`AXE_ADVANCED_RULES`, `AXE_CHROME_PATH`, `BROWSER_TIMEOUT_MS`, `LOG_LEVEL`).

> **Note:** `remediate` consumes AI credits from your organization's allocation, **per issue in the batch** — not per call. It is a batched tool: send every issue from one scan in a single call (up to 25). That is the contract, not a discount, so cost scales with issue count. The plugin's guidance sends every issue instance rather than collapsing repeats by rule — remediation is tailored per element, and one rule spans very different fixes — and asks before remediating unusually large scans. `analyze` does not consume credits, so re-verifying is cheap.

## Findings are not all deterministic

Since server 1.4.0, `analyze` merges **Advanced Rules** findings (screenshots + computer vision + LLMs) into its results, catching things axe-core cannot — pseudo-headings, unhelpful alt text, contrast over gradients and images. Each issue carries an `isAdvanced` flag, and the plugin's guidance treats the two classes differently:

- `isAdvanced: false` — deterministic axe-core, tuned for zero false positives. Authoritative.
- `isAdvanced: true` — probabilistic. A strong signal to verify against the real UI, not a verdict.

Tune per scan with the **`advancedRules`** parameter (`precise` | `balanced` | `thorough` | `disabled`), or set a server-wide default with **`AXE_ADVANCED_RULES`**. Because the parameter is per scan, plain requests work — "run a11y analysis with thorough advanced rules", "scan with advanced rules disabled" — and the plugin's guidance tells the agent to pass it. Each `analyze` response reports the resolved setting in an `advancedRules` block, including which source won; `{"value": "disabled", "source": "unavailable"}` means the org isn't entitled, so no advanced findings will appear.

## License

MIT © Deque Systems, Inc.

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
| `.mcp.json` | MCP server | Ships an auth-agnostic Axe MCP Server entry using the **npm** distribution — works with either API key or OAuth. Docker needs a different command shape (see `client-configs.md`). |

## Prerequisites

- An **[Axe DevTools for Web](https://www.deque.com/axe/devtools/pricing/)** subscription — the Bundle plan includes Axe MCP Server access. Without it, the tools will fail to authenticate.
- **One runtime**, depending on distribution:
  - **npm (default):** Node.js **>= 22.19.0**, plus a one-time Chromium install. The bundled config runs `npx -y axe-mcp-server`, which does **not** download a browser for you — skip this and every scan fails with `Chromium is not installed`.

    **Pin Playwright to the version the server ships**, since a bare `npx playwright install chromium` resolves to Playwright's latest and can install a Chromium revision the server doesn't support:

    ```sh
    npx playwright@$(npm view axe-mcp-server dependencies.playwright) install chromium
    ```

    Deriving the version keeps this correct as the server updates (npm auto-updates on each start, so a hardcoded pin drifts silently). See [Choosing a Distribution](https://docs.deque.com/devtools-server/4.0.0/en/choosing-a-distribution) for the authoritative pin and Linux system-library notes.
  - **Docker:** Docker installed and running. The server is the public image `dequesystems/axe-mcp-server:latest`, pulled automatically on first launch (no `docker login` required).
- For **OAuth** on either distribution: Node.js 22 LTS+ (the config calls `npx @deque/axe-auth`).

## Distributions

The plugin defaults to **npm**, which is the lower-friction path for local development:

| | npm (default) | Docker |
|---|---|---|
| Command | `npx -y axe-mcp-server` | `docker run … dequesystems/axe-mcp-server:latest` |
| Requires | Node >= 22.19.0 | Docker daemon running |
| Browser | one-time Chromium install, Playwright pinned to the server's version | bundled in the image |
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

Once the plugin is accepted into the [Claude plugin directory](https://claude.com/plugins), no marketplace step is needed: Claude Code surfaces that directory as the built-in `claude-plugins-official` marketplace for every user, so `/plugin` finds it directly.

## Publishing

Two distribution paths, not mutually exclusive:

1. **Self-hosted marketplace** — this repo doubles as one; `.claude-plugin/marketplace.json` makes it installable immediately via `/plugin marketplace add dequelabs/axe-accessibility`.
2. **Claude plugin directory** — the community-driven directory that Claude Code exposes as the built-in `claude-plugins-official` marketplace. Submission requires a **public** GitHub repo (closed source is not accepted) and a passing validate:

   ```sh
   claude plugin validate .claude-plugin/plugin.json --strict
   claude plugin validate .claude-plugin/marketplace.json --strict
   ```

   Submit through one of Anthropic's in-app forms — [claude.ai](https://claude.ai/admin-settings/directory/submissions/plugins/new), which needs a Team or Enterprise org plus directory-management access (Owners have it by default), or [Console](https://platform.claude.com/plugins/submit), which needs a Developer, Admin, or Owner role. Submission status and reviewer feedback appear on the [Directory page](https://claude.ai/admin-settings/directory/submissions) in organization settings. Anthropic runs automated screening on every submission; the "Anthropic Verified" badge is an additional, discretionary quality-and-safety review with no application path. After publication, pushes to this repo are picked up automatically — updates do not need re-submission.

   This is a different directory from the [Connectors Directory](https://claude.com/docs/connectors/directory), which lists **remote** MCP servers only. The Axe MCP Server ships as a local stdio server, so the plugin directory is its route; see [Anthropic's review criteria](https://claude.com/docs/connectors/building/review-criteria), which both directories share.

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

Tune per scan with the **`advancedRules`** parameter (`precise` | `balanced` | `thorough` | `disabled`, or the `90%`/`70%`/`50%` aliases), or set a server-wide default with **`AXE_ADVANCED_RULES`**. Because the parameter is per scan, plain requests work — "run a11y analysis with thorough advanced rules", "scan with advanced rules disabled" — and the plugin's guidance tells the agent to pass it.

Every `analyze` response reports what actually applied in an `advancedRules` block. Its `source` is worth reading: `tool_arg`/`env_var`/`org_default` say which input won, while `org_policy_locked` means a fixed org policy rejected your override, and `tier_locked`/`unavailable` mean Advanced Rules aren't enabled for the account — so no advanced findings will appear regardless of what you pass. On those accounts the server also drops `advancedRules` from the tool's published schema, so its absence signals entitlement, not an old server.

## Privacy Policy

Deque's privacy policy applies to this plugin and the Axe MCP Server it configures: **<https://www.deque.com/privacy-policy/>** — privacy questions to <privacyinquiry@deque.com>.

The plugin itself is configuration and instructions: the skills and `.mcp.json` in this repo collect, store, and transmit nothing on their own. Data leaves your machine only through the Axe MCP Server they configure.

- **What stays local.** The server runs on your machine and drives a local Chromium against the URL you give it. Page content is read in that local browser.
- **What is sent to Deque.** Requests to the Axe API (`AXE_SERVER_URL`, Deque's cloud by default) carry your credential plus the data needed to serve the call: authentication and entitlement/credit checks; for Advanced Rules, page context and screenshots processed with computer vision and LLMs; for `remediate`, the issue details you batch into the call, used to generate fix guidance. `analyze` with `advancedRules` disabled still authenticates against the API but sends no page content for AI processing.
- **Credentials.** Either an `AXE_API_KEY` you set yourself, or OAuth tokens that `@deque/axe-auth` stores in your OS keychain and refreshes. Neither is written into this repo or into the plugin's configuration.
- **You choose what gets scanned.** Because the URL is yours to pick, scanning an authenticated or internal page means sending that page's content to Deque under the terms above. Scope scans with `selector`, or set `advancedRules: "disabled"`, when a page should not be processed by AI.

Collection, use, storage, third-party sharing, retention, and regional processing are governed by the privacy policy linked above together with your Axe DevTools agreement.

## License

MIT © Deque Systems, Inc.

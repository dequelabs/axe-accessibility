---
name: mcp-setup
description: This skill should be used when the user asks to "set up Axe MCP", "configure the Axe MCP Server", "install axe accessibility tooling", "connect Axe MCP", "authenticate axe", or runs /axe-accessibility:mcp-setup. It interactively wires the Axe MCP Server into the user's IDE/MCP client, helps choose a distribution (npm or Docker) and authentication (API key or OAuth), and verifies the connection.
argument-hint: "[client] (optional: claude-code | cursor | vscode | claude-desktop)"
allowed-tools: AskUserQuestion, Bash, Read, Edit, Write
---

# Set up the Axe MCP Server

Guide the user from nothing to a working, authenticated Axe MCP Server connection. There are two independent choices — **distribution** (npm or Docker) and **authentication** (API key or OAuth) — giving four valid configurations. Drive both with `AskUserQuestion`, then write the correct configuration for their client and verify it.

The one universal prerequisite is an **Axe DevTools for Web** subscription whose Bundle plan includes Axe MCP Server access (pricing: https://www.deque.com/axe/devtools/pricing/). Without it the tools will fail to authenticate — point the user to the pricing page. If `$1` names a client, skip the client question.

## Step 1 — Choose a distribution

Ask which to use (`AskUserQuestion`). **Recommend npm for local development** — it is the default the plugin ships.

- **npm (recommended)** — runs as a local Node process via `npx -y axe-mcp-server`. Requires **Node.js >= 22.19.0** and a one-time Chromium install (below). Reaches `localhost` dev servers **directly**, with none of the container networking workarounds Docker needs. Auto-updates on each start.
- **Docker** — runs as a container from `dequesystems/axe-mcp-server:latest`. Requires Docker installed and running. Better when the user wants isolation, has no Node toolchain, or is standardizing CI images. Needs `--add-host` plumbing to reach the host's dev server, and re-pulling to pick up new versions.

Verify the chosen prerequisite before writing config:

- npm: `node --version` (must be >= 22.19.0), then install the browser with `npx playwright install chromium`. **The server does not download it for you** — this is the most common first-run failure, surfacing as `Chromium is not installed. Run npx playwright@<version> install chromium`. If that error appears later, run the pinned command from the message verbatim, since it names the Playwright version the server expects.
- Docker: `docker info` (daemon must be running). Chromium ships inside the image, so no browser step is needed.

> **The package name is unscoped: `axe-mcp-server`** — *not* `@deque/axe-mcp-server`, which does not exist. Only the auth CLI is scoped (`@deque/axe-auth`). This is an easy mistake to make.

## Step 2 — Choose authentication

Ask which method to use (`AskUserQuestion`):

- **API key** — simplest. A static `AXE_API_KEY`. Best for CI, shared machines, or users who want no extra CLI.
- **OAuth 2.0** — browser login via the `@deque/axe-auth` CLI, tokens stored in the OS keychain with automatic refresh. Best for individual developers.

> **Only one credential at a time.** The server fails at startup if both `AXE_API_KEY` and `AXE_ACCESS_TOKEN` are set. Configure exactly one; the bundled config enforces this automatically (OAuth token if present, otherwise API key).

### API key path

1. Direct the user to create a key: **Axe Account Portal (https://axe.deque.com) -> API Keys -> ADD NEW API KEY -> product "Axe MCP Server"**, then copy it.
2. Have the user export it where their client can read it: `export AXE_API_KEY="<key>"` (persist in shell profile). Never write the key into a committed file.

### OAuth path

1. Log in: `npx -y @deque/axe-auth login` (add `--server <url>` for private cloud / on-prem). This opens a browser for the PKCE flow and stores tokens in the OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service). Requires Node 22 LTS+.
2. Verify a token can be minted: `npx -y @deque/axe-auth token` should print a token. Logout later with `npx -y @deque/axe-auth logout`.

> **npm + OAuth needs an explicit `unset`.** Under Docker, credentials are passed with explicit `-e` flags, so an inherited `AXE_API_KEY` never reaches the server. The npm distribution inherits the whole shell environment — so if the user has `AXE_API_KEY` exported *and* an OAuth session, both variables reach the server and it fails at startup. Any npm+OAuth config must `unset AXE_API_KEY` when it sets `AXE_ACCESS_TOKEN`. The bundled config does this.

## Step 3 — Choose the client

Ask which client to configure (or use `$1`): Claude Code, Cursor, VS Code (Copilot), Claude Desktop, or generic/other.

The plugin already ships a **distribution- and auth-agnostic** `.mcp.json` (see plugin root): it uses the **npm** distribution, mints an OAuth token, and passes **exactly one** credential — `AXE_ACCESS_TOKEN` if an OAuth session exists (unsetting `AXE_API_KEY`), otherwise whatever `AXE_API_KEY` is in the environment. For Claude Code users who chose npm, installing the plugin is usually enough — confirm the server appears and skip to verification.

For every other combination, emit the correct configuration snippet. Read `references/client-configs.md` and produce the snippet matching the chosen **client + distribution + auth method**, then either write it to the client's config file (with the user's confirmation) or print it for them to paste.

**Merge, do not clobber.** Before writing any client config file, read it if it exists and merge the `axe-mcp-server` entry into the existing `mcpServers` (or `servers` for VS Code) object — never overwrite a file that already defines other MCP servers. If unsure, print the snippet for the user to paste instead of writing.

**Windows note:** the OAuth snippets wrap the command in `sh -c`, which is unavailable in a stock Windows shell. On Windows, prefer the API-key shape, or have the user run under Git Bash/WSL. This applies to both distributions.

## Step 4 — Optional configuration

Mention these only if relevant to the user's situation (full table in `references/client-configs.md`):

- **Private cloud / on-prem / regional SaaS:** set `AXE_SERVER_URL` (default `https://axe.deque.com`) in the same environment as the MCP config, and pass `--server <url>` to `axe-auth login`.
- **Advanced Rules confidence:** `AXE_ADVANCED_RULES` (`precise` | `balanced` | `thorough` | `disabled`) sets the default for every scan this server runs; defaults to the organization's setting. Only worth configuring if the user wants a standing default — individual scans can override it with the `advancedRules` parameter, so a one-off ("scan with advanced rules disabled") needs no config change.
- **Custom Chromium (npm only):** `AXE_CHROME_PATH` points at a Chrome for Testing / Chromium binary instead of the Playwright-managed one. **It fails at startup under Docker** — never set it in a Docker config. Branded Google Chrome stable 137+ is not supported.
- **Slow pages / verbose logs:** `BROWSER_TIMEOUT_MS` (default `30000`), `LOG_LEVEL` (`debug` | `info` | `warn` | `error`, default `info`).

## Step 5 — Verify

Confirm the connection works before declaring success:

- **Claude Code:** advise running `/mcp` and confirming `axe-mcp-server` is listed and connected. Then run a smoke `analyze` against a known URL (e.g. `https://dequeuniversity.com/demo/mars`).
- **Other clients:** have the user restart/reload the client, open the MCP/tools panel, confirm the axe tools (`analyze`, `igt`, `remediate`) appear, then run a smoke `analyze`.

A successful smoke scan on a real page returns a sizable payload (tens of KB) — that is expected, not an error. If the client complains the result is too large, scope the scan with `analyze`'s `selector` parameter.

If verification fails, consult the troubleshooting section of `references/client-configs.md` — it is split by distribution, since the common failure modes differ.

## Step 6 — Suggest next steps

Once connected, recommend:

- `/axe-accessibility:mcp-generate-instructions` to bake the analyze -> remediate -> verify workflow into the repo's agent instructions.
- `/axe-accessibility:mcp-audit <url>` to run the full remediation loop on a page.

## Additional resources

- **`references/client-configs.md`** — per-client config snippets for all four distribution/auth combinations, the full environment-variable table, and distribution-specific troubleshooting.

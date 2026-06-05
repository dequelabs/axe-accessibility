---
name: mcp-setup
description: This skill should be used when the user asks to "set up axe MCP", "configure the axe MCP server", "install axe accessibility tooling", "connect axe MCP", "authenticate axe", or runs /axe-accessibility:mcp-setup. It interactively wires the axe MCP Server into the user's IDE/MCP client, helps choose and configure authentication (API key or OAuth), and verifies the connection.
argument-hint: "[client] (optional: claude-code | cursor | vscode | claude-desktop)"
allowed-tools: AskUserQuestion, Bash, Read, Edit, Write
---

# Set up the axe MCP Server

Guide the user from nothing to a working, authenticated axe MCP Server connection. Drive the flow with `AskUserQuestion` for the decisions below, then write the correct configuration for their client and verify it.

Prerequisites to confirm early: **Docker installed and running**, and an **axe DevTools for Web** subscription whose Bundle plan includes axe MCP Server access (pricing: https://www.deque.com/axe/devtools/pricing/). If the user lacks the subscription, the tools will fail to authenticate — point them to the pricing page. If `$1` names a client, skip the client question.

## Step 1 — Choose authentication

Ask which method to use (`AskUserQuestion`):

- **API key** — simplest. A static `AXE_API_KEY`. Best for CI, shared machines, or users who want no extra CLI.
- **OAuth 2.0** — browser login via the `@deque/axe-auth` CLI, tokens stored in the OS keychain with automatic refresh. Best for individual developers.

> **Only one credential at a time.** The server fails at startup if both `AXE_API_KEY` and `AXE_ACCESS_TOKEN` are set. Configure exactly one; the bundled config enforces this automatically (OAuth token if present, else API key).

### API key path

1. Direct the user to create a key: **axe Account Portal (https://axe.deque.com) -> API Keys -> ADD NEW API KEY -> product "axe MCP Server"**, then copy it.
2. Have the user export it where their client can read it: `export AXE_API_KEY="<key>"` (persist in shell profile). Never write the key into a committed file.

### OAuth path

1. Log in: `npx -y @deque/axe-auth login` (add `--server <url>` for private cloud / on-prem). This opens a browser for the PKCE flow and stores tokens in the OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service). Requires Node 22 LTS+.
2. Verify a token can be minted: `npx -y @deque/axe-auth token` should print a token. Logout later with `npx -y @deque/axe-auth logout`.

## Step 2 — Choose the client

Ask which client to configure (or use `$1`): Claude Code, Cursor, VS Code (Copilot), Claude Desktop, or generic/other.

The plugin already ships an **auth-agnostic** `.mcp.json` (see plugin root) that works for Claude Code out of the box: it mints an OAuth token and passes **exactly one** credential — `AXE_ACCESS_TOKEN` if an OAuth session exists, otherwise `AXE_API_KEY` (never both, since the server fails when both are set). For Claude Code, installing the plugin is usually enough — confirm the server appears and skip to verification.

For all other clients, emit the correct configuration snippet. Read `references/client-configs.md` and produce the snippet matching the chosen client **and** auth method, then either write it to the client's config file (with the user's confirmation) or print it for them to paste.

**Merge, do not clobber.** Before writing any client config file, read it if it exists and merge the `axe-mcp-server` entry into the existing `mcpServers` (or `servers` for VS Code) object — never overwrite a file that already defines other MCP servers. If unsure, print the snippet for the user to paste instead of writing.

## Step 3 — Private cloud / on-prem (optional)

If the user is on a private or on-prem axe deployment, set `AXE_SERVER_URL` to their server in the same environment as the MCP config, and pass `--server <url>` to `axe-auth login`. The bundled config already forwards `AXE_SERVER_URL` into the container.

## Step 4 — Verify

Confirm the connection works before declaring success:

- **Claude Code:** advise running `/mcp` and confirming `axe-mcp-server` is listed and connected. Then run a smoke `analyze` against a known URL (e.g. `https://dequeuniversity.com/demo/mars`).
- **Other clients:** have the user restart/reload the client, open the MCP/tools panel, confirm the axe tools appear, then run a smoke `analyze`.

If verification fails, consult the troubleshooting section of `references/client-configs.md` (Docker not running, image not pulled, missing credential, Node version for OAuth).

## Step 5 — Suggest next steps

Once connected, recommend:

- `/axe-accessibility:mcp-generate-instructions` to bake the analyze -> remediate -> verify workflow into the repo's agent instructions.
- `/axe-accessibility:mcp-audit <url>` to run the full remediation loop on a page.

## Additional resources

- **`references/client-configs.md`** — per-client Docker config snippets (API key + OAuth) and troubleshooting.

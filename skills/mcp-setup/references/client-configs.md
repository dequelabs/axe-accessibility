# Client configuration snippets

Two independent choices: **distribution** (npm or Docker) and **auth** (API key or OAuth). Pick the shape, then drop it into the client block below. In every snippet the server is named `axe-mcp-server`, which is also the tool prefix (e.g. `mcp__axe-mcp-server__analyze`).

- **npm:** package `axe-mcp-server` (**unscoped** — `@deque/axe-mcp-server` does not exist). Requires Node >= 22.19.0 and a one-time `npx playwright install chromium` — the server does not download a browser itself.
- **Docker:** public image `dequesystems/axe-mcp-server:latest` (anonymously pullable — no `docker login` required).

> **Mutual exclusivity:** the server **fails at startup if both `AXE_API_KEY` and `AXE_ACCESS_TOKEN` are set**. Every shape below passes exactly one credential — never both.

---

## The four auth shapes

### 1. npm + API key (simplest)

```json
{
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "axe-mcp-server"],
  "env": { "AXE_API_KEY": "${AXE_API_KEY}" }
}
```

### 2. npm + OAuth

```json
{
  "type": "stdio",
  "command": "sh",
  "args": ["-c", "unset AXE_API_KEY; export AXE_ACCESS_TOKEN=\"$(npx -y @deque/axe-auth token)\"; exec npx -y axe-mcp-server"]
}
```

> **The `unset` is required, not defensive.** The npm distribution inherits the entire shell environment. If the user has `AXE_API_KEY` exported (very common) *and* an OAuth session, both variables reach the server and it refuses to start. Docker does not have this problem because credentials arrive only via explicit `-e` flags.

### 3. npm, distribution- and auth-agnostic (recommended — ships with the plugin)

Serves both auth methods with one config. If an OAuth session exists it passes only `AXE_ACCESS_TOKEN`; otherwise it leaves the inherited `AXE_API_KEY` in place.

```json
{
  "type": "stdio",
  "command": "sh",
  "args": ["-c", "T=\"$(npx -y @deque/axe-auth token 2>/dev/null)\"; if [ -n \"$T\" ]; then unset AXE_API_KEY; export AXE_ACCESS_TOKEN=\"$T\"; fi; exec npx -y axe-mcp-server"]
}
```

### 4. Docker + API key

```json
{
  "type": "stdio",
  "command": "docker",
  "args": ["run", "--add-host=host.docker.internal:host-gateway", "-i", "--rm", "-e", "AXE_API_KEY", "-e", "AXE_SERVER_URL", "dequesystems/axe-mcp-server:latest"]
}
```

### 5. Docker + OAuth

```json
{
  "type": "stdio",
  "command": "sh",
  "args": ["-c", "export AXE_ACCESS_TOKEN=\"$(npx -y @deque/axe-auth token 2>/dev/null)\"; exec docker run --add-host=host.docker.internal:host-gateway -i --rm -e AXE_ACCESS_TOKEN -e AXE_SERVER_URL dequesystems/axe-mcp-server:latest"]
}
```

### 6. Docker, auth-agnostic

```json
{
  "type": "stdio",
  "command": "sh",
  "args": ["-c", "T=\"$(npx -y @deque/axe-auth token 2>/dev/null)\"; if [ -n \"$T\" ]; then exec docker run --add-host=host.docker.internal:host-gateway -i --rm -e AXE_ACCESS_TOKEN=\"$T\" -e AXE_SERVER_URL dequesystems/axe-mcp-server:latest; else exec docker run --add-host=host.docker.internal:host-gateway -i --rm -e AXE_API_KEY -e AXE_SERVER_URL dequesystems/axe-mcp-server:latest; fi"]
}
```

> **`--add-host` is required in every Docker shape — and meaningless in npm ones.** The server rewrites `localhost` / `127.0.0.1` URLs to `host.docker.internal` so it can reach a dev server on the host from inside the container. Docker Desktop (macOS, Windows) provides that hostname on its own, but Linux does not — without the flag, scanning a local dev server fails with `Failed to resolve an IP address for "host.docker.internal"`. The flag is harmless where the hostname already resolves, so keep it in every Docker config. The npm distribution reaches `localhost` directly and needs none of this.

Set `AXE_API_KEY` and `AXE_SERVER_URL` in the environment that launches the client, not in committed files.

**Windows:** the `sh -c` shapes need a POSIX shell (Git Bash / WSL). On a stock Windows shell, prefer shape 1 (npm + API key) or 4 (Docker + API key).

---

## Environment variables

| Variable | Purpose | Default | Distribution |
|---|---|---|---|
| `AXE_API_KEY` | API key auth. Mutually exclusive with `AXE_ACCESS_TOKEN`. | — | both |
| `AXE_ACCESS_TOKEN` | OAuth 2.0 bearer token. Mutually exclusive with `AXE_API_KEY`. | — | both |
| `AXE_SERVER_URL` | Account Portal base URL; required for regional SaaS, private cloud, on-prem. | `https://axe.deque.com` | both |
| `AXE_ADVANCED_RULES` | Default Advanced Rules confidence preset: `precise` \| `balanced` \| `thorough` \| `disabled`. Individual scans override it with the `advancedRules` parameter. | org default | both |
| `AXE_CHROME_PATH` | Chrome/Chromium binary to use instead of the Playwright-managed install. **Fails at startup if set under Docker.** | Playwright's | **npm only** |
| `BROWSER_TIMEOUT_MS` | Browser interaction timeout. | `30000` | both |
| `LOG_LEVEL` | `debug` \| `info` \| `warn` \| `error`. | `info` | both |

---

## Claude Code

The plugin's bundled `.mcp.json` already configures shape 3 (npm, auth-agnostic). To configure manually instead, add to project `.mcp.json` or user settings:

```json
{
  "mcpServers": {
    "axe-mcp-server": { <one of the shapes above> }
  }
}
```

Verify with `/mcp`.

## Cursor

Edit `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project):

```json
{
  "mcpServers": {
    "axe-mcp-server": { <one of the shapes above> }
  }
}
```

Reload Cursor, then check Settings -> MCP for green status.

## VS Code (Copilot)

Edit `.vscode/mcp.json` (workspace) — note VS Code nests servers under a `servers` key:

```json
{
  "servers": {
    "axe-mcp-server": { <one of the shapes above> }
  }
}
```

Reload the window; confirm the tools appear in Copilot's tool picker.

VS Code caches MCP tool schemas aggressively. After any change that alters the advertised schema — an entitlement or feature flag being enabled, or a server upgrade — **quit and relaunch VS Code entirely**; "Restart Server" respawns the process but can keep serving the cached tool definitions.

## Claude Desktop

Edit `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`):

```json
{
  "mcpServers": {
    "axe-mcp-server": { <one of the shapes above> }
  }
}
```

Provide credentials via the `env` object here since Desktop does not inherit a shell environment, e.g. add `"env": { "AXE_API_KEY": "..." }` to the server entry. For the same reason, prefer an API-key shape on Desktop — the OAuth shapes rely on a shell. Restart Claude Desktop.

---

## Troubleshooting

### Either distribution

- **401 / auth errors:** confirm `AXE_API_KEY` is exported in the client's launch environment, or that `npx -y @deque/axe-auth token` prints a token (re-run `login` if not).
- **Server exits immediately at startup:** most often both `AXE_API_KEY` and `AXE_ACCESS_TOKEN` are set. Under npm this happens silently via inherited environment — see the `unset` note above.
- **OAuth token expired:** since 1.4.0 the error tells you what to do — re-authenticate with `npx -y @deque/axe-auth login` and restart the MCP server connection.
- **Long sessions:** if calls start failing after hours, restart the MCP server connection to force a token refresh.
- **A newly enabled feature doesn't show up (e.g. `analyze` has no `advancedRules` parameter after Advanced Rules were turned on):** the server resolves feature flags **once at startup**, before it accepts a connection, and never emits `tools/list_changed`. So the advertised schema is fixed for the life of the process, and clients cache it on top of that. **Fully quit and relaunch the client** — in VS Code, "Restart Server" alone is not enough; a complete quit and relaunch is. Then start a new chat session, since the tool list handed to the model can be cached per session. Verify with `LOG_LEVEL=debug` and look for the `Fetched feature flags` line in the client's MCP output.
- **`Selector did not match any element on the page`:** an `analyze`/`igt` `selector` matched nothing, which fails the whole scan. Confirm the selector exists (or omit it) rather than guessing.
- **Result too large for the client:** real pages produce big payloads (~85KB from `analyze`, several hundred KB from `igt`). Scope with `selector`, or read the spilled result file and extract only the fields needed.
- **Private cloud:** set `AXE_SERVER_URL` and pass `--server <url>` to `login`.

### npm only

- **Server won't start:** check `node --version` >= 22.19.0.
- **`Chromium is not installed. Run npx playwright@<version> install chromium`:** the npm distribution does **not** download a browser automatically — this is the most common first-run failure. Run the exact command from the error message (it pins the Playwright version the server expects), then retry. Docs: https://docs.deque.com/devtools-server/4.0.0/en/troubleshooting-chromium
- **Other browser launch failures:** to use an existing binary instead of the Playwright-managed one, set `AXE_CHROME_PATH` to a **Chrome for Testing** or other Chromium-compatible binary — branded Google Chrome stable 137+ is not supported.
- **`AXE_CHROME_PATH` rejected on Windows:** fixed in 1.4.0 (the path is now validated by existence rather than by a `--version` exit code). Upgrade if a valid path crashes startup.

### Docker only

- **Server not listed / won't connect:** ensure Docker Desktop is running and the image is pulled (`docker pull dequesystems/axe-mcp-server:latest`).
- **`Failed to resolve an IP address for "host.docker.internal"`:** the `docker run` args are missing `--add-host=host.docker.internal:host-gateway`. Add it (most common on Linux) and restart the server.
- **`net::ERR_CONNECTION_REFUSED` scanning a local dev server:** the dev server is bound only to `127.0.0.1` and is unreachable from the container. Restart it listening on all interfaces, e.g. `npm run dev -- --host=0.0.0.0`. (Switching to the npm distribution avoids this class of problem entirely.)
- **`AXE_CHROME_PATH` set:** remove it — it fails at startup under Docker.
- **Stale version — features documented but missing:** `:latest` does **not** auto-update an already-pulled image, so a machine can sit on an old release indefinitely while npm users are current. Symptom: a documented parameter has no effect, or a release-noted feature is absent (e.g. an image still on 1.3.0 has no `screenshot` support). Confirm the running version — the MCP `initialize` response carries `serverInfo.version` — then `docker pull dequesystems/axe-mcp-server:latest` and restart the connection. The npm distribution does not have this failure mode.

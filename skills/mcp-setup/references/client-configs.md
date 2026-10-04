# Client configuration snippets

Two independent choices: **distribution** (npm or Docker) and **auth** (API key or OAuth). Pick the shape, then drop it into the client block below. In every snippet the server is named `axe-mcp-server`, which is also the tool prefix (e.g. `mcp__axe-mcp-server__analyze`).

- **npm:** package `axe-mcp-server` (**unscoped** — `@deque/axe-mcp-server` does not exist), pinned to **`axe-mcp-server@1.6.0`** and `@deque/axe-auth@1.6.0`. Requires Node >= 22.19.0 and a one-time Chromium install, with Playwright **pinned** to the version the server ships (`npx -y playwright@1.62.1 install chromium`) — the server does not download a browser itself, and an unpinned install can fetch an unsupported Chromium revision.
- **Docker:** public image `dequesystems/axe-mcp-server:latest` (anonymously pullable — no `docker login` required).

> **Why the npm shapes pin exact versions, and Docker can't.** The plugin's guidance documents server 1.6.0's response shapes — for example, guided-test results keyed by tool name under `data.igt`. An exact pin keeps the running server matched to that guidance and to what was reviewed, and the Playwright pin (`1.62.1`) is the version that server release depends on, so the browser always matches.
>
> A Docker tag has no range equivalent, so the Docker shapes use `:latest` and are unbounded in both directions: a `docker pull` can cross into 2.x, and an already-pulled image never refreshes on its own, so a container can also sit far *behind* 1.6.0. Treat the Docker version as something the user manages, not something the config guarantees.
>
> If the server and this guidance ever disagree, the server wins: it generates its own tool descriptions and schemas at runtime, so the agent always sees the live shape. `serverInfo.version` in the MCP `initialize` response reports what is actually running.

> **Mutual exclusivity:** the server **fails at startup if both `AXE_API_KEY` and `AXE_ACCESS_TOKEN` are set**. Every shape below passes exactly one credential — never both.

---

## The six distribution × auth shapes

Shapes 1–3 are npm, 4–6 are Docker. Later sections refer to these by number.

### 1. npm + API key (simplest)

```json
{
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "axe-mcp-server@1.6.0"],
  "env": { "AXE_API_KEY": "${AXE_API_KEY}" }
}
```

### 2. npm + OAuth

```json
{
  "type": "stdio",
  "command": "sh",
  "args": ["-c", "unset AXE_API_KEY; export AXE_ACCESS_TOKEN=\"$(npx -y @deque/axe-auth@1.6.0 token)\"; exec npx -y axe-mcp-server@1.6.0"]
}
```

> **The `unset` is required, not defensive.** The npm distribution inherits the entire shell environment. If the user has `AXE_API_KEY` exported (very common) *and* an OAuth session, both variables reach the server and it refuses to start. Docker does not have this problem because credentials arrive only via explicit `-e` flags.
>
> The same reasoning runs the other way, which is why shape 3 opens with `unset AXE_ACCESS_TOKEN`: a stale `AXE_ACCESS_TOKEN` exported in the shell would otherwise survive alongside `AXE_API_KEY` whenever no OAuth session is available, producing the identical both-credentials startup failure. Any npm wrapper must clear whichever variable it is not deliberately setting.

### 3. npm, auth-agnostic (recommended — ships with the plugin)

Serves both auth methods with one config — **npm only**; Docker needs shape 6. It clears any inherited `AXE_ACCESS_TOKEN` first, drops an empty `AXE_API_KEY`, then passes only a freshly minted `AXE_ACCESS_TOKEN` if an OAuth session exists, otherwise leaves `AXE_API_KEY` in place.

```json
{
  "type": "stdio",
  "command": "sh",
  "args": ["-c", "unset AXE_ACCESS_TOKEN; [ -n \"$AXE_API_KEY\" ] || unset AXE_API_KEY; T=\"$(npx -y @deque/axe-auth@1.6.0 token 2>/dev/null)\"; if [ -n \"$T\" ]; then unset AXE_API_KEY; export AXE_ACCESS_TOKEN=\"$T\"; fi; exec npx -y axe-mcp-server@1.6.0"]
}
```

The plugin's own `.mcp.json` is this shape plus `"env": { "AXE_API_KEY": "${user_config.api_key}" }`: in Claude Code the API key comes from the plugin's **Axe API key** option (stored in the system keychain), not from the shell, and an exported `AXE_API_KEY` is ignored. Left blank, the option arrives as an empty string, which the script unsets so OAuth works. Other clients have no plugin options, so this standalone shape reads `AXE_API_KEY` from the client's launch environment.

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
  "args": ["-c", "export AXE_ACCESS_TOKEN=\"$(npx -y @deque/axe-auth@1.6.0 token 2>/dev/null)\"; exec docker run --add-host=host.docker.internal:host-gateway -i --rm -e AXE_ACCESS_TOKEN -e AXE_SERVER_URL dequesystems/axe-mcp-server:latest"]
}
```

### 6. Docker, auth-agnostic

```json
{
  "type": "stdio",
  "command": "sh",
  "args": ["-c", "T=\"$(npx -y @deque/axe-auth@1.6.0 token 2>/dev/null)\"; if [ -n \"$T\" ]; then exec docker run --add-host=host.docker.internal:host-gateway -i --rm -e AXE_ACCESS_TOKEN=\"$T\" -e AXE_SERVER_URL dequesystems/axe-mcp-server:latest; else exec docker run --add-host=host.docker.internal:host-gateway -i --rm -e AXE_API_KEY -e AXE_SERVER_URL dequesystems/axe-mcp-server:latest; fi"]
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
| `AXE_SCREENSHOT_DIR` | Directory `analyze` writes screenshots to when called with `screenshot: { save: true }`. Under Docker it is inside the container — mount a volume to reach it. | OS temp dir | both |
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

- **401 / auth errors:** with the Claude Code plugin, confirm the **Axe API key** option is filled in (`/config`); with any other client, confirm `AXE_API_KEY` is exported in the client's launch environment. For OAuth, confirm that `npx -y @deque/axe-auth@1.6.0 token` prints a token (re-run `login` if not).
- **Server exits immediately at startup:** most often both `AXE_API_KEY` and `AXE_ACCESS_TOKEN` are set. Under npm this happens silently via inherited environment — see the `unset` note above.
- **OAuth token expired:** since 1.4.0 the error tells you what to do — re-authenticate with `npx -y @deque/axe-auth@1.6.0 login` and restart the MCP server connection.
- **Long sessions:** if calls start failing after hours, restart the MCP server connection to force a token refresh.
- **A newly enabled feature doesn't show up (e.g. `analyze` has no `advancedRules` parameter after Advanced Rules were turned on):** the server resolves feature flags **once at startup**, before it accepts a connection, and never emits `tools/list_changed`. So the advertised schema is fixed for the life of the process, and clients cache it on top of that. **Fully quit and relaunch the client** — in VS Code, "Restart Server" alone is not enough; a complete quit and relaunch is. Then start a new chat session, since the tool list handed to the model can be cached per session. Verify with `LOG_LEVEL=debug` and look for the `Fetched feature flags` line in the client's MCP output.
- **`Selector did not match any element on the page`:** an `analyze` `selector` matched nothing, which fails the whole scan. Confirm the selector exists (or omit it) rather than guessing.
- **Result too large for the client:** real pages produce big payloads (~85KB from a plain `analyze`, more when guided tests add their `igtElements` inventory). Scope with `selector`, or read the spilled result file and extract only the fields needed.
- **Private cloud:** set `AXE_SERVER_URL` and pass `--server <url>` to `login`.

### npm only

- **Server won't start:** check `node --version` >= 22.19.0.
- **`Chromium is not installed. Run npx playwright@<version> install chromium`:** the npm distribution does **not** download a browser automatically. Run that message's command **verbatim** — the version it names is the running server's actual Playwright pin, which beats any version computed earlier. A bare `npx playwright install chromium` is not a substitute: it resolves to Playwright's latest and can install a Chromium revision the server rejects, so an unpinned install can leave you with this same error. Docs: https://docs.deque.com/devtools-server/4.0.0/en/troubleshooting#chromium-installation-npm
- **Other browser launch failures:** to use an existing binary instead of the Playwright-managed one, set `AXE_CHROME_PATH` to a **Chrome for Testing** or other Chromium-compatible binary — branded Google Chrome stable 137+ is not supported.
- **`AXE_CHROME_PATH` rejected on Windows:** fixed in 1.4.0 (the path is now validated by existence rather than by a `--version` exit code). Upgrade if a valid path crashes startup.

### Docker only

- **Server not listed / won't connect:** ensure Docker Desktop is running and the image is pulled (`docker pull dequesystems/axe-mcp-server:latest`).
- **`Failed to resolve an IP address for "host.docker.internal"`:** the `docker run` args are missing `--add-host=host.docker.internal:host-gateway`. Add it (most common on Linux) and restart the server.
- **`net::ERR_CONNECTION_REFUSED` scanning a local dev server:** the dev server is bound only to `127.0.0.1` and is unreachable from the container. Restart it listening on all interfaces, e.g. `npm run dev -- --host=0.0.0.0`. (Switching to the npm distribution avoids this class of problem entirely.)
- **`AXE_CHROME_PATH` set:** remove it — it fails at startup under Docker.
- **Stale version — features documented but missing:** `:latest` does **not** auto-update an already-pulled image, so a machine can sit on an old release indefinitely while npm users move forward. Symptom: a documented parameter has no effect, or a release-noted feature is absent (e.g. no `igtTools` on `analyze`, which needs 1.5.0+). Confirm the running version — the MCP `initialize` response carries `serverInfo.version` — then `docker pull dequesystems/axe-mcp-server:latest` and restart the connection. The npm distribution does not have this failure mode.

# Client configuration snippets

Pick the block matching the **client**, then the **auth method**. The server runs as the public Docker image `dequesystems/axe-mcp-server:latest` (anonymously pullable — no `docker login` required).

In every snippet the server is named `axe-mcp-server`, which is also the tool prefix (e.g. `mcp__axe-mcp-server__analyze`).

## The two auth shapes

> **Mutual exclusivity:** the server **fails at startup if both `AXE_API_KEY` and `AXE_ACCESS_TOKEN` are set**. Every shape below passes exactly one credential — never both.

**API key (Docker):** a plain `docker run` that forwards `AXE_API_KEY` from the environment.

```json
{
  "command": "docker",
  "args": ["run", "-i", "--rm", "-e", "AXE_API_KEY", "-e", "AXE_SERVER_URL", "dequesystems/axe-mcp-server:latest"]
}
```

**OAuth (Docker):** wrap in `sh -c` so a fresh access token is minted at each start. Passes only `AXE_ACCESS_TOKEN`.

```json
{
  "command": "sh",
  "args": ["-c", "export AXE_ACCESS_TOKEN=\"$(npx -y @deque/axe-auth token 2>/dev/null)\"; exec docker run -i --rm -e AXE_ACCESS_TOKEN -e AXE_SERVER_URL dequesystems/axe-mcp-server:latest"]
}
```

**Auth-agnostic (recommended, ships with the plugin):** one config that serves both. It mints an OAuth token; if a session exists it passes only `AXE_ACCESS_TOKEN`, otherwise only `AXE_API_KEY` — never both, so the mutual-exclusivity rule holds. OAuth takes precedence when both are available.

```json
{
  "command": "sh",
  "args": ["-c", "T=\"$(npx -y @deque/axe-auth token 2>/dev/null)\"; if [ -n \"$T\" ]; then exec docker run -i --rm -e AXE_ACCESS_TOKEN=\"$T\" -e AXE_SERVER_URL dequesystems/axe-mcp-server:latest; else exec docker run -i --rm -e AXE_API_KEY -e AXE_SERVER_URL dequesystems/axe-mcp-server:latest; fi"]
}
```

Set `AXE_API_KEY` and/or `AXE_SERVER_URL` in the environment that launches the client, not in committed files.

## Claude Code

The plugin's bundled `.mcp.json` already configures this (auth-agnostic). To configure manually instead, add to project `.mcp.json` or user settings:

```json
{
  "mcpServers": {
    "axe-mcp-server": { <one of the auth shapes above> }
  }
}
```

Verify with `/mcp`.

## Cursor

Edit `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project):

```json
{
  "mcpServers": {
    "axe-mcp-server": { <one of the auth shapes above> }
  }
}
```

Reload Cursor, then check Settings -> MCP for green status.

## VS Code (Copilot)

Edit `.vscode/mcp.json` (workspace) — note VS Code nests servers under a `servers` key:

```json
{
  "servers": {
    "axe-mcp-server": { <one of the auth shapes above> }
  }
}
```

Reload the window; confirm the tools appear in Copilot's tool picker.

## Claude Desktop

Edit `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`):

```json
{
  "mcpServers": {
    "axe-mcp-server": { <one of the auth shapes above> }
  }
}
```

Provide credentials via the `env` object here since Desktop does not inherit a shell environment, e.g. add `"env": { "AXE_API_KEY": "..." }` to the server entry. Restart Claude Desktop.

## Troubleshooting

- **Server not listed / won't connect:** ensure Docker Desktop is running and the image is pulled (`docker pull dequesystems/axe-mcp-server:latest`).
- **401 / auth errors:** confirm `AXE_API_KEY` is exported in the client's launch environment, or that `npx -y @deque/axe-auth token` prints a token (re-run `login` if not).
- **OAuth token empty:** Node 22 LTS+ is required; re-run `npx -y @deque/axe-auth login`.
- **Private cloud:** set `AXE_SERVER_URL` and pass `--server <url>` to `login`.
- **Long sessions:** if calls start failing after hours, restart the MCP server connection to force a token refresh.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const mcpConfig = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8"));
const server = mcpConfig.mcpServers["axe-mcp-server"];

const EXACT_SEMVER = String.raw`\d+\.\d+\.\d+`;

const stubNpx = `#!/bin/sh
printf '%s\\n' "$*" >> "$STUB_DIR/calls"
case "$*" in
  *@deque/axe-auth@*)
    if [ -n "$STUB_TOKEN" ]; then printf '%s\\n' "$STUB_TOKEN"; fi
    exit "$STUB_AUTH_STATUS"
    ;;
esac
{
  if [ -n "\${AXE_API_KEY+x}" ]; then printf 'AXE_API_KEY=%s\\n' "$AXE_API_KEY"; fi
  if [ -n "\${AXE_ACCESS_TOKEN+x}" ]; then printf 'AXE_ACCESS_TOKEN=%s\\n' "$AXE_ACCESS_TOKEN"; fi
} > "$STUB_DIR/server-env"
`;

function readLines(path) {
  return readFileSync(path, "utf8").split("\n").filter(Boolean);
}

// Launches the server the way Claude Code does from .mcp.json, with npx
// replaced by a stub that fakes axe-auth and records what the server receives.
function launch({ apiKey, token, authStatus = token ? 0 : 1, env = {} }) {
  const dir = mkdtempSync(join(tmpdir(), "axe-mcp-launch-"));
  try {
    writeFileSync(join(dir, "npx"), stubNpx);
    chmodSync(join(dir, "npx"), 0o755);

    const serverEnv = Object.fromEntries(
      Object.entries(server.env).map(([name, value]) => [
        name,
        value.replaceAll("${user_config.api_key}", apiKey ?? ""),
      ]),
    );
    const args = server.args.map((arg) =>
      arg.replaceAll("${CLAUDE_PLUGIN_ROOT}", root),
    );
    const result = spawnSync(server.command, args, {
      encoding: "utf8",
      env: {
        PATH: `${dir}${delimiter}${process.env.PATH}`,
        STUB_DIR: dir,
        STUB_TOKEN: token ?? "",
        STUB_AUTH_STATUS: String(authStatus),
        ...env,
        ...serverEnv,
      },
    });
    assert.equal(result.status, 0, result.stderr);

    const received = Object.fromEntries(
      readLines(join(dir, "server-env")).map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i), line.slice(i + 1)];
      }),
    );
    assert.ok(
      !("AXE_API_KEY" in received && "AXE_ACCESS_TOKEN" in received),
      `server started with both credentials: ${JSON.stringify(received)}`,
    );
    return { received, calls: readLines(join(dir, "calls")) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test(".mcp.json launches the script with the api_key option as AXE_API_KEY", () => {
  assert.equal(server.command, "sh");
  assert.deepEqual(server.args, [
    "${CLAUDE_PLUGIN_ROOT}/scripts/start-axe-mcp-server.sh",
  ]);
  assert.deepEqual(server.env, { AXE_API_KEY: "${user_config.api_key}" });
});

test("uses the OAuth token and drops the API key when a session exists", () => {
  const { received } = launch({ apiKey: "key-123", token: "oauth-abc" });
  assert.deepEqual(received, { AXE_ACCESS_TOKEN: "oauth-abc" });
});

test("uses the OAuth token when no API key is configured", () => {
  const { received } = launch({ token: "oauth-abc" });
  assert.deepEqual(received, { AXE_ACCESS_TOKEN: "oauth-abc" });
});

test("uses the API key when axe-auth has no session", () => {
  const { received } = launch({ apiKey: "key-123" });
  assert.deepEqual(received, { AXE_API_KEY: "key-123" });
});

test("uses the API key when axe-auth succeeds without printing a token", () => {
  const { received } = launch({ apiKey: "key-123", authStatus: 0 });
  assert.deepEqual(received, { AXE_API_KEY: "key-123" });
});

test("drops an inherited AXE_ACCESS_TOKEN when axe-auth has no session", () => {
  const { received } = launch({
    apiKey: "key-123",
    env: { AXE_ACCESS_TOKEN: "stale-token" },
  });
  assert.deepEqual(received, { AXE_API_KEY: "key-123" });
});

test("replaces an inherited AXE_ACCESS_TOKEN with the OAuth session's", () => {
  const { received } = launch({
    apiKey: "key-123",
    token: "oauth-abc",
    env: { AXE_ACCESS_TOKEN: "stale-token" },
  });
  assert.deepEqual(received, { AXE_ACCESS_TOKEN: "oauth-abc" });
});

test("launches exact pinned versions of axe-auth and the server", () => {
  const { calls } = launch({ apiKey: "key-123" });
  assert.equal(calls.length, 2);
  assert.match(
    calls[0],
    new RegExp(`^-y @deque/axe-auth@${EXACT_SEMVER} token$`),
  );
  assert.match(calls[1], new RegExp(`^-y axe-mcp-server@${EXACT_SEMVER}$`));
});

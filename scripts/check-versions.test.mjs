import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./check-versions.mjs", import.meta.url));

function manifests(pluginVersion, marketplaceVersion = pluginVersion) {
  return {
    ".claude-plugin/plugin.json": JSON.stringify({
      name: "axe-accessibility",
      version: pluginVersion,
    }),
    ".claude-plugin/marketplace.json": JSON.stringify({
      plugins: [
        { name: "something-else", version: "9.9.9" },
        { name: "axe-accessibility", version: marketplaceVersion },
      ],
    }),
  };
}

function write(dir, files) {
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
}

// Files are added to the index, as in a CI checkout; `untracked` files are
// written afterwards, as new files are before a pre-commit run.
function check(files, { untracked = {}, deleted = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "versions-"));
  try {
    spawnSync("git", ["init", "-q", dir]);
    write(dir, { ...manifests("0.3.2"), ...files });
    spawnSync("git", ["-C", dir, "add", "-A"]);
    write(dir, untracked);
    for (const name of deleted) rmSync(join(dir, name));
    return spawnSync(process.execPath, [script, dir], { encoding: "utf8" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const readme = `
### Why the server is pinned to \`1.6.0\`

The plugin is documented against **1.6.0** and runs \`npx -y axe-mcp-server@1.6.0\`.
Log in with \`npx -y @deque/axe-auth@1.6.0 login\`.
Install a browser with \`npx -y playwright@1.62.1 install chromium\`.
| Updates | with each plugin release (pinned \`1.6.0\`) | pinned \`v1.6.0\` |
| Command | \`docker run … dequesystems/axe-mcp-server:v1.6.0\` |
`;

const skill = `
The shapes described here are those of **server 1.6.0**. The bundled config is
pinned to 1.6.0 and the documented Docker image is tagged \`v1.6.0\`.
This guidance documents server 1.6.0's response shapes, and the Playwright pin
(\`1.62.1\`) is the version that server depends on. Docker uses the \`v1.6.0\`
image tag. All shapes below are the wire format of Axe MCP Server 1.6.0.
Docker users can sit _behind_ 1.6.0.
`;

const startScript = `#!/bin/sh
token=$(npx -y @deque/axe-auth@1.6.0 token 2>/dev/null)
exec npx -y axe-mcp-server@1.6.0
`;

test("passes when every pin agrees", () => {
  const result = check({
    "README.md": readme,
    "skills/setup/SKILL.md": skill,
    "scripts/start.sh": startScript,
  });
  assert.equal(result.status, 0, result.stderr);
});

test("fails and names each disagreeing file when one file is bumped", () => {
  const result = check({
    "README.md": readme,
    "skills/setup/SKILL.md": skill,
    "scripts/start.sh": startScript.replace(
      "axe-mcp-server@1.6.0",
      "axe-mcp-server@1.7.0",
    ),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /axe-mcp-server/);
  assert.match(result.stderr, /1\.6\.0[\s\S]*README\.md:4/);
  assert.match(result.stderr, /1\.6\.0[\s\S]*skills\/setup\/SKILL\.md:2/);
  assert.match(result.stderr, /1\.7\.0[\s\S]*scripts\/start\.sh:3/);
  assert.doesNotMatch(result.stderr, /axe-auth/);
  assert.doesNotMatch(result.stderr, /playwright/i);
});

test("fails when @deque/axe-auth disagrees", () => {
  const result = check({
    "README.md": readme,
    "scripts/start.sh": startScript.replace("axe-auth@1.6.0", "axe-auth@1.6.1"),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /@deque\/axe-auth/);
  assert.match(result.stderr, /1\.6\.1[\s\S]*scripts\/start\.sh:2/);
});

test("fails when the Playwright pin disagrees", () => {
  const result = check({
    "README.md": readme,
    "skills/setup/SKILL.md": skill.replace("(`1.62.1`)", "(`1.63.0`)"),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /playwright/i);
  assert.match(result.stderr, /1\.63\.0[\s\S]*skills\/setup\/SKILL\.md:5/);
  assert.match(result.stderr, /1\.62\.1[\s\S]*README\.md:6/);
});

test("fails when the Docker image tag differs from the npm pin", () => {
  const result = check({
    "README.md": readme.replace(
      "axe-mcp-server:v1.6.0",
      "axe-mcp-server:v1.5.0",
    ),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /1\.5\.0[\s\S]*README\.md:8/);
  assert.match(result.stderr, /dequesystems\/axe-mcp-server:v1\.5\.0/);
});

for (const [name, before, after] of [
  ["pinned `X`", "pinned `1.6.0`", "pinned `1.7.0`"],
  ["pinned to `X`", "pinned to `1.6.0`", "pinned to `1.7.0`"],
  ["pinned `vX`", "pinned `v1.6.0`", "pinned `v1.7.0`"],
  ["documented against X", "against **1.6.0**", "against **1.7.0**"],
]) {
  test(`recognizes the README prose pin "${name}"`, () => {
    const result = check({ "README.md": readme.replace(before, after) });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /1\.7\.0[\s\S]*README\.md:\d+/);
  });
}

for (const [name, before, after] of [
  ["of server X", "of **server 1.6.0**", "of **server 1.7.0**"],
  ["pinned to X", "pinned to 1.6.0", "pinned to 1.7.0"],
  ["tagged `vX`", "tagged `v1.6.0`", "tagged `v1.7.0`"],
  ["documents server X", "documents server 1.6.0", "documents server 1.7.0"],
  ["`vX` image tag", "`v1.6.0`\nimage tag", "`v1.7.0`\nimage tag"],
  ["Axe MCP Server X", "Axe MCP Server 1.6.0", "Axe MCP Server 1.7.0"],
  ["behind X", "_behind_ 1.6.0", "_behind_ 1.7.0"],
]) {
  test(`recognizes the skill prose pin "${name}"`, () => {
    const result = check({
      "README.md": readme,
      "skills/setup/SKILL.md": skill.replace(before, after),
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /1\.7\.0[\s\S]*skills\/setup\/SKILL\.md:\d+/);
  });
}

test("ignores historical and unrelated versions", () => {
  const result = check({
    "README.md": readme,
    "skills/history/SKILL.md": `
Since server 1.4.0, \`analyze\` merges Advanced Rules findings.
\`igtTools\` needs 1.5.0+. Fixed in 1.4.0. Introduced in 1.2.0.
If you relied on one before 0.3.1, enter it in the option.
Check for guidance written against the pre-1.3.0 tool contract.
Requires Node >= 22.19.0. Bind to \`0.0.0.0\` or \`127.0.0.1\`.
See https://docs.deque.com/devtools-server/4.0.0/en/axe-mcp-server.
Docker users on \`:latest\` can sit behind the current release.
`,
  });
  assert.equal(result.status, 0, result.stderr);
});

test("ignores files that are not md, json, sh, or yaml", () => {
  const result = check({
    "README.md": readme,
    "scripts/fixture.test.mjs": "npx -y axe-mcp-server@0.0.1",
  });
  assert.equal(result.status, 0, result.stderr);
});

test("ignores gitignored files, which CI never sees", () => {
  const result = check({
    "README.md": readme,
    ".gitignore": "node_modules/\n*.local.md\n",
    "node_modules/pkg/README.md": "npx -y axe-mcp-server@0.0.1",
    "notes.local.md": "npx -y axe-mcp-server@0.0.1",
  });
  assert.equal(result.status, 0, result.stderr);
});

test("scans new files git does not track yet", () => {
  const result = check(
    { "README.md": readme },
    { untracked: { "notes.md": "npx -y axe-mcp-server@0.0.1" } },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /notes\.md:1/);
});

test("skips tracked files deleted from the working tree", () => {
  const result = check(
    { "README.md": readme, "old.md": "npx -y axe-mcp-server@1.6.0" },
    { deleted: ["old.md"] },
  );
  assert.equal(result.status, 0, result.stderr);
});

test("scans json, sh, and yaml files", () => {
  for (const file of ["config.json", "run.sh", "ci.yml", "ci.yaml"]) {
    const result = check({
      "README.md": readme,
      [file]: "npx -y axe-mcp-server@0.0.1",
    });
    assert.equal(result.status, 1, file);
    assert.match(result.stderr, new RegExp(`${file.replace(".", "\\.")}:1`));
  }
});

test("fails when plugin.json and marketplace.json versions differ", () => {
  const result = check({
    "README.md": readme,
    ...manifests("0.3.3", "0.3.2"),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /0\.3\.3\s+\.claude-plugin\/plugin\.json/);
  assert.match(result.stderr, /0\.3\.2\s+\.claude-plugin\/marketplace\.json/);
});

test("fails when marketplace.json has no entry for the plugin", () => {
  const result = check({
    "README.md": readme,
    ".claude-plugin/marketplace.json": JSON.stringify({ plugins: [] }),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /marketplace\.json/);
});

test("passes when the marketplace entry leaves the version to plugin.json", () => {
  const result = check({
    "README.md": readme,
    ".claude-plugin/marketplace.json": JSON.stringify({
      plugins: [{ name: "axe-accessibility" }],
    }),
  });
  assert.equal(result.status, 0, result.stderr);
});

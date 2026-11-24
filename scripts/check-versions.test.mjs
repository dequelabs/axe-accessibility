import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./check-versions.mjs", import.meta.url));

function manifests(
  pluginVersion,
  marketplaceVersion = pluginVersion,
  ref = `v${pluginVersion}`,
) {
  return {
    ".claude-plugin/plugin.json": JSON.stringify({
      name: "axe-accessibility",
      version: pluginVersion,
    }),
    ".claude-plugin/marketplace.json": JSON.stringify({
      plugins: [
        { name: "something-else", version: "9.9.9" },
        {
          name: "axe-accessibility",
          version: marketplaceVersion,
          source: { source: "url", url: "https://example.test/x.git", ref },
        },
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
function check(files, { untracked = {}, deleted = [], staged = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "versions-"));
  try {
    spawnSync("git", ["init", "-q", dir]);
    write(dir, { ...manifests("0.3.2"), ...files });
    spawnSync("git", ["-C", dir, "add", "-A"]);
    write(dir, untracked);
    for (const name of deleted) rmSync(join(dir, name));
    const args = staged ? [script, "--staged", dir] : [script, dir];
    return spawnSync(process.execPath, args, { encoding: "utf8" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const readme = `
### Why the server is pinned to \`1.6.0\`

The plugin is documented against **1.6.0** and runs \`npx -y axe-mcp-server@1.6.0\`.
Log in with \`npx -y @deque/axe-auth@1.6.0 login\`.
Log out with \`npx -y @deque/axe-auth@1.6.0 logout\`.
Install a browser with \`npx -y playwright@1.62.1 install chromium\`.
Or reinstall it with \`npx -y playwright@1.62.1 install --force chromium\`.
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
Compare \`serverInfo.version\` from the MCP \`initialize\` response with \`1.6.0\`.
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
  assert.match(result.stderr, /1\.62\.1[\s\S]*README\.md:7/);
});

test("fails when the Docker image tag differs from the npm pin", () => {
  const result = check({
    "README.md": readme.replace(
      "axe-mcp-server:v1.6.0",
      "axe-mcp-server:v1.5.0",
    ),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /1\.5\.0[\s\S]*README\.md:10/);
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
  ["`serverInfo.version` … with `X`", "with `1.6.0`", "with `1.7.0`"],
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

test("compares hyphenated prerelease and build identifiers in full", () => {
  const result = check({
    "README.md": readme.replaceAll("1.6.0", "1.7.0-beta-1+build-5"),
    "skills/setup/SKILL.md": skill.replaceAll("1.6.0", "1.7.0-beta-2+build-5"),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /1\.7\.0-beta-1\+build-5\n/);
  assert.match(result.stderr, /1\.7\.0-beta-2\+build-5\n/);
});

test("leaves sentence punctuation out of a prerelease version", () => {
  const result = check({
    "README.md": readme.replaceAll("1.6.0", "1.7.0-rc.1"),
    "skills/setup/SKILL.md": skill.replaceAll("1.6.0", "1.7.0-rc.1"),
  });
  assert.equal(result.status, 0, result.stderr);
});

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

test("ignores CHANGELOG.md, which records past pins", () => {
  const result = check({
    "README.md": readme,
    "CHANGELOG.md":
      "# Changelog\n\n## [0.3.3](https://x.test) (2026-12-01)\n\n- Pin axe-mcp-server@1.5.0 ([abc](https://x.test))\n",
  });
  assert.equal(result.status, 0, result.stderr);
});

test("fails when a pin is found fewer than twice, so a rewording can't disable it", () => {
  const result = check({
    "README.md": "The server is pinned to a current release.",
  });
  assert.equal(result.status, 1);
  for (const pin of ["axe-mcp-server", "@deque/axe-auth", "playwright"]) {
    assert.match(result.stderr, new RegExp(`${pin}: found 0`));
  }
  assert.match(result.stderr, /PINS/);
});

test("fails when a pin is found only once", () => {
  const result = check({
    "README.md": "Run `npx -y axe-mcp-server@1.6.0`.",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /axe-mcp-server: found 1/);
});

test("matches a pin phrasing at the start of a sentence", () => {
  const result = check({
    "README.md": readme,
    "skills/setup/SKILL.md":
      "Pinned to `1.7.0` for now. Documented against 1.7.0.",
  });
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /1\.7\.0[\s\S]*skills\/setup\/SKILL\.md:1 {2}Pinned to 1\.7\.0/,
  );
  assert.match(
    result.stderr,
    /skills\/setup\/SKILL\.md:1 {2}Documented against 1\.7\.0/,
  );
});

test("with --staged, checks what would be committed rather than the working tree", () => {
  const result = check(
    {
      "README.md": readme,
      "scripts/start.sh": startScript.replace(
        "axe-mcp-server@1.6.0",
        "axe-mcp-server@1.7.0",
      ),
    },
    { untracked: { "scripts/start.sh": startScript }, staged: true },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /1\.7\.0\n\s+scripts\/start\.sh:3/);
});

test("with --staged, ignores files that are not staged", () => {
  const result = check(
    { "README.md": readme },
    { untracked: { "notes.md": "npx -y axe-mcp-server@0.0.1" }, staged: true },
  );
  assert.equal(result.status, 0, result.stderr);
});

test("with --staged, still checks staged files deleted from the working tree", () => {
  const result = check(
    { "README.md": readme, "old.md": "npx -y axe-mcp-server@1.7.0" },
    { deleted: ["old.md"], staged: true },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /old\.md:1/);
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
      plugins: [
        {
          name: "axe-accessibility",
          source: {
            source: "url",
            url: "https://example.test/x.git",
            ref: "v0.3.2",
          },
        },
      ],
    }),
  });
  assert.equal(result.status, 0, result.stderr);
});

test("fails when the marketplace source ref is not the plugin.json version's tag", () => {
  const result = check({
    "README.md": readme,
    ...manifests("0.4.0", "0.4.0", "v0.3.2"),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /0\.4\.0\s+\.claude-plugin\/plugin\.json/);
  assert.match(
    result.stderr,
    /0\.3\.2\s+\.claude-plugin\/marketplace\.json\s+plugins\[name=axe-accessibility\]\.source\.ref/,
  );
});

test("fails when the marketplace source ref has no v prefix", () => {
  const result = check({
    "README.md": readme,
    ...manifests("0.3.2", "0.3.2", "0.3.2"),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /source\.ref/);
});

test("fails when the marketplace entry is not pinned to a ref", () => {
  const result = check({
    "README.md": readme,
    ".claude-plugin/marketplace.json": JSON.stringify({
      plugins: [{ name: "axe-accessibility", source: "./" }],
    }),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /source\.ref/);
});

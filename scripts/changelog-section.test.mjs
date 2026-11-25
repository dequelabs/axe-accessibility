import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("./changelog-section.mjs", import.meta.url),
);

const changelog = `# Changelog

All notable changes to this project will be documented in this file.

## [0.4.0](https://github.com/dequelabs/axe-accessibility/compare/v0.3.3...v0.4.0) (2026-12-01)

### Features

- Add a skill ([#30](https://github.com/dequelabs/axe-accessibility/issues/30))

### Bug Fixes

- Fix a link

### [0.3.3](https://github.com/dequelabs/axe-accessibility/compare/v0.3.2...v0.3.3) (2026-11-25)

### Bug Fixes

- Patch something

## [0.3.20](https://example.test) (2026-11-21)

- Not 0.3.2

## 0.3.2 (2026-11-19)

Baseline release.
`;

function section(version, content = changelog) {
  const dir = mkdtempSync(join(tmpdir(), "changelog-"));
  writeFileSync(join(dir, "CHANGELOG.md"), content);
  return spawnSync(process.execPath, [script, version, dir], {
    encoding: "utf8",
  });
}

test("prints the body of a minor release up to the next release heading", () => {
  const result = section("0.4.0");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout,
    `### Features

- Add a skill ([#30](https://github.com/dequelabs/axe-accessibility/issues/30))

### Bug Fixes

- Fix a link
`,
  );
});

test("handles the ### heading some generators use for patch releases", () => {
  const result = section("0.3.3");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "### Bug Fixes\n\n- Patch something\n");
});

test("matches the version exactly and reads a plain heading", () => {
  const result = section("0.3.2");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "Baseline release.\n");
});

test("accepts a v-prefixed version", () => {
  assert.equal(section("v0.3.2").stdout, "Baseline release.\n");
});

test("prints nothing for a release with no notable changes", () => {
  const result = section(
    "0.5.0",
    changelog.replace(
      "## [0.4.0]",
      "## [0.5.0](https://x.test) (2026-12-02)\n\n## [0.4.0]",
    ),
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
});

test("fails when CHANGELOG.md has no entry for the version", () => {
  const result = section("9.9.9");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CHANGELOG\.md has no entry for 9\.9\.9/);
});

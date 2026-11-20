import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("./check-workflow-timeouts.mjs", import.meta.url),
);

function check(workflows) {
  const dir = mkdtempSync(join(tmpdir(), "workflows-"));
  for (const [name, content] of Object.entries(workflows)) {
    writeFileSync(join(dir, name), content);
  }
  try {
    return spawnSync(process.execPath, [script, dir], { encoding: "utf8" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("passes when every job sets timeout-minutes", () => {
  const result = check({
    "ci.yml": `
jobs:
  a:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps: [{ run: "true" }]
  b:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps: [{ run: "true" }]
`,
  });
  assert.equal(result.status, 0, result.stderr);
});

test("fails and names the job when one lacks timeout-minutes", () => {
  const result = check({
    "ok.yaml": `
jobs:
  fine:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps: [{ run: "true" }]
`,
    "ci.yml": `
jobs:
  fine:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps: [{ run: "true" }]
  slow:
    runs-on: ubuntu-latest
    steps: [{ run: "true" }]
`,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ci\.yml: job "slow" is missing timeout-minutes/);
  assert.doesNotMatch(result.stderr, /ok\.yaml/);
});

test("fails when timeout-minutes is blank", () => {
  const result = check({
    "ci.yml": `
jobs:
  blank:
    runs-on: ubuntu-latest
    timeout-minutes:
    steps: [{ run: "true" }]
`,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /job "blank" is missing timeout-minutes/);
});

test("ignores a workflow-level timeout-minutes", () => {
  const result = check({
    "ci.yml": `
timeout-minutes: 10
jobs:
  a:
    runs-on: ubuntu-latest
    steps: [{ run: "true" }]
`,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /job "a" is missing timeout-minutes/);
});

test("skips jobs that call a reusable workflow", () => {
  const result = check({
    "ci.yml": `
jobs:
  reuse:
    uses: ./.github/workflows/other.yml
`,
  });
  assert.equal(result.status, 0, result.stderr);
});

test("fails on invalid YAML", () => {
  const result = check({ "ci.yml": "jobs: [\n" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /could not parse YAML/);
});

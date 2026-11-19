import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = new URL("./release-issues.mjs", import.meta.url).pathname;

const fakeGh = `#!/usr/bin/env node
const [cmd, sub, pr, flag, fields] = process.argv.slice(2);
const prs = JSON.parse(process.env.FAKE_GH_PRS);
if (cmd !== "pr" || sub !== "view" || flag !== "--json" || fields !== "closingIssuesReferences" || !(pr in prs)) {
  console.error("unexpected: " + process.argv.slice(2).join(" "));
  process.exit(1);
}
console.log(JSON.stringify({ closingIssuesReferences: prs[pr] }));
`;

function issue(number, repo = "dequelabs/axe-accessibility") {
  const [login, name] = repo.split("/");
  return { number, repository: { name, owner: { login } } };
}

function git(dir, ...args) {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
}

function run({ commits, prs, tagged = ["before tag (#1)"] }) {
  const dir = mkdtempSync(join(tmpdir(), "release-issues-"));
  const bin = join(dir, ".bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "gh"), fakeGh);
  chmodSync(join(bin, "gh"), 0o755);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "test@example.test");
  git(dir, "config", "user.name", "test");
  for (const subject of tagged) {
    git(dir, "commit", "-q", "--allow-empty", "-m", subject);
  }
  git(dir, "tag", "-a", "v0.3.2", "-m", "v0.3.2");
  for (const subject of commits) {
    git(dir, "commit", "-q", "--allow-empty", "-m", subject);
  }
  return spawnSync(process.execPath, [script, dir], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FAKE_GH_PRS: JSON.stringify({ 1: [issue(100)], ...prs }),
      GITHUB_REPOSITORY: "dequelabs/axe-accessibility",
    },
  });
}

test("lists the issues closed by PRs merged since the last tag", () => {
  const result = run({
    commits: ["feat: Add a thing (#20)", "fix: Fix a thing (#21)"],
    prs: { 20: [issue(15)], 21: [issue(16), issue(17)] },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "- #15\n- #16\n- #17\n");
});

test("lists an issue once when several PRs close it", () => {
  const result = run({
    commits: ["feat: One (#20)", "fix: Two (#21)"],
    prs: { 20: [issue(15)], 21: [issue(15)] },
  });
  assert.equal(result.stdout, "- #15\n");
});

test("qualifies issues in other repositories", () => {
  const result = run({
    commits: ["feat: One (#20)"],
    prs: { 20: [issue(1566, "dequelabs/axe-mcp-server")] },
  });
  assert.equal(result.stdout, "- dequelabs/axe-mcp-server#1566\n");
});

test("skips commits without a PR number and PRs gh can't read", () => {
  const result = run({
    commits: ["chore: Direct push", "feat: Gone (#99)", "fix: Real (#21)"],
    prs: { 21: [issue(16)] },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "- #16\n");
});

test("says so when no merged PR closed an issue", () => {
  const result = run({
    commits: ["docs: Tweak (#22)"],
    prs: { 22: [] },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout,
    "_No issue-linked changes since the last release._\n",
  );
});

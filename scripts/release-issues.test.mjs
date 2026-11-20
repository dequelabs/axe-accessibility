import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./release-issues.mjs", import.meta.url));

// Stands in for GitHub: a commit belongs to the PRs FAKE_GH_COMMITS lists for
// its subject, or else to the PR its "(#N)" suffix names.
const fakeGh = `#!/usr/bin/env node
const { execFileSync } = require("node:child_process");
const args = process.argv.slice(2);
const commitPulls = args[0] === "api" && args[1].match(/^repos\\/dequelabs\\/axe-accessibility\\/commits\\/(\\w+)\\/pulls$/);
if (commitPulls) {
  const subject = execFileSync("git", ["log", "-1", "--format=%s", commitPulls[1]], { encoding: "utf8" }).trim();
  const listed = JSON.parse(process.env.FAKE_GH_COMMITS || "{}")[subject];
  const merged = (subject.match(/\\(#(\\d+)\\)$/) || []).slice(1).map((n) => ({ number: Number(n), merged_at: "2026-12-01T00:00:00Z" }));
  console.log(JSON.stringify(listed ?? merged));
  process.exit(0);
}
const [cmd, sub, pr, flag, fields] = args;
const prs = JSON.parse(process.env.FAKE_GH_PRS);
if (cmd !== "pr" || sub !== "view" || flag !== "--json" || fields !== "closingIssuesReferences" || !(pr in prs)) {
  console.error("unexpected: " + args.join(" "));
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

function run({ commits, prs, pulls = {}, tagged = ["before tag (#1)"] }) {
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
      FAKE_GH_COMMITS: JSON.stringify(pulls),
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

const merged = (number) => ({ number, merged_at: "2026-12-01T00:00:00Z" });

test("lists issues for PRs merged by merge commit or rebase", () => {
  const result = run({
    commits: [
      "feat: Rebased part one",
      "fix: Rebased part two",
      "Merge pull request #24 from dequelabs/branch",
    ],
    prs: { 23: [issue(15)], 24: [issue(16)] },
    pulls: {
      "feat: Rebased part one": [merged(23)],
      "fix: Rebased part two": [merged(23)],
      "Merge pull request #24 from dequelabs/branch": [merged(24)],
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "- #15\n- #16\n");
});

test("ignores PRs that a commit belongs to but that aren't merged", () => {
  const result = run({
    commits: ["chore(release): v0.4.0"],
    prs: { 40: [issue(15)] },
    pulls: { "chore(release): v0.4.0": [{ number: 40, merged_at: null }] },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout,
    "_No issue-linked changes since the last release._\n",
  );
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

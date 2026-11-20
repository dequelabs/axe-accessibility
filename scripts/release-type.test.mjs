import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./release-type.mjs", import.meta.url));

function git(dir, ...args) {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
}

function releaseType(commits, { beforeTag = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "release-type-"));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "test@example.test");
  git(dir, "config", "user.name", "test");
  for (const message of ["chore: Initial", ...beforeTag]) {
    git(dir, "commit", "-q", "--allow-empty", "-m", message);
  }
  git(dir, "tag", "-a", "v0.3.2", "-m", "v0.3.2");
  for (const message of commits) {
    git(dir, "commit", "-q", "--allow-empty", "-m", message);
  }
  return spawnSync(process.execPath, [script, dir], { encoding: "utf8" });
}

function assertType(commits, expected, options) {
  const result = releaseType(commits, options);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `${expected}\n`);
}

test("a feat is a minor release, even below 1.0.0", () => {
  assertType(["fix: Fix a thing (#20)", "feat: Add a thing (#21)"], "minor");
});

test("a scoped feat is a minor release", () => {
  assertType(["feat(skills): Add a skill (#21)"], "minor");
});

test("fixes alone are a patch release", () => {
  assertType(["fix: One (#20)", "fix(mcp): Two (#21)"], "patch");
});

test("a ! after the type is a major release, even below 1.0.0", () => {
  assertType(["feat!: Drop Docker (#21)", "fix: One (#20)"], "major");
});

test("a ! after a scope is a major release", () => {
  assertType(["fix(mcp)!: Require OAuth (#21)"], "major");
});

test("a BREAKING CHANGE footer is a major release", () => {
  assertType(
    ["fix: Rename an option (#21)\n\nBREAKING CHANGE: api_key is now key"],
    "major",
  );
});

test("a BREAKING-CHANGE footer is a major release", () => {
  assertType(
    ["feat: Rename an option (#21)\n\nBREAKING-CHANGE: api_key is now key"],
    "major",
  );
});

test("mentioning a breaking change in prose is not a footer", () => {
  assertType(
    ["fix: Explain (#21)\n\nThis avoids a BREAKING CHANGE: no rename."],
    "patch",
  );
});

test("only commits since the last release tag count", () => {
  assertType(["fix: One (#22)"], "patch", {
    beforeTag: ["feat!: Old breaking change (#1)", "feat: Old feature (#2)"],
  });
});

test("types that only look like feat or fix don't count", () => {
  assertType(
    ["docs: Describe feat: commits (#20)", "feature: Not a type (#21)"],
    "patch",
  );
});

test("a release with no feat, fix, or breaking change is a patch", () => {
  assertType(["docs: Tweak (#20)", "chore: Bump deps (#21)"], "patch");
});

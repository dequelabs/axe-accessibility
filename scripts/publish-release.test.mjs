import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = new URL("./publish-release.mjs", import.meta.url).pathname;

const fakeGh = `#!/usr/bin/env node
const { appendFileSync, readFileSync } = require("node:fs");
const args = process.argv.slice(2);
const released = (process.env.FAKE_GH_RELEASES || "").split(",");
if (args[0] === "release" && args[1] === "view") {
  process.exit(released.includes(args[2]) ? 0 : 1);
}
const stdin = args.includes("-") ? readFileSync(0, "utf8") : "";
appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify({ args, stdin }) + "\\n");
`;

function git(dir, ...args) {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
}

function setVersion(dir, version, notes) {
  writeFileSync(
    join(dir, ".claude-plugin/plugin.json"),
    JSON.stringify({ name: "axe-accessibility", version }),
  );
  const changelog = join(dir, "CHANGELOG.md");
  const previous = existsSync(changelog)
    ? readFileSync(changelog, "utf8").replace("# Changelog\n\n", "")
    : "";
  writeFileSync(
    changelog,
    `# Changelog\n\n## [${version}](https://x.test) (2026-12-01)\n\n${notes}\n${previous}`,
  );
}

function setup() {
  const base = mkdtempSync(join(tmpdir(), "publish-"));
  const origin = join(base, "origin.git");
  const dir = join(base, "work");
  const bin = join(base, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "gh"), fakeGh);
  chmodSync(join(bin, "gh"), 0o755);
  git(base, "init", "-q", "--bare", "-b", "main", origin);
  git(base, "clone", "-q", origin, dir);
  git(dir, "config", "user.email", "test@example.test");
  git(dir, "config", "user.name", "test");
  mkdirSync(join(dir, ".claude-plugin"));
  setVersion(dir, "0.3.2", "Baseline release.\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "baseline");
  git(dir, "tag", "-a", "v0.3.2", "-m", "v0.3.2");
  git(dir, "push", "-q", "origin", "main", "v0.3.2");
  return { dir, origin, log: join(base, "gh.log"), bin };
}

function commit(dir, message, change) {
  change();
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", message);
  git(dir, "push", "-q", "origin", "main");
}

function publish({ dir, log, bin }, releases = "v0.3.2") {
  const result = spawnSync(process.execPath, [script, dir], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FAKE_GH_LOG: log,
      FAKE_GH_RELEASES: releases,
    },
  });
  const calls = existsSync(log)
    ? readFileSync(log, "utf8").trim().split("\n").map(JSON.parse)
    : [];
  return { ...result, calls };
}

function remoteTag(origin, tag) {
  try {
    return {
      commit: git(origin, "rev-parse", `${tag}^{commit}`),
      type: git(origin, "cat-file", "-t", tag),
    };
  } catch {
    return null;
  }
}

test("does nothing after a merge that doesn't change the version", () => {
  const repo = setup();
  commit(repo.dir, "docs: Tweak (#30)", () =>
    writeFileSync(join(repo.dir, "README.md"), "docs"),
  );
  const result = publish(repo);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /v0\.3\.2 is already released/);
  assert.deepEqual(result.calls, []);
});

test("tags the release commit and publishes its changelog as the notes", () => {
  const repo = setup();
  commit(repo.dir, "chore(release): v0.4.0 (#31)", () =>
    setVersion(repo.dir, "0.4.0", "### Features\n\n- New thing\n"),
  );
  const head = git(repo.dir, "rev-parse", "HEAD");
  const result = publish(repo);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(remoteTag(repo.origin, "v0.4.0"), {
    commit: head,
    type: "tag",
  });
  assert.deepEqual(result.calls, [
    {
      args: [
        "release",
        "create",
        "v0.4.0",
        "--title",
        "v0.4.0",
        "--verify-tag",
        "--notes-file",
        "-",
      ],
      stdin: "### Features\n\n- New thing\n",
    },
  ]);
});

test("notes a release that has no notable changes", () => {
  const repo = setup();
  commit(repo.dir, "chore(release): v0.3.3 (#31)", () =>
    setVersion(repo.dir, "0.3.3", ""),
  );
  const result = publish(repo);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls[0].stdin, "No notable changes.\n");
});

test("re-running after the tag exists only creates the missing release", () => {
  const repo = setup();
  commit(repo.dir, "chore(release): v0.4.0 (#31)", () =>
    setVersion(repo.dir, "0.4.0", "- New\n"),
  );
  git(repo.dir, "tag", "-a", "v0.4.0", "-m", "v0.4.0");
  git(repo.dir, "push", "-q", "origin", "v0.4.0");
  const result = publish(repo);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].args[1], "create");
});

test("re-running after the release exists does nothing", () => {
  const repo = setup();
  commit(repo.dir, "chore(release): v0.4.0 (#31)", () =>
    setVersion(repo.dir, "0.4.0", "- New\n"),
  );
  git(repo.dir, "tag", "-a", "v0.4.0", "-m", "v0.4.0");
  git(repo.dir, "push", "-q", "origin", "v0.4.0");
  const result = publish(repo, "v0.3.2,v0.4.0");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, []);
});

test("fails when a version bump's tag already exists on another commit", () => {
  const repo = setup();
  const elsewhere = git(repo.dir, "rev-parse", "HEAD");
  git(repo.dir, "tag", "-a", "v0.4.0", "-m", "v0.4.0");
  git(repo.dir, "push", "-q", "origin", "v0.4.0");
  commit(repo.dir, "chore(release): v0.4.0 (#31)", () =>
    setVersion(repo.dir, "0.4.0", "- New\n"),
  );
  const result = publish(repo);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /v0\.4\.0 already exists on/);
  assert.equal(remoteTag(repo.origin, "v0.4.0").commit, elsewhere);
  assert.deepEqual(result.calls, []);
});

test("fails instead of tagging a later commit when the release commit wasn't tagged", () => {
  const repo = setup();
  commit(repo.dir, "chore(release): v0.4.0 (#31)", () =>
    setVersion(repo.dir, "0.4.0", "- New\n"),
  );
  commit(repo.dir, "fix: Later (#32)", () =>
    writeFileSync(join(repo.dir, "README.md"), "later"),
  );
  const result = publish(repo);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /v0\.4\.0 isn't tagged/);
  assert.equal(remoteTag(repo.origin, "v0.4.0"), null);
  assert.deepEqual(result.calls, []);
});

test("fails before tagging when CHANGELOG.md has no entry", () => {
  const repo = setup();
  commit(repo.dir, "chore(release): v0.4.0 (#31)", () =>
    writeFileSync(
      join(repo.dir, ".claude-plugin/plugin.json"),
      JSON.stringify({ name: "axe-accessibility", version: "0.4.0" }),
    ),
  );
  const result = publish(repo);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CHANGELOG\.md has no entry for 0\.4\.0/);
  assert.equal(remoteTag(repo.origin, "v0.4.0"), null);
});

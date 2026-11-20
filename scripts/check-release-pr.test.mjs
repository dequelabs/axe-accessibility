import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("./check-release-pr.mjs", import.meta.url),
);

function manifests(
  version,
  ref = `v${version}`,
  url = "https://example.test/x.git",
) {
  return {
    ".claude-plugin/plugin.json": JSON.stringify({
      name: "axe-accessibility",
      version,
    }),
    ".claude-plugin/marketplace.json": JSON.stringify({
      plugins: [
        {
          name: "axe-accessibility",
          source: { source: "url", url, ref },
        },
      ],
    }),
    "CHANGELOG.md": "# Changelog\n\n## 0.3.2 (2026-11-19)\n\nBaseline.\n",
  };
}

function write(dir, files) {
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
}

function git(dir, ...args) {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
}

function check({
  changes,
  branch,
  title,
  base: baseFiles = manifests("0.3.2"),
}) {
  const dir = mkdtempSync(join(tmpdir(), "release-pr-"));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "test@example.test");
  git(dir, "config", "user.name", "test");
  write(dir, baseFiles);
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "base");
  const base = git(dir, "rev-parse", "HEAD");
  write(dir, changes);
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "head", "--allow-empty");
  return spawnSync(process.execPath, [script, dir], {
    encoding: "utf8",
    env: { ...process.env, BASE: base, HEAD_REF: branch, PR_TITLE: title },
  });
}

const release040 = {
  ...manifests("0.4.0"),
  "CHANGELOG.md":
    "# Changelog\n\n## [0.4.0](https://x.test) (2026-12-01)\n\n### Features\n\n- New\n\n## 0.3.2 (2026-11-19)\n\nBaseline.\n",
};

test("passes a PR that leaves the version and ref alone", () => {
  const result = check({
    changes: { "README.md": "docs" },
    branch: "fix-typo",
    title: "docs: Fix a typo",
  });
  assert.equal(result.status, 0, result.stderr);
});

test("passes a release PR whose branch and title name the new version", () => {
  const result = check({
    changes: release040,
    branch: "release-0.4.0",
    title: "chore(release): v0.4.0",
  });
  assert.equal(result.status, 0, result.stderr);
});

test("fails a version bump outside a release PR", () => {
  const result = check({
    changes: release040,
    branch: "my-feature",
    title: "feat: Something",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /0\.3\.2 -> 0\.4\.0/);
  assert.match(result.stderr, /release-0\.4\.0/);
  assert.match(result.stderr, /chore\(release\): v0\.4\.0/);
});

test("fails a change to only the marketplace ref outside a release PR", () => {
  const result = check({
    changes: {
      ".claude-plugin/marketplace.json": manifests("0.3.2", "v0.3.1")[
        ".claude-plugin/marketplace.json"
      ],
    },
    branch: "pin-older",
    title: "fix: Pin an older release",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /v0\.3\.2 -> v0\.3\.1/);
});

const unpinned = {
  ...manifests("0.3.2"),
  ".claude-plugin/marketplace.json": JSON.stringify({
    plugins: [{ name: "axe-accessibility", source: "./" }],
  }),
};

test("passes first pinning the marketplace entry to the current version's tag", () => {
  const result = check({
    base: unpinned,
    changes: manifests("0.3.2"),
    branch: "release-flow",
    title: "feat: Serve only releases",
  });
  assert.equal(result.status, 0, result.stderr);
});

test("fails first pinning the marketplace entry to another version's tag", () => {
  const result = check({
    base: unpinned,
    changes: manifests("0.3.2", "v0.3.1"),
    branch: "release-flow",
    title: "feat: Serve only releases",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /undefined -> v0\.3\.1/);
});

test("fails a change to the marketplace source's URL outside a release PR", () => {
  const result = check({
    changes: manifests("0.3.2", "v0.3.2", "https://example.test/fork.git"),
    branch: "move-source",
    title: "fix: Install from a fork",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /fork\.git/);
});

test("fails a release branch whose title is not the release title", () => {
  const result = check({
    changes: release040,
    branch: "release-0.4.0",
    title: "chore: Release",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /title/);
});

test("fails a release title whose branch is not the release branch", () => {
  const result = check({
    changes: release040,
    branch: "my-release",
    title: "chore(release): v0.4.0",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /branch/);
});

test("fails when the branch names a different version than plugin.json", () => {
  const result = check({
    changes: release040,
    branch: "release-0.4.1",
    title: "chore(release): v0.4.1",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /release-0\.4\.0/);
});

test("fails a release PR with no CHANGELOG.md entry for the version", () => {
  const result = check({
    changes: manifests("0.4.0"),
    branch: "release-0.4.0",
    title: "chore(release): v0.4.0",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CHANGELOG\.md has no entry for 0\.4\.0/);
});

test("fails without the PR context it needs", () => {
  const result = spawnSync(process.execPath, [script, tmpdir()], {
    encoding: "utf8",
    env: { ...process.env, BASE: "", HEAD_REF: "", PR_TITLE: "" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /BASE/);
});

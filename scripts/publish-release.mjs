import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readChangelogSection } from "./changelog-section.mjs";

// Runs on every push to main. When plugin.json's version has no tag yet, tags
// the commit that set that version v<version> and publishes a GitHub release.
// That is HEAD unless the release's own run was cancelled or failed, so a later
// push still tags the release. The marketplace entry already points at that
// tag, so fresh installs fail until it exists: tag first, fast.
const PLUGIN = ".claude-plugin/plugin.json";
const root = process.argv[2] ?? ".";

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function remoteTagCommit(tag) {
  const lines = git(
    "ls-remote",
    "origin",
    `refs/tags/${tag}`,
    `refs/tags/${tag}^{}`,
  )
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));
  const peeled = lines.find(([, ref]) => ref.endsWith("^{}"));
  return (peeled ?? lines[0])?.[0] ?? null;
}

function versionAt(revision) {
  try {
    return JSON.parse(git("show", `${revision}:${PLUGIN}`)).version;
  } catch {
    return null;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function releaseCommit() {
  let commit = git("rev-parse", "HEAD");
  for (;;) {
    let parent;
    try {
      parent = git("rev-parse", "--verify", "--quiet", `${commit}^`);
    } catch {
      return commit;
    }
    if (versionAt(parent) !== version) return commit;
    commit = parent;
  }
}

if (git("rev-parse", "--is-shallow-repository") === "true") {
  fail("publish-release needs the full history to find the release commit.");
}

const { version } = JSON.parse(readFileSync(join(root, PLUGIN), "utf8"));
const tag = `v${version}`;
const head = git("rev-parse", "HEAD");
const release = releaseCommit();
const tagged = remoteTagCommit(tag);

if (tagged && tagged !== release) {
  if (release === head) {
    fail(
      `${tag} already exists on ${tagged}, but this commit (${head}) bumps plugin.json to ${version}. Release under a new version.`,
    );
  }
  console.log(`${tag} is already released; nothing to publish.`);
  process.exit(0);
}

let notes;
try {
  notes = readChangelogSection(root, version) || "No notable changes.\n";
} catch (error) {
  fail(error.message);
}

if (!tagged) {
  git("tag", "-a", tag, "-m", tag, release);
  git("push", "origin", `refs/tags/${tag}`);
  console.log(`Tagged ${release} as ${tag}.`);
}

if (spawnSync("gh", ["release", "view", tag], { cwd: root }).status === 0) {
  console.log(`The ${tag} GitHub release already exists.`);
  process.exit(0);
}
execFileSync(
  "gh",
  [
    "release",
    "create",
    tag,
    "--title",
    tag,
    "--verify-tag",
    "--notes-file",
    "-",
  ],
  { cwd: root, input: notes, stdio: ["pipe", "inherit", "inherit"] },
);
console.log(`Published the ${tag} GitHub release.`);

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readChangelogSection } from "./changelog-section.mjs";

// Runs on every push to main. When plugin.json's version has no tag yet, tags
// HEAD v<version> and publishes a GitHub release. The marketplace entry already
// points at that tag, so fresh installs fail until it exists: tag first, fast.
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

const { version } = JSON.parse(readFileSync(join(root, PLUGIN), "utf8"));
const tag = `v${version}`;
const head = git("rev-parse", "HEAD");
const tagged = remoteTagCommit(tag);

if (tagged && tagged !== head) {
  if (versionAt("HEAD^") !== version) {
    fail(
      `${tag} already exists on ${tagged}, but this commit (${head}) bumps plugin.json to ${version}. Release under a new version.`,
    );
  }
  console.log(`${tag} is already released; nothing to publish.`);
  process.exit(0);
}

if (!tagged && versionAt("HEAD^") === version) {
  fail(
    `${tag} isn't tagged, but this commit (${head}) doesn't set plugin.json to ${version}, so it isn't the release. Re-run the Release workflow for the ${tag} release PR's merge commit.`,
  );
}

let notes;
try {
  notes = readChangelogSection(root, version) || "No notable changes.\n";
} catch (error) {
  fail(error.message);
}

if (!tagged) {
  git("tag", "-a", tag, "-m", tag);
  git("push", "origin", `refs/tags/${tag}`);
  console.log(`Tagged ${head} as ${tag}.`);
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

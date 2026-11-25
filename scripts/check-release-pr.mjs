import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readChangelogSection } from "./changelog-section.mjs";

// Only release PRs may change what users install: plugin.json's version and
// the marketplace entry's source. Users get a new copy only when the
// version changes, and the ref picks which tag they get, so a stray change to
// either would ship work outside the release flow.
const PLUGIN = ".claude-plugin/plugin.json";
const MARKETPLACE = ".claude-plugin/marketplace.json";

const root = process.argv[2] ?? ".";
const { BASE: base, HEAD_REF: branch, PR_TITLE: title } = process.env;

function fail(lines) {
  console.error(lines.join("\n"));
  process.exit(1);
}

if (!base || !branch || !title) {
  fail(["BASE, HEAD_REF, and PR_TITLE must all be set."]);
}

function readAt(revision, path) {
  const text =
    revision === null
      ? readFileSync(join(root, path), "utf8")
      : execFileSync("git", ["show", `${revision}:${path}`], {
          cwd: root,
          encoding: "utf8",
        });
  return JSON.parse(text);
}

function released(revision) {
  const plugin = readAt(revision, PLUGIN);
  const entry = readAt(revision, MARKETPLACE).plugins?.find(
    (p) => p.name === plugin.name,
  );
  const source = entry?.source;
  return {
    version: plugin.version,
    ref: source?.ref,
    source: JSON.stringify(
      typeof source === "object" ? { ...source, ref: undefined } : source,
    ),
  };
}

const before = released(base);
const after = released(null);
const changes = [];
if (before.version !== after.version) {
  changes.push(`${PLUGIN} version: ${before.version} -> ${after.version}`);
}
if (before.ref !== after.ref) {
  changes.push(`${MARKETPLACE} source.ref: ${before.ref} -> ${after.ref}`);
}
if (before.source !== after.source) {
  changes.push(`${MARKETPLACE} source: ${before.source} -> ${after.source}`);
}

if (changes.length === 0) {
  console.log("This PR doesn't change the released version.");
  process.exit(0);
}

const expectedBranch = `release-${after.version}`;
const expectedTitle = `chore(release): v${after.version}`;
const problems = [];
if (branch !== expectedBranch) {
  problems.push(`the branch is "${branch}", not "${expectedBranch}"`);
}
if (title !== expectedTitle) {
  problems.push(`the title is "${title}", not "${expectedTitle}"`);
}
if (problems.length > 0) {
  fail([
    "This PR changes the released version:",
    ...changes.map((c) => `  ${c}`),
    "",
    "Only a release PR may do that, and",
    ...problems.map((p) => `  ${p}`),
    "",
    'Revert the change, or cut a release with the "Create release PR" workflow.',
  ]);
}

try {
  readChangelogSection(root, after.version);
} catch (error) {
  fail([error.message]);
}
console.log(`Release PR for v${after.version}.`);

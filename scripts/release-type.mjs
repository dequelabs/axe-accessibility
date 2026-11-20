import { execFileSync } from "node:child_process";

// Picks the SemVer bump for the commits since the last release tag by the
// Conventional Commits rules at every version. commit-and-tag-version's own
// pick demotes each bump one level below 1.0.0 (feat -> patch, breaking ->
// minor), with no option to turn that off.
const root = process.argv[2] ?? ".";

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

const since = git("describe", "--tags", "--abbrev=0", "--match", "v*");
const messages = git("log", `${since}..HEAD`, "--format=%B%x00")
  .split("\0")
  .map((message) => message.trim())
  .filter(Boolean);

const HEADER = /^(\w+)(?:\([^)]*\))?(!)?: /;
let type = "patch";
for (const message of messages) {
  const [, kind, bang] = message.match(HEADER) ?? [];
  if (bang || /^BREAKING[ -]CHANGE: /m.test(message)) {
    type = "major";
    break;
  }
  if (kind === "feat") type = "minor";
}
console.log(type);

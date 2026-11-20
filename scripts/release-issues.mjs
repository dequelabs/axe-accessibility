import { execFileSync } from "node:child_process";

// Lists the issues closed by each PR merged since the last release tag, for
// the release PR body. GitHub renders each reference with its live title. PRs
// come from GitHub's commit-to-PR links, which cover squash, merge, and rebase
// merges alike.
const root = process.argv[2] ?? ".";
const repo = process.env.GITHUB_REPOSITORY;

function run(command, args) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

const since = run("git", ["describe", "--tags", "--abbrev=0", "--match", "v*"]);
const commits = run("git", [
  "log",
  "--reverse",
  `${since}..HEAD`,
  "--format=%H",
])
  .split("\n")
  .filter(Boolean);

const prs = new Set();
for (const sha of commits) {
  const pulls = JSON.parse(
    run("gh", ["api", `repos/${repo}/commits/${sha}/pulls`]),
  );
  for (const { number, merged_at } of pulls) {
    if (merged_at) prs.add(String(number));
  }
}

const issues = new Set();
for (const pr of prs) {
  const references = JSON.parse(
    run("gh", ["pr", "view", pr, "--json", "closingIssuesReferences"]),
  ).closingIssuesReferences;
  for (const { number, repository } of references ?? []) {
    const closedIn = `${repository.owner.login}/${repository.name}`;
    issues.add(closedIn === repo ? `#${number}` : `${closedIn}#${number}`);
  }
}

console.log(
  issues.size > 0
    ? [...issues].map((i) => `- ${i}`).join("\n")
    : "_No issue-linked changes since the last release._",
);

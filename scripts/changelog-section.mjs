import { readFileSync } from "node:fs";
import { join } from "node:path";

const RELEASE_HEADING = /^#{2,3} \[?(\d+\.\d+\.\d+(?:-[\w.]+)?)\]?(?:[\s(]|$)/;

// Returns the notes under a version's CHANGELOG heading, or null when the
// changelog has no entry for it.
export function changelogSection(changelog, version) {
  const wanted = version.replace(/^v/, "");
  const lines = changelog.split("\n");
  const start = lines.findIndex(
    (line) => line.match(RELEASE_HEADING)?.[1] === wanted,
  );
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => RELEASE_HEADING.test(line));
  const body = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
  return body ? `${body}\n` : "";
}

export function readChangelogSection(root, version) {
  const section = changelogSection(
    readFileSync(join(root, "CHANGELOG.md"), "utf8"),
    version,
  );
  if (section === null) {
    throw new Error(`CHANGELOG.md has no entry for ${version}`);
  }
  return section;
}

if (import.meta.main) {
  const [version, root = "."] = process.argv.slice(2);
  try {
    process.stdout.write(readChangelogSection(root, version));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

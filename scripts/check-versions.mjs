import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

// Only phrasings that state the *current* pin are listed, so prose about past
// releases ("needs 1.5.0+", "since server 1.4.0") is ignored by default. A new
// way of writing a current pin needs a pattern here, or the check won't see it.
const IDENTIFIERS = String.raw`[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*`;
const VERSION = String.raw`(\d+\.\d+\.\d+(?:-${IDENTIFIERS})?(?:\+${IDENTIFIERS})?)`;
const MARKUP = "[*_`]*";
const PINS = {
  "axe-mcp-server": [
    String.raw`\baxe-mcp-server@${VERSION}`,
    String.raw`\bdequesystems/axe-mcp-server:v${VERSION}`,
    String.raw`\bpinned\s+(?:to\s+)?${MARKUP}v?${VERSION}`,
    String.raw`\bdocumented\s+against\s+${MARKUP}${VERSION}`,
    String.raw`\bdocuments\s+server\s+${VERSION}`,
    String.raw`\bthose\s+of\s+${MARKUP}server\s+${VERSION}`,
    String.raw`\bwire\s+format\s+of\s+Axe\s+MCP\s+Server\s+${VERSION}`,
    String.raw`\btagged\s+${MARKUP}v${VERSION}`,
    String.raw`${MARKUP}v${VERSION}${MARKUP}\s+image tag\b`,
    String.raw`(?<![A-Za-z])behind${MARKUP}\s+${VERSION}`,
    String.raw`\bserverInfo\.version${MARKUP}[^.;\n]*?\bwith\s+${MARKUP}${VERSION}`,
  ],
  "@deque/axe-auth": [String.raw`@deque/axe-auth@${VERSION}`],
  playwright: [
    String.raw`\bplaywright@${VERSION}`,
    String.raw`\bPlaywright\s+pin\s+${MARKUP}\(?${MARKUP}${VERSION}`,
  ],
};
const SCANNED = new Set([".md", ".json", ".sh", ".yml", ".yaml"]);
// CHANGELOG.md records past releases, so the pins it mentions are history.
const SKIPPED = new Set(["pnpm-lock.yaml", "CHANGELOG.md"]);
const PLUGIN = ".claude-plugin/plugin.json";
const MARKETPLACE = ".claude-plugin/marketplace.json";

const args = process.argv.slice(2);
// The pre-commit hook passes --staged to check what would be committed, which
// can differ from the working tree when a file is partially staged.
const staged = args.includes("--staged");
const root = args.find((arg) => arg !== "--staged") ?? ".";

// Ask git rather than walking the tree, so gitignored local files (which CI's
// checkout never has) can't fail the pre-commit hook.
function listFiles() {
  return execFileSync(
    "git",
    [
      "-C",
      root,
      "ls-files",
      "-z",
      "--cached",
      ...(staged ? [] : ["--others", "--exclude-standard"]),
    ],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter(
      (file) =>
        SCANNED.has(extname(file)) &&
        !SKIPPED.has(basename(file)) &&
        (staged || existsSync(join(root, file))),
    );
}

function read(file) {
  return staged
    ? execFileSync("git", ["-C", root, "show", `:${file}`], {
        encoding: "utf8",
      })
    : readFileSync(join(root, file), "utf8");
}

function lineAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

function collectPins() {
  const found = Object.fromEntries(Object.keys(PINS).map((pin) => [pin, []]));
  for (const file of listFiles().sort()) {
    const text = read(file);
    for (const [pin, patterns] of Object.entries(PINS)) {
      for (const pattern of patterns) {
        for (const match of text.matchAll(new RegExp(pattern, "dgi"))) {
          found[pin].push({
            version: match[1],
            file,
            line: lineAt(text, match.indices[1][0]),
            text: match[0].replace(/[*_`(]/g, "").replace(/\s+/g, " "),
          });
        }
      }
    }
  }
  for (const occurrences of Object.values(found)) {
    occurrences.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  }
  return found;
}

function collectPluginVersions() {
  const plugin = JSON.parse(read(PLUGIN));
  const marketplace = JSON.parse(read(MARKETPLACE));
  const entry = marketplace.plugins?.find((p) => p.name === plugin.name);
  const versions = [{ version: plugin.version, file: PLUGIN, text: "version" }];
  if (!entry || "version" in entry) {
    versions.push({
      version: entry?.version ?? "(missing entry)",
      file: MARKETPLACE,
      text: `plugins[name=${plugin.name}].version`,
    });
  }
  if (entry) {
    // Self-hosted marketplace users install the tag this ref names, so it must
    // be the tag of the version plugin.json declares.
    const ref = entry.source?.ref;
    versions.push({
      version: /^v\d/.test(ref ?? "")
        ? ref.slice(1)
        : `(${JSON.stringify(ref ?? null)}, expected "v${plugin.version}")`,
      file: MARKETPLACE,
      text: `plugins[name=${plugin.name}].source.ref`,
    });
  }
  return versions;
}

function groupByVersion(occurrences) {
  const groups = new Map();
  for (const o of occurrences) {
    if (!groups.has(o.version)) groups.set(o.version, []);
    groups.get(o.version).push(o);
  }
  return groups;
}

const pins = collectPins();

// One occurrence leaves nothing to compare, so a rewording that slips past every
// pattern would otherwise pass silently.
const missing = Object.entries(pins).filter(([, found]) => found.length < 2);
if (missing.length > 0) {
  console.error("Too few current pins found to compare:");
  for (const [pin, found] of missing) {
    console.error(`  ${pin}: found ${found.length}, expected at least 2`);
  }
  console.error(
    "\nIf a pin was reworded, add a pattern for the new phrasing to PINS in scripts/check-versions.mjs.",
  );
  process.exit(1);
}

const conflicts = [];
for (const [pin, occurrences] of Object.entries({
  ...pins,
  "plugin version": collectPluginVersions(),
})) {
  const groups = groupByVersion(occurrences);
  if (groups.size > 1) conflicts.push([pin, groups]);
}

if (conflicts.length > 0) {
  console.error("Pinned versions disagree. Update every current pin together:");
  for (const [pin, groups] of conflicts) {
    console.error(`\n${pin}:`);
    for (const [version, occurrences] of groups) {
      console.error(`  ${version}`);
      for (const o of occurrences) {
        const where = o.line ? `${o.file}:${o.line}` : o.file;
        console.error(`    ${where}  ${o.text}`);
      }
    }
  }
  process.exit(1);
}
console.log("All pinned versions agree.");

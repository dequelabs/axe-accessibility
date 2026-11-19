import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

// Only phrasings that state the *current* pin are listed, so prose about past
// releases ("needs 1.5.0+", "since server 1.4.0") is ignored by default. A new
// way of writing a current pin needs a pattern here, or the check won't see it.
const VERSION = String.raw`(\d+\.\d+\.\d+(?:-[\w.]+)?)`;
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
  ],
  "@deque/axe-auth": [String.raw`@deque/axe-auth@${VERSION}`],
  playwright: [
    String.raw`\bplaywright@${VERSION}`,
    String.raw`\bPlaywright\s+pin\s+${MARKUP}\(?${MARKUP}${VERSION}`,
  ],
};
const SCANNED = new Set([".md", ".json", ".sh", ".yml", ".yaml"]);
const SKIPPED = new Set([".git", "node_modules", "pnpm-lock.yaml"]);
const PLUGIN = ".claude-plugin/plugin.json";
const MARKETPLACE = ".claude-plugin/marketplace.json";

const root = process.argv[2] ?? ".";

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIPPED.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile() && SCANNED.has(extname(entry.name))) yield path;
  }
}

function lineAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

function collectPins() {
  const found = Object.fromEntries(Object.keys(PINS).map((pin) => [pin, []]));
  for (const path of [...walk(root)].sort()) {
    const text = readFileSync(path, "utf8");
    const file = relative(root, path);
    for (const [pin, patterns] of Object.entries(PINS)) {
      for (const pattern of patterns) {
        for (const match of text.matchAll(new RegExp(pattern, "dg"))) {
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
  const plugin = JSON.parse(readFileSync(join(root, PLUGIN), "utf8"));
  const marketplace = JSON.parse(readFileSync(join(root, MARKETPLACE), "utf8"));
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

const conflicts = [];
for (const [pin, occurrences] of Object.entries({
  ...collectPins(),
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

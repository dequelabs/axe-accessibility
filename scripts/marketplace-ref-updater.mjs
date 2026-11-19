import { readFileSync } from "node:fs";

// commit-and-tag-version updater for .claude-plugin/marketplace.json. The
// plugin's entry pins its source to the release tag, so a version bump moves
// that ref. Only the ref string is replaced so the file's formatting survives.
const { name } = JSON.parse(
  readFileSync(
    new URL("../.claude-plugin/plugin.json", import.meta.url),
    "utf8",
  ),
);

function currentRef(contents) {
  const entry = JSON.parse(contents).plugins?.find((p) => p.name === name);
  const ref = entry?.source?.ref;
  if (!/^v\d/.test(ref ?? "")) {
    throw new Error(
      `marketplace.json: plugins[name=${name}].source.ref must be a v<version> tag, got ${JSON.stringify(ref ?? null)}`,
    );
  }
  return ref;
}

export function readVersion(contents) {
  return currentRef(contents).slice(1);
}

export function writeVersion(contents, version) {
  const ref = currentRef(contents);
  const start = contents.indexOf(`"name": ${JSON.stringify(name)}`);
  const pattern = /"ref"\s*:\s*"([^"]*)"/g;
  for (const match of contents.matchAll(pattern)) {
    if (match.index < start || match[1] !== ref) continue;
    const at = match.index + match[0].lastIndexOf(`"${ref}"`);
    return `${contents.slice(0, at)}"v${version}"${contents.slice(at + ref.length + 2)}`;
  }
  throw new Error(`marketplace.json: could not locate source.ref ${ref}`);
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { readVersion, writeVersion } from "./marketplace-ref-updater.mjs";

const marketplace = `{
  "name": "deque",
  "plugins": [
    {
      "name": "other",
      "source": { "source": "url", "url": "https://example.test/o.git", "ref": "v9.9.9" }
    },
    {
      "name": "axe-accessibility",
      "source": {
        "source": "url",
        "url": "https://github.com/dequelabs/axe-accessibility.git",
        "ref": "v0.3.2"
      },
      "keywords": ["accessibility", "a11y"]
    }
  ]
}
`;

test("reads the version from the plugin entry's source ref", () => {
  assert.equal(readVersion(marketplace), "0.3.2");
});

test("writes the new version as the entry's v-prefixed ref", () => {
  const updated = writeVersion(marketplace, "0.4.0");
  const entry = JSON.parse(updated).plugins[1];
  assert.equal(entry.source.ref, "v0.4.0");
  assert.equal(readVersion(updated), "0.4.0");
});

test("changes nothing but the ref, so formatting survives", () => {
  assert.equal(
    writeVersion(marketplace, "0.4.0"),
    marketplace.replace('"ref": "v0.3.2"', '"ref": "v0.4.0"'),
  );
});

test("leaves other plugins' refs alone", () => {
  const entry = JSON.parse(writeVersion(marketplace, "0.4.0")).plugins[0];
  assert.equal(entry.source.ref, "v9.9.9");
});

test("throws when the plugin entry has no ref", () => {
  const unpinned = marketplace.replace(/"ref": "v0\.3\.2"/, '"path": "x"');
  assert.throws(() => readVersion(unpinned), /source\.ref/);
  assert.throws(() => writeVersion(unpinned, "0.4.0"), /source\.ref/);
});

test("loads through require, as commit-and-tag-version does", () => {
  const require = createRequire(import.meta.url);
  const updater = require("./marketplace-ref-updater.mjs");
  assert.equal(typeof updater.readVersion, "function");
  assert.equal(typeof updater.writeVersion, "function");
});

test("is the updater .versionrc.json registers for marketplace.json", () => {
  const config = JSON.parse(
    readFileSync(new URL("../.versionrc.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(
    config.bumpFiles.find(
      (f) => f.filename === ".claude-plugin/marketplace.json",
    ),
    {
      filename: ".claude-plugin/marketplace.json",
      updater: "scripts/marketplace-ref-updater.mjs",
    },
  );
});

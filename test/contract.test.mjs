// Customers' settings and permission rules reference these names, so renaming
// or removing one is a breaking change. Update this file only on purpose.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = fileURLToPath(new URL("..", import.meta.url));

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

const plugin = readJson(".claude-plugin/plugin.json");
const marketplace = readJson(".claude-plugin/marketplace.json");
const mcpConfig = readJson(".mcp.json");

test("plugin is named axe-accessibility", () => {
  assert.equal(plugin.name, "axe-accessibility");
});

test("marketplace is named deque and lists axe-accessibility", () => {
  assert.equal(marketplace.name, "deque");
  assert.ok(
    marketplace.plugins.some((p) => p.name === "axe-accessibility"),
    "marketplace.json plugins[] has no axe-accessibility entry",
  );
});

test("plugin keeps the api_key option", () => {
  assert.ok(plugin.userConfig?.api_key, "plugin.json userConfig.api_key");
});

test("MCP server is named axe-mcp-server", () => {
  assert.ok(mcpConfig.mcpServers?.["axe-mcp-server"]);
});

for (const skill of [
  "mcp-audit",
  "mcp-generate-instructions",
  "mcp-setup",
  "mcp-usage",
]) {
  test(`skill ${skill} keeps its invocation name`, () => {
    const path = join(root, "skills", skill, "SKILL.md");
    assert.ok(existsSync(path), `skills/${skill}/SKILL.md is missing`);
    const [, frontmatter] = readFileSync(path, "utf8").split(/^---$/m);
    const { name = skill } = parse(frontmatter) ?? {};
    assert.equal(name, skill);
  });
}

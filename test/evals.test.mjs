// The eval suite names the plugin's skills, MCP server, and tools as strings,
// so a rename would silently turn its graders into checks that can never pass.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = fileURLToPath(new URL("..", import.meta.url));
const evals = join(root, "evals");

const plugin = JSON.parse(
  readFileSync(join(root, ".claude-plugin/plugin.json"), "utf8"),
);
const servers = Object.keys(
  JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8")).mcpServers,
);
const skills = readdirSync(join(root, "skills"));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function frontmatter(path) {
  const [, yaml] = readFileSync(path, "utf8").split(/^---$/m);
  return parse(yaml) ?? {};
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = existsSync(evals) ? walk(evals) : [];
const cases = files
  .filter((path) => path.endsWith("/prompt.md"))
  .map((path) => join(path, ".."));
const graders = files.filter((path) => /\/graders\/[^/]+\.md$/.test(path));
const mocks = files.filter(
  (path) => /\/mocks\/[^/]+\/[^/_][^/]*\.md$/.test(path) && !/\/\./.test(path),
);

test("the suite covers the behaviors #21 asks for", () => {
  const names = cases.map((dir) => relative(evals, dir)).sort();
  assert.deepEqual(names, [
    "guided-tests-when-asked",
    "loads-mcp-usage",
    "no-guided-tests-unless-asked",
    "remediate-one-batch",
  ]);
});

test("every case has at least one grader", () => {
  for (const dir of cases) {
    const own = graders.filter((path) => path.startsWith(`${dir}/graders/`));
    assert.ok(own.length > 0, `${relative(root, dir)} has no graders`);
  }
});

test("mocks stand in for the plugin's MCP server and its documented tools", () => {
  assert.ok(mocks.length > 0, "no mocks found");
  for (const path of mocks) {
    const [server, file] = relative(evals, path).split("/").slice(-2);
    assert.ok(servers.includes(server), `${path}: unknown server ${server}`);
    assert.ok(
      ["analyze.md", "remediate.md"].includes(file),
      `${path}: not a tool the skills document`,
    );
  }
});

test("graders name tools and skills that exist", () => {
  const toolName = new RegExp(
    `^mcp__plugin_${plugin.name}_(${servers.join("|")})__(analyze|remediate)$`,
  );
  for (const path of graders) {
    const grader = frontmatter(path);
    const tools = [grader.tool, grader.before, grader.after]
      .map((t) => (typeof t === "object" ? t?.tool : t))
      .filter(Boolean);
    for (const tool of tools) {
      if (tool.startsWith("mcp__")) {
        assert.match(tool, toolName, `${relative(root, path)}`);
      }
    }
    if (grader.tool === "Skill") {
      const skill = grader.input_match?.match(/\)\?([\w-]+)"/)?.[1];
      assert.ok(skills.includes(skill), `${path}: unknown skill ${skill}`);
    }
  }
});

test("pnpm evals pins both models and caps the cost", () => {
  const script = pkg.scripts.evals ?? "";
  assert.match(script, /--max-cost-usd \d/);
  assert.match(script, /--model \S/);
  assert.match(script, /--judge-model \S/);
  assert.match(script, /--no-publish/);
});

test("eval results are not committed", () => {
  const ignored = readFileSync(join(root, ".gitignore"), "utf8").split("\n");
  assert.ok(ignored.includes("evals/results/"));
});

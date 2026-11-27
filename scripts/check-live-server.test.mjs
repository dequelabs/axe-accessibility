import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

// The analyze and remediate tool definitions published by Axe MCP Server 1.6.0
// for an account entitled to every documented feature.
function serverTools() {
  return [
    {
      name: "analyze",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string" },
          selector: {
            anyOf: [
              { type: "string" },
              { type: "array", items: { type: "string" } },
            ],
          },
          viewportWidth: { type: "number" },
          viewportHeight: { type: "number" },
          cookies: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                value: { type: "string" },
                domain: { type: "string" },
                path: { type: "string" },
                sameSite: { type: "string", enum: ["Strict", "Lax", "None"] },
                secure: { type: "boolean" },
                httpOnly: { type: "boolean" },
                expires: { type: "integer" },
              },
            },
          },
          before: {
            type: "array",
            items: {
              anyOf: [
                {
                  type: "object",
                  properties: {
                    action: { type: "string", const: "click" },
                    selector: { type: "string" },
                  },
                },
                {
                  type: "object",
                  properties: {
                    action: { type: "string", const: "fill" },
                    selector: { type: "string" },
                    value: { type: "string" },
                  },
                },
                {
                  type: "object",
                  properties: {
                    action: { type: "string", const: "waitFor" },
                    selector: { type: "string" },
                    state: { type: "string" },
                  },
                },
                {
                  type: "object",
                  properties: {
                    action: { type: "string", const: "wait" },
                    ms: { type: "integer" },
                  },
                },
              ],
            },
          },
          screenshot: {
            type: "object",
            properties: {
              format: { type: "string", enum: ["png", "jpeg"] },
              save: { type: "boolean" },
              saveTo: { type: "string" },
              inline: { type: "boolean" },
            },
          },
          advancedRules: { type: "string" },
          igtTools: {
            type: "array",
            items: {
              type: "string",
              enum: ["keyboard", "interactive-elements", "modal"],
            },
          },
          chromePath: { type: "string" },
          includeSelectors: { type: "array" },
          modalTriggerSelector: { type: "string" },
          modalSelector: { type: "string" },
          interactive: { type: "boolean" },
          sessionID: { type: "string" },
          selectedIDs: { type: "array" },
        },
        required: ["url"],
      },
    },
    {
      name: "remediate",
      inputSchema: {
        type: "object",
        properties: {
          issues: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                rule: { type: "string" },
                elementHtml: { type: "string" },
                remediation: { type: "string" },
                pageUrl: { type: "string" },
              },
            },
          },
        },
      },
    },
  ];
}

function analyzeResponse() {
  return {
    data: [
      {
        rule: "image-alt",
        source: '<img src="logo.png">',
        summary:
          "Fix any of the following:\n  Element does not have an alt attribute",
        description: "Ensure <img> elements have alternative text",
        helpText: "Images must have alternative text",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.11/image-alt",
        impact: "critical",
        potentialImpact: null,
        selector: ["img"],
        tags: ["cat.text-alternatives", "wcag2a", "wcag111"],
        isAdvanced: false,
        isNeedsReview: false,
        isManual: false,
        isBestPractice: false,
        remediation: { any: [], all: [], none: [] },
        createdAt: "2026-11-20T00:00:00.000Z",
      },
    ],
    pageUrl: "http://127.0.0.1:1234/",
    advancedRules: { value: "disabled", source: "tool_arg" },
  };
}

const stubServer = `
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const dir = process.env.STUB_DIR;
const tools = JSON.parse(readFileSync(dir + "/tools.json", "utf8"));
const analyze = JSON.parse(readFileSync(dir + "/analyze.json", "utf8"));
writeFileSync(
  dir + "/server-env.json",
  JSON.stringify({
    AXE_API_KEY: process.env.AXE_API_KEY,
    AXE_ACCESS_TOKEN: process.env.AXE_ACCESS_TOKEN,
    AXE_SERVER_URL: process.env.AXE_SERVER_URL,
  }),
);

const send = (message) =>
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\\n");

for await (const line of createInterface({ input: process.stdin })) {
  const message = JSON.parse(line);
  if (message.id === undefined) continue;
  appendFileSync(dir + "/requests", line + "\\n");
  const { id, method, params } = message;
  if (method === "initialize") {
    send({
      id,
      result: {
        protocolVersion: params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "axe-mcp-server", version: "1.6.0" },
      },
    });
  } else if (method === "tools/list") {
    send({ id, result: { tools } });
  } else if (method === "tools/call") {
    const page = await fetch(params.arguments.url);
    writeFileSync(
      dir + "/page",
      JSON.stringify({ status: page.status, body: await page.text() }),
    );
    send({
      id,
      result: process.env.STUB_ANALYZE_ERROR
        ? {
            isError: true,
            content: [{ type: "text", text: process.env.STUB_ANALYZE_ERROR }],
          }
        : {
            isError: false,
            content: [
              {
                type: "text",
                text: process.env.STUB_ANALYZE_TEXT ?? JSON.stringify(analyze),
              },
            ],
          },
    });
  } else {
    send({ id, error: { code: -32601, message: "Method not found" } });
  }
}
`;

// npx is replaced by a stub, so the check launches the server through the
// plugin's real .mcp.json and launch script and reaches this fake server.
const stubNpx = `#!/bin/sh
case "$*" in
  *@deque/axe-auth@*) exit 1 ;;
esac
if [ -n "$STUB_EXIT" ]; then exit "$STUB_EXIT"; fi
if [ -n "$STUB_CLOSE_STDIN" ]; then
  read -r _
  exec 0<&-
  echo '{"jsonrpc":"2.0","id":1,"result":{"serverInfo":{"version":"1.6.0"}}}'
  sleep 0.2
  exit 1
fi
exec node "$STUB_DIR/server.mjs"
`;

// Runs the check from a copy of the plugin, so a test can edit the skills it
// reads without touching the real ones.
function check({
  tools = serverTools(),
  analyze = analyzeResponse(),
  env = { AXE_API_KEY: "key-123" },
  editSkills = () => {},
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), "axe-live-check-"));
  try {
    const plugin = join(dir, "plugin");
    for (const path of [".mcp.json", "scripts", "skills"]) {
      cpSync(join(root, path), join(plugin, path), { recursive: true });
    }
    editSkills(join(plugin, "skills"));
    writeFileSync(join(dir, "server.mjs"), stubServer);
    writeFileSync(join(dir, "npx"), stubNpx);
    chmodSync(join(dir, "npx"), 0o755);
    writeFileSync(join(dir, "tools.json"), JSON.stringify(tools));
    writeFileSync(join(dir, "analyze.json"), JSON.stringify(analyze));
    const script = join(plugin, "scripts/check-live-server.mjs");
    const result = spawnSync(process.execPath, [script], {
      encoding: "utf8",
      timeout: 30_000,
      env: {
        ...env,
        PATH: `${dir}${delimiter}${process.env.PATH}`,
        STUB_DIR: dir,
      },
    });
    assert.ifError(result.error);
    const read = (name) => {
      try {
        return readFileSync(join(dir, name), "utf8");
      } catch {
        return undefined;
      }
    };
    const requests = (read("requests") ?? "")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const page = read("page");
    const serverEnv = read("server-env.json");
    return {
      ...result,
      requests,
      page: page && JSON.parse(page),
      serverEnv: serverEnv && JSON.parse(serverEnv),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function analyzeTool(tools) {
  return tools.find((tool) => tool.name === "analyze");
}

function editFile(path, edit) {
  writeFileSync(path, edit(readFileSync(path, "utf8")));
}

function editEveryFile(dir, edit) {
  for (const entry of readdirSync(dir, {
    withFileTypes: true,
    recursive: true,
  })) {
    if (entry.isFile()) editFile(join(entry.parentPath, entry.name), edit);
  }
}

function checked(stdout, label) {
  const line = stdout
    .split("\n")
    .find((candidate) => candidate.startsWith(`Checked ${label}: `));
  return line?.slice(`Checked ${label}: `.length).split(", ");
}

// Pins what the check extracts from the real skills, so a rewording that
// silently drops a parameter or field from the check fails here instead.
test("checks every parameter and field the skills document", () => {
  const result = check();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(checked(result.stdout, "analyze parameters"), [
    "advancedRules",
    "before",
    "before.action",
    "before.ms",
    "chromePath",
    "cookies",
    "cookies.domain",
    "cookies.expires",
    "cookies.httpOnly",
    "cookies.name",
    "cookies.path",
    "cookies.sameSite",
    "cookies.secure",
    "cookies.value",
    "igtTools",
    "includeSelectors",
    "interactive",
    "modalSelector",
    "modalTriggerSelector",
    "screenshot",
    "screenshot.format",
    "screenshot.inline",
    "screenshot.save",
    "screenshot.saveTo",
    "selectedIDs",
    "selector",
    "sessionID",
    "url",
    "viewportHeight",
    "viewportWidth",
  ]);
  assert.deepEqual(checked(result.stdout, "remediate parameters"), [
    "issues",
    "issues[].elementHtml",
    "issues[].id",
    "issues[].pageUrl",
    "issues[].remediation",
    "issues[].rule",
  ]);
  assert.deepEqual(checked(result.stdout, "analyze response fields"), [
    "advancedRules",
    "advancedRules.source",
    "advancedRules.value",
    "data",
    "messages",
    "pageUrl",
  ]);
  assert.deepEqual(checked(result.stdout, "analyze issue fields"), [
    "createdAt",
    "description",
    "helpText",
    "helpUrl",
    "impact",
    "isAdvanced",
    "isBestPractice",
    "isManual",
    "isNeedsReview",
    "potentialImpact",
    "remediation",
    "rule",
    "selector",
    "source",
    "summary",
    "tags",
  ]);
});

test("passes when the server matches the documented parameters and response", () => {
  const result = check();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1\.6\.0/);
});

test("starts the server through the plugin's config with the API key", () => {
  const result = check({
    env: { AXE_API_KEY: "key-123", AXE_SERVER_URL: "https://dev.test" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.serverEnv, {
    AXE_API_KEY: "key-123",
    AXE_SERVER_URL: "https://dev.test",
  });
});

test("fails before starting the server when AXE_API_KEY is unset", () => {
  const result = check({ env: {} });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /AXE_API_KEY/);
  assert.equal(result.requests.length, 0);
});

test("analyzes a page it serves, with no guided tests or Advanced Rules", () => {
  const result = check();
  assert.equal(result.status, 0, result.stderr);
  const calls = result.requests.filter((r) => r.method === "tools/call");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params.name, "analyze");
  assert.deepEqual(Object.keys(calls[0].params.arguments).sort(), [
    "advancedRules",
    "url",
  ]);
  assert.equal(calls[0].params.arguments.advancedRules, "disabled");
  assert.equal(result.page.status, 200);
  assert.match(result.page.body, /<img/);
});

test("fails and names a documented analyze parameter the schema lacks", () => {
  const tools = serverTools();
  delete analyzeTool(tools).inputSchema.properties.modalSelector;
  const result = check({ tools });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /analyze.*modalSelector/);
});

test("fails and names a documented screenshot option the schema lacks", () => {
  const tools = serverTools();
  delete analyzeTool(tools).inputSchema.properties.screenshot.properties.saveTo;
  const result = check({ tools });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /analyze.*screenshot\.saveTo/);
});

test("fails and names a documented screenshot format option the schema lacks", () => {
  const tools = serverTools();
  delete analyzeTool(tools).inputSchema.properties.screenshot.properties.format;
  const result = check({ tools });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /analyze.*screenshot\.format/);
});

test("fails and names a documented cookie field the schema lacks", () => {
  const tools = serverTools();
  delete analyzeTool(tools).inputSchema.properties.cookies.items.properties
    .domain;
  const result = check({ tools });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /analyze.*cookies\.domain/);
});

test("fails when the analyze parameter list in the skills can't be found", () => {
  const result = check({
    editSkills: (skills) =>
      editFile(join(skills, "mcp-usage/SKILL.md"), (markdown) =>
        markdown.replace(
          "## Scoping and setup parameters on `analyze`",
          "## Options for `analyze`",
        ),
      ),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /parameters on `analyze`/);
  assert.equal(result.requests.length, 0);
});

test("fails when no remediate example in the skills can be found", () => {
  const result = check({
    editSkills: (skills) =>
      editEveryFile(skills, (markdown) =>
        markdown.replaceAll("remediate({", "remediate ({"),
      ),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /`remediate` parameters/);
  assert.equal(result.requests.length, 0);
});

test("fails when the analyze response example in field-mapping.md can't be found", () => {
  const result = check({
    editSkills: (skills) =>
      editFile(
        join(skills, "mcp-usage/references/field-mapping.md"),
        (markdown) =>
          markdown.replace("## `analyze` response", "## What analyze returns"),
      ),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /`analyze` response example/);
  assert.equal(result.requests.length, 0);
});

test("fails when the analyze issue field list in field-mapping.md can't be found", () => {
  const result = check({
    editSkills: (skills) =>
      editFile(
        join(skills, "mcp-usage/references/field-mapping.md"),
        (markdown) =>
          markdown.replace(
            "### Shape of an `analyze` issue",
            "### Issue fields",
          ),
      ),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /`analyze` issue field list/);
  assert.equal(result.requests.length, 0);
});

test("fails and names a documented before step field the schema lacks", () => {
  const tools = serverTools();
  const { before } = analyzeTool(tools).inputSchema.properties;
  before.items.anyOf = before.items.anyOf.filter(
    (step) => step.properties.action.const !== "wait",
  );
  const result = check({ tools });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /analyze.*before\.ms/);
});

test("fails and names a documented remediate issue field the schema lacks", () => {
  const tools = serverTools();
  const remediate = tools.find((tool) => tool.name === "remediate");
  delete remediate.inputSchema.properties.issues.items.properties.elementHtml;
  const result = check({ tools });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /remediate.*issues\[\]\.elementHtml/);
});

test("fails when the server doesn't offer a documented guided test", () => {
  const tools = serverTools();
  analyzeTool(tools).inputSchema.properties.igtTools.items.enum = [
    "keyboard",
    "interactive-elements",
  ];
  const result = check({ tools });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /igtTools.*"modal"/);
});

test("fails when a documented tool is missing", () => {
  const tools = serverTools().filter((tool) => tool.name !== "remediate");
  const result = check({ tools });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /remediate/);
});

test("fails and names an issue field field-mapping.md lists that the response lacks", () => {
  const analyze = analyzeResponse();
  delete analyze.data[0].helpUrl;
  const result = check({ analyze });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /helpUrl/);
});

test("fails and names an issue field field-mapping.md doesn't list", () => {
  const analyze = analyzeResponse();
  analyze.data[0].wcagLevel = "A";
  const result = check({ analyze });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /wcagLevel/);
});

test("fails and names a top-level response field that differs", () => {
  const analyze = analyzeResponse();
  delete analyze.pageUrl;
  analyze.scanId = "abc";
  const result = check({ analyze });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pageUrl/);
  assert.match(result.stderr, /scanId/);
});

test("allows the documented optional messages field", () => {
  const analyze = analyzeResponse();
  analyze.messages = ["Screenshot saved to /tmp/x.png"];
  const result = check({ analyze });
  assert.equal(result.status, 0, result.stderr);
});

test("fails and names an advancedRules field that differs", () => {
  const analyze = analyzeResponse();
  analyze.advancedRules = { value: "disabled", origin: "tool_arg" };
  const result = check({ analyze });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /advancedRules\.source/);
  assert.match(result.stderr, /advancedRules\.origin/);
});

test("fails when advancedRules is not an object", () => {
  const analyze = analyzeResponse();
  analyze.advancedRules = "disabled";
  const result = check({ analyze });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /`advancedRules` is not an object/);
});

test("fails without blaming the skills when Advanced Rules could not be disabled", () => {
  const analyze = analyzeResponse();
  analyze.advancedRules = { value: "balanced", source: "org_policy_locked" };
  const result = check({ analyze });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /AI credits/);
  assert.match(result.stderr, /org_policy_locked/);
  assert.doesNotMatch(result.stderr, /no longer match/);
});

test("fails when data is not an issue array", () => {
  const analyze = analyzeResponse();
  analyze.data = { axe: [] };
  const result = check({ analyze });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /`data` is not an issue array/);
  assert.doesNotMatch(result.stderr, /could not run/);
});

test("fails when the scan returns no issues to compare", () => {
  const analyze = analyzeResponse();
  analyze.data = [];
  const result = check({ analyze });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no issues/);
});

test("says the check could not run, with the server's message, when analyze errors", () => {
  const result = check({
    env: { AXE_API_KEY: "key-123", STUB_ANALYZE_ERROR: "Invalid API key" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /could not run/);
  assert.match(result.stderr, /Invalid API key/);
  assert.doesNotMatch(result.stderr, /no longer match/);
});

test("says the check could not run when analyze returns text that isn't JSON", () => {
  const result = check({
    env: { AXE_API_KEY: "key-123", STUB_ANALYZE_TEXT: "Service unavailable" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /could not run/);
  assert.match(result.stderr, /Service unavailable/);
  assert.doesNotMatch(result.stderr, /no longer match/);
});

test("says the check could not run when the server stops reading and exits", () => {
  const result = check({
    env: { AXE_API_KEY: "key-123", STUB_CLOSE_STDIN: "1" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /could not run/);
  assert.doesNotMatch(result.stderr, /no longer match/);
});

test("says the check could not run when the server exits before starting", () => {
  const result = check({ env: { AXE_API_KEY: "key-123", STUB_EXIT: "1" } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /could not run/);
  assert.doesNotMatch(result.stderr, /no longer match/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("./check-live-server.mjs", import.meta.url),
);

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
          cookies: { type: "array" },
          before: { type: "array" },
          screenshot: { type: "object" },
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
            content: [{ type: "text", text: JSON.stringify(analyze) }],
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
exec node "$STUB_DIR/server.mjs"
`;

function check({
  tools = serverTools(),
  analyze = analyzeResponse(),
  env = { AXE_API_KEY: "key-123" },
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), "axe-live-check-"));
  try {
    writeFileSync(join(dir, "server.mjs"), stubServer);
    writeFileSync(join(dir, "npx"), stubNpx);
    chmodSync(join(dir, "npx"), 0o755);
    writeFileSync(join(dir, "tools.json"), JSON.stringify(tools));
    writeFileSync(join(dir, "analyze.json"), JSON.stringify(analyze));
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

test("fails when data is not an issue array", () => {
  const analyze = analyzeResponse();
  analyze.data = { axe: [] };
  const result = check({ analyze });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /data/);
});

test("fails when the scan returns no issues to compare", () => {
  const analyze = analyzeResponse();
  analyze.data = [];
  const result = check({ analyze });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no issues/);
});

test("fails with the server's message when analyze errors", () => {
  const result = check({
    env: { AXE_API_KEY: "key-123", STUB_ANALYZE_ERROR: "Invalid API key" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid API key/);
});

test("says the check could not run when the server exits before starting", () => {
  const result = check({ env: { AXE_API_KEY: "key-123", STUB_EXIT: "1" } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /could not run/);
  assert.doesNotMatch(result.stderr, /no longer match/);
});

import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

// Starts the Axe MCP Server the way the plugin's .mcp.json does and checks that
// what the skills document still matches it: every analyze/remediate parameter
// they use is in the server's published schema, and a plain analyze returns
// exactly the fields field-mapping.md lists. Only a plain analyze with Advanced
// Rules disabled is called, because guided tests, Advanced Rules, and
// remediate spend AI credits. Run nightly by .github/workflows/live-server.yml.
const root = fileURLToPath(new URL("..", import.meta.url));
const FIELD_MAPPING = "skills/mcp-usage/references/field-mapping.md";
const PAGE = fileURLToPath(
  new URL("./fixtures/live-check-page.html", import.meta.url),
);
const TOOLS = ["analyze", "remediate"];
const TIMEOUT_MS = 5 * 60_000;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function markdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith(".md") ? [path] : [];
  });
}

// The lines under a heading, up to the next heading of the same or higher level.
function section(markdown, heading) {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) return null;
  const level = lines[start].match(/^#+/)[0].length;
  const end = lines.findIndex(
    (line, i) =>
      i > start && /^#+ /.test(line) && line.match(/^#+/)[0].length <= level,
  );
  return lines.slice(start + 1, end === -1 ? undefined : end).join("\n");
}

function tokenize(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) {
      i++;
    } else if (c === "/" && text[i + 1] === "/") {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end;
    } else if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      tokens.push({ type: "string", value: text.slice(i + 1, j) });
      i = j + 1;
    } else if (/[A-Za-z_$]/.test(c)) {
      const [ident] = text.slice(i).match(/^[\w$]+/);
      tokens.push({ type: "ident", value: ident });
      i += ident.length;
    } else {
      tokens.push({ type: "symbol", value: c });
      i++;
    }
  }
  return tokens;
}

// Reads the keys of the object literal that opens `text`, written loosely as
// the docs do: shorthand keys, `// comments`, and `<placeholder>` values.
// Nested keys are dotted, and keys of objects inside an array get `[]`, so
// remediate's `{ issues: [{ id }] }` yields `issues` and `issues[].id`. String
// values of an array are collected per key, such as igtTools' test names.
function objectKeys(text) {
  const tokens = tokenize(text);
  const keys = new Set();
  const values = new Map();
  const stack = [];
  let pending = null;
  for (let i = 0; i < tokens.length; i++) {
    const { type, value } = tokens[i];
    const frame = stack.at(-1);
    const previous = tokens[i - 1]?.value;
    const next = tokens[i + 1]?.value;
    if (type === "symbol" && (value === "{" || value === "[")) {
      const prefix =
        pending ?? (frame?.kind === "array" ? `${frame.path}[]` : frame?.path);
      stack.push({
        kind: value === "{" ? "object" : "array",
        path: prefix ?? "",
      });
      pending = null;
    } else if (type === "symbol" && (value === "}" || value === "]")) {
      stack.pop();
      if (stack.length === 0) break;
    } else if (
      frame?.kind === "object" &&
      (type === "ident" || type === "string") &&
      (previous === "{" || previous === ",") &&
      (next === ":" || (type === "ident" && (next === "," || next === "}")))
    ) {
      const path = frame.path ? `${frame.path}.${value}` : value;
      keys.add(path);
      if (next === ":") pending = path;
    } else if (frame?.kind === "array" && type === "string") {
      if (!values.has(frame.path)) values.set(frame.path, new Set());
      values.get(frame.path).add(value);
    } else if (!(type === "symbol" && value === ":")) {
      pending = null;
    }
  }
  return { keys, values };
}

function documentedParams() {
  const params = Object.fromEntries(
    TOOLS.map((tool) => [tool, { keys: new Set(), values: new Map() }]),
  );
  for (const file of markdownFiles(join(root, "skills"))) {
    const markdown = readFileSync(file, "utf8");
    // Only calls in code blocks: prose also quotes wrong, outdated calls as
    // mistakes to avoid.
    for (const [, block] of markdown.matchAll(/^ *```.*\n([\s\S]*?)^ *```/gm)) {
      for (const match of block.matchAll(/\b(analyze|remediate)\(\s*\{/g)) {
        const { keys, values } = objectKeys(
          block.slice(match.index + match[0].lastIndexOf("{")),
        );
        const documented = params[match[1]];
        for (const key of keys) documented.keys.add(key);
        for (const [key, set] of values) {
          if (!documented.values.has(key)) {
            documented.values.set(key, new Set());
          }
          for (const value of set) documented.values.get(key).add(value);
        }
      }
    }
    for (const tool of TOOLS) {
      const text = section(
        markdown,
        new RegExp(`^#+ .*parameters on \`${tool}\``),
      );
      for (const bullet of text?.match(/^- \*\*.+?\*\*/gm) ?? []) {
        for (const [, name] of bullet.matchAll(/`(\w+)`/g)) {
          params[tool].keys.add(name);
        }
      }
    }
  }
  return params;
}

function documentedResponse() {
  const markdown = readFileSync(join(root, FIELD_MAPPING), "utf8");
  const response = section(markdown, /^## `analyze` response$/);
  const example = response?.match(/```\n([\s\S]*?)```/)?.[1];
  const { keys } = objectKeys(example?.slice(example.indexOf("{")) ?? "");
  const issue = section(markdown, /^### Shape of an `analyze` issue$/);
  const issueFields = new Set(
    [...(issue?.matchAll(/^- (.+?) — /gm) ?? [])].flatMap(([, lead]) =>
      [...lead.matchAll(/`(\w+)`/g)].map(([, name]) => name),
    ),
  );
  const topLevel = [...keys].filter((key) => !key.includes("."));
  const missing = [];
  if (topLevel.length === 0) missing.push("the `analyze` response example");
  if (issueFields.size === 0) missing.push("the `analyze` issue field list");
  if (missing.length > 0) {
    fail(
      `Could not find ${missing.join(" or ")} in ${FIELD_MAPPING}. If it was reworded, update scripts/check-live-server.mjs to match.`,
    );
  }
  return {
    topLevel: new Set(topLevel),
    optional: new Set(
      [...response.matchAll(/top-level `(\w+)`/g)].map(([, name]) => name),
    ),
    nested: new Set([...keys].filter((key) => key.includes("."))),
    issue: issueFields,
  };
}

function alternatives(node) {
  return [
    node,
    ...(node.anyOf ?? []),
    ...(node.oneOf ?? []),
    ...(node.allOf ?? []),
  ];
}

function schemaNodes(schema, path) {
  let nodes = [schema];
  for (const part of path.split(".")) {
    const isArray = part.endsWith("[]");
    const name = isArray ? part.slice(0, -2) : part;
    nodes = nodes
      .flatMap(alternatives)
      .map((node) => node.properties?.[name])
      .filter(Boolean);
    if (isArray) {
      nodes = nodes
        .flatMap(alternatives)
        .map((node) => node.items)
        .filter(Boolean);
    }
  }
  return nodes;
}

function paramProblems(documented, tools) {
  const problems = [];
  for (const tool of TOOLS) {
    const definition = tools.find((candidate) => candidate.name === tool);
    if (!definition) {
      problems.push(`The server does not list the \`${tool}\` tool.`);
      continue;
    }
    const { keys, values } = documented[tool];
    for (const key of [...keys].sort()) {
      if (schemaNodes(definition.inputSchema, key).length === 0) {
        problems.push(
          `${tool}: documented parameter \`${key}\` is not in the server's input schema.`,
        );
      }
    }
    for (const [key, documentedValues] of values) {
      const enums = schemaNodes(definition.inputSchema, key)
        .flatMap(alternatives)
        .flatMap((node) => [node, node.items].filter(Boolean))
        .flatMap(alternatives)
        .flatMap((node) => node.enum ?? []);
      if (enums.length === 0) continue;
      for (const value of documentedValues) {
        if (!enums.includes(value)) {
          problems.push(
            `${tool}: \`${key}\` value "${value}" is documented but the server only offers ${JSON.stringify(enums)}.`,
          );
        }
      }
    }
  }
  return problems;
}

function responseProblems(documented, response) {
  const problems = [];
  for (const key of documented.topLevel) {
    if (!(key in response)) {
      problems.push(`analyze response is missing documented field \`${key}\`.`);
    }
  }
  for (const key of Object.keys(response)) {
    if (!documented.topLevel.has(key) && !documented.optional.has(key)) {
      problems.push(`analyze response has undocumented field \`${key}\`.`);
    }
  }
  const parents = new Set(
    [...documented.nested].map((key) => key.split(".")[0]),
  );
  for (const parent of parents) {
    const value = response[parent];
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const actual = new Set(Object.keys(value).map((key) => `${parent}.${key}`));
    for (const key of documented.nested) {
      if (key.startsWith(`${parent}.`) && !actual.has(key)) {
        problems.push(
          `analyze response is missing documented field \`${key}\`.`,
        );
      }
    }
    for (const key of actual) {
      if (!documented.nested.has(key)) {
        problems.push(`analyze response has undocumented field \`${key}\`.`);
      }
    }
  }
  if (!Array.isArray(response.data)) {
    problems.push(
      "analyze response `data` is not an issue array, as documented for a scan without guided tests.",
    );
  } else if (response.data.length === 0) {
    problems.push(
      "analyze returned no issues for the test page, so issue fields could not be compared.",
    );
  } else {
    const missing = new Map();
    const extra = new Map();
    for (const issue of response.data) {
      for (const field of documented.issue) {
        if (!(field in issue)) missing.set(field, issue.rule);
      }
      for (const field of Object.keys(issue)) {
        if (!documented.issue.has(field)) extra.set(field, issue.rule);
      }
    }
    for (const [field, rule] of missing) {
      problems.push(
        `analyze issue is missing documented field \`${field}\` (rule ${rule}).`,
      );
    }
    for (const [field, rule] of extra) {
      problems.push(
        `analyze issue has undocumented field \`${field}\` (rule ${rule}).`,
      );
    }
  }
  return problems;
}

function servePage() {
  const html = readFileSync(PAGE);
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(html);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}/`,
        close: () => server.close(),
      });
    });
  });
}

// A minimal MCP client over stdio: newline-delimited JSON-RPC.
function launchServer(apiKey) {
  const config = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8"));
  const server = config.mcpServers["axe-mcp-server"];
  const substitute = (value) =>
    value
      .replaceAll("${CLAUDE_PLUGIN_ROOT}", root)
      .replaceAll("${user_config.api_key}", apiKey);
  const child = spawn(server.command, server.args.map(substitute), {
    env: {
      ...process.env,
      ...Object.fromEntries(
        Object.entries(server.env ?? {}).map(([name, value]) => [
          name,
          substitute(value),
        ]),
      ),
    },
    stdio: ["pipe", "pipe", "inherit"],
  });
  const pending = new Map();
  let nextId = 1;
  createInterface({ input: child.stdout }).on("line", (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  child.on("exit", (code) => {
    for (const request of pending.values()) {
      request.reject(
        new Error(`The server exited (${code}) before responding.`),
      );
    }
    pending.clear();
  });
  const send = (message) =>
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
  return {
    request(method, params) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        send({ id, method, params });
      });
    },
    notify(method) {
      send({ method });
    },
    close() {
      child.stdin.end();
      child.kill();
    },
  };
}

const apiKey = process.env.AXE_API_KEY;
if (!apiKey) {
  fail("AXE_API_KEY must be set to the API key dedicated to this check.");
}

const params = documentedParams();
const response = documentedResponse();
const page = await servePage();
const server = launchServer(apiKey);
setTimeout(
  () => fail(`The check did not finish within ${TIMEOUT_MS / 60_000} minutes.`),
  TIMEOUT_MS,
).unref();

const problems = [];
let version;
try {
  const init = await server.request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "axe-accessibility-live-check", version: "0" },
  });
  version = init.serverInfo.version;
  server.notify("notifications/initialized");
  console.log(
    `Checking axe-mcp-server ${version} against ${process.env.AXE_SERVER_URL || "its default Axe server"}.`,
  );

  const { tools } = await server.request("tools/list", {});
  problems.push(...paramProblems(params, tools));

  const result = await server.request("tools/call", {
    name: "analyze",
    arguments: { url: page.url, advancedRules: "disabled" },
  });
  const text = result.content?.find((block) => block.type === "text")?.text;
  if (result.isError) {
    problems.push(`analyze failed: ${text}`);
  } else {
    problems.push(...responseProblems(response, JSON.parse(text)));
  }
} catch (error) {
  problems.push(error.message);
} finally {
  server.close();
  page.close();
}

if (version === undefined) {
  fail(
    `The live check could not run: ${problems.join(" ")} See the server's log above.`,
  );
}
if (problems.length > 0) {
  fail(
    [
      `The skills no longer match axe-mcp-server ${version}:`,
      "",
      ...problems.map((problem) => `  - ${problem}`),
      "",
      `Update the skills (parameters) or ${FIELD_MAPPING} (response fields) to match the server, or report the server change to the MCP team.`,
    ].join("\n"),
  );
}
console.log(
  "Every documented analyze/remediate parameter and analyze response field matches the server.",
);
process.exit(0);

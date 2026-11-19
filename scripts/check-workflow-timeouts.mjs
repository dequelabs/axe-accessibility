import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

// Every workflow job must set an explicit `timeout-minutes` so a hung step
// can't burn build minutes indefinitely (org rule, dequelabs/billing-service#2267).
// GitHub Actions has no workflow-level timeout, so this is enforced per job.
const workflowDir = process.argv[2] ?? ".github/workflows";

function findJobsWithoutTimeout() {
  const violations = [];
  const files = readdirSync(workflowDir)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .sort();
  for (const file of files) {
    let doc;
    try {
      doc = parse(readFileSync(join(workflowDir, file), "utf8"));
    } catch (error) {
      violations.push(`${file}: could not parse YAML (${error.message})`);
      continue;
    }
    for (const [id, job] of Object.entries(doc?.jobs ?? {})) {
      // A job that calls a reusable workflow via `uses:` cannot set
      // timeout-minutes itself, so it is out of scope.
      if (job && typeof job === "object" && "uses" in job) continue;
      if (job?.["timeout-minutes"] === undefined) {
        violations.push(`${file}: job "${id}" is missing timeout-minutes`);
      }
    }
  }
  return violations;
}

const violations = findJobsWithoutTimeout();
if (violations.length > 0) {
  console.error(
    "Every workflow job must set timeout-minutes (dequelabs/billing-service#2267):\n",
  );
  for (const v of violations) console.error(`  - ${v}`);
  console.error(
    `\n${violations.length} job(s) missing timeout-minutes. Add a per-job timeout-minutes tuned to the job.`,
  );
  process.exit(1);
}
console.log("All workflow jobs set timeout-minutes.");

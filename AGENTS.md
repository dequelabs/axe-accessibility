# AGENTS.md

This repo is Deque's `axe-accessibility` Claude Code plugin, and it doubles as the `deque` marketplace that serves it. The plugin ships skills (`skills/`) that teach customers' coding agents to use the Axe MCP Server, plus the config that launches that server (`.mcp.json`, `scripts/start-axe-mcp-server.sh`). There is no application code; the product is the instructions and config. Setup and conventions are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Checks

Run `pnpm install` once (Node from `.nvmrc`, pnpm via `corepack enable`). Then:

- `pnpm check` runs everything below, as CI does. Run it before you finish.
- `pnpm fmt` fixes formatting.
- `pnpm test` runs the tests.
- `pnpm run check:<name>` runs one check, where `<name>` is `format`, `lint`, `spelling`, `shell`, `manifests`, `links`, `workflow-timeouts`, or `versions`.

Spelling failures on real words: add them to `project-words.txt`. `check:links` needs network access, and `check:shell` needs ShellCheck installed locally.

## Commits and PRs

- PR titles follow [Conventional Commits](https://www.conventionalcommits.org/), enforced by CI. Capitalize the first word after the prefix: `fix: Use the pinned Playwright version`.
- PRs are squash-merged using the PR title and description as the commit. Write the description as the commit body: what changes for users and why, not how. No headings or checklists; they land in `git log`. End with a `Closes #N` footer after a blank line.
- Branch names have no type prefix: `token-refresh`, not `feat/token-refresh`.

## Rules the code doesn't show

- **Skills are customer-facing.** Every file under `skills/` is instructions that customers' agents follow literally. Editing a skill changes what those agents do on customers' machines. Write for that reader, and treat a wording change as a behavior change.
- **Content reaches users only through a release.** Merging to `main` ships nothing. Users get a change when a release that includes it is published; see the [README](README.md#publishing).
- **Only release PRs change the plugin version** (`version` in `.claude-plugin/plugin.json`). Release PRs are opened by the "Create release PR" workflow from a `release-<version>` branch, titled `chore(release): v<version>`. Never bump the version in any other PR.
- **Customers depend on these names.** Renaming or removing any of them is a breaking change:
  - plugin `axe-accessibility` and marketplace `deque`
  - skills `mcp-audit`, `mcp-generate-instructions`, `mcp-setup`, `mcp-usage` (invoked as `/axe-accessibility:<skill>`)
  - the `api_key` option in `userConfig`
  - the MCP server key `axe-mcp-server` in `.mcp.json`
- **The repo root is the plugin root.** Files there ship to customers with the plugin. `claude plugin validate --strict` rejects a root `CLAUDE.md`, so this file is imported from `.claude/CLAUDE.md` instead.

## Pinned versions

The plugin pins exact versions of `axe-mcp-server` (npm package and Docker image tag), `@deque/axe-auth`, and Playwright, repeated across the launch script, manifests, README, and skills.

- **Current pins** state what the plugin runs today (`axe-mcp-server@X`, "pinned `X`", "documented against X"). They must all agree, and `pnpm run check:versions` fails when they don't. It recognizes only the phrasings listed in `PINS` in [`scripts/check-versions.mjs`](scripts/check-versions.mjs) and ignores every other version number. If you write a current pin in a new way, add a pattern for it (with a test in `scripts/check-versions.test.mjs`), or the check won't see it.
- **Historical references** say when something changed ("`igtTools` needs 1.5.0+", "since server 1.4.0", "fixed in 1.4.0", "pre-1.3.0"). They stay true after a bump. Never update them to the new pin.

When the `axe-mcp-server` pin changes:

1. Update every current pin together, including Playwright (`npm view axe-mcp-server@<version> dependencies.playwright`) and `@deque/axe-auth`. `pnpm run check:versions` lists any that disagree.
2. Re-check every doc that claims to match a specific server release against the new release's actual tool descriptions and responses, and fix the guidance, not just the number. Today those are:
   - `README.md`: "documented against" and the "Why the server is pinned" section
   - `skills/mcp-usage/SKILL.md`: "those of server X"
   - `skills/mcp-usage/references/field-mapping.md`: "wire format of Axe MCP Server X"
   - `skills/mcp-setup/SKILL.md` and `skills/mcp-setup/references/client-configs.md`: "documents server X's response shapes"

   `grep -rniE 'server [0-9]+\.[0-9]+|documented against' README.md skills` finds new ones.

3. Don't bump the plugin version; the next release ships the new pin.

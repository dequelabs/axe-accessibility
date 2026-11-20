# Contributing

This repo is owned by Deque's MCP team. Before changing anything, read [AGENTS.md](AGENTS.md): it lists the rules the code doesn't show, such as which names customers depend on and why only release PRs change the plugin version.

## Getting help

Open a [GitHub issue](https://github.com/dequelabs/axe-accessibility/issues) to report a problem, propose a change, or ask the team a question. The MCP team responds within 2 days.

## Setup

1. Install the Node version in [`.nvmrc`](.nvmrc) (for example `nvm install`).
2. Run `corepack enable`. It provides the pnpm version pinned in `packageManager` in [`package.json`](package.json).
3. Install [ShellCheck](https://github.com/koalaman/shellcheck#installing) (for example `brew install shellcheck`). `pnpm check:shell` uses it; CI runs it through a pinned GitHub Action.
4. Run `pnpm install`. It also installs the pre-commit hook.

## Checks

`pnpm check` runs every check and the tests that CI runs, except the PR title check. Each also runs on its own:

| Command                            | Checks                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm run check:format`            | Formatting (Prettier). `pnpm fmt` fixes it.                                              |
| `pnpm run check:lint`              | Lint for JavaScript, JSON, and Markdown (ESLint)                                         |
| `pnpm run check:spelling`          | Spelling (cspell). Add real words to [`project-words.txt`](project-words.txt).           |
| `pnpm run check:shell`             | Shell scripts (ShellCheck, installed locally)                                            |
| `pnpm run check:manifests`         | `claude plugin validate --strict` on both manifests in `.claude-plugin/`                 |
| `pnpm run check:links`             | Links in Markdown files, local and external (linkinator). Needs network access.          |
| `pnpm run check:workflow-timeouts` | Every GitHub Actions job sets `timeout-minutes`                                          |
| `pnpm run check:versions`          | Every current pin of a version agrees (see [Pinned versions](AGENTS.md#pinned-versions)) |
| `pnpm test`                        | Tests for the repo's own scripts                                                         |

## Conventions

Each convention is enforced or shown by a file in this repo:

- **Pre-commit hook.** [`.husky/pre-commit`](.husky/pre-commit) runs [`lint-staged.config.js`](lint-staged.config.js), which formats, lints, and spell-checks staged files and runs the version check.
- **CI.** [`.github/workflows/checks.yml`](.github/workflows/checks.yml) runs the same checks as `pnpm check` on every PR.
- **Workflow timeouts.** Every job in `.github/workflows/` sets `timeout-minutes`, enforced by [`scripts/check-workflow-timeouts.mjs`](scripts/check-workflow-timeouts.mjs).
- **PR titles.** Conventional Commits with the first word capitalized (`fix: Use the pinned Playwright version`), enforced by [`.github/workflows/semantic-pr-title.yml`](.github/workflows/semantic-pr-title.yml).
- **PR descriptions.** PRs are squash-merged with the title and description as the commit, so the description is the commit body. Describe what changes for users and why, without headings or checklists, and end with `Closes #N`.
- **Branch names.** No type prefix: `token-refresh`, not `feat/token-refresh`.
- **Pinned versions.** Current pins are recognized by the patterns in [`scripts/check-versions.mjs`](scripts/check-versions.mjs). Historical references like "needs 1.5.0+" are never bumped.
- **Skills.** Each skill is a directory with a `SKILL.md` whose frontmatter `name` is the name customers invoke, plus optional `references/`. See [`skills/mcp-setup/`](skills/mcp-setup/SKILL.md).

## Pull request checklist

The [PR template](.github/pull_request_template.md) repeats this list inside an HTML comment. GitHub hides the comment on the PR page, but it still lands in the squash commit, so delete it before merging.

- The title is a Conventional Commit with the first word capitalized.
- `pnpm check` passes.
- Skill edits read correctly as instructions a customer's agent will follow literally.
- No customer-facing name is renamed or removed (see [AGENTS.md](AGENTS.md#rules-the-code-doesnt-show)).
- The plugin version is unchanged, unless this is a release PR.
- If a server pin changed, the docs that claim to match a server release were re-checked (see [Pinned versions](AGENTS.md#pinned-versions)).

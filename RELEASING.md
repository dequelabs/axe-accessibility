# Releasing

Self-hosted marketplace users receive only released versions; the plugin directory is covered under [Publishing](README.md#publishing). A merge to `main` ships no plugin code to the marketplace on its own: the plugin's version lives in `.claude-plugin/plugin.json`, and the marketplace entry in `.claude-plugin/marketplace.json` installs the plugin from that version's tag, `v<version>`.

Anyone with write access can cut a release:

1. In the **Actions** tab, run **Create release PR** on `main`. Choose `major`, `minor`, or `patch`, or leave it on `automatic` to pick the bump from the commits since the last release by the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) rules: a breaking change (`!` after the type, or a `BREAKING CHANGE:` footer) is major, a `feat` is minor, and anything else is a patch. Those rules apply below 1.0.0 too.
2. The workflow opens a PR from `release-<version>` titled `chore(release): v<version>`. It sets the new version in `plugin.json`, moves the marketplace entry's `ref` to `v<version>`, adds a `CHANGELOG.md` entry built from the `feat` and `fix` commits, and lists the issues closed since the last release.
3. Review and merge it like any other PR. CI runs on it. If other PRs merge into `main` while it is open, the release would ship them without listing them, so close it, delete its branch, and run **Create release PR** again.
4. The merge runs the **Release** workflow, which tags the merge commit `v<version>` and publishes a GitHub release with the changelog entry as its notes.
   The marketplace entry points at the tag as soon as the PR merges, so fresh installs fail until **Release** succeeds. If it fails, re-run it; the next push to `main` also retries it.

The **Release PR** check fails any other PR that changes the plugin version or the marketplace entry's `source`, including its `ref`, so versions move only through this flow. It blocks the merge only once it is a required check on `main` ([#11](https://github.com/dequelabs/axe-accessibility/issues/11)). `pnpm release --dry-run --release-as "$(node scripts/release-type.mjs)"` previews locally the version and changelog entry that `automatic` would produce.

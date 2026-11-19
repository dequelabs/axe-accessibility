/** @type {import("lint-staged").Config} */
module.exports = {
  "*.{js,mjs,cjs}": ["eslint --fix", "prettier --write"],
  "*.{md,json}": ["eslint --fix", "prettier --write"],
  "*.{yml,yaml}": ["prettier --write"],
  // Pins must agree across files, so check the whole repo rather than the
  // staged paths lint-staged would otherwise append.
  "*.{md,json,sh,yml,yaml}": () => "node scripts/check-versions.mjs",
};

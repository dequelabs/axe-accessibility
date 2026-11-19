/** @type {import("lint-staged").Config} */
module.exports = {
  "*.{js,mjs,cjs}": ["eslint --fix", "prettier --write"],
  "*.{md,json}": ["eslint --fix", "prettier --write"],
  "*.{yml,yaml}": ["prettier --write"],
};

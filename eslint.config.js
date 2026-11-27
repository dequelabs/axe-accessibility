const js = require("@eslint/js");
const json = require("@eslint/json").default;
const markdown = require("@eslint/markdown").default;
const globals = require("globals");
const { defineConfig } = require("eslint/config");

module.exports = defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["**/*.json"],
    plugins: { json },
    language: "json/json",
    extends: ["json/recommended"],
  },
  {
    files: ["**/*.md"],
    plugins: { markdown },
    language: "markdown/gfm",
    languageOptions: { frontmatter: "yaml" },
    extends: ["markdown/recommended"],
    rules: {
      // Most fences hold pseudo-code, annotated JSON, or prompt text that no
      // single language tag describes.
      "markdown/fenced-code-language": "off",
      // v9 dropped this from markdown/recommended (it is gfm-only now).
      "markdown/table-column-count": "error",
    },
  },
]);

/** @type {import("prettier").Config} */
module.exports = {
  // Never reflow Markdown prose. "preserve" (not "never") so existing
  // hard-wrapped paragraphs are left as written rather than joined.
  proseWrap: "preserve",
  overrides: [
    {
      files: "*.md",
      // Code samples in skills are kept compact on purpose for agent context.
      options: { embeddedLanguageFormatting: "off" },
    },
  ],
};

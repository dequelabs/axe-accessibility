# Canonical workflow text

Embed the section below into the target file. Replace `analyze` / `remediate` with the target's tool-naming convention (see `targets.md`). Keep the structure intact.

---

## Accessibility Testing and Remediation Workflow

### MANDATORY WORKFLOW — DO NOT DEVIATE

This workflow applies to ANY UI code generation or modification — not only when accessibility is explicitly requested. Whenever you create, modify, or refactor user-facing UI (new components, new pages, edits to existing components), follow this exact workflow before considering the task complete.

#### 1. Analysis phase

When checking pages for accessibility issues:

- Use the axe MCP `analyze` tool to scan the page. Do NOT manually identify accessibility issues.
- Always provide the complete URL being analyzed (scheme, host, and port — e.g. `http://localhost:3000/path`).

#### 2. Remediation phase

For each violation found:

- Call the axe MCP `remediate` tool, passing the rule ID, the violating element's HTML (the `source` field), and a description combining the issue's `description` and `helpText`.
- Review the remediation guidance before changing any code.
- Apply fixes based on the tool's recommendations. Do NOT hand-fix accessibility issues without first consulting `remediate`.
- Each `remediate` call consumes AI credits — call it once per unique violation, not speculatively.

#### 3. Verification phase

After applying fixes:

- Re-run `analyze` on the same URL to confirm all issues are resolved.
- Confirm zero violations before considering the task complete. If issues remain, repeat the loop.

### Workflow example

```
1. analyze            -> find violations
2. for each violation: remediate -> get fix guidance, then apply it to code
3. analyze            -> verify
4. repeat until zero violations
```

### Enforcement

- NEVER skip the `remediate` tool when fixing accessibility issues.
- ALWAYS use both `analyze` and `remediate` as specified.
- The axe engine is deterministic and tuned for zero false positives — treat its findings as authoritative.

### Image alt text

When remediating an image without alt text, describe ONLY the informative content of the image itself — not its surrounding context, and never repeat text already rendered adjacent to the image. For images composed of meaningful sub-elements (e.g. icons inside an SVG), inspect the asset and describe those specific elements. Use `alt=""` for purely decorative images.

---

## Project-specific note pattern (optional)

When a repo has asset conventions worth encoding, append a concrete rule, for example:

> Images sourced from `public/<dir>/*.svg` carry meaning via overlaid icons identified by `<!-- ... -->` comments in the SVG. When writing alt text for such an `<img>`, open the SVG, read the comments, and describe only those elements — do not repeat adjacent card text.

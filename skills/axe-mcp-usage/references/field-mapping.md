# analyze -> remediate field mapping

## Shape of an analyze issue

The `analyze` tool returns a response with a `pageUrl` and a list of issues. Each issue includes (field names that matter for remediation):

- `rule` — the axe rule ID, e.g. `color-contrast`, `image-alt`, `button-name`, `label`, `link-name`.
- `source` — the HTML snippet of the violating element, e.g. `<img src="/hero.png">`.
- `description` — a short statement of what the rule checks.
- `helpText` — actionable guidance on how the rule is satisfied.
- Additional metadata (impact, selector, help URL) may be present but is not required by `remediate`.

## Building a remediate call

Map each issue onto `remediate` as follows:

```
remediate({
  pageUrl:     <analyze response .pageUrl>,
  rule:        <issue.rule>,
  elementHtml: <issue.source>,
  remediation: <issue.description> + " " + <issue.helpText>
})
```

`remediation` should read as a self-contained description of the problem and what must change. Concatenate `description` and `helpText` so the remediation engine has full context.

## Worked example

1. `analyze("http://localhost:3000")` returns:

```json
{
  "pageUrl": "http://localhost:3000",
  "issues": [
    {
      "rule": "image-alt",
      "source": "<img src=\"/trips/express-dining.svg\">",
      "description": "Images must have alternate text",
      "helpText": "Add an alt attribute that conveys the informative content of the image."
    }
  ]
}
```

2. Call `remediate`:

```
remediate({
  pageUrl: "http://localhost:3000",
  rule: "image-alt",
  elementHtml: "<img src=\"/trips/express-dining.svg\">",
  remediation: "Images must have alternate text. Add an alt attribute that conveys the informative content of the image."
})
```

3. Apply the returned guidance to the source code (add the `alt` attribute), then re-run `analyze("http://localhost:3000")` to confirm the issue is gone.

## Common mistakes

- Passing a relative path or a path without scheme/port to `analyze` — always pass the full URL.
- Using the CSS selector instead of `source` for `elementHtml` — `remediate` needs the element's HTML, not its selector.
- Calling `remediate` before collecting all issues from one `analyze` pass — gather first, then remediate each unique violation once (credits).

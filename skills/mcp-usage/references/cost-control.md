# Economizing on remediation credits

`remediate` charges **per issue in the batch**, so a 180-issue page costs about 15x a 12-issue one. The default is still to send every instance and get per-issue guidance. This file covers what to do when the user asks to spend less — or when a scan is large enough that you should ask them first.

## When to economize

- **The user asks.** Explicitly, or by signalling budget concern ("just the important ones", "don't burn credits").
- **The scan is large.** More than ~30 issues in a round: report the count and a rule breakdown, then let the user choose. Do not decide for them, and do not silently work through hundreds of issues.

Two levers, in order of preference:

1. **Narrow the scope** — remediate `critical`/`serious` impact only, or one page region, or one component the user is actually working on. This loses no guidance quality for what you do send, so prefer it.
2. **Collapse repeated instances** — the dedup key below. Use when the same component genuinely repeats many times and scope-narrowing does not help.

## The dedup key: `rule` + normalized element identity

**Not raw `selector`.** axe emits a unique selector per element, so exact selector matching dedupes nothing. Measured on one real page: 23 `target-size` issues produced 23 distinct selectors, 8 `link-name` issues produced 8.

**Not raw `source` either.** It is simultaneously too strict and too blind. Too strict because per-instance attributes differ — those same 23 `target-size` issues had 23 distinct `source` strings, so source-equality grouped nothing, even though several were the same control repeated. Too blind because it carries no information about position in the tree.

**Normalize the selector path instead.** Strip positional indices, then group:

```
:nth-child(7)   -> :nth-child(n)
:nth-of-type(2) -> :nth-of-type(n)
```

Join the `selector` array with a separator first so a frame/shadow path stays distinct from a top-frame one. Measured collapse on the same page:

| rule | issues | distinct raw selectors | distinct normalized |
|---|---|---|---|
| `target-size` | 23 | 23 | **19** |
| `link-name` | 8 | 8 | **6** |
| `image-alt` | 4 | 4 | **2** |
| `focus-on-hidden-item` (igt) | 7 | 7 | **4** |

Same-normalized-path issues are the same element in the same structural position across repeated siblings — i.e. one component rendered N times, which is exactly the group whose fix is shared.

## Content-dependent rules need a second condition

Element identity alone is not sufficient when the correct fix depends on the element's *content*. A product grid of 12 cards, each with a different image, yields 12 `image-alt` issues that all share one normalized selector — and every one needs **different** alt text. Collapsing to a single representative would give you one alt string that is right for one card and wrong for eleven.

So for these rules, require the content-bearing part to match **as well as** the element identity:

| rule | also require |
|---|---|
| `image-alt`, `input-image-alt`, `area-alt` | identical `src` |
| `link-name`, `button-name` | identical text content / `href` |
| `label`, `select-name` | identical associated prompt |
| `frame-title` | identical frame `src` |

In practice this means: for content-dependent rules, group by `rule` + normalized selector + `source`. On the page measured above that correctly collapses three instances of the *same* `mars-spaceman.jpg` in a repeated card into one request, while it would have kept twelve genuinely different card images separate.

For structural and style rules — `color-contrast`, `target-size`, `aria-*`, `region`, `heading-order` — the normalized selector alone is fine, because the fix is a token, a role, or a size and does not vary with the element's text.

**Set expectations about the saving.** Running this full recipe over the 50-issue page measured above yields 42 requests — 8 collapsed across 6 components, about 16%. Repetition-heavy pages (long product grids, data tables, footer link farms) save far more; pages with varied one-off violations save almost nothing. Because the typical saving is modest and the quality cost is real, **narrowing scope is usually the better lever** — reach for collapsing when a component genuinely repeats at scale.

## Choosing a representative and reporting

- Send the instance with the **highest `impact`**; on a tie, the first in document order.
- Prefer sending **two or three** representatives over exactly one for a large group. The marginal cost is small and it catches the case where your grouping was wrong.
- **Say what you collapsed.** Report it as e.g. `47 issues -> 18 remediation requests (29 collapsed across 6 repeated components)`. A silent collapse looks identical to a clean scan and hides that guidance was traded for cost.

## Applying collapsed results

The result covers a group, so apply it deliberately:

1. Fix the shared component once where possible — that is the whole reason the group exists.
2. Where the rule is content-dependent, apply the *pattern* from the guidance and author per-instance content yourself (alt text, accessible names) rather than copying the representative's string to every site.
3. Verify with a full `analyze` as normal. Verification is free, and it is what catches a group that should not have been grouped: if a collapsed rule still reports violations at the other instances, your key was too loose — send those individually next round.

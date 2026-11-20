# Plugin evals

These cases measure whether the plugin's skills change what an agent does with the Axe MCP Server, using `claude plugin eval`. Each case runs with and without the plugin, and the report shows both scores and the difference.

| Case                           | Checks                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| `loads-mcp-usage`              | An accessibility request loads the `mcp-usage` skill and scans the page by its full URL |
| `remediate-one-batch`          | Every issue from a scan, including each instance of a repeated rule, goes in one call   |
| `no-guided-tests-unless-asked` | A plain scan request doesn't add guided tests, which consume credits                    |
| `guided-tests-when-asked`      | A keyboard request runs only the keyboard guided test, through `analyze`                |

The Axe MCP Server is never called. `mocks/axe-mcp-server/` answers `analyze` from a fixed scan of a made-up checkout page, has the judge model answer `remediate`, and answers the deprecated `igt` tool so a case can fail an agent that calls it.

`_tools.json` is the `tools/list` result captured from axe-mcp-server 1.6.0, so agents see the same tools, parameters, and descriptions as with the real server. When the server pin changes, capture it again: start the server through `scripts/start-axe-mcp-server.sh` with an Axe API key, send `tools/list`, and save its `tools` array as `{ "tools": [...] }`. Every tool in it needs a mock, or `pnpm test` fails.

## Running

Runs call the model on your credential and cost money. `pnpm run evals` pins the models and stops starting new runs once the estimated cost reaches $10. To iterate on one case cheaply:

```sh
pnpm run evals --case remediate-one-batch --runs 1 --ablation none
```

Results and the HTML report go to `evals/results/`, which is not committed.

In CI, run the **Evals** workflow from the Actions tab. It uses the `ANTHROPIC_API_KEY_EVALS` secret, which should be a key used for nothing else, in a Claude Console workspace with its own spend limit. It is never a required check.

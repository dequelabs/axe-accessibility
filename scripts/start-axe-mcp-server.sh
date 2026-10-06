#!/bin/sh
# Starts the Axe MCP Server with exactly one credential. AXE_API_KEY comes from
# the plugin's api_key option and is empty when unset. The server refuses to
# start with both an API key and an OAuth token, so an OAuth session wins.

unset AXE_ACCESS_TOKEN

token=$(npx -y @deque/axe-auth@1.6.0 token 2>/dev/null)
if [ -n "$token" ]; then
  unset AXE_API_KEY
  AXE_ACCESS_TOKEN=$token
  export AXE_ACCESS_TOKEN
fi

exec npx -y axe-mcp-server@1.6.0

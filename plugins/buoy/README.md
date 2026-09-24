# Buoy for Claude Code

Keeps Claude on your design system.

- **Before it writes styles**, Claude can look up your tokens through the bundled `buoy` MCP server (`list_design_tokens`, `find_token_for_value`, `check_design_drift`, `design_system_context`).
- **After every edit**, a `PostToolUse` hook checks the changed file and hands back each hardcoded value with the token to use instead.

Works with CSS custom properties, Sass variables, Tailwind themes and tokens.json (Style Dictionary / Tokens Studio). No account or configuration needed; it reads your repository.

## Get it on every pull request too

The plugin catches drift while Claude writes. The free [Buoy GitHub App](https://github.com/marketplace/buoy-design) reviews every pull request, from agents and people alike, and suggests the token as a one-click fix. Installing it is enough; no Buoy account needed.

## Install

```
/plugin marketplace add ahoybuoy/buoy
/plugin install buoy@buoy
```

## Configure

Optional `.buoy.yaml` in your repository root. If your JSON tokens are emitted as CSS variables with a prefix:

```yaml
sources:
  tokens:
    cssVariables:
      prefix: cds   # color.white -> var(--cds-color-white)
```

Docs: https://buoy.design/docs/integrations/mcp · Source: https://github.com/ahoybuoy/buoy · MIT

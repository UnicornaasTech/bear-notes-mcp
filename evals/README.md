# Evals for bear-notes-mcp

A/B eval harness comparing MCP server versions on efficiency metrics (tool calls, turns, cost). Uses [promptfoo](https://promptfoo.dev) with the `anthropic:claude-agent-sdk` provider.

## What This Measures

Two versions of the MCP server run against the same prompt. The eval measures how efficiently each version completes the task:

- **Tool calls** (gate ≤5): how many times the agent calls the MCP server
- **Turns**: conversation turns between the agent and MCP server
- **Cost**: USD per run

The current eval tests the tags-in-search feature (PR #100) — search results include tags, so the agent doesn't need follow-up calls to read tag data.

## Prerequisites

1. **Bear app running** — the MCP server reads Bear's SQLite DB
2. **`dist/main.js` built** — `task build` from project root
3. **`evals/released/` populated** — `task eval:setup` (one-time)
4. **`ANTHROPIC_API_KEY` exported** in your shell

## Quick Start

```bash
task eval:setup VERSION=2.10.0   # one-time: download baseline
task build               # build current HEAD
task eval                # run eval, generate report, open in browser
```

Extra args pass through to promptfoo: `task eval -- --repeat 3`

## Files

| File | Purpose |
|------|---------|
| `promptfooconfig.yaml` | Eval config — providers, assertions, prompt, test case |
| `generate-report.js` | Reads `results.json`, produces self-contained `report.html` |
| `outputs/` | Results, report, SDK debug logs (gitignored) |
| `released/` | Baseline server from npm (gitignored) |

## Provider Isolation

Each eval run is isolated from host Claude Code settings:

- `setting_sources: []` — blocks `~/.claude/settings.json` and project settings
- `custom_allowed_tools` — strict allowlist; only the eval's MCP server tools are callable
- `mcp.servers` — passed via `--mcp-config`, independent of settings files
- `persist_session: false` — no session transcripts written

## Adding a New Eval

The current config is a self-contained single file. When adding a second eval, extract the shared parts:

1. Move providers to `shared/providers.yaml`, reference as `providers: file://shared/providers.yaml`
2. Move `defaultTest` to `shared/default-test.yaml`, reference as `defaultTest: file://shared/default-test.yaml`
3. Create a new config with its own prompt and test case, reusing the shared files

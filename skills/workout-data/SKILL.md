---
name: workout-data
description: "Inspect or change supported workout workspace data through the resource CLI. Use when the user needs CLI mechanics, resource selection, payload shape, or validation; workflow skills retain coaching and state-gate decisions."
---

Use the public command from the workspace root:

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/workout-data.mjs" [--workspace <path>] <verb> <resource> [options]
node "${CLAUDE_PLUGIN_ROOT}/scripts/workout-data.mjs" help [resource] [--format json|text]
```

If `${CLAUDE_PLUGIN_ROOT}` is not set, the plugin root is the directory two levels above this SKILL.md; use that path instead.
When unsure about selectors or payload fields, use `help <resource>`; add `--format text` for a compact guide.

## Scope

Use the CLI to inspect or make supported changes to `profile.yaml`, `status.yaml`,
`goals.yaml`, `macrocycle.yaml`, and `sessions.yaml`. Never hand-edit `profile.yaml`,
`status.yaml`, `goals.yaml`, `macrocycle.yaml`, or `sessions.yaml`. If the requested
operation is unsupported, stop and explain that the CLI does not support it; do not fall
back to a manual edit.

`exercises.custom.yaml` is outside CLI v1. Do not attempt to change it through the CLI; a
user may create or update it manually as a custom-catalog workflow. Use
`upgrade-workspace` for confirmed catalog migrations.
`review.md`, `summary.md`, and archive directory moves remain workflow-owned.

## Command mechanics

- Use `get` for a singleton and `list` for a collection. Use `--fields id,name` only with `list`.
- Program resources require `--program <program-id>`. Sessions resources also require
  `--mesocycle <positive-integer>`. Identified resources require `--id` when selecting an
  existing item; `session-exercise --id` selects its parent session.
- `create`, `add`, and `update` take exactly one JSON object through `--data` or
  `--data-file`. `remove` and `move` require `--data '{}'`; a session move requires
  exactly one of `--before <session-id>` or `--after <session-id>`.
- Use `validate --program <program-id>` for a target-program audit or
  `validate --scope workspace` for the full workspace audit.

The CLI validates and atomically replaces one supported YAML file. It does not decide
whether a workflow is allowed, choose coaching content, create reviews or summaries, or
archive a program; use the relevant workflow skill for those decisions.

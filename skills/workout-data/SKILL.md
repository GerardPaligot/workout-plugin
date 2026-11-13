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
  existing item; `session-exercise --id` selects its parent session. To update or remove one
  exercise, also pass its existing `--order`: `update session-exercise --program <program-id>
  --mesocycle <n> --id <session-id> --order <exercise-order> --data '<changed-fields>'`; removal is
  `remove session-exercise --program <program-id>
  --mesocycle <n> --id <session-id> --order <exercise-order> --data '{}'`.
- `create`, `add`, and `update` take exactly one JSON object through `--data` or
  `--data-file`. `remove` and `move` require `--data '{}'`; a session move requires
  exactly one of `--before <session-id>` or `--after <session-id>`.
- To replace a planned exercise, first add its approved replacement with a distinct, unused final
  `order`, then remove the old order. Adding a duplicate order returns `already_exists`. Before
  removing, list that session's exercises to obtain the old `order`; an absent order returns
  `not_found`, while duplicate legacy orders are ambiguous and return `conflict`. The CLI rejects
  removal that would leave a session with no exercises (`schema_invalid`) and leaves the YAML
  unchanged. To tune a planned exercise, use `update session-exercise` with a nonempty object of
  direct exercise fields only: `order`, `superset`, `exercise`, `sets`, `reps`, `rest_s`,
  `target_load`, or `notes`. `sets`, `reps`, and `target_load` are direct payload fields, not
  generic YAML-path or arbitrary nested-field edits. The parent session and metadata are immutable.
  A changed `order` must be unused after normalization (`already_exists` otherwise); it changes the
  order value but does not move the exercise's array position. There is no individual exercise-move
  operation; if session rotation order needs adjustment, use the supported `move session` operation.
- Use `validate --program <program-id>` for a target-program audit or
  `validate --scope workspace` for the full workspace audit.

The CLI validates and atomically replaces one supported YAML file. It does not decide
whether a workflow is allowed, choose coaching content, create reviews or summaries, or
archive a program; use the relevant workflow skill for those decisions.

---
name: create-mesocycle
description: "Build the session block of the next mesocycle of an in-progress program. Use when: the current mesocycle is reviewed and the user wants to move on to the next block. Requires a prior review of the current block."
---

## Prerequisite
Read `profile.yaml` at the workspace root. If it is missing, stop and run the `onboarding` skill first. Write every user-facing text (answers, generated documents, free-text YAML values) in `profile.language`. Express loads and measurements in `profile.units`. Only propose exercises whose equipment is listed in `profile.equipment` (or needs none). If `profile.coach_style` is `nassim`, follow `${CLAUDE_PLUGIN_ROOT}/persona/nassim.md` for tone.

You build the sessions of the next mesocycle, taking into account the adjustments
decided at the review.

## Gate (1st action — mandatory)
1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" .` from the workspace root.
   If `${CLAUDE_PLUGIN_ROOT}` is not set (e.g. in Codex), the plugin root is the directory two levels above this SKILL.md: use that path instead.
2. Read the JSON. If `skills["create-mesocycle"].allowed` is `false`:
   - **Stop.** Display the `reason` field (e.g. "Review mesocycle N first").
   - List the skills whose `allowed` is `true` in the current state.
   - Do not create or modify any file.
3. Otherwise, continue.

## Resource CLI
Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/workout-data.mjs"` from the workspace root.
If `${CLAUDE_PLUGIN_ROOT}` is not set, the plugin root is the directory two levels above
this SKILL.md; use that path instead. Use the program id from the state JSON as
`--program <program-id>`. Pass writes as one JSON object through `--data` or `--data-file`.
The CLI creates and validates the sessions document and validates the status update. Never
hand-edit `profile.yaml`, `status.yaml`, `goals.yaml`, `macrocycle.yaml`, or `sessions.yaml`.
Use `workout-data` for every supported write. If the operation is unsupported, stop and explain
that the CLI does not support it; do not fall back to a manual edit.

## Absolute constraints
- Same constraints as `create-program` (equipment, biomechanics, principles, templates).
- Read `mesocycle-{current}/review.md`: apply the adjustments described there.
- Read `macrocycle.yaml` to get the goal and parameters of the next block.

## Workflow
1. Determine the next block number `N+1` (= `current_mesocycle` from the JSON, +1).
2. Read the current block's review and the goal of block N+1 in `macrocycle.yaml`.
3. Select/adjust the exercises (`*-training` skills, slugs ∈ the catalog: plugin `catalog/exercises.yaml` + workspace `exercises.custom.yaml`).
4. Read `scheduling` in `macrocycle.yaml`; keep the mode. Rotation: no `days`, distinct session ids, file order = rotation order (default: same as previous block).
5. Read `${CLAUDE_PLUGIN_ROOT}/templates/sessions.yaml` to plan the complete body, then call
   `create sessions --program <program-id> --mesocycle <N+1>` first. Never overwrite an existing document.
   If the new block remains unstarted and an exercise needs adaptation, list its session exercises,
   then call `update session-exercise --program <program-id> --mesocycle <N+1> --id <session-id>
   --order <current-exercise-order> --data '<changed-direct-fields>'`. Use only direct exercise
   fields: `order`, `superset`, `exercise`, `sets`, `reps`, `rest_s`, `target_load`, and `notes`;
   never edit `sessions.yaml` or use a generic nested YAML path. Do not modify completed or reviewed
   sessions. To replace an exercise, add the approved replacement with a distinct unused final
   `order`, then call `remove session-exercise --program <program-id> --mesocycle <N+1>
   --id <session-id> --order <old-exercise-order> --data '{}'`. A duplicate order on add or update
   returns `already_exists`; an unknown selector returns `not_found`, duplicate legacy orders return
   `conflict`, and the final exercise cannot be removed. Updating `order` changes its value but does
   not move its array position.
6. Call `update program-status --program <program-id>` with `current_mesocycle: N+1` and
   `current_week: 1`. Rotation: include `next_session_id` as the first id in the new sessions
   document and keep `next_session: null`.

Confirm to the user the files created/modified.

## What you do NOT do
- Never overwrite an existing `sessions.yaml`. No review (skill `review-mesocycle`).

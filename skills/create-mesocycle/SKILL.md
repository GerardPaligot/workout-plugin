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

## Absolute constraints
- Same constraints as `create-program` (equipment, biomechanics, principles, templates).
- Read `mesocycle-{current}/review.md`: apply the adjustments described there.
- Read `macrocycle.yaml` to get the goal and parameters of the next block.

## Workflow
1. Determine the next block number `N+1` (= `current_mesocycle` from the JSON, +1).
2. Read the current block's review and the goal of block N+1 in `macrocycle.yaml`.
3. Select/adjust the exercises (`*-training` skills, slugs ∈ the catalog: plugin `catalog/exercises.yaml` + workspace `exercises.custom.yaml`).
4. Read `scheduling` in `macrocycle.yaml`; keep the mode. Rotation: no `days`, distinct session ids, file order = rotation order (default: same as previous block).
5. Create `mesocycle-{N+1}/sessions.yaml` from `${CLAUDE_PLUGIN_ROOT}/templates/sessions.yaml` (write it first).
6. Update `status.yaml`: `current_mesocycle: N+1`, `current_week: 1`. Rotation: `next_session_id` = first session of the new `sessions.yaml`.

## Final validation
Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs" .`. On error, fix before confirming.
Confirm to the user the files created/modified.

## What you do NOT do
- Never overwrite an existing `sessions.yaml`. No review (skill `review-mesocycle`).

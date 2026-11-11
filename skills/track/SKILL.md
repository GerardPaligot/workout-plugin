---
name: track
description: "Update the program's real-time status and log loads/measurements. Use when: the user did a session, changes week, pauses/resumes, or wants to record new loads or measurements."
---

## Prerequisite
Read `profile.yaml` at the workspace root. If it is missing, stop and run the `onboarding` skill first. Write every user-facing text (answers, generated documents, free-text YAML values) in `profile.language`. Express loads and measurements in `profile.units`. Only propose exercises whose equipment is listed in `profile.equipment` (or needs none). If `profile.coach_style` is `nassim`, follow `${CLAUDE_PLUGIN_ROOT}/persona/nassim.md` for tone.

You keep the active program's real-time state and the history of loads
and measurements up to date.

## Gate (1st action — mandatory)
1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" .` from the workspace root.
   If `${CLAUDE_PLUGIN_ROOT}` is not set (e.g. in Codex), the plugin root is the directory two levels above this SKILL.md: use that path instead.
2. Read the JSON. If `skills["track"].allowed` is `false`:
   - **Stop.** Display the `reason` field.
   - List the skills whose `allowed` is `true` in the current state.
   - Do not create or modify any file.
3. Otherwise, continue.

## Resource CLI
Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/workout-data.mjs"` from the workspace root.
If `${CLAUDE_PLUGIN_ROOT}` is not set, the plugin root is the directory two levels above
this SKILL.md; use that path instead. Use the active program id returned by the state JSON
as `--program <program-id>`. Pass each write as one JSON object with `--data` or `--data-file`.
The CLI validates each accepted write. Never hand-edit `profile.yaml`, `status.yaml`,
`goals.yaml`, `macrocycle.yaml`, or `sessions.yaml`. Use `workout-data` for every supported
write. If the operation is unsupported, stop and explain that the CLI does not support it; do
not fall back to a manual edit.

## Workflow
Ask the user what changed, then make the relevant resource call.

### status.yaml (active program)
- Update `current_week`, `last_session`, `next_session`, `next_session_id`, or `status`
  with `update program-status --program <program-id> --data '<changed fields>'`.
- Scheduling mode = `scheduling` in the program's `macrocycle.yaml` (absent = weekdays); never inferred from `status.yaml`.
- Rotation mode (`scheduling: rotation`): after a logged session set `last_session` to the logged session's date and
  `next_session_id` to the id following the one just done in the current `sessions.yaml` (wrap to the first
  after the last; a single session wraps to itself); keep `next_session: null`. Out of order: follow the session
  actually done. Absent/null `next_session_id` = next session is the first in `sessions.yaml` order. If the session just done is not in `sessions.yaml` (or the pointer's id is unknown), set the pointer to the first session. Keeps rotating across
  weeks and deloads (no weekly reset). Never edit `sessions.yaml`. Weekdays mode: unchanged.
- Pause: call `add status-pause --program <program-id>` with `{ start, end, reason }`,
  then `update program-status` with `{ "status": "paused" }`.
- Resume: call `update program-status` with `{ "status": "active" }`.
- End of program: if the last planned mesocycle (see `macrocycle.yaml`) is reviewed,
  set `status: completed` (makes `archive-program` available).
- Add a free note, when relevant, with `add status-note --program <program-id>`.

### goals.yaml (as you go)
- New load: use `add reference-load --program <program-id>` with `{ date, exercise, load, reps }`,
  `exercise` ∈ the catalog (plugin `catalog/exercises.yaml` + workspace `exercises.custom.yaml`). `load` is in `profile.units.load`.
- New measurement: use `add measurement --program <program-id>` with the allowed measurement keys
  see the header of `${CLAUDE_PLUGIN_ROOT}/templates/goals.yaml`). Lengths are in `profile.units.length`,
  `body_weight` in `profile.units.load`.

Confirm to the user the fields updated.

## What you do NOT do
- Do not modify `sessions.yaml` (history). Do not write a review (skill `review-mesocycle`).

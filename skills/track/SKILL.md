---
name: track
description: "Update the program's real-time status and log loads/measurements. Use when: the user did a session, changes week, pauses/resumes, or wants to record new loads or measurements."
---

## Prerequisite
Read `profile.yaml` at the workspace root. If it is missing, stop and run the `onboarding` skill first. Write every user-facing text (answers, generated documents, free-text YAML values) in `profile.language`. Express loads and measurements in `profile.units`. Only propose exercises whose equipment is listed in `profile.equipment` (or needs none).

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

## Workflow
Ask the user what changed, then update the relevant files.

### status.yaml (active program)
- `current_week`, `last_session`, `next_session`.
- Pause: add an entry to `pauses` (`{ start, end, reason }`) and set `status: paused`.
- Resume: set `status: active`.
- End of program: if the last planned mesocycle (see `macrocycle.yaml`) is reviewed,
  set `status: completed` (makes `archive-program` available).
- Add a free note in `notes` if relevant.

### goals.yaml (as you go)
- New load: add an entry to `reference_loads` (`{ date, exercise, load, reps }`),
  `exercise` ∈ the catalog (plugin `catalog/exercises.yaml` + workspace `exercises.custom.yaml`). `load` is in `profile.units.load`.
- New measurement: add an entry to `measurements` (allowed measurement keys,
  see the header of `${CLAUDE_PLUGIN_ROOT}/templates/goals.yaml`). Lengths are in `profile.units.length`,
  `body_weight` in `profile.units.load`.

## Final validation
Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs" .`. On error, fix before confirming.
Confirm to the user the fields updated.

## What you do NOT do
- Do not modify `sessions.yaml` (history). Do not write a review (skill `review-mesocycle`).

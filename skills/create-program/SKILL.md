---
name: create-program
description: "Create a new strength-training program from scratch (macrocycle, goals, 1st mesocycle). Use when: the user wants to start a new training cycle or plan a macrocycle. Only usable when no program is active."
---

## Prerequisite
Read `profile.yaml` at the workspace root. If it is missing, stop and run the `onboarding` skill first. Write every user-facing text (answers, generated documents, free-text YAML values) in `profile.language`. Express loads and measurements in `profile.units`. Only propose exercises whose equipment is listed in `profile.equipment` (or needs none). If `profile.coach_style` is `nassim`, follow `${CLAUDE_PLUGIN_ROOT}/persona/nassim.md` for tone.

You build a personalized hypertrophy program relying exclusively on the workspace's
knowledge skills, and save it in `programs/`.

## Gate (1st action — mandatory)
1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" .` from the workspace root.
   If `${CLAUDE_PLUGIN_ROOT}` is not set (e.g. in Codex), the plugin root is the directory two levels above this SKILL.md: use that path instead.
2. Read the JSON. If `skills["create-program"].allowed` is `false`:
   - **Stop.** Display the `reason` field.
   - List the skills whose `allowed` is `true` in the current state.
   - Do not create or modify any file.
3. Otherwise, continue.

## Resource CLI
Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/workout-data.mjs"` from the workspace root.
If `${CLAUDE_PLUGIN_ROOT}` is not set, the plugin root is the directory two levels above
this SKILL.md; use that path instead. Choose the program id from the agreed directory name
and pass it as `--program <program-id>`. Use one JSON object through `--data` or `--data-file`
for each write. The CLI creates template-backed YAML and validates each accepted write. Never
hand-edit `profile.yaml`, `status.yaml`, `goals.yaml`, `macrocycle.yaml`, or `sessions.yaml`.
Use `workout-data` for every supported write. If the operation is unsupported, stop and explain
that the CLI does not support it; do not fall back to a manual edit.

## Absolute constraints
- NEVER suggest an exercise whose equipment is not in `profile.equipment` (`profile.yaml` + the catalog). An exercise's `equipment` may be a list: ALL listed ids must be in `profile.equipment`. A custom entry in `exercises.custom.yaml` overrides the catalog one (validator warning).
- Follow the macrocycle → mesocycles → microcycles methodology (the `training-programming` skill).
- Apply the `training-principles` skill (progressive overload, exercise economy).
- Validate every exercise with the `lifting-biomechanics` skill.
- Read the `${CLAUDE_PLUGIN_ROOT}/templates/*.yaml` template to plan each document body; the CLI applies the matching template when it creates the document.
- Follow the `program-structure` skill for the directory tree and names.

## Workflow
### Phase 1 — Information gathering
Ask these questions before any proposal: measurable goals, priorities,
macrocycle duration, scheduling mode (weekdays: fixed training days; rotation: no fixed days, ask only sessions per week; choice is final for the program), frequency/days, load history, weak points/pain.

### Phase 2 — Macrocycle architecture
Build the breakdown into mesocycles (one goal per mesocycle), the microcycle
structure (mechanical → metabolic → overreaching), the deloads.
Create the agreed `programs/YYYY-MM_short-name/` through, in order, `create program-status`,
`create goals`, and `create macrocycle`, each with `--program <program-id>`. Supply the real
dates in the resource payloads. `create program-status` receives the active status body;
`create goals` receives its goals/measurements body; `create macrocycle` receives its full
editable macrocycle body.
For rotation, omit `next_session_id` from the `create program-status` payload: the first
sessions document does not exist yet.
Rotation mode only: include `scheduling: rotation` and `weekly_split` entries
`{ session, muscle_groups }` without `day` in the `create macrocycle` payload. Weekdays mode:
omit `scheduling` from that payload.

### Phase 3 — Exercise selection
2-3 exercises max per muscle group (`*-training` skills), feasible with
the equipment, covering stretch + contraction. Justify each choice. The slugs
used must exist in the catalog (plugin `catalog/exercises.yaml` or the workspace's `exercises.custom.yaml`).
If an exercise or piece of equipment is missing, have the user add it to `exercises.custom.yaml` in the workspace; never edit the plugin catalog.

### Phase 4 — Building the sessions
Create the first block with `create sessions --program <program-id> --mesocycle 1`, using a
complete sessions body (order, sets × reps per microcycle, rest, target loads or RPE, cardio).
Do NOT create the following mesocycles (skill `create-mesocycle`).
If the first block is still unstarted and a planned exercise must change after creation, list
the session exercises, add the approved replacement with a distinct unused final `order`, then
use `remove session-exercise --program <program-id> --mesocycle 1 --id <session-id>
--order <old-exercise-order> --data '{}'`. Never hand-edit the sessions file. Adding a duplicate
order returns `already_exists`; a missing removal order returns `not_found`, duplicate legacy
orders return `conflict`, and the CLI will not remove a session's final exercise. Exercise order
cannot be changed or moved in v1, so choose the replacement's final unused order when adding it.
Rotation mode: no `days` on sessions, file order = rotation order, distinct ids; set
`next_session_id` to the first session id and `next_session: null` only after `create sessions`
succeeds, with `update program-status --program <program-id>`.

Confirm to the user the files created and their path.

## What you do NOT do
- No supplements or detailed nutrition plan.
- No exercise not validated by the skills. No overwriting without confirmation.

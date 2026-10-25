---
name: create-program
description: "Create a new strength-training program from scratch (macrocycle, goals, 1st mesocycle). Use when: the user wants to start a new training cycle or plan a macrocycle. Only usable when no program is active."
---

## Prerequisite
Read `profile.yaml` at the workspace root. If it is missing, stop and run the `onboarding` skill first. Write every user-facing text (answers, generated documents, free-text YAML values) in `profile.language`. Express loads and measurements in `profile.units`. Only propose exercises whose equipment is listed in `profile.equipment` (or needs none).

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

## Absolute constraints
- NEVER suggest an exercise whose equipment is not in `profile.equipment` (`profile.yaml` + the catalog).
- Follow the macrocycle → mesocycles → microcycles methodology (the `training-programming` skill).
- Apply the `training-principles` skill (progressive overload, exercise economy).
- Validate every exercise with the `lifting-biomechanics` skill.
- Read the `${CLAUDE_PLUGIN_ROOT}/templates/*.yaml` template before creating each file, then replace the values.
- Follow the `program-structure` skill for the directory tree and names.

## Workflow
### Phase 1 — Information gathering
Ask these questions before any proposal: measurable goals, priorities,
macrocycle duration, frequency/days, load history, weak points/pain.

### Phase 2 — Macrocycle architecture
Build the breakdown into mesocycles (one goal per mesocycle), the microcycle
structure (mechanical → metabolic → overreaching), the deloads.
Create `programs/YYYY-MM_short-name/` with `status.yaml` (status: active), `goals.yaml`,
`macrocycle.yaml`. Replace all dates with the real dates.

### Phase 3 — Exercise selection
2-3 exercises max per muscle group (`*-training` skills), feasible with
the equipment, covering stretch + contraction. Justify each choice. The slugs
used must exist in the catalog (plugin `catalog/exercises.yaml` or the workspace's `exercises.custom.yaml`).
If an exercise or piece of equipment is missing, have the user add it to `exercises.custom.yaml` in the workspace; never edit the plugin catalog.

### Phase 4 — Building the sessions
Create `mesocycle-1/sessions.yaml` (order, sets × reps per microcycle, rest, target
loads or RPE, cardio). Do NOT create the following mesocycles (skill `create-mesocycle`).

## Final validation
Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs" .`. On error, fix before confirming.
Confirm to the user the files created and their path.

## What you do NOT do
- No supplements or detailed nutrition plan.
- No exercise not validated by the skills. No overwriting without confirmation.

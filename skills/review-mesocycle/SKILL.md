---
name: review-mesocycle
description: "Review a mesocycle and document the adjustments for the next one. Use when: the user wants to analyze their progress over a block, what worked and what didn't, before moving on."
---

## Prerequisite
Read `profile.yaml` at the workspace root. If it is missing, stop and run the `onboarding` skill first. Write every user-facing text (answers, generated documents, free-text YAML values) in `profile.language`. Express loads and measurements in `profile.units`. Only propose exercises whose equipment is listed in `profile.equipment` (or needs none). If `profile.coach_style` is `nassim`, follow `${CLAUDE_PLUGIN_ROOT}/persona/nassim.md` for tone.

You analyze a completed mesocycle and write a review usable by the
`create-mesocycle` skill.

## Gate (1st action — mandatory)
1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" .` from the workspace root.
   If `${CLAUDE_PLUGIN_ROOT}` is not set (e.g. in Codex), the plugin root is the directory two levels above this SKILL.md: use that path instead.
2. Read the JSON. If `skills["review-mesocycle"].allowed` is `false`:
   - **Stop.** Display the `reason` field.
   - List the skills whose `allowed` is `true` in the current state.
   - Do not create or modify any file.
3. Otherwise, continue.

## Resource CLI
Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/workout-data.mjs"` from the workspace root.
If `${CLAUDE_PLUGIN_ROOT}` is not set, the plugin root is the directory two levels above
this SKILL.md; use that path instead. Use the program id from the state JSON as
`--program <program-id>`. Pass each resource write as one JSON object with `--data` or
`--data-file`. The CLI validates each accepted YAML write; continue to write `review.md`
directly from its Markdown template. Never hand-edit `profile.yaml`, `status.yaml`,
`goals.yaml`, `macrocycle.yaml`, or `sessions.yaml`. Use `workout-data` for every supported
write. If the operation is unsupported, stop and explain that the CLI does not support it; do
not fall back to a manual edit.

## Absolute constraints
- Read `macrocycle.yaml`, `goals.yaml` and `mesocycle-{current}/sessions.yaml` before asking questions.
- Apply the `training-principles` skill to assess progression.
- If an exercise replacement is considered: check `profile.equipment` + the `*-training` skills.
- Read `${CLAUDE_PLUGIN_ROOT}/templates/review.md` before creating the file.

## Workflow
1. Gather: current measurements, current loads, feel per exercise,
   pain, adherence to the program.
2. Analyze: measurement progression (start vs end), progressive overload
   (stagnation), exercise relevance, adherence to the microcycles, volume.
3. Create `mesocycle-{current}/review.md` from `${CLAUDE_PLUGIN_ROOT}/templates/review.md`:
   measurements (delta), loads (delta), what worked, what didn't work,
   concrete adjustments for the next block.
4. Add the measurements row with `add measurement --program <program-id>`.
5. Add the revision with `add macrocycle-revision --program <program-id>` using
   `{ ref: "mesocycle-N/review.md", date, summary }`.

Confirm to the user the files created/modified.

## What you do NOT do
- Do not modify the reviewed block's `sessions.yaml` (history). Do not create the next
  block (skill `create-mesocycle`).

---
name: archive-program
description: "Archive a completed program: write the final summary, then move it to programs/archives/. Use when: the macrocycle is finished (status completed) and the user wants to close it out cleanly."
---

## Prerequisite
Read `profile.yaml` at the workspace root. If it is missing, stop and run the `onboarding` skill first. Write every user-facing text (answers, generated documents, free-text YAML values) in `profile.language`. Express loads and measurements in `profile.units`. Only propose exercises whose equipment is listed in `profile.equipment` (or needs none). If `profile.coach_style` is `nassim`, follow `${CLAUDE_PLUGIN_ROOT}/persona/nassim.md` for tone.

You close out a completed program: you write the summary and move the directory
into the archives, after confirmation.

## Gate (1st action — mandatory)
1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" .` from the workspace root.
   If `${CLAUDE_PLUGIN_ROOT}` is not set (e.g. in Codex), the plugin root is the directory two levels above this SKILL.md: use that path instead.
2. Read the JSON. If `skills["archive-program"].allowed` is `false`:
   - **Stop.** Display the `reason` field (e.g. "Program not completed").
   - List the skills whose `allowed` is `true` in the current state.
   - Do not create or modify any file.
3. Otherwise, continue.

## Resource CLI
Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/workout-data.mjs"` from the workspace root.
If `${CLAUDE_PLUGIN_ROOT}` is not set, the plugin root is the directory two levels above
this SKILL.md; use that path instead. Use the program id from the state JSON as
`--program <program-id>`. Pass the status write as one JSON object with `--data`. Never
hand-edit `profile.yaml`, `status.yaml`, `goals.yaml`, `macrocycle.yaml`, or `sessions.yaml`.
Use `workout-data` for every supported write. If the operation is unsupported, stop and explain
that the CLI does not support it; do not fall back to a manual edit.

## Absolute constraints
- NEVER delete a file. Only move after explicit confirmation.
- Read `${CLAUDE_PLUGIN_ROOT}/templates/summary.md` before creating the summary.

## Workflow
1. Check completeness: `goals.yaml` (start + intermediate measurements),
   `macrocycle.yaml`, `mesocycle-N/sessions.yaml` for every block completed,
   `mesocycle-N/review.md` (flag any missing reviews).
   If anything is missing, offer to run `review-mesocycle` or to archive as is.
2. Create `summary.md` at the root of the program directory from `${CLAUDE_PLUGIN_ROOT}/templates/summary.md`
   (measurements start→end vs goals, load progression, lessons, exercises
   to keep/replace).
3. Call `update program-status --program <program-id>` with `{ "status": "archived", "end_date": "YYYY-MM-DD" }`.
4. **Ask for confirmation**, then move the directory to `programs/archives/`
   with `mv` (Bash). Relative review refs stay valid (the whole directory is moved).

## Final validation
Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs" .` (after the move). Confirm the archive location
and the path of the summary.

## What you do NOT do
- Do not create a new program (skill `create-program`, available once archived).
- Do not modify existing sessions/reviews.

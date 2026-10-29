---
name: upgrade-workspace
description: "Bring a workspace created with plugin 0.1.0 up to 0.2.0: validate everything, then clean up custom exercises/equipment now covered by the catalog. Use when: the user updated the plugin, asks to upgrade or migrate their workspace, or sees new validator warnings about custom entries."
---

## Prerequisite
None: this skill must work on older or unusual workspaces, so it has no `profile.yaml` prerequisite and no `state.mjs` gate. If neither `profile.yaml` nor `programs/` exists at the workspace root, say there is nothing to upgrade, point to the `onboarding` skill, and stop. Write every user-facing text in `profile.language` when `profile.yaml` exists (otherwise in the user's language). If `profile.yaml` exists and `profile.coach_style` is `nassim`, follow `${CLAUDE_PLUGIN_ROOT}/persona/nassim.md` for tone.

You audit a 0.1.0 workspace against plugin 0.2.0 and offer optional cleanups.
0.1.0 files stay valid under 0.2.0 unchanged and the data carries no version marker
(`meta.schema_version` is still 1): there is nothing to convert, only entries to review.

## First action — validation
Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs" .` from the workspace root (it also walks `programs/archives/`).
If `${CLAUDE_PLUGIN_ROOT}` is not set (e.g. in Codex), the plugin root is the directory two levels above this SKILL.md: use that path instead.
Report errors and `!` warnings, grouped as current program(s) vs archived programs.

## Absolute constraints
- NEVER delete a file. Edit only what the user confirmed, per entry, and preserve all other content and comments.
- NEVER touch archived programs: report only.
- NEVER convert `scheduling` from weekdays to rotation. It is a per-program choice made at `create-program` time, not part of an upgrade.

## Workflow
1. Read `exercises.custom.yaml` (if absent, skip to the final validation) and compare it with
   `${CLAUDE_PLUGIN_ROOT}/catalog/exercises.yaml` (the catalog grew: e.g. `sled_push`, `sled`, many machines).
2. List every custom exercise slug or equipment id now equal to a catalog one. Explain the 0.2.0 behaviour:
   - same exercise slug: warning, the custom entry overrides the catalog (it was an error in 0.1.0);
   - same equipment id: warning, the custom entry is ignored in favour of the catalog one.
   Show how the custom and catalog entries differ (name, equipment, muscle groups).
3. For each entry ask: **keep** (custom overrides), **remove** (use the catalog entry), or **rename** the slug.
   For a rename, update the references in the sessions of the current live program only (never archives).
   Apply one entry at a time, after its confirmation.
4. Report duplicate slugs/ids inside `exercises.custom.yaml` (a new error in 0.2.0). Ask which one to keep and fix after confirmation.
5. Archived programs: if they show findings, list them, explain they are left untouched, and move on.
6. Mention that rotation scheduling is available: pick it at `create-program` time for a future program.

## Final validation
Re-run `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs" .` and report the result,
plus a summary of the changes made (or "no change needed").

## What you do NOT do
- Do not delete files, edit archived programs, or bump any version marker.
- Do not convert weekdays programs to rotation.
- Do not create programs or sessions (skills `create-program`, `create-mesocycle`).

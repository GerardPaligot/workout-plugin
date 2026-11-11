---
name: onboarding
description: "Set up or update the user's profile: display language, coach style, units (load, length) and available gym equipment, recorded in profile.yaml. Use when: profile.yaml is missing (the state script reports needs_onboarding), or the user wants to change their language, coach style, units or equipment. Always available; first skill to run."
---

You record who the user is and what they can train with, in `profile.yaml` at the
workspace root. Every other skill depends on it. If `profile.coach_style` is `nassim`, follow `${CLAUDE_PLUGIN_ROOT}/persona/nassim.md` for tone.

## Mode
1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" .` from the workspace root.
   If `${CLAUDE_PLUGIN_ROOT}` is not set (e.g. in Codex), the plugin root is the directory two levels above this SKILL.md: use that path instead.
2. `needs_onboarding` (no `profile.yaml`) → **full interview** below.
3. Profile exists and the user asked for a change → **update mode**: ask only about the
   requested section (language, coach style, units or equipment), and change only that
   resource through the CLI below.

## Resource CLI
Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/workout-data.mjs"` from the workspace root.
If `${CLAUDE_PLUGIN_ROOT}` is not set, the plugin root is the directory two levels above
this SKILL.md; use that path instead. Pass writes as one JSON object with `--data` or
`--data-file`. The CLI validates each accepted profile write. Never hand-edit `profile.yaml`,
`status.yaml`, `goals.yaml`, `macrocycle.yaml`, or `sessions.yaml`. Use `workout-data` for
every supported write. If the operation is unsupported, stop and explain that the CLI does not
support it; do not fall back to a manual edit.

## Interview (in this order)
1. **Language**: ask first, in English, which language everything shown to them should
   use (code such as `en`, `fr`, `pt-BR`). Conduct the rest of the interview in that language.
2. **Units**: load `kg` or `lb`; length `cm` or `in`.
3. **Coach style** (optional): `neutral` (default) or `nassim` (direct, myth-vs-better-option, mechanics-based tone inspired by Nassim Sahili's teaching; the coach is not him). Omit the key for `neutral`.
4. **Equipment**: equipment ids come from the `equipment` list of the plugin catalog
   `catalog/exercises.yaml`, grouped there by comment (machines and cable, free weights,
   accessories, cardio). Walk the groups one by one, listing the ids of each group from the
   catalog, and ask
   which the gym has. Accept free entries:
   - map each to the closest known id;
   - if nothing fits, keep it out of `equipment` and tell the user it is missing from
     the catalog. The user can add it to `exercises.custom.yaml` in the workspace (same format as
     the catalog); never edit the plugin catalog. Then use the new id. A custom id equal to a
     catalog id is ignored with a warning.
   Also ask which common gear is absent (for example free weights) to confirm the list.

## Record the profile
Use the interview results to build these CLI payloads:
- `language`, `coach_style` (only when `nassim`; absent = `neutral`), `units.load`, `units.length`.
  The CLI derives `meta.schema_version: 1`; never include `meta` in a payload.
- `equipment[]`: `{ id, name, category, muscles?, notes }`. `id` must exist in
  the catalog (plugin or `exercises.custom.yaml`); `category` ∈ `machine | cable | free_weight | accessory | cardio`.
- Keys are always English. Free-text values (`name`, `notes`) use the user's language.
- No unit suffix on keys; units live only in `units`.

For a first profile, call `create profile` once with `language`, `units`, and the complete
`equipment` array; include `coach_style` only for `nassim`:

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/workout-data.mjs" create profile --data-file profile.json
```

For existing profile fields, call `update profile` with only the changing `language`,
`coach_style`, or `units` fields. For equipment, use `add profile-equipment`,
`update profile-equipment --id <equipment-id>`, or `remove profile-equipment --id <equipment-id>`.
Do not put equipment in an `update profile` payload.

Summarize to the user the language, coach style, units and equipment recorded.

## What other skills do with it
Other skills read `profile.language` (language of answers and written documents),
`profile.coach_style` (tone of replies, see `${CLAUDE_PLUGIN_ROOT}/persona/`), `profile.units` (loads and measurements) and `profile.equipment` (only exercises
feasible with the listed equipment, or needing none). **No program can be created
before onboarding is complete**: skills redirect here when `profile.yaml` is missing.

## What you do NOT do
- Do not create or modify programs, sessions or goals (see `create-program`, `track`).
- Do not invent equipment ids absent from the catalog or `exercises.custom.yaml`.

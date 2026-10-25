---
name: program-structure
description: "File structure for saving a strength-training program: goals, macrocycle, sessions per mesocycle, reviews. Use when: the user wants to create a new program, organize their training files, or save a generated program."
---

> **Prerequisite:** if `profile.yaml` is missing at the workspace root, stop and run the `onboarding` skill first. Answer in `profile.language`, express loads and measurements in `profile.units`, and only propose exercises whose equipment is listed in `profile.equipment` (or needs none).

# Project structure for a strength-training program

## Directory tree

Each program (macrocycle) is stored in a directory under `programs/`, named by start date and short name.

```
<workspace>/
├── profile.yaml                    ← user profile (language, units, equipment) — written by `onboarding`
├── exercises.custom.yaml           ← optional: the user's own exercises/equipment (same format as the plugin catalog)
└── programs/
    ├── archives/                   ← completed programs (status: archived)
    └── YYYY-MM_program-name/
        ├── status.yaml             ← REAL-TIME STATUS (read first)
        ├── goals.yaml
        ├── macrocycle.yaml
        ├── mesocycle-1/
        │   ├── sessions.yaml
        │   └── review.md
        ├── mesocycle-2/
        └── mesocycle-3/
```

The templates (`profile.yaml`, `status.yaml`, `goals.yaml`, `macrocycle.yaml`, `sessions.yaml`, `review.md`, `summary.md`), the JSON schemas and the exercise catalog (`catalog/exercises.yaml`) live in the plugin, not in the workspace. Never edit them; the user's own additions go in the workspace `exercises.custom.yaml`.

### Naming conventions

- **Program directory**: `YYYY-MM_short-name` — the start month + a descriptive kebab-case name (e.g. `2026-05_upper-hypertrophy`).
- **Mesocycle directories**: `mesocycle-N` with N = 1, 2, 3…
- Structure in **YAML**, reviews/summaries in **Markdown**.

---

## `status.yaml` file — Real-time status

Each program contains a `status.yaml` at the root of its directory. It is the
**first file to read**. `status` field: `active | paused | completed | archived`.

The plugin's `scripts/state.mjs` script reads this file (+ the directory tree) to compute the
workflow state and decide which skills are usable:

| State | `status` | Usable skills |
|-------|----------|---------------|
| `needs_onboarding` | `profile.yaml` missing (checked first) | `onboarding`, `coach` |
| `inconsistent` | more than one non-archived program, or a program with `status: archived` still under `programs/` (checked second) | `onboarding`, `coach` (every write skill refused until `programs/` is fixed) |
| `no_program` | no live program (`active`/`paused`/`completed`) outside archives | `create-program`, `coach`, `onboarding` |
| `in_progress` | `active` | `track`, `review-mesocycle`**, `create-mesocycle`*, `coach`, `onboarding` |
| `paused` | `paused` | `track`, `review-mesocycle`**, `create-mesocycle`*, `coach`, `onboarding` |
| `completed` | `completed` | `archive-program`, `review-mesocycle`**, `coach`, `onboarding` |

\* conditional: current block reviewed (`review.md` exists), current block is not the last planned mesocycle, next `sessions.yaml` not yet created.
\*\* conditional: current `mesocycle-N/sessions.yaml` exists (N = `current_mesocycle`), in every state where allowed (including `completed`, for the final review before archiving).

**Rule**: every workflow skill runs `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" .` as its first action
and refuses if it is not allowed.

---

## Templates

The template files are in the `templates/` directory of the plugin root (not in the workspace).
If `${CLAUDE_PLUGIN_ROOT}` is not set (e.g. in Codex), the plugin root is the directory two levels above this SKILL.md: use that path instead. They serve as a **reference** for creating the program files.

| Template | Usage | Created by |
|----------|-------|------------|
| `${CLAUDE_PLUGIN_ROOT}/templates/goals.yaml` | Goals, measurements, starting loads | skill `create-program` |
| `${CLAUDE_PLUGIN_ROOT}/templates/macrocycle.yaml` | Program overview and calendar | skill `create-program` |
| `${CLAUDE_PLUGIN_ROOT}/templates/sessions.yaml` | Session details per microcycle | skill `create-program` (1st block) / `create-mesocycle` (following blocks) |
| `${CLAUDE_PLUGIN_ROOT}/templates/review.md` | Review of a mesocycle | skill `review-mesocycle` |
| `${CLAUDE_PLUGIN_ROOT}/templates/summary.md` | End-of-program summary (archiving) | skill `archive-program` |

**Rule**: skills must read the matching template (`${CLAUDE_PLUGIN_ROOT}/templates/`) before creating a file, then replace the `{...}` and `YYYY-MM-DD` placeholders with real values.

---

## Files and their content

Loads and body weight are expressed in `profile.units.load`; circumferences in `profile.units.length`. YAML keys carry no unit suffix.

### `goals.yaml` — Goals and measurements

This file is created when the program starts and updated with the real measurements.

```yaml
meta:
  schema_version: 1
goals:
  - id: example-goal
    priority: 1
    description: "Describe the measurable goal"
    tracked_measures: [arm_right_relaxed]
    deadline: YYYY-MM-DD
measurements:
  - date: YYYY-MM-DD
    context: "baseline"
    values: { arm_right_relaxed: 32, body_weight: 72 }
    notes: null
reference_loads:
  - { date: YYYY-MM-DD, exercise: chest_press_machine, load: 50, reps: 12 }
```

### `macrocycle.yaml` — Program overview

```yaml
meta:
  schema_version: 1
  version: 1
  last_modified: YYYY-MM-DD
  revisions: []
name: "Macrocycle name"
start_date: YYYY-MM-DD
end_date: YYYY-MM-DD
frequency: "4 sessions/week"
split: upper_lower                      # upper_lower | full_body | ppl | other
mesocycles:
  - number: 1
    name: "Mechanical phase"
    weeks: { start: 1, end: 3 }
    dates: { start: YYYY-MM-DD, end: YYYY-MM-DD }
    goal: "Heavy loads, low sets, long rests"
    parameters:
      sets: "3-4"
      reps: "5-8"
      rest_s: "120-180"
      intensity_pct_1rm: "80-90"
      technique: "Controlled execution"
weekly_split:
  - { day: monday, session: "Upper A", muscle_groups: [chest, back] }
  - { day: tuesday, session: "Lower A", muscle_groups: [quadriceps, glutes] }
cardio:
  - { type: bike, duration_min: "20", frequency: "post-session", notes: null }
```

### `mesocycle-N/sessions.yaml` — Session details

One file per mesocycle containing **all the sessions** with their variants per microcycle.

```yaml
meta:
  schema_version: 1
  version: 1
  mesocycle: 1
  period: { start: YYYY-MM-DD, end: YYYY-MM-DD }
  source: null
  last_modified: YYYY-MM-DD
  revisions: []
sessions:
  - id: A
    name: "Upper body"
    days: [monday, thursday]
    format: standard
    exercises:
      - { order: "A1", superset: "chest-back", exercise: chest_press_machine, sets: 4, reps: "8", rest_s: null, target_load: 55, notes: "Tempo 2-1-1-0" }
      - { order: "A2", superset: "chest-back", exercise: seated_row, sets: 4, reps: "8", rest_s: 90, target_load: 60, notes: null }
  - id: C
    name: "Circuit (optional)"
    days: [saturday]
    format: circuit
    circuit: { rounds: 3, rest_between_exercises_s: 0, rest_between_rounds_s: 120 }
    exercises:
      - { order: 1, exercise: cable_squat, sets: 3, reps: "15", target_load: null, notes: "Light" }
cardio:
  - { type: bike, duration_min: "20", intensity: "intervals", notes: null }
```

### `mesocycle-N/review.md` — Review in progress or at end of cycle

Created during or after the mesocycle to document the adjustments.

```markdown
# Review — Mesocycle {N}

- **Date**: YYYY-MM-DD
- **Period covered**: {weeks covered}

## Measurements

| Measure | Mesocycle start | Mesocycle end | Delta |
|---------|-----------------|---------------|-------|
| Arm circumference (R) | — {length unit} | — {length unit} | — |
| Chest circumference | — {length unit} | — {length unit} | — |
| Waist circumference | — {length unit} | — {length unit} | — |
| Body weight | — {load unit} | — {load unit} | — |

## Loads: observed progression

| Exercise | Start load | End load | Delta |
|----------|------------|----------|-------|
| {Exercise} | — {load unit} | — {load unit} | — |

## What worked

- {Positive point}

## What didn't work

- {Identified problem + probable cause}

## Adjustments for the next mesocycle

- {Planned change + rationale}
```

---

## Rules for skills

1. **Read the template** from `${CLAUDE_PLUGIN_ROOT}/templates/` before creating each file.
2. **Create the program directory** as of phase 2 (macrocycle architecture) with `goals.yaml` and `macrocycle.yaml`.
3. **Create the mesocycle directories** and `sessions.yaml` in phase 4 (building the sessions). Start with mesocycle 1 — the following ones are created as you go.
4. **Never overwrite** an existing file without the user's confirmation.
5. **`review.md` files** are not created in advance — they are created when the user asks for a review.
6. **Dates** in the templates must be replaced by the real dates computed from the start date supplied by the user.
7. **Loads** stay at `—` if the user does not provide them; they will be filled in over time.

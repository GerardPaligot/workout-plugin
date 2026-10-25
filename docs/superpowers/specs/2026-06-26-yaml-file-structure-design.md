# Design — Structuring program files as validatable YAML

- **Date**: 2026-06-26
- **Status**: Approved (pending spec review)
- **Workspace**: the repository root

## Context & goal

The workspace holds strength-training programs described in free-form Markdown
(`status.md`, `goals.md`, `macrocycle.md`, `mesocycle-N/sessions.md`,
`mesocycle-N/review.md`). Free-form Markdown can't be parsed reliably,
validated, or consumed by third-party tools.

Goal: convert the **structure** files (status, goals, macrocycle, sessions) to
YAML validated by JSON Schema, while keeping the **reviews** (narrative of
changes) in Markdown.

### Constraints (stated by the user)

1. Status → structured file, easy to update from a CLI.
2. Goals → evolvable structured format, tracks body measurements, usable for a
   future display.
3. Macrocycle → structured, evolvable (reviews impact it), usable by third-party
   tools.
4. Sessions → structured, evolvable, usable by third-party tools.
5. Reviews → stay in Markdown (they describe the desired change and its date).

### Decisions

| Decision | Choice |
|----------|--------|
| Data format | **YAML** (readable, hand-editable, comments) |
| Schema format | **JSON Schema** (natively validates YAML and JSON) |
| Scope of this iteration | Formats + schemas + **validation script** (no full CLI) |
| Migration | Migrate **everything**, including the archived `2026-01` program |
| Script language | **Node.js** (`ajv` + `js-yaml`) |

## File architecture

```
workspace/
├── schemas/                      # JSON Schema — source of truth for the structure
│   ├── status.schema.json
│   ├── goals.schema.json
│   ├── macrocycle.schema.json
│   ├── sessions.schema.json
│   └── exercises.schema.json
├── src/
│   ├── package.json              # deps: ajv, js-yaml
│   └── validate.mjs              # node scripts/validate.mjs
├── catalog/exercises.yaml                # shared catalog (equipment + exercise slugs)
├── templates/                    # moved from .md → .yaml (review.md stays Markdown)
│   ├── status.yaml
│   ├── goals.yaml
│   ├── macrocycle.yaml
│   ├── sessions.yaml
│   └── review.md
└── programs/
    └── 2026-01_upper-lower-recomposition/
        ├── status.yaml
        ├── goals.yaml
        ├── macrocycle.yaml
        ├── mesocycle-1/ { sessions.yaml, review.md }
        ├── mesocycle-2/ { sessions.yaml, review.md }
        └── mesocycle-3/ { sessions.yaml, review.md }
```

### Cross-cutting conventions

- Dates in ISO format `YYYY-MM-DD`.
- No unit suffix in key names (`target_load`, `body_weight`, `waist`): units come
  from `profile.units` (`kg|lb`, `cm|in`). Time suffixes stay (`rest_s`,
  `duration_min`).
- Identifiers and slugs in `snake_case` (or `kebab-case` for goal/session `id`s —
  see schemas).
- Every file carries a `meta` block with at least `schema_version`.
- Explicit `null` for non-applicable values (rather than omitting them).

## Data schemas

### `status.yaml`

Flat fields to make a future CLI update easy.

```yaml
meta: { schema_version: 1 }
program: 2026-01_upper-lower-recomposition
status: archived              # enum: active | paused | archived | completed
current_mesocycle: 3
current_week: 12
start_date: 2026-01-19
end_date: 2026-04-10          # null if not completed
last_session: 2026-04-10
next_session: null
pauses:
  - { start: 2026-04-11, end: 2026-04-13, reason: "3 days without gym access" }
notes:
  - "M3 program executed — see mesocycle-3/sessions.yaml"
```

Schema: `status` is a closed enum. `end_date`, `next_session`, `current_week` may
be `null`. `pauses` is a list (may be empty).

### `goals.yaml`

Prioritized goals + body measurements as a time series + reference loads.

```yaml
meta: { schema_version: 1 }
goals:
  - id: upper-body-muscle-gain
    priority: 1
    description: "Upper-body muscle gain (chest, arms, shoulders)"
    tracked_measures: [arm_right_relaxed, chest]
    deadline: 2026-05-31
  - id: abdominal-fat-loss
    priority: 2
    description: "Abdominal fat loss"
    tracked_measures: [waist]
    deadline: 2026-05-31
measurements:
  - date: 2026-01-19
    context: "baseline"
    values: { arm_right_relaxed: 32, arm_left_relaxed: 32, waist: 75, body_weight: 72 }
    notes: null
  - date: 2026-03-15
    context: "end of M1"
    values: { arm_right_relaxed: 34.5, chest: 102.3, waist: 72, body_weight: 73.6 }
    notes: "waist 72 probably wrong"
reference_loads:
  - { date: 2026-01-19, exercise: chest_press_machine, load: 55, reps: 12 }
```

The schema defines a **closed vocabulary of measurement keys** (enum). Lengths are
in `profile.units.length`, `body_weight` is in `profile.units.load`:

| Key | Unit |
|-----|------|
| `arm_right_relaxed`, `arm_left_relaxed` | length |
| `arm_right_flexed`, `arm_left_flexed` | length |
| `chest`, `waist`, `hips`, `neck`, `shoulders` | length |
| `thigh_right`, `thigh_left` | length |
| `calf_right`, `calf_left` | length |
| `body_weight` | load |

`values` is a map whose **keys must belong to this vocabulary**
(`additionalProperties: false` with enumerated keys, or cross-validation by the
script). Tracking a key over time for a future display becomes trivial: iterate
`measurements[].values[key]`.

### `macrocycle.yaml`

```yaml
meta:
  schema_version: 1
  version: 1
  last_modified: 2026-01-19
  revisions: []
name: "Upper/Lower Recomposition"
start_date: 2026-01-19
end_date: 2026-05-10
frequency: "4-5 sessions/week"
split: upper_lower            # enum: upper_lower | full_body | ppl | other
mesocycles:
  - number: 1
    name: "Volume / Hypertrophy"
    weeks: { start: 1, end: 4 }
    dates: { start: 2026-01-19, end: 2026-02-15 }
    goal: "Volume / Hypertrophy"
    parameters:
      sets: "3"
      reps: "10-15"
      rest_s: "60-120"
      intensity_pct_1rm: "70-75"
      technique: "Controlled execution"
weekly_split:
  - { day: monday, session: "Upper A", muscle_groups: [chest, back] }
  - { day: tuesday, session: "Lower A", muscle_groups: [quadriceps, glutes, core] }
cardio:
  - { type: bike, duration_min: "20-30", frequency: "post-session", notes: "..." }
```

`parameters`: values are strings to absorb ranges (`"60-120"`, `"70-75"`). `day`
is an enum (`monday`…`sunday`).

### `sessions.yaml` (one per mesocycle)

Handles supersets and the circuit format.

```yaml
meta:
  schema_version: 1
  version: 1
  mesocycle: 3
  period: { start: 2026-04-13, end: 2026-05-10 }
  source: "Gemini"
  last_modified: 2026-04-11
  revisions:
    - { ref: "mesocycle-3/review.md", date: 2026-04-11, summary: "Critical analysis of M3" }
sessions:
  - id: A
    name: "Upper body (Density & Pump)"
    days: [monday, thursday]
    format: standard            # enum: standard | circuit
    exercises:
      - { order: A1, superset: "chest-back", exercise: chest_press_machine, sets: 3, reps: "10-12", rest_s: null, target_load: 55, notes: "smooth" }
      - { order: A2, superset: "chest-back", exercise: seated_row, sets: 3, reps: "10-12", rest_s: 60, target_load: 60, notes: null }
  - id: C
    name: "Full Body Circuit"
    days: [saturday]
    format: circuit
    circuit: { rounds: 3, rest_between_exercises_s: 0, rest_between_rounds_s: 120 }
    exercises:
      - { order: 1, exercise: chest_press_machine, sets: 3, reps: "15", target_load: null, notes: "light" }
cardio:
  - { type: bike, duration_min: "20", intensity: "intervals 30s/90s", notes: "..." }
```

Schema rules:
- `format: circuit` ⇒ `circuit` object required; `format: standard` ⇒ `circuit`
  forbidden (conditional `if/then` validation).
- `reps` is a **string** (handles ranges `"10-12"`, plank durations `"45-60s"`,
  fixed value `"15"`).
- `target_load` may be `null` (bodyweight, unquantified "light" load).
- `superset` is optional: exercises sharing the same value are chained.
- `exercise` is a **slug** that must exist in `catalog/exercises.yaml`.

### `catalog/exercises.yaml` (shared catalog)

Decouples "which exercises/equipment exist" from "which session uses them".

```yaml
meta: { schema_version: 1 }
equipment:
  - chest_press
  - pec_deck
  - shoulder_press
  - lat_machine
  - low_row
  - leg_press
  - leg_extension
  - arm_curl
  - dual_adjustable_pulley
  - bench
  - captains_chair
exercises:
  - { slug: chest_press_machine, name: "Chest Press machine", equipment: chest_press, muscle_groups: [chest] }
  - { slug: seated_row, name: "Seated row", equipment: low_row, muscle_groups: [back] }
  - { slug: cable_biceps_curl, name: "Cable biceps curl", equipment: dual_adjustable_pulley, muscle_groups: [biceps] }
```

Benefits: validation catches an unknown exercise slug in a session; a third-party
tool can list the equipment and the muscle groups worked.

## Evolvability & reviews

Files likely to be revised (`macrocycle.yaml`, `sessions.yaml`) carry a revision
log in `meta`:

```yaml
meta:
  schema_version: 1
  version: 2
  last_modified: 2026-04-11
  revisions:
    - { ref: "mesocycle-3/review.md", date: 2026-04-11, summary: "Load regression, added dips, rear delts" }
```

Principle: **the narrative of the change stays in Markdown** (constraint #5); the
YAML stores only `version` + `last_modified` + a `ref` pointer to the review file.
No duplication: Markdown carries the "why", YAML carries the "current state".

`schema_version` (in `meta`) versions the **format**; `version` versions the
**content** of the program file.

### Additional recommendation: `git init`

Initialize a git repository on the workspace. Git history automatically captures
"what changed and when" at line level; the review Markdown keeps the "why". This
directly reinforces constraint #5. The first commit will include the spec and the
migrated structure.

## Validation (Node.js)

`src/validate.mjs`, dependencies `ajv` (JSON Schema draft 2020-12) + `js-yaml`.

Behavior:
1. Glob `programs/**/*.yaml`, `templates/*.yaml`, `catalog/exercises.yaml`.
2. Pick the schema by base file name
   (`status.yaml` → `schemas/status.schema.json`, `sessions.yaml` →
   `schemas/sessions.schema.json`, etc.).
3. Validate each file; errors printed as `path/file: instancePath — message`.
4. **Cross-validations** (beyond pure JSON Schema):
   - Every `exercise` (slug) of a session exists in `catalog/exercises.yaml`.
   - Every key of `measurements[].values` and every entry of
     `goals[].tracked_measures` belongs to the measurement vocabulary.
   - Every `ref` of `meta.revisions` points to an existing file.
5. Exit code `0` if everything is valid, non-zero otherwise (usable in
   pre-commit / CI).

The script is **read-only** (no file mutation). `package.json` exposes
`npm run validate`. Designed to be extended later into a full CLI (subcommands
`status set`, `measurement add`, …) — out of scope here.

## Migration

The whole `2026-01_upper-lower-recomposition` program is converted:

| Markdown source | YAML target |
|-----------------|-------------|
| `status.md` | `status.yaml` (status `archived`) |
| `goals.md` | `goals.yaml` (goals + 3 measurement snapshots + loads) |
| `macrocycle.md` | `macrocycle.yaml` (3 mesocycles + weekly split + cardio) |
| `mesocycle-{1,2,3}/sessions.md` | `mesocycle-{1,2,3}/sessions.yaml` |
| `mesocycle-{1,2,3}/review.md` | **kept as-is** (Markdown) |

Templates `templates/*.md` (except `review.md`) are replaced by their
`templates/*.yaml` equivalents. Migrated structure `.md` files are deleted once
the equivalent `.yaml` is validated.

## Out of scope (YAGNI)

- Full update CLI (separate, future iteration).
- Display / charts generation for measurements.
- YAML ↔ JSON synchronization (YAML stays the only source).
- Converting review files to structured data.

## Success criteria

- `node scripts/validate.mjs` passes (exit 0) on the whole migrated workspace.
- Every structure file of the `2026-01` program exists as valid `.yaml`.
- Markdown review files are preserved and correctly referenced.
- No loss of information compared to the original `.md` files.

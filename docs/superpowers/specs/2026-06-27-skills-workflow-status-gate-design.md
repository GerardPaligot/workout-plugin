# Design — Workflow skills gated by status

- **Date**: 2026-06-27
- **Status**: Approved (pending spec review)
- **Workspace**: the repository root

## Context & goal

The workspace currently drives the life cycle of a strength-training program
through **4 agents** (`.claude/agents/`): Workout Program, Program Review,
Program Archiver, Workout Coach. Each agent describes in its prompt when it
applies and reads `status.yaml` "first" — but nothing prevents running a step out
of sequence (e.g. archiving a still-active program: the Archiver agent only does
a loose textual check).

Goal: replace the agents with **workflow skills**, one per step, whose
**applicability is decided deterministically** by a script that reads the current
state (`status.yaml` + directory tree). A write skill flatly refuses if invoked
outside the state that allows it.

> Update: a first-run state `needs_onboarding` (no `profile.yaml`) and an
> `onboarding` skill were added later; see the README. They are not part of the
> original design below.

### Decisions (stated by the user)

| Decision | Choice |
|----------|--------|
| Scope | **Replace** the 4 agents with skills (agents are deleted) |
| Gate mechanism | **Deterministic script** (`src/state.mjs`) called by each skill |
| Granularity | **6 fine-grained skills**, one clear step each |
| New program while one is completed | **Forbidden**: archive first (strict rule) |

### Non-goals (YAGNI)

- No dedicated "router" skill: `state.mjs` run alone already answers "where am I".
  (The chosen mechanism is script + skills, not router + auto-gate.)
- No automated test of the skills (Markdown, no code): reliability comes from the
  deterministic gate, which is tested.
- No change to the **knowledge** skills nor to `templates/` / `schemas/`.

---

## Architecture

Three layers, separated responsibilities:

```
┌─ src/state.mjs ──────────────┐   THE GATE (deterministic, testable)
│ reads programs/*/status.yaml   │   → computes the current state
│ + filesystem checks            │   → lists allowed/blocked skills + reason
│ JSON output on stdout          │   → exit code 0 (decision is in the JSON)
└────────────────────────────────┘
            ▲ called as the 1st action of each workflow skill
┌─ skills/ (workflow) ───┐   THE BEHAVIOR (6 skills)
│ create-program / create-       │   each skill: 1) calls state.mjs
│ mesocycle / track / review-    │   2) if not allowed → refuse + point to the
│ mesocycle / archive-program /  │      right skill 3) otherwise run the step
│ coach                          │
└────────────────────────────────┘
┌─ skills/ (knowledge) ──┐   UNCHANGED
│ lifting-biomechanics,          │   knowledge skills, passive reading
│ training-principles,           │   consulted by the workflow skills
│ training-programming,          │
│ *-training                     │
└────────────────────────────────┘
```

- **`src/state.mjs`** is the **only** source of truth for the state: a single
  place decides which step is possible. Testable like `validate.mjs`.
- The **6 workflow skills** run in the **main context** (continuity: create →
  track → coach without a sub-agent handoff).
- The `.claude/agents/` **agents are deleted**.

---

## State machine

`state.mjs` detects the current program: it scans `programs/*/status.yaml`
(excluding `programs/archives/`) and reads the `status` field
(`active | paused | completed | archived`).

### States → allowed skills

| State | Detection | coach | track | review-mesocycle | create-mesocycle | create-program | archive-program |
|-------|-----------|:-----:|:-----:|:----------------:|:----------------:|:--------------:|:---------------:|
| `no_program` | no program outside archives (or all `archived`) | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `in_progress` | one `status: active` | ✅ | ✅ | ✅ | ⚠️ cond. | ❌ | ❌ |
| `paused` | one `status: paused` | ✅ | ✅ (resume) | ✅ | ⚠️ cond. | ❌ | ❌ |
| `completed` | one `status: completed` still in `programs/` | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| `inconsistent` | ≥2 active programs, or `archived` not moved | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ (reports the anomaly) |

The state is derived from `status`. It is named `in_progress` (not `active`) so
that it is never confused with the `active` status value.

### Fine-grained preconditions (beyond the state)

- **`create-mesocycle`** (⚠️ cond. in `in_progress` / `paused`) allowed only if:
  - `mesocycle-{current}/review.md` exists (review before building the next
    block), **and**
  - `current_mesocycle < number of planned mesocycles` in `macrocycle.yaml`,
    **and**
  - `mesocycle-{current+1}/sessions.yaml` is missing (no overwriting).
- **`review-mesocycle`**: requires `mesocycle-{current}/sessions.yaml` to exist.
- **`archive-program`**: requires `status: completed`. Hard gate — fixes the
  too-loose check of the current Archiver agent.
- **`create-program`**: allowed only in `no_program`. In `completed`, you must
  **archive first** (strict rule: only one non-archived program at a time,
  `programs/` stays clean).

### Transitions

```
no_program ──create-program──▶ in_progress
in_progress ⇄ paused                    (track: pause / resume)
in_progress ──create-mesocycle──▶ in_progress   (current_mesocycle +1, current_week 1)
in_progress ──review + last block──▶ completed  (track sets status→completed)
completed ──archive-program──▶ no_program       (program moved to archives/)
```

### Strictness

Write skills **flatly refuse** outside their state, display the `reason` returned
by `state.mjs` and **name the allowed skill(s)**. `coach` is always available
(read-only, never gated off).

---

## The `src/state.mjs` script

Contract modeled on `validate.mjs` (same style, reuses `loadYaml`,
`collectYamlFiles`):

- **Call**: `node scripts/state.mjs .` (workspace root as argument).
- **Output**: indented JSON on stdout. Skills parse `skills.<name>.allowed` (and
  `.reason` if `false`). Exit code `0` in normal operation (the decision is in
  the JSON, not in the code); `1` only if reading is impossible / YAML parsing is
  broken.
- **Run alone**, it serves as the answer to "where am I".

Example output (state `in_progress`, mesocycle 1 not reviewed):

```json
{
  "state": "in_progress",
  "program": "2026-01_upper-lower-recomposition",
  "current_mesocycle": 1,
  "current_week": 3,
  "skills": {
    "coach":             { "allowed": true },
    "track":             { "allowed": true },
    "review-mesocycle":  { "allowed": true },
    "create-mesocycle":  { "allowed": false, "reason": "Review mesocycle 1 first (mesocycle-1/review.md missing)" },
    "create-program":    { "allowed": false, "reason": "A program is already active" },
    "archive-program":   { "allowed": false, "reason": "Program not completed (status: active)" }
  }
}
```

### Exported functions (for isolated testing)

- `detectState(root)` → `{ state, program, loaded status.yaml }` (pure, reads the FS).
- `computeSkills(context)` → `skills` table (pure, from the state + FS checks).
- `main(root)` → orchestrates, prints the JSON, returns the exit code.
- `main()` behind the `import.meta.url === process.argv[1]` guard, like
  `validate.mjs`.

---

## The 6 skills

Each workflow skill (`skills/<name>/SKILL.md`) has a frontmatter (`name`,
a carefully written `description` for auto-triggering) and follows the **same
skeleton**:

1. **1st action**: run `node scripts/state.mjs .`, read the JSON.
2. **Gate**: if `skills[self].allowed === false` → **stop**, display `reason` and
   name the skill(s) allowed in the current state.
3. **Otherwise**: run the step (body migrated from the matching agent).
4. **Write skills**: finish with `node scripts/validate.mjs .` and confirm the
   touched files to the user.

| Skill | Comes from | Writes | Effect on `status.yaml` |
|-------|------------|--------|--------------------------|
| `create-program` | Program agent (phases 0-4, 1st block) | `status.yaml` + `goals.yaml` + `macrocycle.yaml` + `mesocycle-1/sessions.yaml` | creates it, `status: active` |
| `create-mesocycle` | (was folded into Program) | `mesocycle-{N+1}/sessions.yaml` | `current_mesocycle+1`, `current_week: 1` |
| `track` | (real-time status concept) | updates `status.yaml`; logs loads (`reference_loads`) + measurements in `goals.yaml` | week, last/next session, pauses, `active`↔`paused`, →`completed` at the last reviewed block |
| `review-mesocycle` | Review agent | `mesocycle-N/review.md` + measurement row in `goals.yaml` + ref in `meta.revisions` | unchanged |
| `archive-program` | Archiver agent | `summary.md` then `mv` to `archives/` | `completed`→`archived` |
| `coach` | Coach agent | nothing (read-only) | never gated off |

Constraints inherited from the agents and kept in each skill:
- Never propose an exercise whose equipment is missing (checked against
  `profile.equipment` in `profile.yaml`).
- Rely on the knowledge skills (biomechanics, principles, programming, muscle
  groups) for any training decision.
- Read the `templates/*` template before creating a file.
- Never overwrite / delete a file without explicit confirmation.

---

## Migration

- **Delete** `.claude/agents/program.md`, `review.md`, `archiver.md`,
  `coach.md`.
- **Create** the 6 workflow skills in `skills/`.
- **Fix the drift** in `skills/program-structure/SKILL.md`: replace `.md`
  references with `.yaml` (except `review.md` / `summary.md`), document the
  `status` states and the gate via `state.mjs`.
- **README**: rewrite the workflow section (skills instead of agents, add
  `state.mjs` to the pipeline).
- **Unchanged**: knowledge skills, `templates/`, `schemas/`, `validate.mjs`.

---

## Tests

- **`test/state.test.mjs`** (`node --test`, same pattern as
  `validate.test.mjs`):
  - State detection: `no_program`, `in_progress`, `paused`, `completed`,
    `inconsistent` (≥2 active).
  - Gate decisions per state (the "States → allowed skills" table checked case by
    case).
  - Fine-grained preconditions: `create-mesocycle` blocked if `review.md` is
    missing; `archive-program` blocked if `status` ≠ `completed`;
    `create-program` blocked outside `no_program`.
  - Fixtures = temporary mini `programs/` trees (status.yaml + mesocycle
    directories) created/destroyed by the test.
- `state.mjs` exposes `detectState` / `computeSkills` for testing without process
  I/O.

---

## Success criteria

1. `node scripts/state.mjs .` returns correct JSON for the real state of the
   workspace (an archived program → `no_program`).
2. The 6 skills exist, each calling `state.mjs` as its first action and flatly
   refusing outside its state.
3. The 4 agents are deleted; no residual reference to the agents in the README or
   in `program-structure`.
4. `node scripts/validate.mjs .` stays green.
5. `npm test` (in `src/`) passes, including the `state` tests.

# Workflow skills gated by status — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 4 strength-training agents with 6 workflow skills whose applicability is decided by a deterministic script (`src/state.mjs`) that reads the program's current state.

**Architecture:** A `state.mjs` script (in the style of `validate.mjs`) computes the state (`no_program | in_progress | paused | completed | inconsistent`) by reading `programs/*/status.yaml` + the directory tree, and returns as JSON which skills are allowed. Each workflow skill calls `state.mjs` as its first action and flatly refuses if it is not allowed. The agents are deleted; the knowledge skills stay untouched.

**Tech Stack:** Node.js ESM, `node:test`, `js-yaml` (via `loadYaml` re-exported from `validate.mjs`), Claude Code markdown skills.

> **Note:** a first-run state `needs_onboarding` (no `profile.yaml`) and an `onboarding` skill were added after this plan; see the README. Equipment feasibility is checked against `profile.equipment` in `profile.yaml`.

## Global Constraints

- **ESM module**: `src/` is `"type": "module"`. `node:*` and `.mjs` imports.
- **Reuse** `loadYaml` exported by `src/validate.mjs` — do not reimplement YAML parsing.
- **Test style**: `node:test` + `node:assert/strict`, fixtures via `mkdtempSync(join(tmpdir(), 'workout-state-'))`, paths via `import.meta.dirname`. See `test/validate.test.mjs`.
- **CLI guard**: `main()` behind `if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))`, like `validate.mjs`.
- **Exact skill names** (JSON keys AND file names `skills/<name>/SKILL.md`): `coach`, `track`, `review-mesocycle`, `create-mesocycle`, `create-program`, `archive-program`.
- **`state.mjs` always returns exit code 0** in normal operation (decision in the JSON); exit code 1 only if reading is impossible.
- **Commits**: end each message with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Work on the `skills-workflow-status-gate` branch (already created).
- **Gate skeleton** (identical at the top of each gated workflow skill):
  ```markdown
  ## Gate (1st action — mandatory)
  1. Run `node scripts/state.mjs .` from the workspace root.
  2. Read the JSON. If `skills["<name>"].allowed` is `false`:
     - **Stop.** Display the `reason` field.
     - List the skills whose `allowed` is `true` in the current state.
     - Do not create or modify any file.
  3. Otherwise, continue.
  ```
- **Final validation block** (end of each write skill):
  ```markdown
  ## Final validation
  Run `node scripts/validate.mjs .`. On error, fix before confirming.
  Confirm to the user the files created/modified and their path.
  ```

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/state.mjs` (create) | State computation + gate. Exports `detectState`, `computeSkills`, `main`, `SKILLS`. |
| `test/state.test.mjs` (create) | Unit tests of detection + gate on temporary fixtures. |
| `test/skills.test.mjs` (create) | Checks that each workflow skill exists, has a frontmatter and calls the gate. |
| `skills/create-program/SKILL.md` (create) | Step: create a new program (1st mesocycle). |
| `skills/create-mesocycle/SKILL.md` (create) | Step: create the session block of the next mesocycle. |
| `skills/track/SKILL.md` (create) | Step: update the status + log loads/measurements. |
| `skills/review-mesocycle/SKILL.md` (create) | Step: review a mesocycle. |
| `skills/archive-program/SKILL.md` (create) | Step: archive a completed program. |
| `skills/coach/SKILL.md` (create) | Step: read-only Q&A, always available. |
| `.claude/agents/{program,review,archiver,coach}.md` (delete) | Replaced former agents. |
| `skills/program-structure/SKILL.md` (modify) | Fix the `.md`→`.yaml` drift, document states + gate. |
| `README.md` (modify) | Rewrite the workflow around the skills + `state.mjs`. |

---

## Task 1: `detectState`

**Files:**
- Create: `src/state.mjs`
- Test: `test/state.test.mjs`

**Interfaces:**
- Consumes: `loadYaml` from `src/validate.mjs`.
- Produces: `detectState(root) → { state, programDir, program, status, anomaly? }` where `state ∈ {no_program, in_progress, paused, completed, inconsistent}`, `programDir` absolute path or `null`, `program` slug or `null`, `status` loaded YAML object or `null`.

- [ ] **Step 1: Write the detection tests (they fail)**

Create `test/state.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectState } from '../state.mjs';

function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'workout-state-'));
  mkdirSync(join(root, 'programs'));
  return root;
}
function writeProgram(root, slug, statusYaml, { mesocycles = [] } = {}) {
  const dir = join(root, 'programs', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'status.yaml'), statusYaml);
  for (const m of mesocycles) {
    const md = join(dir, `mesocycle-${m.n}`);
    mkdirSync(md, { recursive: true });
    if (m.sessions) writeFileSync(join(md, 'sessions.yaml'), 'meta: { schema_version: 1 }\nsessions: []\n');
    if (m.review) writeFileSync(join(md, 'review.md'), '# Review\n');
  }
  return dir;
}
const STATUS = (status, n = 1, wk = 1) =>
  `meta: { schema_version: 1 }\nprogram: p\nstatus: ${status}\ncurrent_mesocycle: ${n}\ncurrent_week: ${wk}\nstart_date: 2026-01-01\n`;

test('detectState: no program', () => {
  const root = workspace();
  assert.equal(detectState(root).state, 'no_program');
});
test('detectState: active program', () => {
  const root = workspace();
  writeProgram(root, '2026-01_p', STATUS('active'));
  const r = detectState(root);
  assert.equal(r.state, 'in_progress');
  assert.equal(r.program, '2026-01_p');
});
test('detectState: paused program', () => {
  const root = workspace();
  writeProgram(root, '2026-01_p', STATUS('paused'));
  assert.equal(detectState(root).state, 'paused');
});
test('detectState: completed program', () => {
  const root = workspace();
  writeProgram(root, '2026-01_p', STATUS('completed'));
  assert.equal(detectState(root).state, 'completed');
});
test('detectState: archives ignored', () => {
  const root = workspace();
  mkdirSync(join(root, 'programs', 'archives', 'old'), { recursive: true });
  writeFileSync(join(root, 'programs', 'archives', 'old', 'status.yaml'), STATUS('archived'));
  assert.equal(detectState(root).state, 'no_program');
});
test('detectState: two live programs = inconsistent', () => {
  const root = workspace();
  writeProgram(root, '2026-01_a', STATUS('active'));
  writeProgram(root, '2026-02_b', STATUS('completed'));
  assert.equal(detectState(root).state, 'inconsistent');
});
test('detectState: archived not moved = inconsistent', () => {
  const root = workspace();
  writeProgram(root, '2026-01_p', STATUS('archived'));
  assert.equal(detectState(root).state, 'inconsistent');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd tools && node --test test/state.test.mjs`
Expected: FAIL — `Cannot find module '../state.mjs'`.

- [ ] **Step 3: Implement `detectState`**

Create `src/state.mjs`:

```js
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadYaml } from './validate.mjs';

export const SKILLS = ['coach', 'track', 'review-mesocycle', 'create-mesocycle', 'create-program', 'archive-program'];

// The derived state is named `in_progress` (not `active`) to avoid colliding with the `active` status value.
const STATE_BY_STATUS = { active: 'in_progress', paused: 'paused', completed: 'completed' };

export function detectState(root) {
  const base = join(root, 'programs');
  const empty = { state: 'no_program', programDir: null, program: null, status: null };
  if (!existsSync(base)) return empty;

  const candidates = [];
  for (const entry of readdirSync(base)) {
    if (entry === 'archives' || entry.startsWith('.')) continue;
    const full = join(base, entry);
    if (!statSync(full).isDirectory()) continue;
    const sf = join(full, 'status.yaml');
    if (!existsSync(sf)) continue;
    let status = null;
    try { status = loadYaml(sf); } catch { status = null; }
    candidates.push({ programDir: full, program: entry, status });
  }

  const archivedPresent = candidates.some((c) => c.status?.status === 'archived');
  const live = candidates.filter((c) => ['active', 'paused', 'completed'].includes(c.status?.status));

  if (live.length > 1 || archivedPresent) {
    return { state: 'inconsistent', programDir: null, program: null, status: null,
      anomaly: archivedPresent ? 'archived program not moved out of programs/' : 'multiple non-archived programs' };
  }
  if (live.length === 0) return empty;

  const p = live[0];
  return { state: STATE_BY_STATUS[p.status.status], programDir: p.programDir, program: p.program, status: p.status };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd tools && node --test test/state.test.mjs`
Expected: PASS (7 detection tests).

- [ ] **Step 5: Commit**

```bash
git add src/state.mjs test/state.test.mjs
git commit -m "feat(tools): detectState — program state from status.yaml

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `computeSkills` (the gate)

**Files:**
- Modify: `src/state.mjs`
- Test: `test/state.test.mjs`

**Interfaces:**
- Consumes: output of `detectState`.
- Produces: `computeSkills(root, ctx) → { <skill>: { allowed: boolean, reason?: string } }` for the 6 names in `SKILLS`.

- [ ] **Step 1: Write the gate tests (they fail)**

Append to `test/state.test.mjs` (also import `computeSkills`):

```js
import { computeSkills } from '../state.mjs';

const MACRO_3 = 'meta: { schema_version: 1, version: 1, last_modified: 2026-01-01 }\nname: P\nstart_date: 2026-01-01\nend_date: 2026-06-30\nfrequency: "4"\nsplit: upper_lower\nmesocycles:\n  - { number: 1, name: A, weeks: { start: 1, end: 4 }, dates: { start: 2026-01-01, end: 2026-01-28 }, goal: x }\n  - { number: 2, name: B, weeks: { start: 5, end: 8 }, dates: { start: 2026-02-01, end: 2026-02-28 }, goal: y }\n  - { number: 3, name: C, weeks: { start: 9, end: 12 }, dates: { start: 2026-03-01, end: 2026-03-28 }, goal: z }\n';
function writeMacro(dir) { writeFileSync(join(dir, 'macrocycle.yaml'), MACRO_3); }

function skills(root) { return computeSkills(root, detectState(root)); }

test('gate no_program: only coach + create-program', () => {
  const root = workspace();
  const s = skills(root);
  assert.equal(s['create-program'].allowed, true);
  assert.equal(s['coach'].allowed, true);
  assert.equal(s['track'].allowed, false);
  assert.equal(s['archive-program'].allowed, false);
});
test('gate in_progress: create-program blocked, track/coach ok', () => {
  const root = workspace();
  const dir = writeProgram(root, '2026-01_p', STATUS('active', 1), { mesocycles: [{ n: 1, sessions: true }] });
  writeMacro(dir);
  const s = skills(root);
  assert.equal(s['create-program'].allowed, false);
  assert.equal(s['track'].allowed, true);
  assert.equal(s['review-mesocycle'].allowed, true);
  assert.equal(s['archive-program'].allowed, false);
});
test('gate in_progress: create-mesocycle blocked without review', () => {
  const root = workspace();
  const dir = writeProgram(root, '2026-01_p', STATUS('active', 1), { mesocycles: [{ n: 1, sessions: true }] });
  writeMacro(dir);
  const s = skills(root);
  assert.equal(s['create-mesocycle'].allowed, false);
  assert.match(s['create-mesocycle'].reason, /Review/);
});
test('gate in_progress: create-mesocycle allowed after review', () => {
  const root = workspace();
  const dir = writeProgram(root, '2026-01_p', STATUS('active', 1), { mesocycles: [{ n: 1, sessions: true, review: true }] });
  writeMacro(dir);
  assert.equal(skills(root)['create-mesocycle'].allowed, true);
});
test('gate in_progress: create-mesocycle blocked at the last planned mesocycle', () => {
  const root = workspace();
  const dir = writeProgram(root, '2026-01_p', STATUS('active', 3), { mesocycles: [{ n: 3, sessions: true, review: true }] });
  writeMacro(dir);
  assert.equal(skills(root)['create-mesocycle'].allowed, false);
});
test('gate review blocked if current block sessions are missing', () => {
  const root = workspace();
  const dir = writeProgram(root, '2026-01_p', STATUS('active', 2), { mesocycles: [{ n: 2 }] });
  writeMacro(dir);
  assert.equal(skills(root)['review-mesocycle'].allowed, false);
});
test('gate completed: archive-program ok, create-program blocked', () => {
  const root = workspace();
  const dir = writeProgram(root, '2026-01_p', STATUS('completed', 3), { mesocycles: [{ n: 3, sessions: true, review: true }] });
  writeMacro(dir);
  const s = skills(root);
  assert.equal(s['archive-program'].allowed, true);
  assert.equal(s['create-program'].allowed, false);
  assert.match(s['create-program'].reason, /[Aa]rchive/);
});
test('gate inconsistent: every write blocked', () => {
  const root = workspace();
  writeProgram(root, '2026-01_a', STATUS('active'));
  writeProgram(root, '2026-02_b', STATUS('active'));
  const s = skills(root);
  assert.equal(s['coach'].allowed, true);
  for (const n of ['track', 'review-mesocycle', 'create-mesocycle', 'create-program', 'archive-program']) {
    assert.equal(s[n].allowed, false);
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd tools && node --test test/state.test.mjs`
Expected: FAIL — `computeSkills is not a function` / missing export.

- [ ] **Step 3: Implement `computeSkills`**

Add to `src/state.mjs`:

```js
function plannedMesocycleCount(programDir) {
  const f = join(programDir, 'macrocycle.yaml');
  if (!existsSync(f)) return null;
  try {
    const macro = loadYaml(f);
    return Array.isArray(macro?.mesocycles) ? macro.mesocycles.length : null;
  } catch { return null; }
}

export function computeSkills(root, ctx) {
  const { state, programDir, status } = ctx;
  const skills = {};
  const set = (n, allowed, reason) => { skills[n] = allowed ? { allowed: true } : { allowed: false, reason }; };

  set('coach', true);

  if (state === 'inconsistent') {
    for (const n of ['track', 'review-mesocycle', 'create-mesocycle', 'create-program', 'archive-program']) {
      set(n, false, `Inconsistent state: ${ctx.anomaly}. Fix programs/ before any write.`);
    }
    return skills;
  }

  if (state === 'no_program') {
    set('create-program', true);
    set('track', false, 'No active program');
    set('review-mesocycle', false, 'No active program');
    set('create-mesocycle', false, 'No active program');
    set('archive-program', false, 'No program to archive');
    return skills;
  }

  const m = status.current_mesocycle;
  const currentSessions = join(programDir, `mesocycle-${m}`, 'sessions.yaml');

  if (state === 'completed') {
    set('archive-program', true);
    set('create-program', false, 'Archive the completed program first');
    set('track', false, 'Program completed');
    set('create-mesocycle', false, 'Program completed');
    set('review-mesocycle', existsSync(currentSessions), existsSync(currentSessions) ? undefined : `mesocycle-${m}/sessions.yaml missing`);
    return skills;
  }

  // in_progress | paused
  set('create-program', false, 'A program is already active');
  set('archive-program', false, `Program not completed (status: ${status.status})`);
  set('track', true);
  set('review-mesocycle', existsSync(currentSessions), existsSync(currentSessions) ? undefined : `mesocycle-${m}/sessions.yaml missing`);

  const currentReview = join(programDir, `mesocycle-${m}`, 'review.md');
  const nextSessions = join(programDir, `mesocycle-${m + 1}`, 'sessions.yaml');
  const plannedCount = plannedMesocycleCount(programDir);
  let reason = null;
  if (!existsSync(currentReview)) reason = `Review mesocycle ${m} first (mesocycle-${m}/review.md missing)`;
  else if (plannedCount != null && m >= plannedCount) reason = `Last planned mesocycle (${plannedCount}) reached: complete, then archive`;
  else if (existsSync(nextSessions)) reason = `mesocycle-${m + 1}/sessions.yaml already exists`;
  set('create-mesocycle', reason == null, reason);

  return skills;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd tools && node --test test/state.test.mjs`
Expected: PASS (detection + gate).

- [ ] **Step 5: Commit**

```bash
git add src/state.mjs test/state.test.mjs
git commit -m "feat(tools): computeSkills — skill gate by state

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `main` CLI + JSON output

**Files:**
- Modify: `src/state.mjs`
- Test: `test/state.test.mjs`

**Interfaces:**
- Produces: `main(root) → 0`, prints on stdout a JSON `{ state, program, current_mesocycle, current_week, skills, anomaly? }`. CLI: `node state.mjs <root>`.

- [ ] **Step 1: Write the CLI test (it fails)**

Append to `test/state.test.mjs` (import `execFileSync`):

```js
import { execFileSync } from 'node:child_process';

test('CLI: prints JSON with state and skills, exit code 0', () => {
  const root = workspace();
  const out = execFileSync('node', [join(import.meta.dirname, '..', 'state.mjs'), root], { encoding: 'utf8' });
  const parsed = JSON.parse(out);
  assert.equal(parsed.state, 'no_program');
  assert.equal(parsed.skills['create-program'].allowed, true);
  assert.equal(parsed.skills['coach'].allowed, true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd tools && node --test test/state.test.mjs`
Expected: FAIL — empty / non-JSON output (no `main` nor CLI block).

- [ ] **Step 3: Implement `main` + CLI guard**

Add at the end of `src/state.mjs`:

```js
export function main(root) {
  const ctx = detectState(root);
  const skills = computeSkills(root, ctx);
  const out = {
    state: ctx.state,
    program: ctx.program,
    current_mesocycle: ctx.status?.current_mesocycle ?? null,
    current_week: ctx.status?.current_week ?? null,
    skills,
  };
  if (ctx.anomaly) out.anomaly = ctx.anomaly;
  console.log(JSON.stringify(out, null, 2));
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(resolve(process.argv[2] || '.')));
}
```

- [ ] **Step 4: Run the full suite + check on the real workspace**

Run: `cd tools && node --test`
Expected: PASS (state + validate + schemas).

Run: `node scripts/state.mjs .` (from the root)
Expected: JSON `"state": "no_program"` (the real program is `archived`), `create-program.allowed: true`.

- [ ] **Step 5: Commit**

```bash
git add src/state.mjs test/state.test.mjs
git commit -m "feat(tools): state.mjs CLI — JSON output of the state + gate

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `create-program` skill + skills test harness

**Files:**
- Create: `skills/create-program/SKILL.md`
- Create: `test/skills.test.mjs`

**Interfaces:**
- Consumes: `src/state.mjs` (gate), templates `templates/*.yaml`, knowledge skills.
- Produces: helper `assertSkillGate(name)` reused by tasks 5-8.

- [ ] **Step 1: Write the test harness (it fails)**

Create `test/skills.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SKILLS_DIR = join(import.meta.dirname, '..', '..', '.claude', 'skills');

export function readSkill(name) {
  const p = join(SKILLS_DIR, name, 'SKILL.md');
  assert.ok(existsSync(p), `${name}/SKILL.md missing`);
  return readFileSync(p, 'utf8');
}
export function assertFrontmatter(txt, name) {
  assert.match(txt, /^---\n[\s\S]*?\n---/, `${name}: frontmatter missing`);
  assert.match(txt, /name:/, `${name}: name field missing`);
  assert.match(txt, /description:/, `${name}: description field missing`);
}
export function assertSkillGate(name) {
  const txt = readSkill(name);
  assertFrontmatter(txt, name);
  assert.match(txt, /node tools\/state\.mjs \./, `${name}: state.mjs call missing`);
  assert.ok(txt.includes(`skills["${name}"]`), `${name}: gate read skills["${name}"] missing`);
}

test('skill create-program: gate present', () => assertSkillGate('create-program'));
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd tools && node --test test/skills.test.mjs`
Expected: FAIL — `create-program/SKILL.md missing`.

- [ ] **Step 3: Create the `create-program` skill**

Create `skills/create-program/SKILL.md`:

```markdown
---
name: create-program
description: "Create a new strength-training program from scratch (macrocycle, goals, 1st mesocycle). Use when: the user wants to start a new training cycle or plan a macrocycle. Only usable when no program is active."
---

You build a personalized hypertrophy program relying exclusively on the workspace
knowledge skills, and you save it in `programs/`.

## Gate (1st action — mandatory)
1. Run `node scripts/state.mjs .` from the workspace root.
2. Read the JSON. If `skills["create-program"].allowed` is `false`:
   - **Stop.** Display the `reason` field.
   - List the skills whose `allowed` is `true` in the current state.
   - Do not create or modify any file.
3. Otherwise, continue.

## Absolute constraints
- NEVER propose an exercise whose equipment is not in `profile.equipment` (`profile.yaml`) + `catalog/exercises.yaml`.
- Follow the macrocycle → mesocycles → microcycles methodology (`skills/training-programming/SKILL.md`).
- Apply `skills/training-principles/SKILL.md` (progressive overload, exercise economy).
- Validate each exercise with `skills/lifting-biomechanics/SKILL.md`.
- Read the `templates/*.yaml` template before creating each file, then replace the values.
- Follow `skills/program-structure/SKILL.md` for the directory tree and names.

## Workflow
### Phase 1 — Information gathering
Ask these questions before any proposal: measurable goals, priorities,
macrocycle duration, frequency/days, load history, weak points/pain.

### Phase 2 — Macrocycle architecture
Build the split into mesocycles (goal per mesocycle), the microcycle structure
(mechanical → metabolic → overreaching), the deloads.
Create `programs/YYYY-MM_short-name/` with `status.yaml` (status: active), `goals.yaml`,
`macrocycle.yaml`. Replace all dates with the real dates.

### Phase 3 — Exercise selection
2-3 exercises max per muscle group (`*-training` skills), feasible with the
equipment, covering stretch + contraction. Justify each choice. The slugs
used must exist in `catalog/exercises.yaml`.

### Phase 4 — Session construction
Create `mesocycle-1/sessions.yaml` (order, sets × reps per microcycle, rest, target
loads or RPE, cardio). Do NOT create the following mesocycles (skill `create-mesocycle`).

## Final validation
Run `node scripts/validate.mjs .`. On error, fix before confirming.
Confirm to the user the files created and their path.

## What you do NOT do
- No supplements nor detailed nutrition plan.
- No exercise not validated by the skills. No overwriting without confirmation.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd tools && node --test test/skills.test.mjs`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add skills/create-program/SKILL.md test/skills.test.mjs
git commit -m "feat(skills): create-program + skills test harness

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `create-mesocycle` skill

**Files:**
- Create: `skills/create-mesocycle/SKILL.md`
- Modify: `test/skills.test.mjs`

**Interfaces:**
- Consumes: `assertSkillGate` (Task 4), `src/state.mjs`.

- [ ] **Step 1: Add the test (it fails)**

Append to `test/skills.test.mjs`:

```js
test('skill create-mesocycle: gate present', () => assertSkillGate('create-mesocycle'));
```

- [ ] **Step 2: Verify the failure**

Run: `cd tools && node --test test/skills.test.mjs`
Expected: FAIL — `create-mesocycle/SKILL.md missing`.

- [ ] **Step 3: Create the skill**

Create `skills/create-mesocycle/SKILL.md`:

```markdown
---
name: create-mesocycle
description: "Build the session block of the next mesocycle of an in-progress program. Use when: the current mesocycle is reviewed and the user wants to move on to the next block. Requires a prior review of the current block."
---

You build the sessions of the next mesocycle taking into account the adjustments
decided at the review.

## Gate (1st action — mandatory)
1. Run `node scripts/state.mjs .` from the workspace root.
2. Read the JSON. If `skills["create-mesocycle"].allowed` is `false`:
   - **Stop.** Display the `reason` field (e.g. "Review mesocycle N first").
   - List the skills whose `allowed` is `true` in the current state.
   - Do not create or modify any file.
3. Otherwise, continue.

## Absolute constraints
- Same constraints as `create-program` (equipment, biomechanics, principles, templates).
- Read `mesocycle-{current}/review.md`: apply the adjustments described there.
- Read `macrocycle.yaml` to know the goal and parameters of the next block.

## Workflow
1. Determine the next block number `N+1` (= `current_mesocycle` from the JSON, +1).
2. Read the current block's review and the goal of block N+1 in `macrocycle.yaml`.
3. Select/adjust the exercises (`*-training` skills, slugs ∈ `catalog/exercises.yaml`).
4. Create `mesocycle-{N+1}/sessions.yaml` from `templates/sessions.yaml`.
5. Update `status.yaml`: `current_mesocycle: N+1`, `current_week: 1`.

## Final validation
Run `node scripts/validate.mjs .`. On error, fix before confirming.
Confirm to the user the files created/modified.

## What you do NOT do
- Do not overwrite an existing `sessions.yaml`. No review (skill `review-mesocycle`).
```

- [ ] **Step 4: Verify the success**

Run: `cd tools && node --test test/skills.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add skills/create-mesocycle/SKILL.md test/skills.test.mjs
git commit -m "feat(skills): create-mesocycle (next block, gated on review)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `track` skill

**Files:**
- Create: `skills/track/SKILL.md`
- Modify: `test/skills.test.mjs`

- [ ] **Step 1: Add the test (it fails)**

```js
test('skill track: gate present', () => assertSkillGate('track'));
```

- [ ] **Step 2: Verify the failure**

Run: `cd tools && node --test test/skills.test.mjs`
Expected: FAIL — `track/SKILL.md missing`.

- [ ] **Step 3: Create the skill**

Create `skills/track/SKILL.md`:

```markdown
---
name: track
description: "Update the program's real-time status and log loads/measurements. Use when: the user did a session, changes week, pauses/resumes, or wants to record new loads or measurements."
---

You keep the active program's real-time state and the history of loads
and measurements up to date.

## Gate (1st action — mandatory)
1. Run `node scripts/state.mjs .` from the workspace root.
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
- Add a free note to `notes` if relevant.

### goals.yaml (as you go)
- New load: add an entry to `reference_loads` (`{ date, exercise, load, reps }`),
  `exercise` ∈ `catalog/exercises.yaml`.
- New measurement: add an entry to `measurements` (allowed measurement keys,
  see the header of `templates/goals.yaml`).

## Final validation
Run `node scripts/validate.mjs .`. On error, fix before confirming.
Confirm to the user the updated fields.

## What you do NOT do
- Do not modify `sessions.yaml` (history). Do not write a review (skill `review-mesocycle`).
```

- [ ] **Step 4: Verify the success**

Run: `cd tools && node --test test/skills.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add skills/track/SKILL.md test/skills.test.mjs
git commit -m "feat(skills): track (real-time status + loads/measurements)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `review-mesocycle` skill

**Files:**
- Create: `skills/review-mesocycle/SKILL.md`
- Modify: `test/skills.test.mjs`

- [ ] **Step 1: Add the test (it fails)**

```js
test('skill review-mesocycle: gate present', () => assertSkillGate('review-mesocycle'));
```

- [ ] **Step 2: Verify the failure**

Run: `cd tools && node --test test/skills.test.mjs`
Expected: FAIL — `review-mesocycle/SKILL.md missing`.

- [ ] **Step 3: Create the skill**

Create `skills/review-mesocycle/SKILL.md`:

```markdown
---
name: review-mesocycle
description: "Review a mesocycle and document the adjustments for the next one. Use when: the user wants to analyze their progress over a block, what worked and what didn't, before moving on."
---

You analyze a finished mesocycle and write a review usable by the skill
`create-mesocycle`.

## Gate (1st action — mandatory)
1. Run `node scripts/state.mjs .` from the workspace root.
2. Read the JSON. If `skills["review-mesocycle"].allowed` is `false`:
   - **Stop.** Display the `reason` field.
   - List the skills whose `allowed` is `true` in the current state.
   - Do not create or modify any file.
3. Otherwise, continue.

## Absolute constraints
- Read `macrocycle.yaml`, `goals.yaml` and `mesocycle-{current}/sessions.yaml` before asking questions.
- Apply `skills/training-principles/SKILL.md` to evaluate progress.
- If an exercise replacement is considered: check equipment + `*-training` skills.
- Read `templates/review.md` before creating the file.

## Workflow
1. Gather: current measurements, current loads, feedback per exercise,
   pain, adherence to the program.
2. Analyze: measurement progress (start vs end), progressive overload
   (plateaus), exercise relevance, adherence to the microcycles, volume.
3. Create `mesocycle-{current}/review.md` from `templates/review.md`:
   measurements (delta), loads (delta), what worked, what didn't work,
   concrete adjustments for the next block.
4. Add a measurement row to `goals.yaml` (measurements).
5. Add an entry to `meta.revisions` of `macrocycle.yaml`
   (`{ ref: "mesocycle-N/review.md", date, summary }`).

## Final validation
Run `node scripts/validate.mjs .`. On error, fix before confirming.
Confirm to the user the files created/modified.

## What you do NOT do
- Do not modify the reviewed block's `sessions.yaml` (history). Do not create the next
  block (skill `create-mesocycle`).
```

- [ ] **Step 4: Verify the success**

Run: `cd tools && node --test test/skills.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add skills/review-mesocycle/SKILL.md test/skills.test.mjs
git commit -m "feat(skills): review-mesocycle (review + adjustments)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `archive-program` skill

**Files:**
- Create: `skills/archive-program/SKILL.md`
- Modify: `test/skills.test.mjs`

- [ ] **Step 1: Add the test (it fails)**

```js
test('skill archive-program: gate present', () => assertSkillGate('archive-program'));
```

- [ ] **Step 2: Verify the failure**

Run: `cd tools && node --test test/skills.test.mjs`
Expected: FAIL — `archive-program/SKILL.md missing`.

- [ ] **Step 3: Create the skill**

Create `skills/archive-program/SKILL.md`:

```markdown
---
name: archive-program
description: "Archive a completed program: write the final summary, then move it to programs/archives/. Use when: the macrocycle is finished (status completed) and the user wants to close it out cleanly."
---

You close out a completed program: you write the summary and move the directory
to the archives, after confirmation.

## Gate (1st action — mandatory)
1. Run `node scripts/state.mjs .` from the workspace root.
2. Read the JSON. If `skills["archive-program"].allowed` is `false`:
   - **Stop.** Display the `reason` field (e.g. "Program not completed").
   - List the skills whose `allowed` is `true` in the current state.
   - Do not create or modify any file.
3. Otherwise, continue.

## Absolute constraints
- NEVER delete a file. Move only after explicit confirmation.
- Read `templates/summary.md` before creating the summary.

## Workflow
1. Check completeness: `goals.yaml` (start + intermediate measurements),
   `macrocycle.yaml`, `mesocycle-N/sessions.yaml` for each block done,
   `mesocycle-N/review.md` (flag missing reviews).
   If items are missing, offer to run `review-mesocycle` or to archive as-is.
2. Create `summary.md` at the root of the program directory from `templates/summary.md`
   (measurements start→end vs goals, load progression, lessons, exercises
   to keep/replace).
3. Set `status: archived` in `status.yaml`, fill in `end_date`.
4. **Ask for confirmation**, then move the directory to `programs/archives/`
   with `mv` (Bash). Relative review refs stay valid (the whole directory moves).

## Final validation
Run `node scripts/validate.mjs .` (after the move). Confirm the archive location
and the path of the summary.

## What you do NOT do
- Do not create a new program (skill `create-program`, available once archived).
- Do not modify existing sessions/reviews.
```

- [ ] **Step 4: Verify the success**

Run: `cd tools && node --test test/skills.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add skills/archive-program/SKILL.md test/skills.test.mjs
git commit -m "feat(skills): archive-program (summary + move, hard gate on completed)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: `coach` skill (read-only)

**Files:**
- Create: `skills/coach/SKILL.md`
- Modify: `test/skills.test.mjs`

**Interfaces:**
- Consumes: `readSkill`, `assertFrontmatter` (Task 4). `coach` reads `state.mjs` for context but is never blocked — its test differs (no refusal assertion).

- [ ] **Step 1: Add the test (it fails)**

```js
test('skill coach: frontmatter + reads state for context, read-only', () => {
  const txt = readSkill('coach');
  assertFrontmatter(txt, 'coach');
  assert.match(txt, /node tools\/state\.mjs \./, 'coach: must read state.mjs for context');
  assert.match(txt, /read-only/i, 'coach: must be declared read-only');
});
```

- [ ] **Step 2: Verify the failure**

Run: `cd tools && node --test test/skills.test.mjs`
Expected: FAIL — `coach/SKILL.md missing`.

- [ ] **Step 3: Create the skill**

Create `skills/coach/SKILL.md`:

```markdown
---
name: coach
description: "Answer strength-training questions (execution, exercise choice, biomechanics, principles, programming) using the workspace skills. Use when: the user asks a question without wanting any file changed. Always available."
---

You answer questions relying exclusively on the workspace knowledge skills.
This skill is **read-only**: you do not create or modify any file.

## First action — context
Run `node scripts/state.mjs .` to situate the user (state, mesocycle, week),
then read the active program's `status.yaml` if the question is about the program.
`coach` is never blocked by the gate.

## Skills to consult by topic
| Topic | Skill(s) |
|-------|----------|
| Execution, line of force, lever arm | `skills/lifting-biomechanics/SKILL.md` |
| Exercise choice for a muscle | `skills/<muscle>-training/SKILL.md` + `profile.yaml` (`equipment`) |
| Overload, volume, frequency, ego lifting | `skills/training-principles/SKILL.md` |
| Cycles, mesocycles, microcycles | `skills/training-programming/SKILL.md` |
| Equipment, feasibility | `profile.yaml` (`equipment`) |
| Current program, loads | `status.yaml` then files of `programs/` |

## How to answer
1. Read the relevant skill(s) before answering.
2. Answer concisely, justify with biomechanical/methodological principles.
3. NEVER propose an exercise whose equipment is not available.
4. If the question is outside the skills' scope, say so honestly.

## What you do NOT do
- Do not create or modify any file. No supplements. No medical diagnosis.
```

- [ ] **Step 4: Verify the success (full suite)**

Run: `cd tools && node --test`
Expected: PASS — state.test.mjs + skills.test.mjs (6 skills) + validate + schemas.

- [ ] **Step 5: Commit**

```bash
git add skills/coach/SKILL.md test/skills.test.mjs
git commit -m "feat(skills): coach (read-only Q&A, always available)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Delete the agents

**Files:**
- Delete: `.claude/agents/program.md`, `.claude/agents/review.md`, `.claude/agents/archiver.md`, `.claude/agents/coach.md`

- [ ] **Step 1: Check the state before**

Run: `ls .claude/agents/`
Expected: the 4 files present.

- [ ] **Step 2: Delete the 4 agents**

```bash
git rm .claude/agents/program.md .claude/agents/review.md .claude/agents/archiver.md .claude/agents/coach.md
```

- [ ] **Step 3: Verify absence + that no reference remains**

Run: `ls .claude/agents/ 2>/dev/null; grep -rl "Program agent\|Review agent\|Archiver agent\|Coach agent" .claude README.md 2>/dev/null | grep -v docs/superpowers || echo "no reference"`
Expected: empty (or absent) directory; no reference outside `docs/superpowers/` (historical specs/plans are OK). References in `program-structure/SKILL.md` and `README.md` will be fixed in tasks 11-12.

- [ ] **Step 4: Run the test suite (unchanged)**

Run: `cd tools && node --test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor: remove the 4 agents (replaced by the workflow skills)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Fix the drift in `program-structure`

**Files:**
- Modify: `skills/program-structure/SKILL.md`

- [ ] **Step 1: Replace the tree (`.md`→`.yaml`)**

In `skills/program-structure/SKILL.md`, replace the tree block (between the ``` ```) with:

```
templates/                          ← reference templates (do not modify)
├── status.yaml
├── goals.yaml
├── macrocycle.yaml
├── sessions.yaml
├── review.md                       ← reviews: Markdown (free text)
└── summary.md
programs/
├── archives/                       ← completed programs (status: archived)
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

- [ ] **Step 2: Rewrite the status section (states + gate)**

Replace the section `## File status.md — Real-time status` with:

```markdown
## File `status.yaml` — Real-time status

Each program contains a `status.yaml` at the root of its directory. It is the
**first file to read**. `status` field: `active | paused | completed | archived`.

The `src/state.mjs` script reads this file (+ the directory tree) to compute the
workflow state and decide which skills are usable:

| State | `status` | Usable skills |
|-------|----------|---------------|
| `no_program` | no program outside archives | `create-program`, `coach` |
| `in_progress` | `active` | `track`, `review-mesocycle`, `create-mesocycle`*, `coach` |
| `paused` | `paused` | `track`, `review-mesocycle`, `coach` |
| `completed` | `completed` | `archive-program`, `coach` |

\* conditional: current block reviewed, next block planned and not yet created.

**Rule**: each workflow skill runs `node scripts/state.mjs .` as its first action
and refuses if it is not allowed.
```

- [ ] **Step 3: Update file and agent references**

Throughout the file: replace `goals.md`→`goals.yaml`, `macrocycle.md`→`macrocycle.yaml`,
`sessions.md`→`sessions.yaml`, `status.md`→`status.yaml` (leave `review.md`, `summary.md`).
Replace the "Created by" table of the templates to cite the **skills**
(`create-program`, `review-mesocycle`, `archive-program`) instead of the agents.
Replace mentions "files are always Markdown" with "structure in YAML,
reviews/summaries in Markdown".

- [ ] **Step 4: Verify that no `.md` structure ref remains**

Run: `grep -nE "status\.md|goals\.md|macrocycle\.md|sessions\.md|(Program|Review|Archiver|Coach) agent" skills/program-structure/SKILL.md || echo "OK: no obsolete ref"`
Expected: `OK: no obsolete ref`.

- [ ] **Step 5: Commit**

```bash
git add skills/program-structure/SKILL.md
git commit -m "docs(skills): program-structure in YAML + workflow states/gate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Rewrite the README workflow

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the "2. The agents" section with "2. The skills"**

Replace the title and the table with:

```markdown
## 2. The workflow skills

A program's life cycle is driven by 6 skills, one per step. Each skill
runs `node scripts/state.mjs .` as its first action; the script computes the current state
and **refuses** a step out of sequence.

| Skill | Step | Available when |
|-------|------|----------------|
| `create-program` | New program (1st mesocycle) | no active program |
| `create-mesocycle` | Next block of sessions | active program + current block reviewed |
| `track` | Update status + loads/measurements | active or paused program |
| `review-mesocycle` | Review of a mesocycle | program active/paused/completed |
| `archive-program` | Final summary + archiving | completed program (`completed`) |
| `coach` | Read-only Q&A | always |

`node scripts/state.mjs .` run alone answers "where am I" (JSON: state + allowed skills).
The **knowledge** skills (biomechanics, principles, programming, `*-training`) are still
consulted by the workflow skills.
```

- [ ] **Step 2: Update the Mermaid diagram (skills, not agents) and the pipeline**

In the section "4. The complete workflow", replace the `Agent: X` labels with the skill
names (`create-program`, `review-mesocycle`, etc.) and add the gate node
`node scripts/state.mjs .` upstream of each write step.

- [ ] **Step 3: Update the section "7. Quick start"**

Replace the agent invocations with the skills and add the gate:

```text
1. /create-program    → asks its questions then generates the directory (if no active program)
2. node scripts/state.mjs .   ← "where am I" + possible steps
3. /track             → keep status.yaml up to date, log loads/measurements
4. /review-mesocycle  → review of a block
5. /create-mesocycle  → next block (after review)
6. /archive-program   → close-out + archives/
```

- [ ] **Step 4: Verify that no mention of an agent remains**

Run: `grep -niE "\bagent(s)?\b" README.md || echo "OK: no more agent mention"`
Expected: `OK: no more agent mention` (otherwise, fix the remaining occurrences).

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs(readme): workflow driven by the skills + state.mjs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (done)

**Spec coverage:**
- 3-layer architecture → Tasks 1-3 (script), 4-9 (skills), 11 (knowledge unchanged, documented). ✅
- State machine + 5 states → Task 1 (detection) + Task 2 (gate), tests case by case. ✅
- Fine-grained preconditions (create-mesocycle, review, archive, create-program) → Task 2 tests + impl. ✅
- `state.mjs` script JSON contract + exported functions → Tasks 1-3. ✅
- 6 skills, gate skeleton + final validation → Tasks 4-9. ✅
- Migration (agent deletion, drift fix, README) → Tasks 10-12. ✅
- Tests → `state.test.mjs` (Tasks 1-3), `skills.test.mjs` (Tasks 4-9). ✅
- Spec success criteria → covered (real state.mjs, gate, agents deleted, validate green, npm test green). ✅

**Placeholders:** none — complete code and markdown content in each step.

**Type consistency:** `detectState → ctx` consumed by `computeSkills(root, ctx)` then `main`; skill names identical across JSON, `SKILLS`, `skills/<name>/SKILL.md` files and `assertSkillGate`. ✅

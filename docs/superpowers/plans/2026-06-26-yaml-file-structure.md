# Structuring program files as YAML — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the structure files of strength-training programs (status, goals, macrocycle, sessions) to YAML validated by JSON Schema, with a Node.js validation script, keeping the reviews in Markdown.

**Architecture:** JSON Schema = source of truth for the structure (`schemas/`). Data in YAML, hand-editable. A Node script (`src/validate.mjs`, deps `ajv` + `ajv-formats` + `js-yaml`) globs the workspace `.yaml` files, picks the schema by file name, validates, and applies cross-validations that JSON Schema can't express (exercise slugs vs the shared catalog, existence of referenced review files). Full migration of the archived program `2026-01_upper-lower-recomposition`.

**Tech Stack:** Node.js (ESM), `ajv` ^8, `ajv-formats` ^3, `js-yaml` ^4, `node:test` (built-in runner), git.

> **Note:** the sample data below (loads, measurements, dates, notes) is illustrative. Keys carry no unit suffix; units come from `profile.units` in `profile.yaml`.

## Global Constraints

- Node ESM (`"type": "module"`), no build/transpile.
- Allowed dependencies: `ajv` ^8.17, `ajv-formats` ^3.0, `js-yaml` ^4.1. No other runtime dependency.
- Tests with the built-in `node:test` runner (`node --test`). No external test framework.
- Data in **YAML**; schemas in **JSON Schema draft 2020-12**.
- Dates in ISO format `YYYY-MM-DD` (JSON Schema format `date`).
- Exercise slugs and keys in `snake_case` (`^[a-z0-9_]+$`); goal `id`s in `kebab-case` (`^[a-z0-9-]+$`).
- Every file carries `meta.schema_version` = `1` (const).
- `src/validate.mjs` is **read-only** — no file mutation.
- A review's `ref` field = path **relative to the directory of the YAML file** containing it (resolved by `resolve(dirname(file), ref)`).
- Markdown review files are **never** modified or converted.

---

## File Structure

**Created:**
- `src/package.json` — declares deps + `validate` / `test` scripts.
- `src/.gitignore` — ignores `node_modules/`.
- `src/validate.mjs` — exported functions + CLI. Single responsibility: load/validate.
- `test/validate.test.mjs` — tests of the generic functions + cross-validation.
- `test/schemas.test.mjs` — tests of each schema (valid real file + invalid fixture).
- `schemas/{status,goals,macrocycle,sessions,exercises}.schema.json` — one schema per type.
- `catalog/exercises.yaml` — shared catalog (workspace root).
- `programs/2026-01_upper-lower-recomposition/{status,goals,macrocycle}.yaml`.
- `programs/2026-01_upper-lower-recomposition/mesocycle-{1,2,3}/sessions.yaml`.
- `templates/{status,goals,macrocycle,sessions}.yaml` — minimal valid examples.

**Deleted at the end of the plan (Task 9):**
- `programs/2026-01_.../{status,goals,macrocycle}.md`
- `programs/2026-01_.../mesocycle-{1,2,3}/sessions.md`
- `templates/{goals,macrocycle,sessions}.md`

**Preserved (Markdown):**
- `programs/2026-01_.../mesocycle-{1,2,3}/review.md`
- `templates/review.md`, `templates/summary.md`
- `docs/superpowers/specs/2026-06-26-yaml-file-structure-design.md`

**Interfaces exported by `src/validate.mjs` (used by all tests):**
```
SCHEMA_BY_FILENAME : Record<string,string>            // 'status.yaml' -> 'status.schema.json'
loadYaml(filePath: string) : object                   // parse YAML, throw on error
buildValidators(schemasDir: string) : Record<string, AjvValidateFn>   // key = yaml file name
collectYamlFiles(rootDir: string) : string[]          // absolute paths, excludes node_modules / .dotdirs / schemas
validateDoc(validators, fileName: string, doc: object) : string[]     // [] = valid
crossValidate(docs: {path,fileName,data}[]) : string[]                // [] = valid
```

---

### Task 1: Init repo + scaffold Node tooling

**Files:**
- Create: `src/package.json`, `src/.gitignore`, `src/validate.mjs`, `test/validate.test.mjs`
- Create: `.gitignore` (root)

**Interfaces:**
- Consumes: nothing.
- Produces: `loadYaml`, `collectYamlFiles`, `buildValidators`, `validateDoc`, `SCHEMA_BY_FILENAME`, and `crossValidate` (stub returning `[]` — real body in Task 7). CLI `main()`.

- [ ] **Step 1: Init git + baseline commit**

```bash
cd <workspace>
git init
printf 'src/node_modules/\n' > .gitignore
git add -A
git commit -m "chore: baseline before YAML structuring (existing markdown + spec)"
```

- [ ] **Step 2: Create `src/package.json`**

```json
{
  "name": "workout-tools",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "validate": "node validate.mjs ..",
    "test": "node --test"
  },
  "dependencies": {
    "ajv": "^8.17.1",
    "ajv-formats": "^3.0.1",
    "js-yaml": "^4.1.0"
  }
}
```

- [ ] **Step 3: Create `src/.gitignore`**

```
node_modules/
```

- [ ] **Step 4: Install dependencies**

Run: `cd <workspace>/tools && npm install`
Expected: `node_modules/` created, `package-lock.json` generated, exit 0.

- [ ] **Step 5: Create `src/validate.mjs`**

```js
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import Ajv from 'ajv/dist/2020.js'; // draft 2020-12 build (the schemas declare this dialect)
import addFormats from 'ajv-formats';

export const SCHEMA_BY_FILENAME = {
  'status.yaml': 'status.schema.json',
  'goals.yaml': 'goals.schema.json',
  'macrocycle.yaml': 'macrocycle.schema.json',
  'sessions.yaml': 'sessions.schema.json',
  'catalog/exercises.yaml': 'exercises.schema.json',
};

export function loadYaml(filePath) {
  // JSON_SCHEMA: stops js-yaml from converting unquoted ISO dates into Date objects
  // (the AJV "date" format requires strings).
  return yaml.load(readFileSync(filePath, 'utf8'), { schema: yaml.JSON_SCHEMA });
}

export function buildValidators(schemasDir) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validators = {};
  for (const [yamlName, schemaFile] of Object.entries(SCHEMA_BY_FILENAME)) {
    const schemaPath = join(schemasDir, schemaFile);
    if (!existsSync(schemaPath)) continue;
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    validators[yamlName] = ajv.compile(schema);
  }
  return validators;
}

export function collectYamlFiles(rootDir) {
  const out = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'schemas' || entry.startsWith('.')) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.yaml') || entry.endsWith('.yml')) out.push(full);
    }
  })(rootDir);
  return out;
}

export function validateDoc(validators, fileName, doc) {
  const validate = validators[fileName];
  if (!validate) return [];
  if (validate(doc)) return [];
  return validate.errors.map((e) => `${e.instancePath || '/'} ${e.message}`);
}

// Real body implemented in Task 7.
export function crossValidate(docs) {
  return [];
}

export function main(root) {
  const schemasDir = join(root, 'schemas');
  const validators = buildValidators(schemasDir);
  const files = collectYamlFiles(root);
  const docs = [];
  let errorCount = 0;
  for (const f of files) {
    const name = basename(f);
    let data;
    try {
      data = loadYaml(f);
    } catch (e) {
      console.error(`✗ ${relative(root, f)}: YAML parse error — ${e.message}`);
      errorCount++;
      continue;
    }
    const errs = validateDoc(validators, name, data);
    for (const e of errs) console.error(`✗ ${relative(root, f)}: ${e}`);
    errorCount += errs.length;
    if (SCHEMA_BY_FILENAME[name]) docs.push({ path: f, fileName: name, data });
  }
  const crossErrs = crossValidate(docs);
  for (const e of crossErrs) console.error(`✗ ${e}`);
  errorCount += crossErrs.length;
  if (errorCount === 0) {
    console.log(`✓ ${docs.length} valid file(s)`);
    return 0;
  }
  console.error(`\n${errorCount} error(s)`);
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(resolve(process.argv[2] || '.')));
}
```

- [ ] **Step 6: Write the failing test `test/validate.test.mjs`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadYaml, collectYamlFiles, validateDoc } from '../validate.mjs';

test('loadYaml parses a YAML document', () => {
  const dir = mkdtempSync(join(tmpdir(), 'workout-'));
  const f = join(dir, 'x.yaml');
  writeFileSync(f, 'a: 1\nb: [2, 3]\n');
  assert.deepEqual(loadYaml(f), { a: 1, b: [2, 3] });
});

test('collectYamlFiles finds .yaml files and ignores node_modules', () => {
  const dir = mkdtempSync(join(tmpdir(), 'workout-'));
  writeFileSync(join(dir, 'a.yaml'), 'k: 1\n');
  mkdirSync(join(dir, 'node_modules'));
  writeFileSync(join(dir, 'node_modules', 'b.yaml'), 'k: 1\n');
  const found = collectYamlFiles(dir).map((p) => p.split('/').pop());
  assert.deepEqual(found, ['a.yaml']);
});

test('validateDoc with no schema loaded returns [] (skip)', () => {
  assert.deepEqual(validateDoc({}, 'unknown.yaml', { x: 1 }), []);
});
```

- [ ] **Step 7: Run tests**

Run: `cd <workspace>/tools && npm test`
Expected: 3 tests PASS.

- [ ] **Step 8: Run the validator on the workspace**

Run: `cd <workspace>/tools && npm run validate`
Expected: `✓ 0 valid file(s)`, exit 0 (no `.yaml` present yet).

- [ ] **Step 9: Commit**

```bash
cd <workspace>
git add tools .gitignore
git commit -m "feat(tools): scaffold Node YAML validator (ajv + js-yaml)"
```

---

### Task 2: Schema + `catalog/exercises.yaml` catalog

**Files:**
- Create: `schemas/exercises.schema.json`, `catalog/exercises.yaml`
- Test: `test/schemas.test.mjs`

**Interfaces:**
- Consumes: `buildValidators`, `validateDoc`, `loadYaml`.
- Produces: catalog with slugs consumed by Task 4 (loads) and Task 6 (sessions).

- [ ] **Step 1: Write the failing test (create `test/schemas.test.mjs`)**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { buildValidators, validateDoc, loadYaml } from '../validate.mjs';

const ROOT = join(import.meta.dirname, '..', '..');
const SCHEMAS = join(ROOT, 'schemas');
const validators = buildValidators(SCHEMAS);

test('exercises: real catalog valid', () => {
  const doc = loadYaml(join(ROOT, 'catalog/exercises.yaml'));
  assert.deepEqual(validateDoc(validators, 'catalog/exercises.yaml', doc), []);
});

test('exercises: invalid slug (uppercase) rejected', () => {
  const bad = { meta: { schema_version: 1 }, equipment: ['x'],
    exercises: [{ slug: 'Bad Slug', name: 'X', muscle_groups: ['back'] }] };
  assert.ok(validateDoc(validators, 'catalog/exercises.yaml', bad).length > 0);
});

test('exercises: muscle group outside vocabulary rejected', () => {
  const bad = { meta: { schema_version: 1 }, equipment: ['x'],
    exercises: [{ slug: 'ok', name: 'X', muscle_groups: ['nonexistent'] }] };
  assert.ok(validateDoc(validators, 'catalog/exercises.yaml', bad).length > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd <workspace>/tools && node --test test/schemas.test.mjs`
Expected: the 2 "rejected" tests fail (no schema → `validateDoc` returns `[]`), the "valid" test fails too (`catalog/exercises.yaml` missing → read error).

- [ ] **Step 3: Create `schemas/exercises.schema.json`**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "exercises.schema.json",
  "title": "Exercise catalog",
  "type": "object",
  "additionalProperties": false,
  "required": ["meta", "equipment", "exercises"],
  "properties": {
    "meta": {
      "type": "object",
      "required": ["schema_version"],
      "properties": { "schema_version": { "const": 1 } }
    },
    "equipment": { "type": "array", "items": { "type": "string" }, "uniqueItems": true },
    "exercises": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["slug", "name", "muscle_groups"],
        "properties": {
          "slug": { "type": "string", "pattern": "^[a-z0-9_]+$" },
          "name": { "type": "string" },
          "equipment": { "type": ["string", "null"] },
          "muscle_groups": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/muscle_group" } }
        }
      }
    }
  },
  "$defs": {
    "muscle_group": {
      "enum": ["chest", "back", "shoulders", "biceps", "triceps", "quadriceps",
        "hamstrings", "glutes", "calves", "abs", "core", "rear_delts"]
    }
  }
}
```

- [ ] **Step 4: Create `catalog/exercises.yaml`**

```yaml
meta:
  schema_version: 1
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
  - dumbbells
exercises:
  - { slug: chest_press_machine, name: "Chest Press machine", equipment: chest_press, muscle_groups: [chest] }
  - { slug: lat_pulldown, name: "Lat pulldown (Lat Machine)", equipment: lat_machine, muscle_groups: [back] }
  - { slug: seated_row, name: "Seated row (Low Row)", equipment: low_row, muscle_groups: [back] }
  - { slug: shoulder_press_machine, name: "Shoulder press machine", equipment: shoulder_press, muscle_groups: [shoulders] }
  - { slug: cable_biceps_curl, name: "Cable biceps curl", equipment: dual_adjustable_pulley, muscle_groups: [biceps] }
  - { slug: cable_triceps_pushdown, name: "Cable triceps pushdown", equipment: dual_adjustable_pulley, muscle_groups: [triceps] }
  - { slug: dumbbell_squat, name: "Squat (dumbbell)", equipment: dumbbells, muscle_groups: [quadriceps, glutes] }
  - { slug: cable_squat, name: "Cable squat", equipment: dual_adjustable_pulley, muscle_groups: [quadriceps, glutes] }
  - { slug: leg_press, name: "Leg press", equipment: leg_press, muscle_groups: [quadriceps, glutes] }
  - { slug: single_leg_press, name: "Single-leg press", equipment: leg_press, muscle_groups: [quadriceps, glutes] }
  - { slug: leg_extension, name: "Quadriceps machine (Leg Extension)", equipment: leg_extension, muscle_groups: [quadriceps] }
  - { slug: cable_crunch, name: "Cable crunch", equipment: dual_adjustable_pulley, muscle_groups: [abs] }
  - { slug: plank, name: "Plank", equipment: null, muscle_groups: [core] }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd <workspace>/tools && node --test test/schemas.test.mjs`
Expected: the 3 `exercises:*` tests PASS.

- [ ] **Step 6: Commit**

```bash
cd <workspace>
git add schemas/exercises.schema.json catalog/exercises.yaml test/schemas.test.mjs
git commit -m "feat(schema): exercise catalog + validation"
```

---

### Task 3: Schema + `status.yaml` migration

**Files:**
- Create: `schemas/status.schema.json`, `programs/2026-01_upper-lower-recomposition/status.yaml`
- Test: `test/schemas.test.mjs` (append)

**Interfaces:**
- Consumes: `buildValidators`, `validateDoc`, `loadYaml`.
- Produces: validated `status.yaml` (status `archived`).

- [ ] **Step 1: Append tests to `test/schemas.test.mjs`**

```js
const PROG = join(ROOT, 'programs', '2026-01_upper-lower-recomposition');

test('status: migrated file valid', () => {
  const doc = loadYaml(join(PROG, 'status.yaml'));
  assert.deepEqual(validateDoc(validators, 'status.yaml', doc), []);
});

test('status: unknown enum value rejected', () => {
  const bad = { meta: { schema_version: 1 }, program: 'x', status: 'bogus', start_date: '2026-01-19' };
  assert.ok(validateDoc(validators, 'status.yaml', bad).length > 0);
});

test('status: malformed date rejected', () => {
  const bad = { meta: { schema_version: 1 }, program: 'x', status: 'active', start_date: '19/01/2026' };
  assert.ok(validateDoc(validators, 'status.yaml', bad).length > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd <workspace>/tools && node --test test/schemas.test.mjs`
Expected: the 3 new `status:*` tests fail (schema + file missing).

- [ ] **Step 3: Create `schemas/status.schema.json`**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "status.schema.json",
  "title": "Program status",
  "type": "object",
  "additionalProperties": false,
  "required": ["meta", "program", "status", "start_date"],
  "properties": {
    "meta": {
      "type": "object",
      "required": ["schema_version"],
      "properties": { "schema_version": { "const": 1 } }
    },
    "program": { "type": "string" },
    "status": { "enum": ["active", "paused", "archived", "completed"] },
    "current_mesocycle": { "type": ["integer", "null"], "minimum": 1 },
    "current_week": { "type": ["integer", "null"], "minimum": 1 },
    "start_date": { "type": "string", "format": "date" },
    "end_date": { "type": ["string", "null"], "format": "date" },
    "last_session": { "type": ["string", "null"], "format": "date" },
    "next_session": { "type": ["string", "null"], "format": "date" },
    "pauses": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["start", "end"],
        "properties": {
          "start": { "type": "string", "format": "date" },
          "end": { "type": "string", "format": "date" },
          "reason": { "type": ["string", "null"] }
        }
      }
    },
    "notes": { "type": "array", "items": { "type": "string" } }
  }
}
```

- [ ] **Step 4: Create `programs/2026-01_upper-lower-recomposition/status.yaml`**

```yaml
meta:
  schema_version: 1
program: 2026-01_upper-lower-recomposition
status: archived
current_mesocycle: 3
current_week: 12
start_date: 2026-01-19
end_date: 2026-04-10
last_session: 2026-04-10
next_session: null
pauses:
  - start: 2026-04-11
    end: 2026-04-13
    reason: "3 days without gym access"
notes:
  - "Original M3 program executed — see mesocycle-3/sessions.yaml"
  - "Critical analysis and review in mesocycle-3/review.md"
  - "No deload planned in the macrocycle — the 3-day pause partly compensated"
  - "Recommendation for the next macrocycle: 2 mesocycles of 2 months (mechanical → metabolic → overreaching → deload)"
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd <workspace>/tools && node --test test/schemas.test.mjs`
Expected: `status:*` tests PASS.

- [ ] **Step 6: Commit**

```bash
cd <workspace>
git add schemas/status.schema.json programs/2026-01_upper-lower-recomposition/status.yaml test/schemas.test.mjs
git commit -m "feat(schema): status + migration of the 2026-01 program"
```

---

### Task 4: Schema + `goals.yaml` migration

**Files:**
- Create: `schemas/goals.schema.json`, `programs/2026-01_upper-lower-recomposition/goals.yaml`
- Test: `test/schemas.test.mjs` (append)

**Interfaces:**
- Consumes: `buildValidators`, `validateDoc`, `loadYaml`. `reference_loads` slugs checked against the catalog in Task 7.
- Produces: measurement vocabulary (`$defs/measureKey`) reused by the future display.

- [ ] **Step 1: Append tests to `test/schemas.test.mjs`**

```js
test('goals: migrated file valid', () => {
  const doc = loadYaml(join(PROG, 'goals.yaml'));
  assert.deepEqual(validateDoc(validators, 'goals.yaml', doc), []);
});

test('goals: measurement key outside vocabulary rejected', () => {
  const bad = { meta: { schema_version: 1 }, goals: [],
    measurements: [{ date: '2026-01-19', values: { unknown_size: 80 } }] };
  assert.ok(validateDoc(validators, 'goals.yaml', bad).length > 0);
});

test('goals: non-numeric measurement value rejected', () => {
  const bad = { meta: { schema_version: 1 }, goals: [],
    measurements: [{ date: '2026-01-19', values: { body_weight: 'heavy' } }] };
  assert.ok(validateDoc(validators, 'goals.yaml', bad).length > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd <workspace>/tools && node --test test/schemas.test.mjs`
Expected: `goals:*` tests fail.

- [ ] **Step 3: Create `schemas/goals.schema.json`**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "goals.schema.json",
  "title": "Goals and measurements",
  "type": "object",
  "additionalProperties": false,
  "required": ["meta", "goals", "measurements"],
  "properties": {
    "meta": {
      "type": "object",
      "required": ["schema_version"],
      "properties": { "schema_version": { "const": 1 } }
    },
    "goals": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "priority", "description", "tracked_measures"],
        "properties": {
          "id": { "type": "string", "pattern": "^[a-z0-9-]+$" },
          "priority": { "type": "integer", "minimum": 1 },
          "description": { "type": "string" },
          "tracked_measures": { "type": "array", "items": { "$ref": "#/$defs/measureKey" } },
          "deadline": { "type": ["string", "null"], "format": "date" }
        }
      }
    },
    "measurements": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["date", "values"],
        "properties": {
          "date": { "type": "string", "format": "date" },
          "context": { "type": ["string", "null"] },
          "values": {
            "type": "object",
            "minProperties": 1,
            "propertyNames": { "$ref": "#/$defs/measureKey" },
            "additionalProperties": { "type": "number" }
          },
          "notes": { "type": ["string", "null"] }
        }
      }
    },
    "reference_loads": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["date", "exercise", "load", "reps"],
        "properties": {
          "date": { "type": "string", "format": "date" },
          "exercise": { "type": "string", "pattern": "^[a-z0-9_]+$" },
          "load": { "type": ["number", "null"] },
          "reps": { "type": ["integer", "string"] }
        }
      }
    }
  },
  "$defs": {
    "measureKey": {
      "enum": ["arm_right_relaxed", "arm_left_relaxed",
        "arm_right_flexed", "arm_left_flexed",
        "chest", "waist", "hips", "neck", "shoulders",
        "thigh_right", "thigh_left",
        "calf_right", "calf_left", "body_weight"]
    }
  }
}
```

- [ ] **Step 4: Create `programs/2026-01_upper-lower-recomposition/goals.yaml`**

```yaml
meta:
  schema_version: 1
goals:
  - id: upper-body-muscle-gain
    priority: 1
    description: "Upper-body muscle gain (chest, arms, shoulders)"
    tracked_measures: [arm_right_relaxed, arm_left_relaxed, chest]
    deadline: 2026-05-31
  - id: abdominal-fat-loss
    priority: 2
    description: "Abdominal fat loss"
    tracked_measures: [waist]
    deadline: 2026-05-31
measurements:
  - date: 2026-01-19
    context: "baseline"
    values:
      arm_right_relaxed: 32
      arm_left_relaxed: 32
      waist: 75
      body_weight: 72
    notes: "Chest and thighs not measured at baseline"
  - date: 2026-03-15
    context: "end of M1 (approximate date)"
    values:
      arm_right_relaxed: 34
      arm_left_relaxed: 34
      chest: 100
      waist: 74
      body_weight: 73
    notes: null
reference_loads:
  - { date: 2026-01-19, exercise: chest_press_machine, load: 50, reps: 12 }
  - { date: 2026-01-19, exercise: cable_biceps_curl, load: 20, reps: 10 }
  - { date: 2026-01-19, exercise: lat_pulldown, load: 50, reps: 12 }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd <workspace>/tools && node --test test/schemas.test.mjs`
Expected: `goals:*` tests PASS.

- [ ] **Step 6: Commit**

```bash
cd <workspace>
git add schemas/goals.schema.json programs/2026-01_upper-lower-recomposition/goals.yaml test/schemas.test.mjs
git commit -m "feat(schema): goals + measurements + migration of the 2026-01 program"
```

---

### Task 5: Schema + `macrocycle.yaml` migration

**Files:**
- Create: `schemas/macrocycle.schema.json`, `programs/2026-01_upper-lower-recomposition/macrocycle.yaml`
- Test: `test/schemas.test.mjs` (append)

**Interfaces:**
- Consumes: `buildValidators`, `validateDoc`, `loadYaml`.
- Produces: `$defs/versionedMeta` (conceptually reused by sessions), `$defs/day`, `$defs/muscle_group`. Review `ref` `mesocycle-3/review.md` checked in Task 7.

- [ ] **Step 1: Append tests to `test/schemas.test.mjs`**

```js
test('macrocycle: migrated file valid', () => {
  const doc = loadYaml(join(PROG, 'macrocycle.yaml'));
  assert.deepEqual(validateDoc(validators, 'macrocycle.yaml', doc), []);
});

test('macrocycle: split outside enum rejected', () => {
  const doc = loadYaml(join(PROG, 'macrocycle.yaml'));
  doc.split = 'crossfit';
  assert.ok(validateDoc(validators, 'macrocycle.yaml', doc).length > 0);
});

test('macrocycle: meta without version rejected', () => {
  const doc = loadYaml(join(PROG, 'macrocycle.yaml'));
  delete doc.meta.version;
  assert.ok(validateDoc(validators, 'macrocycle.yaml', doc).length > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd <workspace>/tools && node --test test/schemas.test.mjs`
Expected: `macrocycle:*` tests fail.

- [ ] **Step 3: Create `schemas/macrocycle.schema.json`**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "macrocycle.schema.json",
  "title": "Macrocycle",
  "type": "object",
  "additionalProperties": false,
  "required": ["meta", "name", "start_date", "end_date", "frequency", "split", "mesocycles", "weekly_split"],
  "properties": {
    "meta": { "$ref": "#/$defs/versionedMeta" },
    "name": { "type": "string" },
    "start_date": { "type": "string", "format": "date" },
    "end_date": { "type": "string", "format": "date" },
    "frequency": { "type": "string" },
    "split": { "enum": ["upper_lower", "full_body", "ppl", "other"] },
    "mesocycles": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["number", "name", "weeks", "dates", "goal", "parameters"],
        "properties": {
          "number": { "type": "integer", "minimum": 1 },
          "name": { "type": "string" },
          "weeks": { "$ref": "#/$defs/intRange" },
          "dates": { "$ref": "#/$defs/dateRange" },
          "goal": { "type": "string" },
          "parameters": {
            "type": "object",
            "additionalProperties": false,
            "required": ["sets", "reps", "rest_s", "intensity_pct_1rm", "technique"],
            "properties": {
              "sets": { "type": "string" },
              "reps": { "type": "string" },
              "rest_s": { "type": "string" },
              "intensity_pct_1rm": { "type": "string" },
              "technique": { "type": "string" }
            }
          }
        }
      }
    },
    "weekly_split": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["day", "session"],
        "properties": {
          "day": { "$ref": "#/$defs/day" },
          "session": { "type": "string" },
          "muscle_groups": { "type": "array", "items": { "$ref": "#/$defs/muscle_group" } }
        }
      }
    },
    "cardio": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["type", "duration_min"],
        "properties": {
          "type": { "type": "string" },
          "duration_min": { "type": "string" },
          "frequency": { "type": ["string", "null"] },
          "notes": { "type": ["string", "null"] }
        }
      }
    }
  },
  "$defs": {
    "versionedMeta": {
      "type": "object",
      "additionalProperties": false,
      "required": ["schema_version", "version", "last_modified"],
      "properties": {
        "schema_version": { "const": 1 },
        "version": { "type": "integer", "minimum": 1 },
        "last_modified": { "type": "string", "format": "date" },
        "revisions": { "$ref": "#/$defs/revisions" }
      }
    },
    "revisions": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["ref", "date", "summary"],
        "properties": {
          "ref": { "type": "string" },
          "date": { "type": "string", "format": "date" },
          "summary": { "type": "string" }
        }
      }
    },
    "intRange": {
      "type": "object",
      "additionalProperties": false,
      "required": ["start", "end"],
      "properties": { "start": { "type": "integer" }, "end": { "type": "integer" } }
    },
    "dateRange": {
      "type": "object",
      "additionalProperties": false,
      "required": ["start", "end"],
      "properties": { "start": { "type": "string", "format": "date" }, "end": { "type": "string", "format": "date" } }
    },
    "day": { "enum": ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] },
    "muscle_group": {
      "enum": ["chest", "back", "shoulders", "biceps", "triceps", "quadriceps",
        "hamstrings", "glutes", "calves", "abs", "core", "rear_delts"]
    }
  }
}
```

- [ ] **Step 4: Create `programs/2026-01_upper-lower-recomposition/macrocycle.yaml`**

```yaml
meta:
  schema_version: 1
  version: 1
  last_modified: 2026-04-11
  revisions:
    - ref: "mesocycle-3/review.md"
      date: 2026-04-11
      summary: "Recommendations: add a deload, 8-week mesocycles for the next macrocycle"
name: "Upper/Lower Recomposition"
start_date: 2026-01-19
end_date: 2026-05-10
frequency: "4-5 sessions/week (Mon, Tue, Thu, Fri + optional Sat)"
split: upper_lower
mesocycles:
  - number: 1
    name: "Volume / Hypertrophy"
    weeks: { start: 1, end: 4 }
    dates: { start: 2026-01-19, end: 2026-02-15 }
    goal: "Volume / Hypertrophy (70-75% 1RM, 12 reps, 3 sets)"
    parameters:
      sets: "3"
      reps: "10-15"
      rest_s: "60-120"
      intensity_pct_1rm: "70-75"
      technique: "Controlled execution, no imposed tempo"
  - number: 2
    name: "Strength / Thickness"
    weeks: { start: 5, end: 8 }
    dates: { start: 2026-03-16, end: 2026-04-12 }
    goal: "Strength / Thickness (antagonist supersets, tempo 2-1-1-0, 8 reps)"
    parameters:
      sets: "3-4"
      reps: "6-10"
      rest_s: "60-90"
      intensity_pct_1rm: "80-85"
      technique: "Tempo 2-1-1-0 on main exercises, antagonist supersets"
  - number: 3
    name: "Density / Pump / Fat loss"
    weeks: { start: 9, end: 12 }
    dates: { start: 2026-04-13, end: 2026-05-10 }
    goal: "Density / Pump / Fat loss (short rests, high reps, 60-75% 1RM)"
    parameters:
      sets: "3"
      reps: "10-15"
      rest_s: "45-60"
      intensity_pct_1rm: "60-75"
      technique: "Supersets, reduced rest times, optional circuit training"
weekly_split:
  - { day: monday, session: "Upper body A", muscle_groups: [chest, back] }
  - { day: tuesday, session: "Lower body A", muscle_groups: [quadriceps, glutes, core] }
  - { day: wednesday, session: "Rest / Cardio" }
  - { day: thursday, session: "Upper body B", muscle_groups: [shoulders, back, biceps, triceps] }
  - { day: friday, session: "Lower body B", muscle_groups: [hamstrings, calves] }
  - { day: saturday, session: "Full Body (optional)" }
cardio:
  - { type: bike, duration_min: "20-30", frequency: "Post-session or dedicated day", notes: "Intervals 30s fast / 90s easy from M2" }
  - { type: incline_walk, duration_min: "10-15", frequency: "Post-bike", notes: "15° incline, 4-5 km/h" }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd <workspace>/tools && node --test test/schemas.test.mjs`
Expected: `macrocycle:*` tests PASS.

- [ ] **Step 6: Commit**

```bash
cd <workspace>
git add schemas/macrocycle.schema.json programs/2026-01_upper-lower-recomposition/macrocycle.yaml test/schemas.test.mjs
git commit -m "feat(schema): macrocycle + migration of the 2026-01 program"
```

---

### Task 6: Schema + migration of the 3 `sessions.yaml`

**Files:**
- Create: `schemas/sessions.schema.json`
- Create: `programs/2026-01_upper-lower-recomposition/mesocycle-{1,2,3}/sessions.yaml`
- Test: `test/schemas.test.mjs` (append)

**Interfaces:**
- Consumes: `buildValidators`, `validateDoc`, `loadYaml`. `exercise` slugs and review `ref`s checked in Task 7.
- Produces: 3 validated session files.

- [ ] **Step 1: Append tests to `test/schemas.test.mjs`**

```js
for (const m of [1, 2, 3]) {
  test(`sessions: mesocycle-${m} migrated valid`, () => {
    const doc = loadYaml(join(PROG, `mesocycle-${m}`, 'sessions.yaml'));
    assert.deepEqual(validateDoc(validators, 'sessions.yaml', doc), []);
  });
}

test('sessions: circuit format without circuit object rejected', () => {
  const bad = { meta: { schema_version: 1, version: 1, mesocycle: 1, last_modified: '2026-01-19' },
    sessions: [{ id: 'C', name: 'X', days: ['saturday'], format: 'circuit',
      exercises: [{ order: 1, exercise: 'chest_press_machine', sets: 3, reps: '15' }] }] };
  assert.ok(validateDoc(validators, 'sessions.yaml', bad).length > 0);
});

test('sessions: standard format with circuit object rejected', () => {
  const bad = { meta: { schema_version: 1, version: 1, mesocycle: 1, last_modified: '2026-01-19' },
    sessions: [{ id: 'A', name: 'X', days: ['monday'], format: 'standard',
      circuit: { rounds: 3, rest_between_exercises_s: 0, rest_between_rounds_s: 120 },
      exercises: [{ order: 1, exercise: 'chest_press_machine', sets: 3, reps: '12' }] }] };
  assert.ok(validateDoc(validators, 'sessions.yaml', bad).length > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd <workspace>/tools && node --test test/schemas.test.mjs`
Expected: `sessions:*` tests fail.

- [ ] **Step 3: Create `schemas/sessions.schema.json`**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sessions.schema.json",
  "title": "Sessions of a mesocycle",
  "type": "object",
  "additionalProperties": false,
  "required": ["meta", "sessions"],
  "properties": {
    "meta": {
      "type": "object",
      "additionalProperties": false,
      "required": ["schema_version", "version", "mesocycle", "last_modified"],
      "properties": {
        "schema_version": { "const": 1 },
        "version": { "type": "integer", "minimum": 1 },
        "mesocycle": { "type": "integer", "minimum": 1 },
        "period": { "$ref": "#/$defs/dateRange" },
        "source": { "type": ["string", "null"] },
        "last_modified": { "type": "string", "format": "date" },
        "revisions": { "$ref": "#/$defs/revisions" }
      }
    },
    "sessions": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "name", "days", "format", "exercises"],
        "properties": {
          "id": { "type": "string" },
          "name": { "type": "string" },
          "days": { "type": "array", "items": { "$ref": "#/$defs/day" } },
          "format": { "enum": ["standard", "circuit"] },
          "circuit": {
            "type": "object",
            "additionalProperties": false,
            "required": ["rounds", "rest_between_exercises_s", "rest_between_rounds_s"],
            "properties": {
              "rounds": { "type": "integer", "minimum": 1 },
              "rest_between_exercises_s": { "type": "integer", "minimum": 0 },
              "rest_between_rounds_s": { "type": "integer", "minimum": 0 }
            }
          },
          "exercises": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["order", "exercise", "sets", "reps"],
              "properties": {
                "order": { "type": ["string", "integer"] },
                "superset": { "type": ["string", "null"] },
                "exercise": { "type": "string", "pattern": "^[a-z0-9_]+$" },
                "sets": { "type": "integer", "minimum": 1 },
                "reps": { "type": "string" },
                "rest_s": { "type": ["integer", "null"], "minimum": 0 },
                "target_load": { "type": ["number", "string", "null"] },
                "notes": { "type": ["string", "null"] }
              }
            }
          }
        },
        "allOf": [
          { "if": { "properties": { "format": { "const": "circuit" } } }, "then": { "required": ["circuit"] } },
          { "if": { "properties": { "format": { "const": "standard" } } }, "then": { "not": { "required": ["circuit"] } } }
        ]
      }
    },
    "cardio": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["type", "duration_min"],
        "properties": {
          "type": { "type": "string" },
          "duration_min": { "type": "string" },
          "intensity": { "type": ["string", "null"] },
          "notes": { "type": ["string", "null"] }
        }
      }
    }
  },
  "$defs": {
    "day": { "enum": ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] },
    "dateRange": {
      "type": "object",
      "additionalProperties": false,
      "required": ["start", "end"],
      "properties": { "start": { "type": "string", "format": "date" }, "end": { "type": "string", "format": "date" } }
    },
    "revisions": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["ref", "date", "summary"],
        "properties": {
          "ref": { "type": "string" },
          "date": { "type": "string", "format": "date" },
          "summary": { "type": "string" }
        }
      }
    }
  }
}
```

- [ ] **Step 4: Create `programs/2026-01_upper-lower-recomposition/mesocycle-1/sessions.yaml`**

```yaml
meta:
  schema_version: 1
  version: 1
  mesocycle: 1
  period: { start: 2026-01-19, end: 2026-02-15 }
  source: "duck.ai"
  last_modified: 2026-01-19
  revisions: []
sessions:
  - id: A
    name: "Upper body (Chest / Back / Arms)"
    days: [monday, thursday]
    format: standard
    exercises:
      - { order: 1, exercise: chest_press_machine, sets: 3, reps: "12", rest_s: 120, target_load: 50, notes: "70-75% 1RM" }
      - { order: 2, exercise: lat_pulldown, sets: 3, reps: "12", rest_s: 120, target_load: 50, notes: "70-75% 1RM" }
      - { order: 3, exercise: seated_row, sets: 3, reps: "12", rest_s: 120, target_load: 55, notes: "70-75% 1RM" }
      - { order: 4, exercise: shoulder_press_machine, sets: 3, reps: "12", rest_s: 120, target_load: 45, notes: "70-75% 1RM" }
      - { order: 5, exercise: cable_biceps_curl, sets: 3, reps: "10", rest_s: 60, target_load: 20, notes: "70-75% 1RM" }
      - { order: 6, exercise: cable_triceps_pushdown, sets: 3, reps: "10", rest_s: 60, target_load: 20, notes: "70-75% 1RM" }
  - id: B
    name: "Lower body (Quadriceps / Core)"
    days: [tuesday, friday]
    format: standard
    exercises:
      - { order: 1, exercise: dumbbell_squat, sets: 3, reps: "15", rest_s: 120, target_load: 8, notes: "Max load available (single dumbbell) — insufficient, corrected in M2" }
cardio:
  - { type: bike, duration_min: "20-30", intensity: null, notes: "Post-session" }
  - { type: incline_walk, duration_min: "10", intensity: "15° at 4-5 km/h", notes: "Cool-down" }
```

- [ ] **Step 5: Create `programs/2026-01_upper-lower-recomposition/mesocycle-2/sessions.yaml`**

```yaml
meta:
  schema_version: 1
  version: 1
  mesocycle: 2
  period: { start: 2026-03-16, end: 2026-04-12 }
  source: "Gemini"
  last_modified: 2026-03-16
  revisions: []
sessions:
  - id: A
    name: "Upper body (Chest / Back / Arms)"
    days: [monday, thursday]
    format: standard
    exercises:
      - { order: "A1", superset: "chest-back", exercise: chest_press_machine, sets: 4, reps: "8", rest_s: null, target_load: 55, notes: "Tempo 2-1-1-0" }
      - { order: "A2", superset: "chest-back", exercise: seated_row, sets: 4, reps: "8", rest_s: 90, target_load: 60, notes: "Tempo 2-1-1-0" }
      - { order: "B1", superset: "shoulders-back", exercise: shoulder_press_machine, sets: 4, reps: "10", rest_s: null, target_load: 40, notes: "Reduced load (shoulder weakness)" }
      - { order: "B2", superset: "shoulders-back", exercise: lat_pulldown, sets: 4, reps: "8", rest_s: 90, target_load: 60, notes: null }
      - { order: "C1", superset: "arms", exercise: cable_biceps_curl, sets: 3, reps: "8", rest_s: null, target_load: 25, notes: null }
      - { order: "C2", superset: "arms", exercise: cable_triceps_pushdown, sets: 3, reps: "8", rest_s: 60, target_load: 25, notes: null }
  - id: B
    name: "Lower body (Quadriceps / Core)"
    days: [tuesday, friday]
    format: standard
    exercises:
      - { order: "A", superset: null, exercise: cable_squat, sets: 4, reps: "12", rest_s: 90, target_load: 25, notes: "Tempo 3-2-1-0" }
      - { order: "B1", superset: "core", exercise: cable_crunch, sets: 4, reps: "8", rest_s: null, target_load: 30, notes: "Core" }
      - { order: "B2", superset: "core", exercise: plank, sets: 4, reps: "45s", rest_s: 60, target_load: null, notes: "Front or side plank, bodyweight" }
      - { order: "C", superset: null, exercise: leg_press, sets: 3, reps: "12", rest_s: 60, target_load: 120, notes: "Added during M2" }
      - { order: "D", superset: null, exercise: leg_extension, sets: 3, reps: "12", rest_s: 60, target_load: 55, notes: "Added during M2" }
  - id: C
    name: "Full Body (optional)"
    days: [saturday]
    format: standard
    exercises:
      - { order: 1, exercise: chest_press_machine, sets: 3, reps: "8", rest_s: 90, target_load: 55, notes: "Tempo 2-1-1-0" }
      - { order: 2, exercise: shoulder_press_machine, sets: 3, reps: "8", rest_s: 90, target_load: 40, notes: null }
      - { order: 3, exercise: lat_pulldown, sets: 3, reps: "8", rest_s: 90, target_load: 60, notes: null }
      - { order: 4, exercise: cable_biceps_curl, sets: 3, reps: "8", rest_s: 60, target_load: 25, notes: null }
      - { order: 5, exercise: cable_triceps_pushdown, sets: 3, reps: "8", rest_s: 60, target_load: 25, notes: null }
      - { order: 6, exercise: cable_squat, sets: 3, reps: "12", rest_s: 60, target_load: 25, notes: null }
      - { order: 7, exercise: cable_crunch, sets: 3, reps: "8", rest_s: 60, target_load: 30, notes: null }
cardio:
  - { type: bike, duration_min: "30", intensity: "Level 3, intervals 30s/90s", notes: null }
  - { type: incline_walk, duration_min: "15", intensity: "15° at 4 km/h", notes: "Cool-down" }
```

- [ ] **Step 6: Create `programs/2026-01_upper-lower-recomposition/mesocycle-3/sessions.yaml`**

```yaml
meta:
  schema_version: 1
  version: 1
  mesocycle: 3
  period: { start: 2026-04-13, end: 2026-05-10 }
  source: "Gemini"
  last_modified: 2026-04-11
  revisions:
    - { ref: "review.md", date: 2026-04-11, summary: "Critical analysis of M3 (regressing loads, volume, dips, rear delts)" }
sessions:
  - id: A
    name: "Upper body (Density & Pump)"
    days: [monday, thursday]
    format: standard
    exercises:
      - { order: "A1", superset: "chest-back", exercise: chest_press_machine, sets: 3, reps: "10-12", rest_s: null, target_load: 50, notes: "Fluid movement, no pause" }
      - { order: "A2", superset: "chest-back", exercise: seated_row, sets: 3, reps: "10-12", rest_s: 60, target_load: 55, notes: null }
      - { order: "B1", superset: "shoulders-back", exercise: shoulder_press_machine, sets: 3, reps: "12-15", rest_s: null, target_load: 35, notes: "Shoulder protection (more reps, less weight)" }
      - { order: "B2", superset: "shoulders-back", exercise: lat_pulldown, sets: 3, reps: "10-12", rest_s: 60, target_load: 55, notes: null }
      - { order: "C1", superset: "arms", exercise: cable_biceps_curl, sets: 3, reps: "12", rest_s: null, target_load: 20, notes: null }
      - { order: "C2", superset: "arms", exercise: cable_triceps_pushdown, sets: 3, reps: "12", rest_s: 45, target_load: 20, notes: null }
  - id: B
    name: "Lower body (Asymmetry correction & Core)"
    days: [tuesday, friday]
    format: standard
    exercises:
      - { order: "A", superset: null, exercise: single_leg_press, sets: 3, reps: "10-12 /leg", rest_s: 45, target_load: "50-60", notes: "Start with the weaker leg. Never more reps on the stronger side." }
      - { order: "B1", superset: "quad-core", exercise: leg_extension, sets: 3, reps: "12-15", rest_s: null, target_load: 45, notes: "It should burn!" }
      - { order: "B2", superset: "quad-core", exercise: cable_crunch, sets: 3, reps: "12-15", rest_s: 60, target_load: 30, notes: "Core" }
      - { order: "C1", superset: "finisher", exercise: cable_squat, sets: 3, reps: "15", rest_s: null, target_load: 25, notes: "Constant tempo, no pause" }
      - { order: "C2", superset: "finisher", exercise: plank, sets: 3, reps: "45-60s", rest_s: 45, target_load: null, notes: "Bodyweight" }
  - id: C
    name: "Full Body Circuit Training (optional)"
    days: [saturday]
    format: circuit
    circuit: { rounds: 3, rest_between_exercises_s: 0, rest_between_rounds_s: 120 }
    exercises:
      - { order: 1, exercise: chest_press_machine, sets: 3, reps: "15", target_load: null, notes: "Light, circuit" }
      - { order: 2, exercise: seated_row, sets: 3, reps: "15", target_load: null, notes: "Light, circuit" }
      - { order: 3, exercise: shoulder_press_machine, sets: 3, reps: "15", target_load: null, notes: "Light, circuit" }
      - { order: 4, exercise: cable_biceps_curl, sets: 3, reps: "15", target_load: null, notes: "Light, circuit" }
      - { order: 5, exercise: cable_triceps_pushdown, sets: 3, reps: "15", target_load: null, notes: "Light, circuit" }
      - { order: 6, exercise: cable_squat, sets: 3, reps: "15", target_load: null, notes: "Light, circuit" }
cardio:
  - { type: bike, duration_min: "20", intensity: "Intervals 30s fast / 90s easy", notes: "Fat-loss goal" }
  - { type: incline_walk, duration_min: "10", intensity: "15° at 5 km/h", notes: "Cool-down" }
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd <workspace>/tools && node --test test/schemas.test.mjs`
Expected: `sessions:*` tests (5) PASS.

- [ ] **Step 8: Commit**

```bash
cd <workspace>
git add schemas/sessions.schema.json programs/2026-01_upper-lower-recomposition/mesocycle-*/sessions.yaml test/schemas.test.mjs
git commit -m "feat(schema): sessions + migration of the 3 mesocycles (2026-01 program)"
```

---

### Task 7: Cross-validations

**Files:**
- Modify: `src/validate.mjs` (replace the `crossValidate` stub)
- Test: `test/validate.test.mjs` (append)

**Interfaces:**
- Consumes: `loadYaml`, `collectYamlFiles`, `SCHEMA_BY_FILENAME`, migrated files (Tasks 2-6).
- Produces: final `crossValidate(docs)`.

Rules checked:
1. Every `sessions[].exercises[].exercise` (slug) exists in the `catalog/exercises.yaml` catalog.
2. Every `reference_loads[].exercise` (slug) exists in the catalog.
3. Every non-`null` `exercises[].equipment` belongs to the catalog's `equipment` list.
4. Every `meta.revisions[].ref` points to an existing file (resolved relative to the YAML file's directory).

- [ ] **Step 1: Write the failing tests (append to `test/validate.test.mjs`)**

```js
import { crossValidate } from '../validate.mjs';

const cat = { path: '/ws/exercises.yaml', fileName: 'catalog/exercises.yaml',
  data: { meta: { schema_version: 1 }, equipment: ['leg_press'],
    exercises: [{ slug: 'leg_press', name: 'P', equipment: 'leg_press', muscle_groups: ['quadriceps'] }] } };

test('crossValidate: all valid returns []', () => {
  const session = { path: '/ws/p/m1/sessions.yaml', fileName: 'sessions.yaml',
    data: { meta: { schema_version: 1, version: 1, mesocycle: 1, last_modified: '2026-01-19' },
      sessions: [{ id: 'A', name: 'X', days: ['monday'], format: 'standard',
        exercises: [{ order: 1, exercise: 'leg_press', sets: 3, reps: '12' }] }] } };
  assert.deepEqual(crossValidate([cat, session]), []);
});

test('crossValidate: unknown exercise slug in session detected', () => {
  const session = { path: '/ws/p/m1/sessions.yaml', fileName: 'sessions.yaml',
    data: { meta: { schema_version: 1, version: 1, mesocycle: 1, last_modified: '2026-01-19' },
      sessions: [{ id: 'A', name: 'X', days: ['monday'], format: 'standard',
        exercises: [{ order: 1, exercise: 'ghost_exercise', sets: 3, reps: '12' }] }] } };
  const errs = crossValidate([cat, session]);
  assert.ok(errs.some((e) => e.includes('ghost_exercise')));
});

test('crossValidate: equipment outside list detected', () => {
  const badCat = { path: '/ws/exercises.yaml', fileName: 'catalog/exercises.yaml',
    data: { meta: { schema_version: 1 }, equipment: ['leg_press'],
      exercises: [{ slug: 'x', name: 'X', equipment: 'unknown_machine', muscle_groups: ['back'] }] } };
  const errs = crossValidate([badCat]);
  assert.ok(errs.some((e) => e.includes('unknown_machine')));
});

test('crossValidate: nonexistent review ref detected', () => {
  const macro = { path: '/ws/p/macrocycle.yaml', fileName: 'macrocycle.yaml',
    data: { meta: { schema_version: 1, version: 1, last_modified: '2026-04-11',
      revisions: [{ ref: 'missing-file.md', date: '2026-04-11', summary: 'X' }] } } };
  const errs = crossValidate([macro]);
  assert.ok(errs.some((e) => e.includes('missing-file.md')));
});

test('crossValidate on the real workspace returns []', () => {
  const root = join(import.meta.dirname, '..', '..');
  const docs = collectYamlFiles(root)
    .filter((f) => SCHEMA_BY_FILENAME[f.split('/').pop()])
    .map((f) => ({ path: f, fileName: f.split('/').pop(), data: loadYaml(f) }));
  assert.deepEqual(crossValidate(docs), []);
});
```

Add `collectYamlFiles`, `SCHEMA_BY_FILENAME` to the existing import at the top of `validate.test.mjs`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd <workspace>/tools && node --test test/validate.test.mjs`
Expected: the `crossValidate: unknown/outside list/nonexistent` tests fail (stub returns `[]`).

- [ ] **Step 3: Replace the `crossValidate` stub in `src/validate.mjs`**

```js
export function crossValidate(docs) {
  const errors = [];
  const catalog = docs.find((d) => d.fileName === 'catalog/exercises.yaml');
  const slugs = new Set(catalog ? (catalog.data.exercises || []).map((e) => e.slug) : []);
  const equipment = new Set(catalog ? catalog.data.equipment || [] : []);

  // Rule 3: exercise equipment ∈ equipment list
  if (catalog) {
    for (const ex of catalog.data.exercises || []) {
      if (ex.equipment != null && !equipment.has(ex.equipment)) {
        errors.push(`catalog/exercises.yaml: unknown equipment "${ex.equipment}" (exercise ${ex.slug})`);
      }
    }
  }

  for (const d of docs) {
    const rel = d.path;
    // Rule 1: session slugs ∈ catalog
    if (d.fileName === 'sessions.yaml') {
      for (const s of d.data.sessions || []) {
        for (const ex of s.exercises || []) {
          if (!slugs.has(ex.exercise)) {
            errors.push(`${rel}: unknown exercise "${ex.exercise}" (session ${s.id})`);
          }
        }
      }
    }
    // Rule 2: reference load slugs ∈ catalog
    if (d.fileName === 'goals.yaml') {
      for (const c of d.data.reference_loads || []) {
        if (!slugs.has(c.exercise)) {
          errors.push(`${rel}: reference_load unknown exercise "${c.exercise}"`);
        }
      }
    }
    // Rule 4: review refs point to an existing file
    const revisions = d.data?.meta?.revisions;
    if (Array.isArray(revisions)) {
      for (const r of revisions) {
        const target = resolve(dirname(d.path), r.ref);
        if (!existsSync(target)) {
          errors.push(`${rel}: review not found "${r.ref}"`);
        }
      }
    }
  }
  return errors;
}
```

(`resolve`, `dirname`, `existsSync` are already imported at the top of `validate.mjs`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd <workspace>/tools && node --test test/validate.test.mjs`
Expected: all `crossValidate:*` tests PASS, including "real workspace returns []".

- [ ] **Step 5: Run full validation + full test suite**

Run: `cd <workspace>/tools && npm test && npm run validate`
Expected: all tests PASS; `npm run validate` prints `✓ 7 valid file(s)`, exit 0.

> Count: `catalog/exercises.yaml` (1) + `status.yaml` + `goals.yaml` + `macrocycle.yaml` (3) + 3× `sessions.yaml` = **7 files**. The 4 templates of Task 8 bring the total to 11.

- [ ] **Step 6: Commit**

```bash
cd <workspace>
git add src/validate.mjs test/validate.test.mjs
git commit -m "feat(tools): cross-validations (exercise slugs, equipment, review refs)"
```

---

### Task 8: YAML templates

**Files:**
- Create: `templates/{status,goals,macrocycle,sessions}.yaml`

**Interfaces:**
- Consumes: the 4 schemas (Tasks 3-6). Templates must be **minimal valid examples** (they pass validation like any other `.yaml`).
- Produces: documented skeletons for future programs.

- [ ] **Step 1: Add a test asserting templates validate (append to `test/schemas.test.mjs`)**

```js
const TPL = join(ROOT, 'templates');
for (const t of ['status', 'goals', 'macrocycle', 'sessions']) {
  test(`template ${t}.yaml is a valid example`, () => {
    const doc = loadYaml(join(TPL, `${t}.yaml`));
    assert.deepEqual(validateDoc(validators, `${t}.yaml`, doc), []);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd <workspace>/tools && node --test test/schemas.test.mjs`
Expected: the 4 `template *.yaml` tests fail (files missing).

- [ ] **Step 3: Create `templates/status.yaml`**

```yaml
# Status template — copy to programs/<program>/status.yaml
meta:
  schema_version: 1
program: yyyy-mm_program-name   # program directory identifier
status: active                  # active | paused | archived | completed
current_mesocycle: 1
current_week: 1
start_date: 2026-01-01
end_date: null                  # null until completed
last_session: null
next_session: null
pauses: []                      # e.g.: [{ start: 2026-01-10, end: 2026-01-12, reason: "..." }]
notes: []
```

- [ ] **Step 4: Create `templates/goals.yaml`**

```yaml
# Goals template — copy to programs/<program>/goals.yaml
# Allowed measurement keys: arm_right_relaxed, arm_left_relaxed,
# arm_right_flexed, arm_left_flexed, chest, waist,
# hips, neck, shoulders, thigh_right, thigh_left,
# calf_right, calf_left, body_weight
meta:
  schema_version: 1
goals:
  - id: example-goal
    priority: 1
    description: "Describe the measurable goal"
    tracked_measures: [arm_right_relaxed]
    deadline: 2026-06-30
measurements:
  - date: 2026-01-01
    context: "baseline"
    values: { arm_right_relaxed: 32, body_weight: 72 }
    notes: null
reference_loads:
  - { date: 2026-01-01, exercise: chest_press_machine, load: 50, reps: 12 }
```

- [ ] **Step 5: Create `templates/macrocycle.yaml`**

```yaml
# Macrocycle template — copy to programs/<program>/macrocycle.yaml
meta:
  schema_version: 1
  version: 1
  last_modified: 2026-01-01
  revisions: []   # e.g.: [{ ref: "mesocycle-1/review.md", date: ..., summary: "..." }]
name: "Macrocycle name"
start_date: 2026-01-01
end_date: 2026-03-31
frequency: "4 sessions/week"
split: upper_lower   # upper_lower | full_body | ppl | other
mesocycles:
  - number: 1
    name: "Mechanical phase"
    weeks: { start: 1, end: 3 }
    dates: { start: 2026-01-01, end: 2026-01-21 }
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

- [ ] **Step 6: Create `templates/sessions.yaml`**

```yaml
# Sessions template — copy to programs/<program>/mesocycle-N/sessions.yaml
# format: standard (rest_s per exercise) | circuit (circuit object required, no rest_s)
# exercise: slug must exist in catalog/exercises.yaml (workspace root)
meta:
  schema_version: 1
  version: 1
  mesocycle: 1
  period: { start: 2026-01-01, end: 2026-01-28 }
  source: null
  last_modified: 2026-01-01
  revisions: []
sessions:
  - id: A
    name: "Upper body"
    days: [monday, thursday]
    format: standard
    exercises:
      - { order: "A1", superset: "chest-back", exercise: chest_press_machine, sets: 4, reps: "8", rest_s: null, target_load: 50, notes: "Tempo 2-1-1-0" }
      - { order: "A2", superset: "chest-back", exercise: seated_row, sets: 4, reps: "8", rest_s: 90, target_load: 55, notes: null }
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

- [ ] **Step 7: Run test to verify it passes + full validate**

Run: `cd <workspace>/tools && npm test && npm run validate`
Expected: all tests PASS; `npm run validate` → `✓ 11 valid file(s)` (7 + 4 templates), exit 0.

- [ ] **Step 8: Commit**

```bash
cd <workspace>
git add templates/status.yaml templates/goals.yaml templates/macrocycle.yaml templates/sessions.yaml test/schemas.test.mjs
git commit -m "feat(templates): valid YAML skeletons (status, goals, macrocycle, sessions)"
```

---

### Task 9: Delete migrated Markdown + final validation

**Files:**
- Delete: `programs/2026-01_.../{status,goals,macrocycle}.md`
- Delete: `programs/2026-01_.../mesocycle-{1,2,3}/sessions.md`
- Delete: `templates/{goals,macrocycle,sessions}.md`

**Interfaces:**
- Consumes: all validated `.yaml` files (Tasks 2-8).
- Produces: cleaned workspace, a single structure format.

- [ ] **Step 1: Verify the YAML equivalents exist and are validated**

Run:
```bash
cd <workspace>
ls programs/2026-01_upper-lower-recomposition/status.yaml \
   programs/2026-01_upper-lower-recomposition/goals.yaml \
   programs/2026-01_upper-lower-recomposition/macrocycle.yaml \
   programs/2026-01_upper-lower-recomposition/mesocycle-1/sessions.yaml \
   programs/2026-01_upper-lower-recomposition/mesocycle-2/sessions.yaml \
   programs/2026-01_upper-lower-recomposition/mesocycle-3/sessions.yaml \
   templates/status.yaml templates/goals.yaml templates/macrocycle.yaml templates/sessions.yaml
```
Expected: the 10 files exist (exit 0).

- [ ] **Step 2: Delete the migrated Markdown structure files**

```bash
cd <workspace>
git rm programs/2026-01_upper-lower-recomposition/status.md \
       programs/2026-01_upper-lower-recomposition/goals.md \
       programs/2026-01_upper-lower-recomposition/macrocycle.md \
       programs/2026-01_upper-lower-recomposition/mesocycle-1/sessions.md \
       programs/2026-01_upper-lower-recomposition/mesocycle-2/sessions.md \
       programs/2026-01_upper-lower-recomposition/mesocycle-3/sessions.md \
       templates/goals.md templates/macrocycle.md templates/sessions.md
```

- [ ] **Step 3: Confirm the preserved Markdown is untouched**

Run:
```bash
cd <workspace>
ls programs/2026-01_upper-lower-recomposition/mesocycle-*/review.md \
   templates/review.md templates/summary.md
```
Expected: the 5 review/summary files still exist (exit 0).

- [ ] **Step 4: Final full validation + test suite**

Run: `cd <workspace>/tools && npm test && npm run validate`
Expected: all tests PASS; `npm run validate` → `✓ 11 valid file(s)`, exit 0.

- [ ] **Step 5: Commit**

```bash
cd <workspace>
git add -A
git commit -m "refactor: remove structure Markdown migrated to YAML"
```

---

## Migration notes (reference for the implementer)

- **Do not invent values.** Loads, reps, measurements and dates come from the source `.md` files listed in the spec. When in doubt, re-read the original `.md` before transcribing.
- **`reps` is always a string** (`"12"`, `"10-12"`, `"45s"`, `"10-12 /leg"`).
- **`target_load`** accepts a number, a string (range `"50-60"`), or `null` (bodyweight / "light" load).
- **Approximate dates** (`~2026-03-15`) are transcribed as an exact ISO date (`2026-03-15`) with "(approximate date)" noted in `context`.
- **Missing measurements** (`—` in the tables): the key is simply **omitted** from the `values` object (do not put `0` or `null`).
- **M1 `squat`** (dumbbell) → slug `dumbbell_squat`. **Cable squat** (M2/M3) → `cable_squat`. Two distinct exercises.
- **Depth of review `ref`s** (resolved relative to the YAML file's directory): from `programs/<prog>/macrocycle.yaml`, a review is `mesocycle-N/review.md`; from `programs/<prog>/mesocycle-N/sessions.yaml`, the sibling review is simply `review.md`.
- **Node ≥ 20.11** required: the tests use `import.meta.dirname`. Check `node --version` before Task 1.

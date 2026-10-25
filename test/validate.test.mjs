import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadYaml, collectYamlFiles, validateDoc, crossValidate, main, loadCatalog } from '../src/validate.mjs';

test('loadYaml parses a YAML document', () => {
  const dir = mkdtempSync(join(tmpdir(), 'workout-validate-'));
  const f = join(dir, 'x.yaml');
  writeFileSync(f, 'a: 1\nb: [2, 3]\n');
  assert.deepEqual(loadYaml(f), { a: 1, b: [2, 3] });
});

test('collectYamlFiles finds .yaml files and ignores node_modules', () => {
  const dir = mkdtempSync(join(tmpdir(), 'workout-validate-'));
  writeFileSync(join(dir, 'a.yaml'), 'k: 1\n');
  mkdirSync(join(dir, 'node_modules'));
  writeFileSync(join(dir, 'node_modules', 'b.yaml'), 'k: 1\n');
  const found = collectYamlFiles(dir).map((p) => p.split('/').pop());
  assert.deepEqual(found, ['a.yaml']);
});

test('validateDoc without a loaded schema returns [] (skip)', () => {
  assert.deepEqual(validateDoc({}, 'unknown.yaml', { x: 1 }), []);
});

const cat = { path: '/ws/exercises.yaml', fileName: 'exercises.yaml',
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

test('crossValidate: reference_load unknown slug detected', () => {
  const goals = { path: '/ws/p/goals.yaml', fileName: 'goals.yaml',
    data: { meta: { schema_version: 1 }, goals: [], measurements: [],
      reference_loads: [{ date: '2026-01-19', exercise: 'ghost_load', load: 50, reps: 12 }] } };
  const errs = crossValidate([cat, goals]);
  assert.ok(errs.some((e) => e.includes('ghost_load')));
});

test('crossValidate: equipment outside list detected', () => {
  const badCat = { path: '/ws/exercises.yaml', fileName: 'exercises.yaml',
    data: { meta: { schema_version: 1 }, equipment: ['leg_press'],
      exercises: [{ slug: 'x', name: 'X', equipment: 'unknown_machine', muscle_groups: ['dos'] }] } };
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

const profileDoc = (ids) => ({ path: '/ws/profile.yaml', fileName: 'profile.yaml',
  data: { meta: { schema_version: 1 }, language: 'en', units: { load: 'kg', length: 'cm' },
    equipment: ids.map((id) => ({ id, name: id, category: 'machine' })) } });

test('crossValidate: profile equipment id in catalog accepted', () => {
  assert.deepEqual(crossValidate([cat, profileDoc(['leg_press'])]), []);
});

test('crossValidate: profile unknown equipment id rejected', () => {
  const errs = crossValidate([cat, profileDoc(['leg_press', 'unknown_machine'])]);
  assert.equal(errs.length, 1);
  assert.ok(errs[0].includes('unknown_machine'));
});

const ROOT = join(import.meta.dirname, '..');
const FIXTURE = join(import.meta.dirname, 'fixtures');

function fixtureWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'workout-validate-'));
  cpSync(join(FIXTURE, 'workspace'), root, { recursive: true });
  return root;
}

test('crossValidate on the shipped catalog, fixture profile and templates returns []', () => {
  const docs = [
    join(ROOT, 'catalog', 'exercises.yaml'),
    join(FIXTURE, 'workspace', 'profile.yaml'),
    ...['status', 'goals', 'macrocycle', 'sessions', 'profile'].map((t) => join(ROOT, 'templates', `${t}.yaml`)),
  ].map((f) => ({ path: f, fileName: f.split('/').pop(), data: loadYaml(f) }));
  assert.deepEqual(crossValidate(docs), []);
});

test('main: fixture workspace is valid', () => {
  assert.equal(main(fixtureWorkspace()), 0);
});

test('main: profile referencing an unknown equipment id fails', () => {
  const root = fixtureWorkspace();
  writeFileSync(join(root, 'profile.yaml'),
    'meta: { schema_version: 1 }\nlanguage: en\nunits: { load: kg, length: cm }\nequipment:\n  - { id: unknown_machine, name: X, category: machine }\n');
  assert.equal(main(root), 1);
});

test('custom catalog: new equipment + exercise are usable by profile and sessions', () => {
  const root = fixtureWorkspace();
  cpSync(join(FIXTURE, 'exercises.custom.yaml'), join(root, 'exercises.custom.yaml'));
  writeFileSync(join(root, 'profile.yaml'),
    'meta: { schema_version: 1 }\nlanguage: en\nunits: { load: kg, length: cm }\nequipment:\n  - { id: my_sled, name: Sled, category: accessory }\n');
  assert.equal(main(root), 0);
});

test('custom catalog: slug colliding with the plugin catalog gives a clear error', () => {
  const root = fixtureWorkspace();
  writeFileSync(join(root, 'exercises.custom.yaml'),
    'meta: { schema_version: 1 }\nequipment: []\nexercises:\n  - { slug: seated_row, name: Dup, equipment: low_row, muscle_groups: [back] }\n');
  const { errors } = loadCatalog(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /exercises\.custom\.yaml: exercise slug "seated_row" already exists in the plugin catalog/);
  assert.equal(main(root), 1);
});

test('custom catalog: equipment id colliding with the plugin catalog gives a clear error', () => {
  const root = fixtureWorkspace();
  writeFileSync(join(root, 'exercises.custom.yaml'), 'meta: { schema_version: 1 }\nequipment: [leg_press]\nexercises: []\n');
  assert.match(loadCatalog(root).errors[0], /equipment "leg_press" already exists/);
});

test('custom catalog: invalid custom file fails schema validation', () => {
  const root = fixtureWorkspace();
  writeFileSync(join(root, 'exercises.custom.yaml'), 'meta: { schema_version: 1 }\nequipment: []\nexercises:\n  - { slug: x }\n');
  assert.equal(main(root), 1);
});

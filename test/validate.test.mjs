import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, cpSync, readFileSync, appendFileSync } from 'node:fs';
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

const macroDoc = (scheduling) => ({ path: '/ws/p/macrocycle.yaml', fileName: 'macrocycle.yaml',
  data: { meta: { schema_version: 1, version: 1, last_modified: '2026-04-11' }, ...(scheduling ? { scheduling } : {}) } });
const sessDoc = (sessions) => ({ path: '/ws/p/mesocycle-1/sessions.yaml', fileName: 'sessions.yaml',
  data: { meta: { schema_version: 1, version: 1, mesocycle: 1, last_modified: '2026-01-19' }, sessions } });
const statusDoc = (data) => ({ path: '/ws/p/status.yaml', fileName: 'status.yaml',
  data: { meta: { schema_version: 1 }, current_mesocycle: 1, ...data } });
const rs = (id, extra = {}) => ({ id, name: id, format: 'standard',
  exercises: [{ order: 1, exercise: 'leg_press', sets: 3, reps: '12' }], ...extra });

test('crossValidate rotation: sessions without days accepted', () => {
  assert.deepEqual(crossValidate([cat, macroDoc('rotation'), sessDoc([rs('A'), rs('B')])]), []);
});

test('crossValidate rotation: session with days rejected', () => {
  const errs = crossValidate([cat, macroDoc('rotation'), sessDoc([rs('A', { days: ['monday'] })])]);
  assert.ok(errs.some((e) => e.includes('must not set "days"')));
});

test('crossValidate rotation: duplicate session ids rejected', () => {
  const errs = crossValidate([cat, macroDoc('rotation'), sessDoc([rs('A'), rs('A')])]);
  assert.ok(errs.some((e) => e.includes('duplicate session id')));
});

test('crossValidate rotation: single session accepted', () => {
  assert.deepEqual(crossValidate([cat, macroDoc('rotation'), sessDoc([rs('A')])]), []);
});

test('crossValidate weekdays: session without days rejected', () => {
  for (const docs of [[macroDoc('weekdays')], [macroDoc()], []]) {
    const errs = crossValidate([cat, ...docs, sessDoc([rs('A')])]);
    assert.ok(errs.some((e) => e.includes('has no "days"')));
  }
});

test('crossValidate rotation: next_session_id unknown rejected', () => {
  const errs = crossValidate([cat, macroDoc('rotation'), sessDoc([rs('A')]), statusDoc({ next_session_id: 'Z' })]);
  assert.ok(errs.some((e) => e.includes('not found in mesocycle-1/sessions.yaml')));
});

test('crossValidate rotation: next_session_id known, null, or other mesocycle accepted', () => {
  const base = [cat, macroDoc('rotation'), sessDoc([rs('A'), rs('B')])];
  assert.deepEqual(crossValidate([...base, statusDoc({ next_session_id: 'B' })]), []);
  assert.deepEqual(crossValidate([...base, statusDoc({ next_session_id: null })]), []);
  assert.deepEqual(crossValidate([...base, statusDoc({ current_mesocycle: 2, next_session_id: 'Z' })]), []);
});

test('crossValidate weekdays: next_session_id rejected', () => {
  const errs = crossValidate([cat, macroDoc(), statusDoc({ next_session_id: 'A' })]);
  assert.ok(errs.some((e) => e.includes('only valid when')));
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

test('custom catalog: slug colliding with the plugin catalog overrides it with a warning', () => {
  const root = fixtureWorkspace();
  writeFileSync(join(root, 'exercises.custom.yaml'),
    'meta: { schema_version: 1 }\nequipment: []\nexercises:\n  - { slug: seated_row, name: Mine, equipment: low_row, muscle_groups: [lats] }\n');
  const { doc, errors, warnings } = loadCatalog(root);
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /exercises\.custom\.yaml: exercise "seated_row" overrides the plugin catalog entry/);
  const hits = doc.data.exercises.filter((e) => e.slug === 'seated_row');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].name, 'Mine');
  assert.equal(doc.origin.get('seated_row'), 'exercises.custom.yaml');
  assert.equal(main(root), 0);
});

test('custom catalog: equipment id colliding with the plugin catalog is ignored with a warning', () => {
  const root = fixtureWorkspace();
  writeFileSync(join(root, 'exercises.custom.yaml'), 'meta: { schema_version: 1 }\nequipment: [leg_press]\nexercises:\n  - { slug: my_press, name: Mine, equipment: leg_press, muscle_groups: [quadriceps] }\n');
  const { doc, errors, warnings } = loadCatalog(root);
  assert.deepEqual(errors, []);
  assert.match(warnings[0], /equipment "leg_press" already exists.*ignored/);
  assert.equal(doc.data.equipment.filter((e) => e === 'leg_press').length, 1);
  assert.equal(main(root), 0);
});

test('custom catalog: duplicates inside exercises.custom.yaml are errors, not plugin-catalog warnings', () => {
  const root = fixtureWorkspace();
  writeFileSync(join(root, 'exercises.custom.yaml'), 'meta: { schema_version: 1 }\nequipment: [my_sled, my_sled]\nexercises:\n  - { slug: x, name: A, equipment: my_sled, muscle_groups: [quadriceps] }\n  - { slug: x, name: B, equipment: my_sled, muscle_groups: [quadriceps] }\n');
  const { doc, errors, warnings } = loadCatalog(root);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /equipment "my_sled" is defined twice in exercises\.custom\.yaml/);
  assert.match(errors[1], /exercise slug "x" is defined twice in exercises\.custom\.yaml/);
  assert.deepEqual(warnings, []);
  assert.equal(doc.data.exercises.filter((e) => e.slug === 'x').length, 1);
});

test('custom catalog: no collision gives no warnings', () => {
  const root = fixtureWorkspace();
  cpSync(join(FIXTURE, 'exercises.custom.yaml'), join(root, 'exercises.custom.yaml'));
  assert.deepEqual(loadCatalog(root).warnings, []);
});

test('crossValidate: equipment list with known ids accepted', () => {
  const c = { ...cat, data: { ...cat.data, equipment: ['barbell', 'flat_bench'],
    exercises: [{ slug: 'bench', name: 'B', equipment: ['barbell', 'flat_bench'], muscle_groups: ['chest'] }] } };
  assert.deepEqual(crossValidate([c]), []);
});

test('crossValidate: unknown id inside an equipment list rejected', () => {
  const c = { ...cat, data: { ...cat.data, equipment: ['barbell'],
    exercises: [{ slug: 'bench', name: 'B', equipment: ['barbell', 'ghost_bench'], muscle_groups: ['chest'] }] } };
  const errs = crossValidate([c]);
  assert.equal(errs.length, 1);
  assert.ok(errs[0].includes('ghost_bench'));
});

test('catalog: no duplicate exercise slugs or equipment ids', () => {
  const doc = loadYaml(join(ROOT, 'catalog', 'exercises.yaml'));
  const dup = (xs) => xs.filter((x, i) => xs.indexOf(x) !== i);
  assert.deepEqual(dup(doc.exercises.map((e) => e.slug)), []);
  assert.deepEqual(dup(doc.equipment), []);
});

test('custom catalog: invalid custom file fails schema validation', () => {
  const root = fixtureWorkspace();
  writeFileSync(join(root, 'exercises.custom.yaml'), 'meta: { schema_version: 1 }\nequipment: []\nexercises:\n  - { slug: x }\n');
  assert.equal(main(root), 1);
});

function rotationWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'workout-validate-'));
  cpSync(join(FIXTURE, 'workspace-rotation'), root, { recursive: true });
  return root;
}

test('main: rotation fixture workspace is valid', () => {
  assert.equal(main(rotationWorkspace()), 0);
});

test('main: rotation fixture with days added to a session fails', () => {
  const root = rotationWorkspace();
  const f = join(root, 'programs', '2026-01_rotation-program', 'mesocycle-1', 'sessions.yaml');
  const text = readFileSync(f, 'utf8');
  assert.ok(/^(\s*)- id: A\b/m.test(text));
  writeFileSync(f, text.replace(/^(\s*)- id: A\b.*$/m, (m, ind) => `${m}\n${ind}  days: [monday]`));
  assert.equal(main(root), 1);
});

test('main: next_session_id without scheduling fails', () => {
  const root = fixtureWorkspace();
  const f = collectYamlFiles(root).find((p) => p.endsWith('status.yaml'));
  appendFileSync(f, '\nnext_session_id: A\n');
  const orig = console.error;
  const out = [];
  console.error = (...a) => out.push(a.join(' '));
  let code;
  try { code = main(root); } finally { console.error = orig; }
  assert.equal(code, 1);
  assert.ok(out.some((l) => l.includes('only valid when')));
});

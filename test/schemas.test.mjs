import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildValidators, validateDoc, loadYaml } from '../src/validate.mjs';

const ROOT = join(import.meta.dirname, '..');
const FIX = join(import.meta.dirname, 'fixtures');
const SCHEMAS = join(ROOT, 'schemas');
const validators = buildValidators(SCHEMAS);

const META = { schema_version: 1 };
const MACROCYCLE = () => ({
  meta: { schema_version: 1, version: 1, last_modified: '2026-01-19' },
  name: 'P', start_date: '2026-01-19', end_date: '2026-06-30', frequency: '4 sessions/week', split: 'upper_lower',
  mesocycles: [{ number: 1, name: 'A', weeks: { start: 1, end: 4 }, dates: { start: '2026-01-19', end: '2026-02-15' }, goal: 'x',
    parameters: { sets: '3-4', reps: '5-8', rest_s: '120-180', intensity_pct_1rm: '80-90', technique: 'Controlled' } }],
  weekly_split: [{ day: 'monday', session: 'Upper A', muscle_groups: ['chest', 'back'] }],
  cardio: [{ type: 'bike', duration_min: '20', frequency: null, notes: null }],
});
const SESSIONS = () => ({
  meta: { schema_version: 1, version: 1, mesocycle: 1, last_modified: '2026-01-19' },
  sessions: [{ id: 'A', name: 'Upper', days: ['monday'], format: 'standard',
    exercises: [{ order: 'A1', exercise: 'chest_press_machine', sets: 3, reps: '12', rest_s: 90, target_load: 50, notes: null }] }],
});
const PROFILE = () => ({
  meta: META, language: 'fr', units: { load: 'kg', length: 'cm' },
  equipment: [{ id: 'chest_press', name: 'Chest Press', category: 'machine', muscles: ['chest'], notes: null }],
});

test('exercises: real catalog valid', () => {
  const doc = loadYaml(join(ROOT, 'catalog', 'exercises.yaml'));
  assert.deepEqual(validateDoc(validators, 'exercises.yaml', doc), []);
});

test('exercises: invalid slug (uppercase) rejected', () => {
  const bad = { meta: META, equipment: ['x'],
    exercises: [{ slug: 'Bad Slug', name: 'X', muscle_groups: ['back'] }] };
  assert.ok(validateDoc(validators, 'exercises.yaml', bad).length > 0);
});

test('exercises: muscle group outside vocabulary rejected', () => {
  const bad = { meta: META, equipment: ['x'],
    exercises: [{ slug: 'ok', name: 'X', muscle_groups: ['nonexistent'] }] };
  assert.ok(validateDoc(validators, 'exercises.yaml', bad).length > 0);
});

const exWith = (ex) => ({ meta: META, equipment: ['barbell', 'flat_bench'],
  exercises: [{ slug: 'ok', name: 'X', muscle_groups: ['chest'], ...ex }] });

test('exercises: equipment as id, null, or non-empty unique list accepted', () => {
  for (const equipment of ['barbell', null, ['barbell'], ['barbell', 'flat_bench']]) {
    assert.deepEqual(validateDoc(validators, 'exercises.yaml', exWith({ equipment })), []);
  }
});

test('exercises: empty, duplicated or non-string equipment list rejected', () => {
  for (const equipment of [[], ['barbell', 'barbell'], [1], 5]) {
    assert.ok(validateDoc(validators, 'exercises.yaml', exWith({ equipment })).length > 0);
  }
});

test('exercises: type accepted when valid, optional, rejected otherwise', () => {
  for (const type of ['strength', 'calisthenics', 'cardio', 'plyometric', 'mobility']) {
    assert.deepEqual(validateDoc(validators, 'exercises.yaml', exWith({ type })), []);
  }
  assert.deepEqual(validateDoc(validators, 'exercises.yaml', exWith({})), []);
  assert.ok(validateDoc(validators, 'exercises.yaml', exWith({ type: 'machine' })).length > 0);
});

const NEW_MUSCLES = ['lats', 'traps', 'obliques', 'forearms', 'adductors'];

test('new muscle values accepted in exercise, profile and macrocycle schemas', () => {
  assert.deepEqual(validateDoc(validators, 'exercises.yaml', exWith({ muscle_groups: NEW_MUSCLES })), []);
  const profile = PROFILE();
  profile.equipment[0].muscles = NEW_MUSCLES;
  assert.deepEqual(validateDoc(validators, 'profile.yaml', profile), []);
  const macro = JSON.parse(readFileSync(join(ROOT, 'schemas', 'macrocycle.schema.json'), 'utf8'));
  for (const m of NEW_MUSCLES) assert.ok(macro.$defs.muscle_group.enum.includes(m), m);
});

test('status: valid file', () => {
  const doc = { meta: META, program: 'x', status: 'active', current_mesocycle: 1, current_week: 1, start_date: '2026-01-19', end_date: null };
  assert.deepEqual(validateDoc(validators, 'status.yaml', doc), []);
});

test('status: unknown enum value rejected', () => {
  const bad = { meta: META, program: 'x', status: 'bogus', start_date: '2026-01-19' };
  assert.ok(validateDoc(validators, 'status.yaml', bad).length > 0);
});

test('status: malformed date rejected', () => {
  const bad = { meta: META, program: 'x', status: 'active', start_date: '19/01/2026' };
  assert.ok(validateDoc(validators, 'status.yaml', bad).length > 0);
});

test('goals: valid file', () => {
  const doc = { meta: META,
    goals: [{ id: 'chest-plus-5pct', priority: 1, description: 'x', tracked_measures: ['chest'], deadline: null }],
    measurements: [{ date: '2026-01-19', context: 'baseline', values: { chest: 100, body_weight: 72 }, notes: null }],
    reference_loads: [{ date: '2026-01-19', exercise: 'chest_press_machine', load: 50, reps: 12 }] };
  assert.deepEqual(validateDoc(validators, 'goals.yaml', doc), []);
});

test('goals: measurement key outside vocabulary rejected', () => {
  const bad = { meta: META, goals: [],
    measurements: [{ date: '2026-01-19', values: { unknown_size: 80 } }] };
  assert.ok(validateDoc(validators, 'goals.yaml', bad).length > 0);
});

test('goals: non-numeric measurement value rejected', () => {
  const bad = { meta: META, goals: [],
    measurements: [{ date: '2026-01-19', values: { body_weight: 'heavy' } }] };
  assert.ok(validateDoc(validators, 'goals.yaml', bad).length > 0);
});

test('macrocycle: valid file', () => {
  assert.deepEqual(validateDoc(validators, 'macrocycle.yaml', MACROCYCLE()), []);
});

test('macrocycle: split outside enum rejected', () => {
  const doc = MACROCYCLE();
  doc.split = 'crossfit';
  assert.ok(validateDoc(validators, 'macrocycle.yaml', doc).length > 0);
});

test('macrocycle: meta without version rejected', () => {
  const doc = MACROCYCLE();
  delete doc.meta.version;
  assert.ok(validateDoc(validators, 'macrocycle.yaml', doc).length > 0);
});

test('sessions: valid file', () => {
  assert.deepEqual(validateDoc(validators, 'sessions.yaml', SESSIONS()), []);
});

test('sessions: circuit format without circuit object rejected', () => {
  const bad = SESSIONS();
  bad.sessions[0].format = 'circuit';
  assert.ok(validateDoc(validators, 'sessions.yaml', bad).length > 0);
});

test('sessions: standard format with circuit object rejected', () => {
  const bad = SESSIONS();
  bad.sessions[0].circuit = { rounds: 3, rest_between_exercises_s: 0, rest_between_rounds_s: 120 };
  assert.ok(validateDoc(validators, 'sessions.yaml', bad).length > 0);
});

test('profile: sample fixture profile valid', () => {
  const doc = loadYaml(join(FIX, 'workspace', 'profile.yaml'));
  assert.deepEqual(validateDoc(validators, 'profile.yaml', doc), []);
});

test('profile: valid file', () => {
  assert.deepEqual(validateDoc(validators, 'profile.yaml', PROFILE()), []);
});

test('profile: unknown unit rejected', () => {
  const bad = PROFILE();
  bad.units.load = 'stone';
  assert.ok(validateDoc(validators, 'profile.yaml', bad).length > 0);
});

test('profile: malformed language code rejected', () => {
  const bad = PROFILE();
  bad.language = 'French';
  assert.ok(validateDoc(validators, 'profile.yaml', bad).length > 0);
});

test('profile: empty equipment list rejected', () => {
  const bad = PROFILE();
  bad.equipment = [];
  assert.ok(validateDoc(validators, 'profile.yaml', bad).length > 0);
});

test('profile: unknown equipment category rejected', () => {
  const bad = PROFILE();
  bad.equipment[0].category = 'gadget';
  assert.ok(validateDoc(validators, 'profile.yaml', bad).length > 0);
});

const TPL = join(ROOT, 'templates');
for (const t of ['status', 'goals', 'macrocycle', 'sessions', 'profile']) {
  test(`template ${t}.yaml is a valid example`, () => {
    const doc = loadYaml(join(TPL, `${t}.yaml`));
    assert.deepEqual(validateDoc(validators, `${t}.yaml`, doc), []);
  });
}

const rot = () => { const m = MACROCYCLE(); m.scheduling = 'rotation'; delete m.weekly_split[0].day; return m; };
const okDoc = (f, d) => validateDoc(validators, f, d).length === 0;
test('macrocycle: rotation without day valid', () => assert.ok(okDoc('macrocycle.yaml', rot())));
test('macrocycle: rotation with day rejected', () => {
  const m = rot(); m.weekly_split[0].day = 'monday';
  assert.ok(!okDoc('macrocycle.yaml', m));
});
test('macrocycle: rotation with weekly_split not an array rejected', () => {
  const a = rot(); a.weekly_split = 'x';
  assert.ok(!okDoc('macrocycle.yaml', a));
  const b = rot(); b.weekly_split = {};
  assert.ok(!okDoc('macrocycle.yaml', b));
});
test('macrocycle: weekdays without day rejected', () => {
  const m = rot(); m.scheduling = 'weekdays';
  assert.ok(!okDoc('macrocycle.yaml', m));
});
test('macrocycle: absent scheduling without day rejected', () => {
  const m = rot(); delete m.scheduling;
  assert.ok(!okDoc('macrocycle.yaml', m));
});
test('macrocycle: absent scheduling with day valid', () => assert.ok(okDoc('macrocycle.yaml', MACROCYCLE())));
test('macrocycle: scheduling weekdays with day valid', () => {
  const m = MACROCYCLE(); m.scheduling = 'weekdays';
  assert.ok(okDoc('macrocycle.yaml', m));
});
test('macrocycle: unknown scheduling value rejected', () => {
  const m = MACROCYCLE(); m.scheduling = 'bogus';
  assert.ok(!okDoc('macrocycle.yaml', m));
});
test('sessions: session without days valid at schema level', () => {
  const d = SESSIONS(); delete d.sessions[0].days;
  assert.ok(okDoc('sessions.yaml', d));
});
const STATUS = () => loadYaml(join(ROOT, 'templates', 'status.yaml'));
test('status: next_session_id string valid', () => {
  const d = STATUS(); d.next_session_id = 'B';
  assert.ok(okDoc('status.yaml', d));
});
test('status: next_session_id null valid', () => {
  const d = STATUS(); d.next_session_id = null;
  assert.ok(okDoc('status.yaml', d));
});
test('status: next_session_id empty string rejected', () => {
  const d = STATUS(); d.next_session_id = '';
  assert.ok(!okDoc('status.yaml', d));
});
test('status: unknown extra property still rejected', () => {
  const d = STATUS(); d.bogus = 1;
  assert.ok(!okDoc('status.yaml', d));
});

const PROG = join(FIX, 'workspace', 'programs', '2026-01_sample-program');
for (const f of ['status', 'goals', 'macrocycle']) {
  test(`fixture program: ${f}.yaml valid`, () => {
    assert.deepEqual(validateDoc(validators, `${f}.yaml`, loadYaml(join(PROG, `${f}.yaml`))), []);
  });
}
test('fixture program: mesocycle-1 sessions.yaml valid', () => {
  assert.deepEqual(validateDoc(validators, 'sessions.yaml', loadYaml(join(PROG, 'mesocycle-1', 'sessions.yaml'))), []);
});
test('exercises.custom.yaml uses the catalog schema', () => {
  assert.deepEqual(validateDoc(validators, 'exercises.custom.yaml', loadYaml(join(FIX, 'exercises.custom.yaml'))), []);
});

const ROT_PROG = join(FIX, 'workspace-rotation', 'programs', '2026-01_rotation-program');
for (const f of ['status', 'goals', 'macrocycle']) {
  test(`rotation fixture program: ${f}.yaml valid`, () => {
    assert.deepEqual(validateDoc(validators, `${f}.yaml`, loadYaml(join(ROT_PROG, `${f}.yaml`))), []);
  });
}
test('rotation fixture program: mesocycle-1 sessions.yaml valid', () => {
  assert.deepEqual(validateDoc(validators, 'sessions.yaml', loadYaml(join(ROT_PROG, 'mesocycle-1', 'sessions.yaml'))), []);
});

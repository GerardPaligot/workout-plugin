import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import { applyResourceOperation, readResource, resolveResourceRequest, ResourceRequestError, RESOURCE_DEFINITIONS } from '../src/workout-data/resources.mjs';
import { loadRoundTripDocument } from '../src/workout-data/workspace.mjs';
import { main } from '../src/workout-data/cli.mjs';

function document(name) {
  return parseDocument(readFileSync(new URL(`../templates/${name}`, import.meta.url), 'utf8'));
}

function request(verb, resource, options = {}) {
  const definition = RESOURCE_DEFINITIONS[resource];
  const target = definition.target === 'workspace' ? {} : { program: 'plan' };
  if (definition.target === 'mesocycle') target.mesocycle = '1';
  return resolveResourceRequest({ verb, resource, options: { ...target, ...options } });
}

function expectCode(action, code) {
  assert.throws(action, (error) => error instanceof ResourceRequestError && error.code === code);
}

function memoryIo(cwd = mkdtempSync(join(tmpdir(), 'workout-data-memory-'))) {
  const output = { stdout: '', stderr: '' };
  return {
    io: {
      cwd,
      stdout: { write: (text) => { output.stdout += text; } },
      stderr: { write: (text) => { output.stderr += text; } },
    },
    output,
  };
}

test('positional help exposes concise JSON resource operations and selector payload metadata', async () => {
  const { io, output } = memoryIo();
  assert.equal(await main(['help'], io), 0);
  const overview = JSON.parse(output.stdout);
  assert.equal(overview.ok, true);
  assert.ok(overview.resources.some((resource) => resource.resource === 'session' && resource.verbs.includes('move')));

  output.stdout = '';
  assert.equal(await main(['help', 'goal'], io), 0);
  const goal = JSON.parse(output.stdout);
  assert.equal(goal.selector.option, '--id');
  assert.deepEqual(goal.payloads.add.required, ['id', 'priority', 'description', 'tracked_measures']);
  assert.deepEqual(goal.payloads.update.allowed, ['priority', 'description', 'tracked_measures', 'deadline']);

  output.stdout = '';
  assert.equal(await main(['help', 'session-exercise'], io), 0);
  const sessionExercise = JSON.parse(output.stdout);
  assert.deepEqual(sessionExercise.selector.item, { option: '--order', key: 'order', label: 'exercise-order', requiredFor: ['remove'] });
});

test('positional help renders a compact text guide and rejects unrelated options', async () => {
  const { io, output } = memoryIo();
  assert.equal(await main(['help', '--format', 'text'], io), 0);
  assert.match(output.stdout, /profile: workspace; selector singleton/);
  assert.match(output.stdout, /session: --program <id> --mesocycle <n>; selector --id <id>/);
  output.stdout = '';
  assert.equal(await main(['help', 'session-exercise', '--format', 'text'], io), 0);
  assert.match(output.stdout, /session-exercise/);
  assert.match(output.stdout, /document: sessions\.yaml/);
  assert.match(output.stdout, /--program <id> --mesocycle <n> --id <session>/);
  assert.match(output.stdout, /--order <exercise-order> \(remove\)/);
  assert.match(output.stdout, /add: required order, exercise, sets, reps/);

  for (const argv of [
    ['help', 'unknown-resource'],
    ['help', 'profile', '--program', 'plan'],
    ['help', 'profile', 'extra'],
    ['help', '--unknown-option'],
  ]) {
    output.stderr = '';
    assert.equal(await main(argv, io), 1);
    assert.equal(JSON.parse(output.stderr).code, 'invalid_target');
  }
  const regular = memoryIo();
  assert.equal(await main(['get', 'profile', '--workspace', 'help', '--unknown-option'], regular.io), 1);
  assert.equal(JSON.parse(regular.output.stderr).code, 'invalid_payload');
});

test('reads single resources and list items through their registry routes', () => {
  assert.equal(readResource(document('profile.yaml'), request('get', 'profile')).data.language, 'en');
  assert.equal(readResource(document('goals.yaml'), request('get', 'goal', { id: 'example-goal' })).data.id, 'example-goal');
  assert.equal(readResource(document('sessions.yaml'), request('list', 'session')).items.length, 2);
  assert.equal(readResource(document('sessions.yaml'), request('list', 'session-exercise', { id: 'A' })).items[0].order, 'A1');
});

test('the full v1 read matrix resolves each supported route', () => {
  const cases = [
    ['profile.yaml', 'get', 'profile', {}],
    ['profile.yaml', 'list', 'profile-equipment', {}], ['profile.yaml', 'get', 'profile-equipment', { id: 'bench' }],
    ['status.yaml', 'get', 'program-status', {}], ['status.yaml', 'list', 'status-pause', {}], ['status.yaml', 'list', 'status-note', {}],
    ['goals.yaml', 'get', 'goals', {}], ['goals.yaml', 'list', 'goal', {}], ['goals.yaml', 'get', 'goal', { id: 'example-goal' }],
    ['goals.yaml', 'list', 'measurement', {}], ['goals.yaml', 'list', 'reference-load', {}],
    ['macrocycle.yaml', 'get', 'macrocycle', {}], ['macrocycle.yaml', 'list', 'mesocycle-plan', {}], ['macrocycle.yaml', 'get', 'mesocycle-plan', { id: '1' }],
    ['macrocycle.yaml', 'list', 'macrocycle-revision', {}], ['macrocycle.yaml', 'list', 'weekly-split', {}], ['macrocycle.yaml', 'list', 'macrocycle-cardio', {}],
    ['sessions.yaml', 'get', 'sessions', {}], ['sessions.yaml', 'list', 'session', {}], ['sessions.yaml', 'get', 'session', { id: 'A' }],
    ['sessions.yaml', 'list', 'session-exercise', { id: 'A' }], ['sessions.yaml', 'list', 'session-cardio', {}],
  ];
  for (const [file, verb, resource, options] of cases) {
    const result = readResource(document(file), request(verb, resource, options));
    assert.ok(verb === 'list' ? Array.isArray(result.items) : result.data !== undefined, `${verb} ${resource}`);
  }
});

test('identified selectors reject missing, duplicate, and add-collision resources', () => {
  const goals = document('goals.yaml');
  expectCode(() => readResource(goals, request('get', 'goal', { id: 'missing' })), 'not_found');
  goals.get('goals').add(goals.get('goals').items[0]);
  expectCode(() => readResource(goals, request('get', 'goal', { id: 'example-goal' })), 'conflict');

  const profile = document('profile.yaml');
  expectCode(() => applyResourceOperation(profile, request('add', 'profile-equipment'), { id: 'bench', name: 'Other', category: 'accessory' }), 'already_exists');
});

test('updates only allow mutable keys and retain omitted selected fields', () => {
  const goals = document('goals.yaml');
  applyResourceOperation(goals, request('update', 'goal', { id: 'example-goal' }), { description: 'Updated' });
  const goal = readResource(goals, request('get', 'goal', { id: 'example-goal' })).data;
  assert.equal(goal.description, 'Updated');
  assert.equal(goal.priority, 1);
  expectCode(() => applyResourceOperation(goals, request('update', 'goal', { id: 'example-goal' }), { id: 'changed' }), 'invalid_payload');
  expectCode(() => applyResourceOperation(goals, request('update', 'goal', { id: 'example-goal' }), { unknown: true }), 'invalid_payload');
  expectCode(() => applyResourceOperation(goals, request('update', 'goal', { id: 'example-goal' }), {}), 'invalid_payload');
});

test('session exercise requires a matching parent session and session moves preserve node order', () => {
  const sessions = document('sessions.yaml');
  expectCode(() => readResource(sessions, request('list', 'session-exercise', { id: 'missing' })), 'not_found');
  applyResourceOperation(sessions, request('move', 'session', { id: 'C', before: 'A' }), {});
  assert.deepEqual(readResource(sessions, request('list', 'session')).items.map(({ id }) => id), ['C', 'A']);
});

test('session format transitions own the circuit field', () => {
  const sessions = document('sessions.yaml');
  applyResourceOperation(sessions, request('update', 'session', { id: 'C' }), { format: 'standard' });
  assert.equal(readResource(sessions, request('get', 'session', { id: 'C' })).data.circuit, undefined);
  expectCode(() => applyResourceOperation(sessions, request('update', 'session', { id: 'A' }), { format: 'circuit' }), 'invalid_payload');
  applyResourceOperation(sessions, request('update', 'session', { id: 'A' }), { format: 'circuit', circuit: { rounds: 3, rest_between_exercises_s: 0, rest_between_rounds_s: 90 } });
  assert.equal(readResource(sessions, request('get', 'session', { id: 'A' })).data.circuit.rounds, 3);
});

test('append-only collections mutate only with add and are returned as lists', () => {
  const status = document('status.yaml');
  applyResourceOperation(status, request('add', 'status-note'), { text: 'Deload' });
  assert.equal(status.get('notes', true).items[0], 'Deload');
  assert.equal(readResource(status, request('list', 'status-note')).items.length, 1);
  expectCode(() => resolveResourceRequest({ verb: 'get', resource: 'status-note', options: { program: 'plan' } }), 'invalid_target');
});

test('every child add contract rejects missing and unknown payload keys before mutation', () => {
  const addCases = [
    ['profile.yaml', 'profile-equipment', { id: 'new', name: 'New', category: 'accessory' }],
    ['status.yaml', 'status-pause', { start: '2026-02-01', end: '2026-02-02' }],
    ['status.yaml', 'status-note', { text: 'Note' }],
    ['goals.yaml', 'goal', { id: 'new-goal', priority: 1, description: 'New', tracked_measures: [] }],
    ['goals.yaml', 'measurement', { date: '2026-02-01', values: { body_weight: 70 } }],
    ['goals.yaml', 'reference-load', { date: '2026-02-01', exercise: 'seated_row', load: 50, reps: 10 }],
    ['macrocycle.yaml', 'mesocycle-plan', { number: 2, name: 'Next', weeks: { start: 4, end: 6 }, dates: { start: '2026-02-01', end: '2026-02-21' }, goal: 'Build', parameters: {} }],
    ['macrocycle.yaml', 'macrocycle-revision', { ref: 'review.md', date: '2026-02-01', summary: 'Adjusted' }],
    ['macrocycle.yaml', 'weekly-split', { session: 'Upper' }],
    ['macrocycle.yaml', 'macrocycle-cardio', { type: 'bike', duration_min: '20' }],
    ['sessions.yaml', 'session', { id: 'B', name: 'Lower', format: 'standard', exercises: [] }],
    ['sessions.yaml', 'session-exercise', { order: 'A3', exercise: 'seated_row', sets: 3, reps: '10' }],
    ['sessions.yaml', 'session-cardio', { type: 'bike', duration_min: '20' }],
  ];
  for (const [file, resource, payload] of addCases) {
    const doc = document(file);
    const options = resource === 'session-exercise' ? { id: 'A' } : {};
    expectCode(() => applyResourceOperation(doc, request('add', resource, options), {}), 'invalid_payload');
    expectCode(() => applyResourceOperation(doc, request('add', resource, options), { ...payload, unexpected: true }), 'invalid_payload');
  }
});

test('the v1 mutation matrix applies every child add and selected update/remove/move operation', () => {
  const addCases = [
    ['profile.yaml', 'profile-equipment', { id: 'new', name: 'New', category: 'accessory' }, {}],
    ['status.yaml', 'status-pause', { start: '2026-02-01', end: '2026-02-02' }, {}], ['status.yaml', 'status-note', { text: 'Note' }, {}],
    ['goals.yaml', 'goal', { id: 'new-goal', priority: 1, description: 'New', tracked_measures: [] }, {}],
    ['goals.yaml', 'measurement', { date: '2026-02-01', values: { body_weight: 70 } }, {}], ['goals.yaml', 'reference-load', { date: '2026-02-01', exercise: 'seated_row', load: 50, reps: 10 }, {}],
    ['macrocycle.yaml', 'mesocycle-plan', { number: 2, name: 'Next', weeks: { start: 4, end: 6 }, dates: { start: '2026-02-01', end: '2026-02-21' }, goal: 'Build', parameters: {} }, {}],
    ['macrocycle.yaml', 'macrocycle-revision', { ref: 'review.md', date: '2026-02-01', summary: 'Adjusted' }, {}], ['macrocycle.yaml', 'weekly-split', { session: 'Upper' }, {}], ['macrocycle.yaml', 'macrocycle-cardio', { type: 'bike', duration_min: '20' }, {}],
    ['sessions.yaml', 'session', { id: 'B', name: 'Lower', format: 'standard', exercises: [] }, {}], ['sessions.yaml', 'session-exercise', { order: 'A3', exercise: 'seated_row', sets: 3, reps: '10' }, { id: 'A' }], ['sessions.yaml', 'session-cardio', { type: 'bike', duration_min: '20' }, {}],
  ];
  for (const [file, resource, payload, options] of addCases) {
    const doc = document(file);
    assert.doesNotThrow(() => applyResourceOperation(doc, request('add', resource, options), payload), `add ${resource}`);
  }

  const updates = [
    ['profile.yaml', 'profile', {}, { language: 'fr' }], ['status.yaml', 'program-status', {}, { current_week: 2 }], ['macrocycle.yaml', 'macrocycle', {}, { name: 'Updated' }], ['sessions.yaml', 'sessions', {}, { source: 'review' }],
    ['profile.yaml', 'profile-equipment', { id: 'bench' }, { name: 'Updated bench' }], ['goals.yaml', 'goal', { id: 'example-goal' }, { priority: 2 }], ['macrocycle.yaml', 'mesocycle-plan', { id: '1' }, { name: 'Updated' }], ['sessions.yaml', 'session', { id: 'A' }, { name: 'Updated' }],
  ];
  for (const [file, resource, options, payload] of updates) {
    assert.doesNotThrow(() => applyResourceOperation(document(file), request('update', resource, options), payload), `update ${resource}`);
  }
  for (const [file, resource, options] of [
    ['profile.yaml', 'profile-equipment', { id: 'bench' }], ['goals.yaml', 'goal', { id: 'example-goal' }], ['macrocycle.yaml', 'mesocycle-plan', { id: '1' }], ['sessions.yaml', 'session', { id: 'A' }],
  ]) {
    assert.doesNotThrow(() => applyResourceOperation(document(file), request('remove', resource, options), {}), `remove ${resource}`);
  }
  assert.doesNotThrow(() => applyResourceOperation(document('sessions.yaml'), request('move', 'session', { id: 'A', after: 'C' }), {}));
});

test('round-trip loading rejects YAML constructs that cannot be preserved safely', () => {
  const directory = mkdtempSync(join(tmpdir(), 'workout-data-yaml-'));
  for (const [name, source] of Object.entries({
    alias: 'first: &shared { value: 1 }\nsecond: *shared\n',
    merge: 'base: &base { value: 1 }\nderived: { <<: *base }\n',
    multiple: 'first: true\n---\nsecond: true\n',
  })) {
    const path = join(directory, `${name}.yaml`);
    writeFileSync(path, source);
    expectCode(() => loadRoundTripDocument(path), 'unsupported_yaml');
  }
});

test('CLI reads selected data and projects list responses without changing the document', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'workout-data-read-'));
  cpSync(new URL('./fixtures/workspace/', import.meta.url), workspace, { recursive: true });
  let stdout = '';
  let stderr = '';
  const io = { cwd: workspace, stdout: { write: (text) => { stdout += text; } }, stderr: { write: (text) => { stderr += text; } } };
  assert.equal(await main(['get', 'goal', '--program', '2026-01_sample-program', '--id', 'example-goal'], io), 0);
  assert.equal(JSON.parse(stdout).data.id, 'example-goal');
  stdout = '';
  assert.equal(await main(['list', 'session', '--program', '2026-01_sample-program', '--mesocycle', '1', '--fields', 'id,name'], io), 0);
  assert.deepEqual(JSON.parse(stdout).items[0], { id: 'A', name: 'Upper body' });
  assert.equal(stderr, '');
});

test('AST mutations retain untouched comments, flow style, and sibling ordering', () => {
  const profile = document('profile.yaml');
  applyResourceOperation(profile, request('update', 'profile-equipment', { id: 'bench' }), { name: 'Flat bench' });
  assert.match(profile.toString(), /# equipment\[\]\.id must exist/);
  assert.match(profile.toString(), /name: "Chest Press",\n      category: machine/);

  const macrocycle = document('macrocycle.yaml');
  applyResourceOperation(macrocycle, request('add', 'macrocycle-revision'), { ref: 'mesocycle-1/review.md', date: '2026-02-01', summary: 'Adjusted volume' });
  const serialized = macrocycle.toString();
  assert.match(serialized, /revisions: .*# e\.g\./);
  assert.ok(serialized.indexOf('mesocycles:') < serialized.indexOf('weekly_split:'));

  const sessions = document('sessions.yaml');
  applyResourceOperation(sessions, request('move', 'session', { id: 'C', before: 'A' }), {});
  const sessionText = sessions.toString();
  assert.match(sessionText, /# format: standard/);
  assert.ok(sessionText.indexOf('id: C') < sessionText.indexOf('id: A'));
});

test('CLI validates and atomically persists one accepted resource mutation', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'workout-data-write-'));
  cpSync(new URL('./fixtures/workspace/', import.meta.url), workspace, { recursive: true });
  let stdout = '';
  let stderr = '';
  const io = { cwd: workspace, stdout: { write: (text) => { stdout += text; } }, stderr: { write: (text) => { stderr += text; } } };
  assert.equal(await main(['update', 'profile', '--data', '{"language":"fr"}'], io), 0);
  const receipt = JSON.parse(stdout);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.validation.passed, true);
  assert.match(readFileSync(join(workspace, 'profile.yaml'), 'utf8'), /language: fr/);
  assert.equal(stderr, '');
});

test('CLI stores a status note as text and renders successful text responses', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'workout-data-note-'));
  cpSync(new URL('./fixtures/workspace/', import.meta.url), workspace, { recursive: true });
  let stdout = '';
  let stderr = '';
  const io = { cwd: workspace, stdout: { write: (text) => { stdout += text; } }, stderr: { write: (text) => { stderr += text; } } };
  assert.equal(await main(['add', 'status-note', '--program', '2026-01_sample-program', '--data', '{"text":"Deload"}', '--format', 'text'], io), 0);
  assert.match(stdout, /Added status-note/);
  assert.match(readFileSync(join(workspace, 'programs/2026-01_sample-program/status.yaml'), 'utf8'), /notes: \[ Deload \]/);
  stdout = '';
  assert.equal(await main(['get', 'program-status', '--program', '2026-01_sample-program', '--format', 'text'], io), 0);
  assert.match(stdout, /program-status/);
  assert.doesNotMatch(stdout, /^\{/);
  assert.equal(stderr, '');
});

test('remove and move require an empty JSON object payload', async () => {
  for (const argv of [
    ['remove', 'goal', '--program', 'plan', '--id', 'example-goal'],
    ['move', 'session', '--program', 'plan', '--mesocycle', '1', '--id', 'A', '--after', 'C'],
  ]) {
    const { io, output } = memoryIo();
    assert.equal(await main(argv, io), 1);
    assert.equal(JSON.parse(output.stderr).code, 'invalid_payload');
  }
  const { io, output } = memoryIo();
  assert.equal(await main(['remove', 'goal', '--program', 'plan', '--id', 'example-goal', '--data', '{"extra":true}'], io), 1);
  assert.equal(JSON.parse(output.stderr).code, 'invalid_payload');
});

test('CLI rejects an empty singleton update payload', async () => {
  const { io, output } = memoryIo();
  assert.equal(await main(['update', 'program-status', '--program', 'plan', '--data', '{}'], io), 1);
  assert.equal(JSON.parse(output.stderr).code, 'invalid_payload');
});

test('CLI updates sessions period and source inside meta while advancing document metadata', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'workout-data-sessions-meta-'));
  cpSync(new URL('./fixtures/workspace/', import.meta.url), workspace, { recursive: true });
  const { io, output } = memoryIo(workspace);
  const argv = ['update', 'sessions', '--program', '2026-01_sample-program', '--mesocycle', '1', '--as-of', '2026-02-01', '--data', '{"period":{"start":"2026-02-01","end":"2026-02-28"},"source":"review"}'];
  assert.equal(await main(argv, io), 0);
  assert.equal(JSON.parse(output.stdout).validation.passed, true);
  const persisted = loadRoundTripDocument(join(workspace, 'programs/2026-01_sample-program/mesocycle-1/sessions.yaml')).toJSON();
  assert.deepEqual(persisted.meta.period, { start: '2026-02-01', end: '2026-02-28' });
  assert.equal(persisted.meta.source, 'review');
  assert.equal(persisted.meta.version, 2);
  assert.equal(persisted.meta.last_modified, '2026-02-01');
  assert.equal(persisted.period, undefined);
  assert.equal(persisted.source, undefined);
});

test('CLI validates one program or the workspace without a resource name', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'workout-data-validate-'));
  cpSync(new URL('./fixtures/workspace/', import.meta.url), workspace, { recursive: true });
  const { io, output } = memoryIo(workspace);
  assert.equal(await main(['validate', '--program', '2026-01_sample-program'], io), 0);
  assert.equal(JSON.parse(output.stdout).scope, 'target-program');
  output.stdout = '';
  assert.equal(await main(['validate', '--scope', 'workspace', '--format', 'text'], io), 0);
  assert.match(output.stdout, /Validation passed for workspace/);
  for (const argv of [
    ['validate', '--program', '2026-01_sample-program', '--id', 'A'],
    ['validate', '--program', '2026-01_sample-program', '--mesocycle', '1'],
    ['validate', '--scope', 'workspace', '--before', 'A'],
    ['validate', '--scope', 'workspace', '--as-of', '2026-02-01'],
  ]) {
    output.stderr = '';
    assert.equal(await main(argv, io), 1);
    assert.equal(JSON.parse(output.stderr).code, 'invalid_target');
  }
});

test('CLI persists schema-valid mutations across nested resource documents', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'workout-data-matrix-'));
  cpSync(new URL('./fixtures/workspace/', import.meta.url), workspace, { recursive: true });
  const { io, output } = memoryIo(workspace);
  const program = '2026-01_sample-program';
  writeFileSync(join(workspace, 'programs', program, 'review.md'), '# review\n');
  const commands = [
    [['add', 'profile-equipment', '--data', '{"id":"adjustable_bench","name":"Adjustable bench","category":"accessory"}'], 'profile.yaml', /adjustable_bench/],
    [['add', 'status-pause', '--program', program, '--data', '{"start":"2026-02-01","end":"2026-02-02","reason":"Travel"}'], `programs/${program}/status.yaml`, /reason: Travel/],
    [['add', 'measurement', '--program', program, '--data', '{"date":"2026-02-01","values":{"body_weight":70}}'], `programs/${program}/goals.yaml`, /body_weight: 70/],
    [['add', 'reference-load', '--program', program, '--data', '{"date":"2026-02-01","exercise":"seated_row","load":55,"reps":10}'], `programs/${program}/goals.yaml`, /load: 55/],
    [['add', 'goal', '--program', program, '--data', '{"id":"new-goal","priority":2,"description":"Build back","tracked_measures":["body_weight"]}'], `programs/${program}/goals.yaml`, /id: new-goal/],
    [['update', 'program-status', '--program', program, '--data', '{"current_week":2}'], `programs/${program}/status.yaml`, /current_week: 2/],
    [['add', 'mesocycle-plan', '--program', program, '--data', '{"number":2,"name":"Next","weeks":{"start":4,"end":6},"dates":{"start":"2026-02-01","end":"2026-02-21"},"goal":"Build","parameters":{"sets":"3","reps":"8","rest_s":"90","intensity_pct_1rm":"80","technique":"Controlled"}}'], `programs/${program}/macrocycle.yaml`, /number: 2/],
    [['add', 'macrocycle-revision', '--program', program, '--data', '{"ref":"review.md","date":"2026-02-01","summary":"Adjusted"}'], `programs/${program}/macrocycle.yaml`, /summary: Adjusted/],
    [['add', 'weekly-split', '--program', program, '--data', '{"day":"wednesday","session":"Accessory","muscle_groups":["biceps"]}'], `programs/${program}/macrocycle.yaml`, /session: Accessory/],
    [['add', 'macrocycle-cardio', '--program', program, '--data', '{"type":"walk","duration_min":"30"}'], `programs/${program}/macrocycle.yaml`, /type: walk/],
    [['add', 'session-exercise', '--program', program, '--mesocycle', '1', '--id', 'A', '--data', '{"order":"A3","exercise":"seated_row","sets":3,"reps":"10"}'], `programs/${program}/mesocycle-1/sessions.yaml`, /order: A3/],
    [['add', 'session-cardio', '--program', program, '--mesocycle', '1', '--data', '{"type":"walk","duration_min":"30"}'], `programs/${program}/mesocycle-1/sessions.yaml`, /type: walk/],
    [['add', 'session', '--program', program, '--mesocycle', '1', '--data', '{"id":"B","name":"Lower","days":["wednesday"],"format":"standard","exercises":[{"order":"B1","exercise":"seated_row","sets":3,"reps":"10"}]}'], `programs/${program}/mesocycle-1/sessions.yaml`, /id: B/],
    [['update', 'session', '--program', program, '--mesocycle', '1', '--id', 'B', '--data', '{"name":"Lower updated"}'], `programs/${program}/mesocycle-1/sessions.yaml`, /name: Lower updated/],
    [['move', 'session', '--program', program, '--mesocycle', '1', '--id', 'B', '--before', 'A', '--data', '{}'], `programs/${program}/mesocycle-1/sessions.yaml`, /id: B/],
    [['remove', 'session', '--program', program, '--mesocycle', '1', '--id', 'B', '--data', '{}'], `programs/${program}/mesocycle-1/sessions.yaml`, /id: C/],
  ];
  for (const [argv, relativePath, expected] of commands) {
    output.stdout = '';
    output.stderr = '';
    assert.equal(await main(argv, io), 0, argv.join(' '));
    const receipt = JSON.parse(output.stdout);
    assert.equal(receipt.ok, true);
    if (argv[1] === 'profile-equipment') assert.equal(receipt.validation.scope, 'profile');
    assert.match(readFileSync(join(workspace, relativePath), 'utf8'), expected);
    assert.equal(output.stderr, '');
  }
});

test('CLI rejects removal of the sole goal or mesocycle plan without changing target bytes', async () => {
  const cases = [
    ['goals.yaml', ['remove', 'goal', '--program', '2026-01_sample-program', '--id', 'example-goal', '--data', '{}']],
    ['macrocycle.yaml', ['remove', 'mesocycle-plan', '--program', '2026-01_sample-program', '--id', '1', '--data', '{}']],
  ];
  for (const [file, argv] of cases) {
    const workspace = mkdtempSync(join(tmpdir(), 'workout-data-minimum-'));
    cpSync(new URL('./fixtures/workspace/', import.meta.url), workspace, { recursive: true });
    const path = join(workspace, 'programs', '2026-01_sample-program', file);
    const original = readFileSync(path, 'utf8');
    const { io, output } = memoryIo(workspace);
    assert.equal(await main(argv, io), 1);
    assert.equal(JSON.parse(output.stderr).code, 'schema_invalid');
    assert.equal(readFileSync(path, 'utf8'), original);
  }
});

test('persisted nested session mutations retain unrelated comments, flow style, and order', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'workout-data-preserve-'));
  cpSync(new URL('./fixtures/workspace/', import.meta.url), workspace, { recursive: true });
  const { io } = memoryIo(workspace);
  const program = '2026-01_sample-program';
  assert.equal(await main(['move', 'session', '--program', program, '--mesocycle', '1', '--id', 'C', '--before', 'A', '--data', '{}'], io), 0);
  assert.equal(await main(['add', 'session-exercise', '--program', program, '--mesocycle', '1', '--id', 'A', '--data', '{"order":"A3","exercise":"seated_row","sets":3,"reps":"10"}'], io), 0);
  const text = readFileSync(join(workspace, 'programs', program, 'mesocycle-1/sessions.yaml'), 'utf8');
  assert.match(text, /# format: standard/);
  assert.match(text, /period: \{ start: 2026-01-01, end: 2026-01-28 \}/);
  assert.match(text, /order: "A1",\n          superset: "chest-back"/);
  assert.ok(text.indexOf('id: C') < text.indexOf('id: A'));
});


test('session exercise removal selects one order and retains the remaining exercise', () => {
  const sessions = document('sessions.yaml');
  const result = applyResourceOperation(sessions, request('remove', 'session-exercise', { id: 'A', order: 'A2' }), {});
  assert.deepEqual(result.selector, { id: 'A', order: 'A2' });
  assert.deepEqual(readResource(sessions, request('list', 'session-exercise', { id: 'A' })).items.map(({ order }) => order), ['A1']);
});

test('session exercise add rejects duplicate normalized orders without mutation', () => {
  const sameText = document('sessions.yaml');
  const sameTextBefore = String(sameText);
  expectCode(() => applyResourceOperation(sameText, request('add', 'session-exercise', { id: 'A' }), { order: 'A1', exercise: 'seated_row', sets: 3, reps: '10' }), 'already_exists');
  assert.equal(String(sameText), sameTextBefore);

  const numeric = document('sessions.yaml');
  numeric.getIn(['sessions', 0, 'exercises', 0], true).set('order', 1);
  const numericBefore = String(numeric);
  expectCode(() => applyResourceOperation(numeric, request('add', 'session-exercise', { id: 'A' }), { order: '1', exercise: 'seated_row', sets: 3, reps: '10' }), 'already_exists');
  assert.equal(String(numeric), numericBefore);
});


test('session exercise removal rejects missing and duplicate orders without mutation', () => {
  const missing = document('sessions.yaml');
  const missingBefore = String(missing);
  expectCode(() => applyResourceOperation(missing, request('remove', 'session-exercise', { id: 'A', order: 'missing' }), {}), 'not_found');
  assert.equal(String(missing), missingBefore);

  const duplicate = document('sessions.yaml');
  const exercises = duplicate.getIn(['sessions', 0, 'exercises'], true);
  exercises.add(exercises.items[0].clone());
  const duplicateBefore = String(duplicate);
  expectCode(() => applyResourceOperation(duplicate, request('remove', 'session-exercise', { id: 'A', order: 'A1' }), {}), 'conflict');
  assert.equal(String(duplicate), duplicateBefore);
});

test('CLI atomically rejects removal of a session exercise when it is the sole exercise', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'workout-data-session-minimum-'));
  cpSync(new URL('./fixtures/workspace/', import.meta.url), workspace, { recursive: true });
  const path = join(workspace, 'programs', '2026-01_sample-program', 'mesocycle-1/sessions.yaml');
  const original = readFileSync(path, 'utf8');
  const { io, output } = memoryIo(workspace);
  assert.equal(await main(['remove', 'session-exercise', '--program', '2026-01_sample-program', '--mesocycle', '1', '--id', 'C', '--order', '1', '--data', '{}'], io), 1);
  assert.equal(JSON.parse(output.stderr).code, 'schema_invalid');
  assert.equal(readFileSync(path, 'utf8'), original);
});

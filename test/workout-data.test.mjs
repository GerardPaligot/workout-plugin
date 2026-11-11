import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFromTemplate, resolveTarget } from '../src/workout-data/workspace.mjs';
import { main } from '../src/workout-data/cli.mjs';
import { RESOURCE_DEFINITIONS, ResourceRequestError, resolveResourceRequest } from '../src/workout-data/resources.mjs';

function ioFor(cwd = mkdtempSync(join(tmpdir(), 'workout-data-'))) {
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

async function run(argv) {
  const { io, output } = ioFor();
  const exitCode = await main(argv, io);
  return { exitCode, ...output };
}

async function expectError(argv, code) {
  const result = await run(argv);
  assert.notEqual(result.exitCode, 0);
  assert.equal(result.stdout, '');
  const error = JSON.parse(result.stderr);
  assert.equal(error.ok, false);
  assert.equal(error.code, code);
  assert.equal(typeof error.message, 'string');
}

test('help writes usage and succeeds', async () => {
  const result = await run(['--help']);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /workout-data/);
  assert.equal(result.stderr, '');
});

test('missing verb or resource emits an invalid target error', async () => {
  await expectError([], 'invalid_target');
  await expectError(['get'], 'invalid_target');
});

test('unsupported resource verb emits an invalid target error', async () => {
  await expectError(['update', 'status-note', '--program', 'example', '--data', '{}'], 'invalid_target');
});

test('write payload must use exactly one data source', async () => {
  await expectError(['update', 'profile', '--data', '{}', '--data-file', 'data.json'], 'invalid_payload');
  await expectError(['update', 'profile'], 'invalid_payload');
});

test('write payload must be a JSON object', async () => {
  await expectError(['update', 'profile', '--data', '{'], 'invalid_payload');
  await expectError(['update', 'profile', '--data', '[]'], 'invalid_payload');
});

test('as-of and format values are validated', async () => {
  await expectError(['update', 'profile', '--data', '{}', '--as-of', '2026-13-45'], 'invalid_payload');
  await expectError(['get', 'profile', '--format', 'yaml'], 'invalid_payload');
});

test('moving a session requires exactly one placement flag', async () => {
  const base = ['move', 'session', '--program', 'example', '--mesocycle', '1', '--id', 'A'];
  await expectError(base, 'invalid_target');
  await expectError([...base, '--before', 'B', '--after', 'C'], 'invalid_target');
});

test('mesocycle-plan selectors require a positive integer number', async () => {
  for (const id of ['0', '-1', '1.5', 'NaN']) {
    assert.throws(
      () => resolveResourceRequest({ verb: 'get', resource: 'mesocycle-plan', options: { program: 'example', id } }),
      (error) => error instanceof ResourceRequestError && error.code === 'invalid_target',
    );
  }
});

test('goal and mesocycle-plan declare their mutable payload fields', () => {
  assert.deepEqual(RESOURCE_DEFINITIONS.goal.add, {
    required: ['id', 'priority', 'description', 'tracked_measures'], optional: ['deadline'],
  });
  assert.deepEqual(RESOURCE_DEFINITIONS.goal.update, ['priority', 'description', 'tracked_measures', 'deadline']);
  assert.deepEqual(RESOURCE_DEFINITIONS['mesocycle-plan'].add, {
    required: ['number', 'name', 'weeks', 'dates', 'goal', 'parameters'], optional: [],
  });
  assert.deepEqual(RESOURCE_DEFINITIONS['mesocycle-plan'].update, ['name', 'weeks', 'dates', 'goal', 'parameters']);
});

test('target resolution rejects unsafe program names and symlinked program directories', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'workout-data-workspace-'));
  const request = resolveResourceRequest({ verb: 'get', resource: 'program-status', options: { program: 'safe' } });

  for (const program of ['../x', '/tmp/x', '.', 'archives', 'a/b', 'bad\u0000name']) {
    const unsafe = resolveResourceRequest({ verb: 'get', resource: 'program-status', options: { program } });
    assert.throws(
      () => resolveTarget(workspace, unsafe),
      (error) => error instanceof ResourceRequestError && error.code === 'invalid_target',
    );
  }

  const outside = mkdtempSync(join(tmpdir(), 'workout-data-outside-'));
  mkdirSync(join(workspace, 'programs'), { recursive: true });
  symlinkSync(outside, join(workspace, 'programs', 'safe'));
  assert.throws(
    () => resolveTarget(workspace, request),
    (error) => error instanceof ResourceRequestError && error.code === 'invalid_target',
  );
});

test('target resolution rejects a non-directory target ancestor', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'workout-data-workspace-'));
  writeFileSync(join(workspace, 'programs'), 'not a directory\n');
  const request = resolveResourceRequest({ verb: 'get', resource: 'program-status', options: { program: 'safe' } });
  assert.throws(
    () => resolveTarget(workspace, request),
    (error) => error instanceof ResourceRequestError && error.code === 'invalid_target',
  );
});

test('target resolution uses the registry definition instead of a forged request definition', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'workout-data-workspace-'));
  const request = resolveResourceRequest({ verb: 'get', resource: 'profile', options: {} });
  const forged = { ...request, definition: { ...request.definition, document: '../escaped.yaml', target: 'program' }, program: 'safe' };
  const target = resolveTarget(workspace, forged);
  assert.equal(target.path, join(target.workspace, 'profile.yaml'));
  assert.equal(target.location, 'profile.yaml');
});

test('target resolution confines profile and live program documents to the workspace', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'workout-data-workspace-'));
  const profile = resolveTarget(workspace, resolveResourceRequest({ verb: 'get', resource: 'profile', options: {} }));
  const status = resolveTarget(workspace, resolveResourceRequest({ verb: 'get', resource: 'program-status', options: { program: '2026-plan' } }));

  assert.equal(profile.path, join(profile.workspace, 'profile.yaml'));
  assert.equal(status.path, join(status.workspace, 'programs', '2026-plan', 'status.yaml'));
  assert.equal(status.location, 'programs/2026-plan/status.yaml');
  assert.equal(status.programDir, join(status.workspace, 'programs', '2026-plan'));
});

test('target resolution rejects invalid mesocycle selectors', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'workout-data-workspace-'));
  for (const mesocycle of ['0', '-1', '1.5', 'NaN']) {
    assert.throws(
      () => resolveResourceRequest({ verb: 'get', resource: 'sessions', options: { program: 'plan', mesocycle } }),
      (error) => error instanceof ResourceRequestError && error.code === 'invalid_target',
    );
  }
  const request = resolveResourceRequest({ verb: 'get', resource: 'sessions', options: { program: 'plan', mesocycle: '2' } });
  const target = resolveTarget(workspace, request);
  assert.equal(target.path, join(target.workspace, 'programs', 'plan', 'mesocycle-2', 'sessions.yaml'));
});

test('template creation derives target metadata and removes absent optional examples', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'workout-data-workspace-'));
  const profileTarget = resolveTarget(workspace, resolveResourceRequest({ verb: 'create', resource: 'profile', options: {} }));
  const profile = createFromTemplate('profile', {
    language: 'fr', units: { load: 'kg', length: 'cm' }, equipment: [{ id: 'bench', name: 'Bench', category: 'accessory' }],
  }, profileTarget, '2026-11-10').toJS();
  assert.deepEqual(profile.meta, { schema_version: 1 });
  assert.equal(profile.coach_style, undefined);

  const statusTarget = resolveTarget(workspace, resolveResourceRequest({ verb: 'create', resource: 'program-status', options: { program: 'plan' } }));
  const status = createFromTemplate('program-status', { status: 'active', start_date: '2026-11-01' }, statusTarget, '2026-11-10').toJS();
  assert.equal(status.program, 'plan');
  assert.deepEqual(status.meta, { schema_version: 1 });
  assert.equal(status.current_mesocycle, undefined);
  assert.equal(status.pauses, undefined);

  const goalsTarget = resolveTarget(workspace, resolveResourceRequest({ verb: 'create', resource: 'goals', options: { program: 'plan' } }));
  const goals = createFromTemplate('goals', { goals: [], measurements: [] }, goalsTarget, '2026-11-10').toJS();
  assert.deepEqual(goals, { meta: { schema_version: 1 }, goals: [], measurements: [] });

  const macroTarget = resolveTarget(workspace, resolveResourceRequest({ verb: 'create', resource: 'macrocycle', options: { program: 'plan' } }));
  const macrocycle = createFromTemplate('macrocycle', {
    name: 'Plan', start_date: '2026-11-01', end_date: '2027-01-01', frequency: '3 sessions/week', split: 'full_body', mesocycles: [], weekly_split: [],
  }, macroTarget, '2026-11-10').toJS();
  assert.deepEqual(macrocycle.meta, { schema_version: 1, version: 1, last_modified: '2026-11-10', revisions: [] });
  assert.equal(macrocycle.scheduling, undefined);
  assert.equal(macrocycle.cardio, undefined);

  const sessionsTarget = resolveTarget(workspace, resolveResourceRequest({ verb: 'create', resource: 'sessions', options: { program: 'plan', mesocycle: '2' } }));
  const sessions = createFromTemplate('sessions', { sessions: [] }, sessionsTarget, '2026-11-10').toJS();
  assert.deepEqual(sessions.meta, { schema_version: 1, version: 1, mesocycle: 2, last_modified: '2026-11-10', revisions: [] });
  assert.equal(sessions.cardio, undefined);
});

test('template creation rejects an existing document and unknown or derived payload keys', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'workout-data-workspace-'));
  const target = resolveTarget(workspace, resolveResourceRequest({ verb: 'create', resource: 'profile', options: {} }));
  writeFileSync(target.path, 'meta: { schema_version: 1 }\n');
  const body = { language: 'fr', units: { load: 'kg', length: 'cm' }, equipment: [{ id: 'bench', name: 'Bench', category: 'accessory' }] };
  assert.throws(() => createFromTemplate('profile', body, target, '2026-11-10'), (error) => error instanceof ResourceRequestError && error.code === 'already_exists');

  const statusTarget = resolveTarget(workspace, resolveResourceRequest({ verb: 'create', resource: 'program-status', options: { program: 'plan' } }));
  assert.throws(() => createFromTemplate('program-status', { status: 'active', start_date: '2026-11-01', program: 'other' }, statusTarget, '2026-11-10'), (error) => error instanceof ResourceRequestError && error.code === 'invalid_payload');
});

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const repo = process.cwd();
const run = promisify(execFile);
const tools = JSON.parse(await readFile(join(import.meta.dirname, 'tools.json')));
const actualDate = new Date().toISOString().slice(0, 10);

async function fixture(check) {
  const root = await mkdtemp(join(tmpdir(), 'opengym-release-recheck-'));
  const workspace = join(root, 'workspace');
  const program = '2026-01_rotation-program';
  const programDir = join(workspace, 'programs', program);
  const stateDir = join(root, 'state');
  await cp(join(repo, 'test/fixtures/workspace-rotation'), workspace, { recursive: true });
  const second = join(programDir, 'mesocycle-2');
  await mkdir(second);
  const sessions = await readFile(join(programDir, 'mesocycle-1/sessions.yaml'), 'utf8');
  await writeFile(join(second, 'sessions.yaml'), sessions.replace('mesocycle: 1', 'mesocycle: 2').replace('id: A', 'id: D').replace('id: B', 'id: E'));
  const workspaceAlias = join(root, 'workspace-alias');
  await symlink(workspace, workspaceAlias);
  const configPath = join(root, 'config.json');
  const inputPath = join(root, 'input.json');
  const routines = [];
  const workouts = [];
  const actualSaves = [];
  const saves = [];
  let revision = 1;
  let responseMode;
  let delayed;
  let createCount = 0;
  let previewCount = 0;
  const errors = [];
  const calls = [];
  let truncate = false;
  const server = createServer(async (request, response) => {
    const send = (body, status = 200, headers = {}) => {
      response.writeHead(status, { 'content-type': 'application/json', ...headers });
      response.end(JSON.stringify(body));
    };
    try {
      if (request.url === '/api/token/me') return send({ user: { id: 'profile', name: 'Profile' }, token: { id: 'token', name: 'Token', exp: null, scopes: { workouts: 'apply', plans: 'apply', bodyweight: 'off', measurements: 'off', notes: 'off' } } });
      if (request.url === '/api/token/data') return send({ rev: revision, state: { routines: routines.map(routine => ({ id: routine.id, name: routine.name, ex: routine.exercises.map(exercise => ({ id: exercise.id })) })), week: {} } });
      let body = '';
      for await (const chunk of request) body += chunk;
      const message = JSON.parse(body);
      const reply = result => send({ jsonrpc: '2.0', id: message.id, result });
      const value = result => reply({ content: [{ type: 'text', text: JSON.stringify(result) }] });
      if (message.method === 'initialize') return reply({ protocolVersion: '2025-03-26' });
      if (message.method === 'notifications/initialized') return send(null, 202);
      if (message.method === 'tools/list') return reply({ tools });
      const { name, arguments: args } = message.params;
      calls.push({ name, args });
      if (name === 'list_routines') return value({ routines: routines.map(routine => ({ id: routine.id, name: routine.name })), revision });
      if (name === 'get_routine') return value({ ...routines.find(routine => routine.id === args.routine_id), revision });
      if (name === 'preview_session') {
        const routine = routines.find(item => item.id === args.routine_id);
        return value({ routine_id: routine.id, unit: routine.unit, exercises: routine.exercises.map(exercise => ({ id: exercise.id, opening_sets: Array.from({ length: exercise.sets }, () => ({ phase: 'work', w: exercise.weight, r: exercise.reps })) })) });
      }
      if (name === 'create_routine' || name === 'update_routine') {
        const routine = { id: args.routine_id || (args.dry_run ? 'preview-' + ++previewCount : 'created-' + ++createCount), name: args.name, unit: args.unit, exercises: args.exercises.map(exercise => ({ id: exercise.exercise, sets: exercise.sets, reps: exercise.reps, weight: exercise.weight })) };
        if (args.expected_revision !== undefined && args.expected_revision !== revision) return value({ saved: false, conflict: true, revision });
        if (args.dry_run) return value({ saved: false, dry_run: true, would_save: { routine }, revision });
        saves.push({ tool: name, arguments: args, outcome: responseMode || 'saved' });
        const save = () => {
          const index = routines.findIndex(item => item.id === routine.id);
          if (index < 0) routines.push(routine);
          else routines[index] = routine;
          revision++;
        };
        if (responseMode === 'limited') return send({ jsonrpc: '2.0', error: { code: -32000, message: 'rate limited' }, id: null }, 429, { 'retry-after': '0' });
        if (responseMode === 'lost') { delayed = save; return response.destroy(); }
        save();
        return value({ saved: true, routine, revision });
      }
      if (name === 'log_workout') {
        const workout = { id: 'hermes-a', date: args.date, routine_name: 'Workout', unit: args.unit, entries: args.exercises.map(exercise => ({ id: exercise.exercise, sets: exercise.sets.map(set => ({ r: set.reps, w: set.weight })) })) };
        const view = { workout_id: workout.id, date: args.date, start: args.start, name: workout.routine_name, unit: args.unit, exercises: args.exercises.map(exercise => ({ id: exercise.exercise, sets: exercise.sets })) };
        if (args.dry_run) return value({ logged: false, dry_run: true, would_log: view });
        actualSaves.push({ arguments: args, outcome: responseMode || 'saved' });
        if (responseMode === 'limited') return send({ jsonrpc: '2.0', error: { code: -32000, message: 'rate limited' }, id: null }, 429, { 'retry-after': '0' });
        workouts.push(workout);
        return value({ logged: true, ...view, revision: ++revision });
      }
      if (name === 'list_workouts') {
        if (truncate) return value({ workouts: [], matching_count: 201, returned_count: 0, truncated: true });
        const selected = workouts.filter(workout => workout.date >= args.from && workout.date <= args.to);
        const rows = selected.map(({ id, date }) => ({ id, date }));
        return value({ workouts: rows, matching_count: rows.length, returned_count: rows.length, truncated: false });
      }
      if (name === 'get_workout') return value(workouts.find(workout => workout.id === args.workout_id) || { id: null });
      throw new Error(name);
    } catch (error) {
      errors.push(error.message);
      return send({ error: 'fixture failure' }, 500);
    }
  });
  await new Promise((done, reject) => server.once('error', reject).listen(0, '127.0.0.1', done));
  const config = { endpoint: 'http://127.0.0.1:' + server.address().port, trustedPrivateHttp: true, profileId: 'profile', stateDir, serverTimezone: 'UTC' };
  const setServerTimezone = async value => { config.serverTimezone = value; await writeFile(configPath, JSON.stringify(config)); };
  await setServerTimezone('UTC');
  const cli = resolve(repo, 'src/opengym/cli.mjs');
  const command = async (verb, input, ...extra) => {
    const args = [cli, verb, '--config', configPath, '--workspace', workspaceAlias, '--program', program, ...extra];
    if (input) {
      await writeFile(inputPath, JSON.stringify(input));
      args.push('--input', inputPath);
    }
    try { return JSON.parse((await run(process.execPath, args, { env: { ...process.env, OPENGYM_TOKEN: 'synthetic-review-token' } })).stdout); }
    catch (error) { return JSON.parse(error.stdout); }
  };
  const readState = async () => JSON.parse(await readFile(join(stateDir, (await readdir(stateDir))[0], 'state.json')));
  const readProjection = async () => JSON.parse(await readFile(join(programDir, '.opengym-projection.json')));
  try {
    const connection = await command('connect');
    if (connection.state !== 'connected') throw new Error(JSON.stringify(connection));
    const coreState = async () => JSON.parse((await run(process.execPath, [resolve(repo, 'scripts/state.mjs'), workspaceAlias])).stdout);
    const setMesocycle = async n => {
      const cli = resolve(repo, 'scripts/workout-data.mjs');
      return JSON.parse((await run(process.execPath, [cli, '--workspace', workspaceAlias, 'update', 'program-status', '--program', program, '--data', JSON.stringify({ current_mesocycle: n, current_week: 1 })])).stdout);
    };
    return await check({
      command, routines, workouts, saves, actualSaves, readState, readProjection, setServerTimezone,
      setMesocycle, coreState, calls, config, programDir, program, workspace: await realpath(workspace),
      mode: value => { responseMode = value; },
      setTruncated: value => { truncate = value; },
      finishDelayed: () => delayed?.(),
      close: () => new Promise((done, reject) => server.close(error => error ? reject(error) : done())),
    });
  } finally {
    await new Promise(done => server.close(done));
    await rm(root, { recursive: true, force: true });
    if (errors.length) throw new Error(errors.join(', '));
  }
}

const publication = (revision, weight) => ({
  templateId: 'local-a',
  revision,
  payload: { name: 'Strength', unit: 'kg', exercises: [{ exercise: '0025', sets: 3, reps: 5, weight }] },
});
const review = (f, input) => f.command('publish', input, '--dry-run');
const approve = (f, input, proposal) => f.command('publish', { ...input, approval: proposal.data?.approval });
const sync = (f, range = { from: '2020-01-01', to: actualDate }) => f.command('sync', range, '--once');
const history = f => f.command('history', { limit: 10 });
const workout = (date, id = 'phone-a') => ({ id, date, unit: 'kg', entries: [{ id: '0025', sets: [{ r: 5, w: 50 }] }] });
const adopt = async (f, proposed) => {
  const preview = await f.command('adopt', proposed, '--dry-run');
  assert.equal(preview.state, 'review', JSON.stringify(preview));
  const applied = await f.command('adopt', { proposed, mapping: proposed, approval: preview.data?.approval });
  assert.equal(applied.state, 'adopted', JSON.stringify(applied));
  return applied;
};

const results = {};
async function check(name, scenario) {
  if (process.env.WORKOUT_RECHECK_CASE && name !== process.env.WORKOUT_RECHECK_CASE) return;
  const observed = {};
  try {
    await fixture(f => scenario(f, observed));
    results[name] = { verdict: 'PASS', ...observed };
  } catch (error) {
    results[name] = { verdict: 'FAIL', ...observed, error: error.stack };
    process.exitCode = 1;
  }
}

await check('semanticReplayIsNoop', async (f, observed) => {
  const request = publication('r1', 50);
  const initial = await approve(f, request, await review(f, request));
  const reordered = { ...request, payload: { unit: 'kg', exercises: [{ weight: 50, reps: 5, sets: 3, exercise: '0025' }], name: 'Strength' } };
  const repeated = await review(f, reordered);
  const replay = await approve(f, reordered, repeated);
  const rebasedNoop = await review(f, { ...reordered, rebase: true });
  f.routines[0].name = 'Phone edit';
  const conflict = await review(f, reordered);
  Object.assign(observed, { initial, repeated, replay, rebasedNoop, conflict, saves: f.saves, publications: (await f.readState()).publications.length });
  assert.equal(initial.state, 'verified');
  assert.equal(repeated.state, 'verified'); assert.equal(rebasedNoop.state, 'verified');
  assert.equal(conflict.state, 'conflict');
  assert.equal(f.saves.length, 1, 'Same prescription with reordered JSON keys must be a no-op');
});


await check('legacyReconnectDoesNotDispatchBeforeAdoption', async (f, observed) => {
  const request = publication('r1', 50);
  const proposal = await review(f, request);
  f.mode('limited');
  const queued = await approve(f, request, proposal);
  const markerPath = join(f.programDir, '.opengym-backend.json');
  const marker = JSON.parse(await readFile(markerPath));
  const { program: _program, ...rest } = marker;
  await writeFile(markerPath, JSON.stringify({ ...rest, version: 1 }));
  const originalState = await f.coreState();
  const rejectedSync = await sync(f);
  const connected = await f.command('connect');
  const requiresAdoption = JSON.parse(await readFile(markerPath)).requiresAdoption;
  const rejectedPublish = await review(f, request);
  f.mode(null);
  const afterReconnect = await sync(f);
  Object.assign(observed, { queued, originalProgress: originalState.progress, rejectedSync, connected, requiresAdoption, rejectedPublish, afterReconnect, writes: f.saves.map(save => save.outcome), routines: f.routines });
  assert.equal(queued.state, 'retry_at');
  assert.equal(originalState.progress.status, 'unknown');
  assert.equal(rejectedSync.ok, false);
  assert.equal(connected.state, 'connected');
  assert.equal(requiresAdoption, true);
  assert.equal(rejectedPublish.ok, false);
  assert.deepEqual(observed.writes, ['limited'], 'Sync must honor the required adoption gate before writing');
  assert.equal(afterReconnect.data.pendingJobs[0].state, 'needs_review');
  assert.equal((await f.readProjection()).requiresAdoption, true);
  f.workouts.push(workout(actualDate));
  await sync(f);
  assert.equal((await history(f)).data.observations[0].id, 'phone-a');
  await adopt(f, { templates: {}, assignments: [] });
  const stale = await approve(f, request, proposal);
  assert.equal(stale.state, 'needs_review');
  const fresh = await review(f, request);
  assert.equal(fresh.state, 'review');
  assert.equal((await approve(f, request, fresh)).state, 'verified');
  assert.equal(f.saves.length, 2);
  Object.assign(observed, { stale, fresh, finalWrites: f.saves.map(save => save.outcome) });
});


process.stdout.write(JSON.stringify(results) + '\n');

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
  const root = await mkdtemp(join(tmpdir(), 'opengym-dispatch-recheck-'));
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
      if (request.url === '/api/token/data') return send({ rev: revision, state: { routines: routines.map(routine => ({ id: routine.id, name: routine.name, ex: routine.exercises.map(exercise => ({ id: exercise.id })) })), week: {}, unit: 'kg', workouts: workouts.map(({ id, date, start, entries }) => ({ id, d: date, start, entries })) } });
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
        const workout = { id: 'hermes-a', date: args.date, ...(args.start ? { start: Date.parse(args.date + 'T' + args.start + ':00Z') } : {}), routine_name: 'Workout', unit: args.unit, entries: args.exercises.map(exercise => ({ id: exercise.exercise, sets: exercise.sets.map(set => ({ r: set.reps, w: set.weight })) })) };
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
  const cli = resolve(repo, process.env.WORKOUT_RECHECK_BUNDLE || 'plugins/workout-opengym/skills/opengym/scripts/workout-opengym.mjs');
  let fault;
  const command = async (verb, input, ...extra) => {
    const args = [...(fault ? ['--import', join(import.meta.dirname, 'stop-at-rename.mjs')] : []), cli, verb, '--config', configPath, '--workspace', workspaceAlias, '--program', program, ...extra];
    if (input) {
      await writeFile(inputPath, JSON.stringify(input));
      args.push('--input', inputPath);
    }
    try { return JSON.parse((await run(process.execPath, args, { env: { ...process.env, OPENGYM_TOKEN: 'synthetic-review-token', WORKOUT_RECHECK_FAULT: fault } })).stdout); }
    catch (error) { if (error.signal) return { signal: error.signal }; return JSON.parse(error.stdout); }
  };
  const statePath = async () => join(stateDir, (await readdir(stateDir))[0], 'state.json');
  const readState = async () => JSON.parse(await readFile(await statePath()));
  const writeState = async state => writeFile(await statePath(), JSON.stringify(state));
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
      command, routines, workouts, saves, actualSaves, readState, writeState, readProjection, setServerTimezone,
      editPhoneRoutine: weight => { routines[0].exercises[0].weight = weight; revision++; },
      setFault: value => { fault = value; },
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
    results[name] = { verdict: 'BLOCK', ...observed, error: error.stack };
    process.exitCode = 1;
  }
}

const parseJson = async file => JSON.parse(await readFile(file));
const markerPath = f => join(f.programDir, '.opengym-backend.json');
const projectionPath = f => join(f.programDir, '.opengym-projection.json');
const readMarker = f => parseJson(markerPath(f));
const writeJson = (file, value) => writeFile(file, JSON.stringify(value));
const unknown = { status: 'unknown', lastSession: null, nextSessionId: null, needs_mapping: true };
const mapping = {
  templates: {},
  assignments: [{ occurrenceId: 'phone-a1', sessionId: 'A', order: 1, workoutId: 'phone-a' }, { occurrenceId: 'b1', sessionId: 'B', order: 2 }],
};
const reduced = result => ({ ok: result.ok, state: result.state, id: result.data?.id, routineId: result.data?.routineId, workoutId: result.data?.workoutId, reason: result.data?.reason, error: result.error });
const mutationTools = new Set(['create_routine', 'update_routine', 'log_workout']);

async function legacyMarker(f) {
  const { program: discarded, ...marker } = await readMarker(f);
  await writeJson(markerPath(f), { ...marker, version: 1 });
}

await check('queuedPublicationAndActualsWaitForAdoption', async (f, observed) => {
  const prescription = publication('r1', 50);
  const log = { occurrenceId: 'b1', sessionId: 'B', timezone: 'UTC', payload: {
    date: actualDate, start: '09:00', unit: 'kg', exercises: [{ exercise: '0025', sets: [{ reps: 5, weight: 50 }] }],
  } };
  const oldPublication = await review(f, prescription);
  const oldLog = await f.command('log', log, '--dry-run');
  assert.equal(oldPublication.state, 'review');
  assert.equal(oldLog.state, 'review');
  f.mode('limited');
  const queuedPublication = await approve(f, prescription, oldPublication);
  const queuedLog = await f.command('log', { ...log, approval: oldLog.data.approval });
  f.mode(null);
  assert.equal(queuedPublication.state, 'retry_at', JSON.stringify(queuedPublication));
  assert.equal(queuedLog.state, 'retry_at', JSON.stringify(queuedLog));
  assert.deepEqual(f.saves.map(save => save.outcome), ['limited']);
  assert.deepEqual(f.actualSaves.map(save => save.outcome), ['limited']);
  assert.equal(f.routines.length + f.workouts.length, 0);
  f.workouts.push(workout('2026-07-01'));
  await legacyMarker(f);
  const rejectedLegacySync = await sync(f);
  assert.equal(rejectedLegacySync.ok, false);
  assert.equal((await f.command('connect')).state, 'connected');
  const pendingMarker = await readMarker(f);
  assert.equal(pendingMarker.requiresAdoption, true);

  const callsBefore = f.calls.length;
  const directPublication = await approve(f, prescription, oldPublication);
  const directLog = await f.command('log', { ...log, approval: oldLog.data.approval });
  const pendingSync = await sync(f);
  const pendingHistory = await history(f);
  const pendingProjection = await f.readProjection();
  const pendingCore = (await f.coreState()).progress;
  const blockedTools = f.calls.slice(callsBefore).filter(call => mutationTools.has(call.name));
  Object.assign(observed, {
    queued: [queuedPublication, queuedLog].map(reduced), legacySync: reduced(rejectedLegacySync), markerRequiresAdoption: pendingMarker.requiresAdoption,
    direct: [directPublication, directLog].map(reduced), pendingSync, historyIds: pendingHistory.data?.observations.map(row => row.id),
    pendingProjection: pendingProjection.requiresAdoption, pendingCore, mutationToolCalls: blockedTools,
  });
  assert.equal(directPublication.ok, false);
  assert.equal(pendingSync.state, 'synced', JSON.stringify(pendingSync));
  assert.ok(pendingSync.data.pendingJobs.every(job => job.state === 'needs_review'));
  assert.deepEqual(new Set(pendingSync.data.pendingJobs.map(job => job.id)), new Set([queuedPublication.data.id, queuedLog.data.id]));
  assert.deepEqual(observed.historyIds, ['phone-a']);
  assert.equal(pendingProjection.requiresAdoption, true);
  assert.deepEqual(pendingCore, unknown);
  assert.deepEqual(blockedTools, []);
  assert.deepEqual(f.saves.map(save => save.outcome), ['limited']);
  assert.deepEqual(f.actualSaves.map(save => save.outcome), ['limited']);

  await adopt(f, mapping);
  assert.notEqual((await readMarker(f)).requiresAdoption, true);
  assert.equal((await f.readProjection()).requiresAdoption, false);
  assert.equal((await f.coreState()).progress.nextSessionId, 'B');
  const oldPublicationReplay = await approve(f, prescription, oldPublication);
  const oldLogReplay = await f.command('log', { ...log, approval: oldLog.data.approval });
  assert.equal(oldPublicationReplay.state, 'needs_review');
  assert.equal(oldLogReplay.state, 'needs_review');
  const newPublication = await review(f, prescription);
  const newLog = await f.command('log', log, '--dry-run');
  assert.equal(newPublication.state, 'review', JSON.stringify(newPublication));
  assert.equal(newLog.state, 'review', JSON.stringify(newLog));
  assert.notEqual(newPublication.data.approval, oldPublication.data.approval);
  assert.notEqual(newLog.data.approval, oldLog.data.approval);
  const oldPublicationWithNewDraft = await approve(f, prescription, oldPublication);
  const oldLogWithNewDraft = await f.command('log', { ...log, approval: oldLog.data.approval });
  assert.equal(oldPublicationWithNewDraft.state, 'needs_review');
  assert.equal(oldLogWithNewDraft.ok, false);
  assert.deepEqual(f.saves.map(save => save.outcome), ['limited']);
  assert.deepEqual(f.actualSaves.map(save => save.outcome), ['limited']);

  // Native publication previews carry the profile revision, so apply that review first.
  const publishApplied = await approve(f, prescription, newPublication);
  const logApplied = await f.command('log', { ...log, approval: newLog.data.approval });
  const repeated = await sync(f);
  Object.assign(observed, {
    oldAfterAdoption: [oldPublicationReplay, oldLogReplay].map(reduced), oldWithNewDraft: [oldPublicationWithNewDraft, oldLogWithNewDraft].map(reduced),
    freshApplied: [publishApplied, logApplied].map(reduced), repeated: reduced(repeated), publicationSaves: f.saves.map(save => save.outcome),
    logSaves: f.actualSaves.map(save => save.outcome), remoteIds: [...f.routines, ...f.workouts].map(row => row.id),
  });
  assert.equal(publishApplied.state, 'verified', JSON.stringify(publishApplied));
  assert.equal(logApplied.state, 'verified', JSON.stringify(logApplied));
  assert.deepEqual(observed.publicationSaves, ['limited', 'saved']);
  assert.deepEqual(observed.logSaves, ['limited', 'saved']);
  assert.deepEqual(observed.remoteIds, [publishApplied.data.routineId, 'phone-a', logApplied.data.workoutId]);
});


await check('freshActualReviewAfterAdoptionWithoutPendingSync', async (f, observed) => {
  const request = { occurrenceId: 'b1', sessionId: 'B', timezone: 'UTC', payload: {
    date: actualDate, unit: 'kg', exercises: [{ exercise: '0025', sets: [{ reps: 5, weight: 50 }] }],
  } };
  const draft = await f.command('log', request, '--dry-run');
  assert.equal(draft.state, 'review');
  f.mode('limited');
  const queued = await f.command('log', { ...request, approval: draft.data.approval });
  f.mode(null);
  assert.equal(queued.state, 'retry_at');
  f.workouts.push(workout('2026-07-01'));
  await legacyMarker(f);
  assert.equal((await f.command('connect')).state, 'connected');
  assert.equal((await readMarker(f)).requiresAdoption, true);
  await adopt(f, mapping);
  const staleRetry = await sync(f);
  const submittedOldApproval = await f.command('log', { ...request, approval: draft.data.approval });
  const fresh = await f.command('log', request, '--dry-run');
  const usedReview = await f.command('log', { ...request, approval: fresh.data?.approval });
  Object.assign(observed, {
    queued: reduced(queued), staleRetry, submittedOldApproval: reduced(submittedOldApproval),
    freshReview: reduced(fresh), approvalChanged: fresh.data?.approval !== draft.data.approval,
    usedReview: reduced(usedReview), logSaves: f.actualSaves.map(save => save.outcome),
  });
  assert.equal(staleRetry.state, 'synced');
  assert.equal(staleRetry.data.pendingJobs.find(job => job.id === queued.data.id)?.state, 'needs_review');
  assert.equal(submittedOldApproval.state, 'needs_review');
  assert.equal(fresh.state, 'review');
  assert.equal(observed.approvalChanged, true, 'Fresh review after adoption must issue a different approval');
  assert.equal(usedReview.state, 'verified');
  assert.deepEqual(observed.logSaves, ['limited', 'saved']);
});


process.stdout.write(JSON.stringify(results) + '\n');

import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const repo = process.cwd();
const run = promisify(execFile);
const native = JSON.parse(await readFile(join(repo, 'test/fixtures/opengym/native-contract.json')));
const routineTools = JSON.parse(await readFile(join(repo, 'test/fixtures/opengym/routine-schemas.json')));
const tools = [...new Map([{ name: 'log_workout', inputSchema: native.logSchema }, ...routineTools, ...['list_workouts', 'get_workout', 'list_routines', 'get_routine', 'preview_session'].map(name => ({ name, inputSchema: { type: 'object', properties: {} } }))].map(tool => [tool.name, tool])).values()];
const actualDate = new Date().toISOString().slice(0, 10);

async function fixture(check) {
  const root = await mkdtemp(join(tmpdir(), 'opengym-final-review-'));
  const workspace = join(root, 'workspace');
  const program = '2026-01_sample-program';
  const programDir = join(workspace, 'programs', program);
  const stateDir = join(root, 'state');
  await mkdir(programDir, { recursive: true });
  await writeFile(join(programDir, 'status.yaml'), 'current_mesocycle: 1\n');
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
    const args = [cli, verb, '--config', configPath, '--workspace', workspace, '--program', program, ...extra];
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
    return await check({ command, routines, workouts, saves, actualSaves, readState, readProjection, setServerTimezone, setMesocycle: n => writeFile(join(programDir, 'status.yaml'), `current_mesocycle: ${n}\n`), mode: value => { responseMode = value; }, finishDelayed: () => delayed?.() });
  } finally {
    await new Promise(done => server.close(done));
    await rm(root, { recursive: true, force: true });
    if (errors.length) throw new Error(errors.join(', '));
  }
}

const publication = (revision, weight) => ({ templateId: 'local-a', revision, payload: { name: 'Strength', unit: 'kg', exercises: [{ exercise: '0025', sets: 3, reps: 5, weight }] } });
const review = (fixture, input) => fixture.command('publish', input, '--dry-run');
const approve = (fixture, input, proposal) => fixture.command('publish', { ...input, approval: proposal.data?.approval });
const sync = fixture => fixture.command('sync', { from: '2020-01-01', to: actualDate }, '--once');
const results = {};

results.sameRevision = await fixture(async f => {
  const first = publication('r1', 50);
  const next = publication('r1', 60);
  const initialReview = await review(f, first);
  const initialSave = await approve(f, first, initialReview);
  const nextReview = await review(f, next);
  const nextSave = await approve(f, next, nextReview);
  const ledger = (await f.readState()).publications.map(row => ({ revision: row.revision, weight: row.snapshot.exercises[0].weight }));
  return { initialReview: initialReview.state, initialSave: initialSave.state, nextReview: nextReview.state, nextSave: nextSave.state, ledger, writes: f.saves.length };
});

results.queuedCreate = await fixture(async f => {
  const first = publication('r1', 50), next = publication('r2', 60);
  const initialReview = await review(f, first);
  f.mode('limited');
  const queued = await approve(f, first, initialReview);
  const newReview = await review(f, next);
  f.mode('lost');
  const uncertain = await approve(f, next, newReview);
  f.mode(null);
  const resumed = await sync(f);
  f.finishDelayed();
  return { queued: queued.state, newReview: newReview.state, uncertain: uncertain.state, sync: resumed.state, writes: f.saves.map(save => save.outcome), routines: f.routines.map(routine => ({ id: routine.id, weight: routine.exercises[0].weight })) };
});

results.missingLinkedWorkout = await fixture(async f => {
  const date = '2026-07-01';
  f.workouts.push({ id: 'phone-a', date, unit: 'kg', entries: [{ id: '0025', sets: [{ r: 5, w: 50 }] }] });
  const unlinkedSync = await sync(f);
  const unlinkedStatus = await f.command('status');
  const publicHistory = await f.command('history', { limit: 10 });
  const proposed = { templates: {}, assignments: [{ occurrenceId: 'a1', sessionId: 'A', order: 1, workoutId: 'phone-a' }, { occurrenceId: 'b1', sessionId: 'B', order: 2 }] };
  const adoption = await f.command('adopt', proposed, '--dry-run');
  const applied = await f.command('adopt', { proposed, mapping: proposed, approval: adoption.data?.approval });
  const initialSync = await sync(f);
  const initialProjection = await f.readProjection();
  await f.setMesocycle(2);
  f.workouts[0].date = '2026-07-02';
  const editSync = await sync(f);
  const editProjection = await f.readProjection();
  f.workouts.length = 0;
  const deletionSync = await sync(f);
  const deletionProjection = await f.readProjection();
  return { unlinkedSync, unlinkedStatus, publicHistory, applied: applied.state, initialSync: initialSync.state, initialProjection, editSync: editSync.state, editProjection, deletionSync: deletionSync.state, deletionProjection };
});

results.retryTimezone = await fixture(async f => {
  const input = { occurrenceId: 'a1', sessionId: 'A', timezone: 'UTC', payload: { date: actualDate, start: '09:00', unit: 'kg', exercises: [{ exercise: '0025', sets: [{ reps: 5, weight: 50 }] }] } };
  const proposal = await f.command('log', input, '--dry-run');
  f.mode('limited');
  const queued = await f.command('log', { ...input, approval: proposal.data?.approval });
  await f.setServerTimezone('Europe/Paris');
  f.mode(null);
  const retry = await sync(f);
  return { proposal: proposal.state, queued: queued.state, retry: retry.state, newServerTimezone: 'Europe/Paris', actualSaves: f.actualSaves, storedWorkouts: f.workouts.length };
});

process.stdout.write(JSON.stringify(results, null, 2) + '\n');

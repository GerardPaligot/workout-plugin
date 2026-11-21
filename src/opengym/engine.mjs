import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { realpathSync, lstatSync, readFileSync } from 'node:fs';
import { load as parseYaml } from 'js-yaml';
import { Client, endpoint } from './client.mjs';
import { atomicJson, hash, readJson, Store } from './store.mjs';
import { publish, dispatchPublication, reconcilePublication, rememberAdoptedBases, captureRoutine } from './publication.mjs';

const required = (value, name) => { if (!value) throw new Error(`Missing ${name}`); return value; };
const ok = (state, data, warnings) => ({ ok: true, state, ...(data === undefined ? {} : { data }), ...(warnings?.length ? { warnings } : {}) });
const capabilities = ['list_workouts', 'get_workout', 'list_routines', 'get_routine', 'preview_session', 'log_workout', 'create_routine', 'update_routine'];
export function programDir(options) {
  if (!options.workspace || !options.program || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(options.program) || options.program === '..') throw new Error('A workspace and valid program are required');
  const workspace = realpathSync(options.workspace);
  const programs = realpathSync(path.join(workspace, 'programs'));
  const directory = realpathSync(path.join(programs, options.program));
  const within = (parent, child) => child.startsWith(parent + path.sep);
  if (!within(workspace, programs) || !within(programs, directory)) throw new Error('Program directory escapes workspace');
  for (const file of ['.opengym-backend.json', '.opengym-projection.json']) {
    try { if (lstatSync(path.join(directory, file)).isSymbolicLink()) throw new Error('Program sidecar cannot be a symlink'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return directory;
}
function validateActual(input) {
  required(input?.occurrenceId, 'occurrenceId'); required(input?.sessionId, 'sessionId');
  const payload = required(input?.payload, 'payload');
  if (!/^\d{4}-\d\d-\d\d$/.test(payload.date || '') || !Number.isFinite(Date.parse(payload.date)) || new Date(payload.date).toISOString().slice(0, 10) !== payload.date || typeof input.timezone !== 'string' || !['kg','lb'].includes(payload.unit) || !Array.isArray(payload.exercises) || !payload.exercises.length || payload.exercises.length > 40) throw new Error('Actuals require date, timezone, unit and exercises');
  try { new Intl.DateTimeFormat('en', { timeZone: input.timezone }); } catch { throw new Error('Invalid timezone'); }
  if (Object.keys(payload).some(key => !['date','start','duration_min','name','unit','note','exercises'].includes(key))) throw new Error('Unsupported workout field; use duration_min and note');
  if (payload.start != null && (typeof payload.start !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(payload.start))) throw new Error('Invalid workout start; use HH:MM');
  if (payload.duration_min != null && (!Number.isFinite(payload.duration_min) || payload.duration_min < 1 || payload.duration_min > 1440)) throw new Error('Invalid workout duration_min');
  for (const [field, max] of [['name',80], ['note',500]]) if (payload[field] != null && (typeof payload[field] !== 'string' || payload[field] !== payload[field].trim() || !payload[field] || payload[field].length > max)) throw new Error('Invalid workout ' + field);
  for (const exercise of payload.exercises) {
    if (!exercise || Object.keys(exercise).some(key => !['exercise','sets'].includes(key)) || typeof exercise.exercise !== 'string' || !exercise.exercise || exercise.exercise.length > 120 || !Array.isArray(exercise.sets) || !exercise.sets.length || exercise.sets.length > 50) throw new Error('Explicit exercise IDs and sets are required');
    const kinds = new Set();
    for (const set of exercise.sets) {
      if (!set || typeof set !== 'object' || Array.isArray(set) || Object.keys(set).some(key => !['reps','weight','seconds','rir','rpe'].includes(key))) throw new Error('Unsupported actual set field; use seconds for holds');
      if ((set.reps == null) === (set.seconds == null)) throw new Error('Each set needs either reps or seconds');
      kinds.add(set.reps == null ? 'seconds' : 'reps');
      if (set.reps != null && (!Number.isInteger(set.reps) || set.reps < 1 || set.reps > 1000)) throw new Error('Invalid reps');
      if (set.seconds != null && (!Number.isInteger(set.seconds) || set.seconds < 1 || set.seconds > 21600)) throw new Error('Invalid seconds');
      if (!Number.isFinite(set.weight) || set.weight < 0) throw new Error('Specify weight explicitly, including 0 for bodyweight; unknown weight cannot be preserved');
      if (set.rir != null && (!Number.isFinite(set.rir) || set.rir < 0 || set.rir > 10) || set.rpe != null && (!Number.isFinite(set.rpe) || set.rpe < 6 || set.rpe > 10) || set.rir != null && set.rpe != null || set.seconds != null && (set.rir != null || set.rpe != null)) throw new Error('Invalid effort; use RIR or RPE on rep sets');
    }
    if (kinds.size !== 1) throw new Error('Each exercise must use reps or seconds consistently');
  }
  return structuredClone(payload);
}
async function history(client, from, to, state = null, save = async () => {}) {
  const key = hash({ from, to });
  const scan = state?.historyScan?.key === key ? state.historyScan : {
    key, pending: [{ type: 'range', from, to }], observations: [], complete: true
  };
  if (state) { state.historyScan = scan; await save(); }
  while (scan.pending.length) {
    const item = scan.pending[0];
    try {
      if (item.type === 'detail') {
        const detail = await client.call('get_workout', { workout_id: item.id });
        if (detail?.id !== item.id || detail.ambiguous || !Array.isArray(detail.entries || detail.exercises)) throw new Error('Invalid workout detail');
        scan.observations.push(detail);
        if (state) state.workouts[item.id] = detail;
        scan.pending.shift();
      } else {
        const result = await client.call('list_workouts', { from: item.from, to: item.to, limit: 200 });
        if (!Array.isArray(result.workouts) || !Number.isInteger(result.matching_count) || typeof result.truncated !== 'boolean' || !Number.isInteger(result.returned_count) || result.returned_count !== result.workouts.length) throw new Error('Invalid workout coverage response');
        if (item.type === 'confirm') {
          if (hash(result) !== item.fingerprint) scan.complete = false;
          scan.pending.shift();
        } else if (result.truncated || result.matching_count > result.workouts.length) {
          scan.pending.shift();
          if (item.from === item.to) scan.complete = false;
          else {
            const a = Date.parse(item.from + 'T00:00:00Z'), b = Date.parse(item.to + 'T00:00:00Z');
            const middle = Math.floor((a + b) / 172800000) * 86400000;
            scan.pending.unshift({ type: 'range', from: item.from, to: new Date(middle).toISOString().slice(0, 10) }, { type: 'range', from: new Date(middle + 86400000).toISOString().slice(0, 10), to: item.to });
          }
        } else {
          scan.pending.shift();
          const details = [];
          for (const workout of result.workouts) {
            if (!workout.id) scan.observations.push({ ...workout, unresolved: true });
            else details.push({ type: 'detail', id: workout.id });
          }
          scan.pending.unshift(...details, ...(state ? [{ type: 'confirm', from: item.from, to: item.to, fingerprint: hash(result) }] : []));
        }
      }
      if (state) await save();
    } catch (error) {
      if (state && error.code === 'local_quota') { await save(); return { complete: false, observations: scan.observations, pending: scan.pending.length }; }
      throw error;
    }
  }
  if (state) { delete state.historyScan; await save(); }
  return { complete: scan.complete, observations: scan.observations };
}
function projection(state, from, to, complete, observedAt, programKey, program, requiresAdoption = false) {
  const currentMesocycle = state.assignmentContexts?.[programKey]?.currentMesocycle ?? null;
  state = { ...state, assignments: state.assignments.filter(a => a.programKey === programKey) };
  const currentIds = new Set(state.observation?.observedIds || []);
  const linked = state.assignments.filter(a => a.workoutId && currentIds.has(a.workoutId) && state.workouts[a.workoutId] && a.verified === true && typeof state.workouts[a.workoutId].date === 'string' && Number.isFinite(Date.parse(state.workouts[a.workoutId].date))).map(a => ({ occurrenceId: a.occurrenceId, sessionId: a.sessionId, workoutId: a.workoutId, completedAt: state.workouts[a.workoutId].date, templateId: a.templateId ?? null, templateRevision: a.templateRevision ?? null, versionContext: a.templateId && a.templateRevision ? 'known' : 'unknown' }));
  const ordered = linked.filter(a => Number.isInteger(state.assignments.find(x => x.occurrenceId === a.occurrenceId)?.order)).sort((a,b) => state.assignments.find(x => x.occurrenceId === a.occurrenceId).order - state.assignments.find(x => x.occurrenceId === b.occurrenceId).order);
  const last = ordered.at(-1) || null;
  const lastOrder = last && state.assignments.find(x => x.occurrenceId === last.occurrenceId).order;
  const orderCounts = new Map();
  for (const assignment of state.assignments) if (Number.isInteger(assignment.order)) orderCounts.set(assignment.order, (orderCounts.get(assignment.order) || 0) + 1);
  const ambiguous = state.assignments.some(a => !Number.isInteger(a.order) || !a.sessionId || (a.workoutId && !linked.some(x => x.occurrenceId === a.occurrenceId))) || [...orderCounts.values()].some(count => count > 1);
  const firstOrder = Math.min(...orderCounts.keys());
  const nextCandidates = state.assignments.filter(x => x.order === (last ? lastOrder + 1 : firstOrder));
  const next = !ambiguous && nextCandidates.length === 1 ? nextCandidates[0] : null;
  return { version: 2, scope: state.scope, program, requiresAdoption, currentMesocycle, observedAt, freshnessMaxAgeMs: 86400000, coverage: { from, to, complete }, activeUnknown: true, assignments: linked, lastSession: last, nextSessionId: next?.sessionId || null, needs_mapping: !next };
}
function schemaAccepts(schema, value) {
  if (!schema || typeof schema !== 'object') return false;
  if (schema.type === 'object') return value && typeof value === 'object' && !Array.isArray(value) && (schema.required || []).every(key => Object.hasOwn(value, key)) && Object.entries(value).every(([key, item]) => schemaAccepts(schema.properties?.[key], item));
  if (schema.type === 'array') return Array.isArray(value) && (schema.minItems == null || value.length >= schema.minItems) && (schema.maxItems == null || value.length <= schema.maxItems) && value.every(item => schemaAccepts(schema.items, item));
  if (schema.type === 'string') return typeof value === 'string' && (schema.minLength == null || value.length >= schema.minLength) && (schema.maxLength == null || value.length <= schema.maxLength) && (!schema.pattern || new RegExp(schema.pattern).test(value)) && (!schema.enum || schema.enum.includes(value));
  if (schema.type === 'number' || schema.type === 'integer') return Number.isFinite(value) && (schema.type !== 'integer' || Number.isInteger(value)) && (schema.minimum == null || value >= schema.minimum) && (schema.maximum == null || value <= schema.maximum);
  if (schema.type === 'boolean') return typeof value === 'boolean';
  return false;
}

function matchesPreview(view, payload) {
  if (!view || view.date !== payload.date || view.unit !== payload.unit || (payload.start != null && view.start !== payload.start) || (payload.name != null && view.name !== payload.name) || (payload.note != null && view.note !== payload.note) || !Array.isArray(view.exercises) || view.exercises.length !== payload.exercises.length) return false;
  return payload.exercises.every((e, i) => {
    const found = view.exercises[i];
    return found?.id === e.exercise && Array.isArray(found.sets) && found.sets.length === e.sets.length && e.sets.every((set, j) => Object.entries(set).every(([k, v]) => found.sets[j]?.[k] === v));
  });
}

function matchesWorkout(detail, payload, id) {
  if (!detail || detail.ambiguous || detail.id !== id || detail.date !== payload.date || detail.unit !== payload.unit) return false;
  if (payload.name != null && detail.routine_name !== payload.name) return false;
  const entries = detail.entries;
  if (!Array.isArray(entries) || entries.length !== payload.exercises.length) return false;
  return payload.exercises.every((expected, i) => {
    const entry = entries[i];
    if (entry?.id !== expected.exercise || !Array.isArray(entry.sets) || entry.sets.length !== expected.sets.length) return false;
    return expected.sets.every((set, j) => {
      const actual = entry.sets[j];
      return actual?.w === set.weight && (set.reps == null || actual.r === set.reps) && (set.seconds == null || actual.sec === set.seconds);
    });
  });
}
async function verifyJob(client, state, job) {
  const detail = await client.call('get_workout', { workout_id: job.workoutId });
  if (!matchesWorkout(detail, job.payload, job.workoutId)) return false;
  const payload = job.payload;
  if (payload.start != null || payload.duration_min != null || payload.note != null || payload.exercises.some(e => e.sets.some(s => s.rir != null || s.rpe != null))) {
    const data = await client.request('api/token/data');
    if (!data || typeof data.rev !== 'number' || !Array.isArray(data.state?.workouts)) return false;
    const raw = data.state.workouts.find(w => w.id === job.workoutId);
    if (!raw || raw.d !== payload.date || !Array.isArray(raw.entries) || raw.entries.length !== payload.exercises.length) return false;
    if (payload.start != null) {
      if (!Number.isFinite(raw.start)) return false;
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: job.timezone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(raw.start);
      const get = name => parts.find(p => p.type === name)?.value;
      if (`${get('year')}-${get('month')}-${get('day')}` !== payload.date || `${get('hour')}:${get('minute')}` !== payload.start) return false;
    }
    if (payload.duration_min != null && (!Number.isFinite(raw.start) || !Number.isFinite(raw.end) || raw.end - raw.start !== payload.duration_min * 60000)) return false;
    if (payload.note != null && raw.note !== payload.note) return false;
    if (!payload.exercises.every((e, i) => raw.entries[i]?.id === e.exercise && Array.isArray(raw.entries[i].sets) && raw.entries[i].sets.length === e.sets.length && e.sets.every((s, j) => ['rir','rpe'].every(k => s[k] == null || raw.entries[i].sets[j]?.[k] === s[k])))) return false;
  }
  const existing = state.assignments.find(a => a.programKey === job.programKey && a.occurrenceId === job.occurrenceId && a.verified && a.workoutId);
  if (existing && existing.workoutId !== job.workoutId) return false;
  state.workouts[job.workoutId] = detail;
  const index = state.assignments.findIndex(a => a.programKey === job.programKey && a.occurrenceId === job.occurrenceId);
  const assignment = { programKey: job.programKey, occurrenceId: job.occurrenceId, sessionId: job.sessionId, workoutId: job.workoutId, verified: true, completedAt: detail.date };
  if (index < 0) state.assignments.push(assignment);
  else state.assignments[index] = { ...state.assignments[index], ...assignment };
  job.state = 'verified';
  return true;
}
async function dispatch(client, state, job, save, context) {
  if (!await context.allowMutation(job, save)) return;
  context.need('list_workouts', 'get_workout', 'log_workout');
  if (job.payload.start != null && (!context.serverTimezone || job.timezone !== context.serverTimezone)) { job.state = 'needs_review'; job.reason = 'Server timezone changed since approval'; delete job.retryAt; await save(); return; }
  if (!schemaAccepts(context.logSchema, { ...job.payload, dry_run: false })) { job.state = 'needs_review'; await save(); return; }
  const occurrence = state.assignments.find(a => a.programKey === job.programKey && a.occurrenceId === job.occurrenceId);
  if ((occurrence && (occurrence.sessionId !== job.sessionId || occurrence.verified && occurrence.workoutId)) || job.programKey !== context.programKey || job.fingerprint !== context.fingerprint || job.approval !== hash({ id: job.id, preview: job.preview, fingerprint: context.fingerprint, ...(job.reviewNonce ? { reviewNonce: job.reviewNonce } : {}) })) {
    job.state = 'needs_review'; await save(); return;
  }
  const currentPreview = await client.call('log_workout', { ...job.payload, dry_run: true });
  if (currentPreview.logged !== false || currentPreview.dry_run !== true || currentPreview.problems || currentPreview.duplicate || currentPreview.duplicate_of || !matchesPreview(currentPreview.would_log, job.payload)) { job.state = 'needs_review'; await save(); return; }
  const current = await history(client, job.payload.date, job.payload.date);
  if (!current.complete || current.observations.length) { job.state = 'needs_review'; await save(); return; }
  const now = Date.now();
  state.writeTimes = (state.writeTimes || []).filter(time => now - time < 3600000);
  if (state.writeTimes.length >= 20) { job.state = 'retry_at'; job.retryReason = 'local_write_budget'; job.retryAt = new Date(state.writeTimes[0] + 3600000).toISOString(); await save(); return; }
  state.writeTimes.push(now);
  job.state = 'dispatched'; job.remoteEffect = 'maybe'; delete job.retryAt; delete job.retryReason; await save();
  let result;
  try { result = await client.call('log_workout', { ...job.payload, dry_run: false }); }
  catch (error) {
    job.state = ['rate_limited', 'native_rate_limited'].includes(error.code) ? 'retry_at' : 'uncertain';
    if (job.state === 'retry_at') { job.remoteEffect = 'none'; job.retryReason = error.code === 'native_rate_limited' ? 'upstream_tool_quota' : 'upstream_http_quota'; }
    if (error.retryAt) job.retryAt = error.retryAt;
    await save(); return;
  }
  if (result.logged !== true || typeof result.workout_id !== 'string' || !result.workout_id) {
    if (result.duplicate && typeof result.workout_id === 'string' && result.workout_id) {
      job.workoutId = result.workout_id;
      try { const detail = await client.call('get_workout', { workout_id: job.workoutId }); if (matchesWorkout(detail, job.payload, job.workoutId)) state.workouts[job.workoutId] = detail; } catch { /* Keep the candidate for review. */ }
    }
    if (result.logged === false && result.problems && !result.duplicate && !result.duplicate_of) { job.remoteEffect = 'none'; }
    job.state = result.duplicate || result.duplicate_of || result.problems ? 'needs_review' : 'uncertain';
    await save(); return;
  }
  job.state = 'acknowledged'; job.remoteEffect = 'confirmed'; job.workoutId = result.workout_id; await save();
  try { if (!await verifyJob(client, state, job)) job.state = 'needs_review'; }
  catch { job.state = 'uncertain'; }
  await save();
}
async function reconcile(client, state, job, save) {
  try {
    if (job.workoutId) {
      if (!await verifyJob(client, state, job)) job.state = 'needs_review';
    } else {
      job.state = 'needs_review';
    }
  } catch { job.state = 'uncertain'; }
  await save();
}

export async function run(command, options, input, config, configPath) {
  const base = endpoint(config).href;
  if (typeof config.profileId !== 'string' || !config.profileId) throw new Error('profileId must be a nonempty string');
  const expectedScope = { server: base, profileId: config.profileId };
  const programKey = options.workspace && options.program ? programDir(options) : null;
  const program = programKey ? { workspace: realpathSync(options.workspace), name: options.program } : null;
  let sidecar = options.workspace && options.program ? await readJson(path.join(programDir(options), '.opengym-backend.json'), null) : null;
  if (['adopt','log','sync','publish','history'].includes(command) && !sidecar) throw new Error('Connect this program before using openGym');
  if (command === 'publish' && sidecar?.requiresAdoption) throw new Error('Review and adopt this program mapping before publishing');
  if (command !== 'connect' && sidecar && (sidecar.version !== 2 || sidecar.backend !== 'opengym' || (hash(sidecar.scope) !== hash(expectedScope) || hash(sidecar.program) !== hash(program)))) throw new Error('Backend profile or server mismatch');
  const store = new Store(options.stateDir || config.stateDir, expectedScope);
  if (command === 'history') return store.run(async state => {
    const from = input?.from ?? '0000-01-01', to = input?.to ?? '9999-12-31', limit = input?.limit ?? 50;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to || !Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('History requires valid from/to dates and limit 1 to 200');
    const observed = new Set(state.observation?.observedIds || []);
    const observationTime = Date.parse(state.observation?.observedAt);
    const fresh = state.observation?.complete && Number.isFinite(observationTime) && observationTime <= Date.now() && Date.now() - observationTime <= 86400000;
    const observations = [...Object.values(state.workouts), ...(state.unresolvedObservations || [])].filter(w => typeof w.date === 'string' && w.date >= from && w.date <= to).sort((a,b) => b.date.localeCompare(a.date)).slice(0, limit).map(w => ({ ...w, freshness: !w.id ? 'unresolved' : observed.has(w.id) ? (fresh ? 'observed' : 'stale') : 'unconfirmed', assignment: state.assignments.find(a => a.programKey === programKey && a.workoutId === w.id) || null }));
    const { observedIds: _observedIds, ...coverage } = state.observation || {};
    return ok('history', { coverage: state.observation ? coverage : null, observations, limit }, ['Cached observations; absence does not prove deletion']);
  }, options.recoverLock);
  if (command === 'status') return store.run(async state => {
    const observation = state.observation;
    const observedTime = Date.parse(observation?.observedAt);
    const stale = !observation || !observation.complete || !Number.isFinite(observedTime) || observedTime > Date.now() || Date.now() - observedTime > 86400000;
    const { observedIds: _observedIds, ...publicObservation } = observation || {};
    return ok('status', { scope: expectedScope, jobs: state.jobs.map(({ id, kind, state, retryAt, retryReason, reason }) => ({ id, kind, state, retryAt, retryReason, reason })), observation: observation ? publicObservation : null, stale, activeUnknown: true });
  }, options.recoverLock);
  const client = new Client(config);
  const identity = await client.identity();
  const profileId = identity?.user?.id;
  if (typeof profileId !== 'string' || profileId !== expectedScope.profileId || typeof identity.user?.name !== 'string' || typeof identity.token?.id !== 'string' || !identity.token.id || typeof identity.token.name !== 'string' || !(identity.token.exp === null || Number.isInteger(identity.token.exp)) || !identity.token?.scopes || typeof identity.token.scopes !== 'object' || Array.isArray(identity.token.scopes) || ['workouts','plans','bodyweight','measurements','notes'].some(key => !['off','view','apply'].includes(identity.token.scopes[key])) || identity.token.scopes.notes === 'apply' || Object.values(identity.token.scopes).some(level => !['off', 'view', 'apply'].includes(level))) throw new Error('Profile or scope verification failed');
  const tools = await client.initialize();
  const available = new Set(tools.map(tool => tool.name));
  const logSchema = tools.find(tool => tool.name === 'log_workout')?.inputSchema;
  const scope = expectedScope;
  const scopes = identity.token.scopes;
  const need = (...names) => {
    for (const name of names) {
      if (!available.has(name)) throw new Error('Required tool unavailable: ' + name);
      const group = ['list_workouts','get_workout','log_workout'].includes(name) ? 'workouts' : ['list_routines','get_routine','preview_session','create_routine','update_routine'].includes(name) ? 'plans' : null;
      if (group && !(scopes[group] === 'apply' || (!['log_workout','create_routine','update_routine'].includes(name) && scopes[group] === 'view'))) throw new Error('Required token scope unavailable');
      if (name === 'search_exercises' && !['workouts','plans'].some(group => ['view','apply'].includes(scopes[group]))) throw new Error('Required token scope unavailable');
    }
  };
  const capabilityFingerprint = hash({ tools, scopes });
  const allowMutation = async (job, save) => {
    const marker = await readJson(path.join(programKey, '.opengym-backend.json'), null);
    if (marker?.version === 2 && marker.backend === 'opengym' && hash(marker.scope) === hash(scope) && hash(marker.program) === hash(program) && (marker.requiresAdoption === undefined || marker.requiresAdoption === false)) return true;
    job.state = 'needs_review'; job.reason = 'Review and adopt this program mapping before dispatch';
    delete job.retryAt; delete job.retryReason; await save(); return false;
  };
  return store.run(async (state, save) => {
    if (programKey) sidecar = await readJson(path.join(programKey, '.opengym-backend.json'), null);
    if (command !== 'connect' && programKey && (!sidecar || sidecar.version !== 2 || sidecar.backend !== 'opengym' || hash(sidecar.scope) !== hash(scope) || hash(sidecar.program) !== hash(program))) throw new Error('Backend profile or server mismatch');
    const adoption = state.adoptionEpochs?.[programKey];
    const fingerprint = adoption ? hash({ fingerprint: capabilityFingerprint, adoption }) : capabilityFingerprint;
    const publicationContext = { need, fingerprint, programKey, schemaAccepts, allowMutation, schemas: Object.fromEntries(tools.map(t => [t.name, t.inputSchema])) };
    const call = client.call.bind(client);
    client.call = async (name, args) => {
      const now = Date.now();
      state.requestTimes = (state.requestTimes || []).filter(time => now - time < 60000);
      if (state.requestTimes.length >= 120) { const error = new Error('Local read quota reached; retry later'); error.code = 'local_quota'; throw error; }
      state.requestTimes.push(now); await save();
      return call(name, args);
    };
    for (const job of state.jobs) if (job.state === 'dispatched') job.state = 'uncertain';
    await save();
    if (command === 'connect') {
      const requiresAdoption = sidecar && (sidecar.version !== 2 || hash(sidecar.program) !== hash(program) || hash(sidecar.scope) !== hash(scope) || sidecar.requiresAdoption);
      if (requiresAdoption) {
        const projectionPath = path.join(programDir(options), '.opengym-projection.json');
        const cached = await readJson(projectionPath, null);
        if (cached) await atomicJson(projectionPath, { ...cached, requiresAdoption: true });
      }
      await atomicJson(path.join(programDir(options), '.opengym-backend.json'), { version: 2, backend: 'opengym', scope, program, configPath, ...(sidecar && (sidecar.version !== 2 || hash(sidecar.program) !== hash(program) || hash(sidecar.scope) !== hash(scope) || sidecar.requiresAdoption) ? { requiresAdoption: true } : {}), ...(options.stateDir || config.stateDir ? { stateDir: options.stateDir || config.stateDir } : {}) });
      return ok('connected', { scope, scopes, capabilities: capabilities.filter(name => available.has(name)), limitations: ['serverTimezone is a configured assertion, not remotely verified', 'Completed freestyle workouts only', 'Active workout unknown', 'History edits and deletions are unsupported', 'Exactly-once delivery is unsupported'] });
    }
    if (command === 'search') {
      need('search_exercises');
      const query = input?.query;
      if (typeof query !== 'string' || !query.trim()) throw new Error('Exercise search requires a query');
      const result = await client.call('search_exercises', { query, limit: 50 });
      if (!Array.isArray(result.exercises)) throw new Error('Invalid exercise search result');
      return ok('results', result);
    }
    if (command === 'adopt') {
      need('list_routines', 'get_routine', 'get_workout');
      const routines = await client.call('list_routines');
      if (!Array.isArray(routines.routines)) throw new Error('Invalid routine list');
      const proposed = options.dryRun ? input : input?.proposed;
      if (!proposed || !Array.isArray(proposed.assignments) || typeof proposed.templates !== 'object' || !proposed.templates) throw new Error('Adoption requires explicit templates and assignments');
      const details = {};
      for (const id of Object.values(proposed.templates)) {
        if (typeof id !== 'string' || !routines.routines.some(r => r.id === id)) throw new Error('Mapped routine not found');
        const detail = await captureRoutine(client, id);
        if (detail?.id !== id || !Array.isArray(detail.exercises)) throw new Error('Mapped routine could not be verified');
        details[id] = detail;
      }
      const workouts = {};
      for (const assignment of proposed.assignments) {
        if (!assignment.occurrenceId || !assignment.sessionId || (assignment.order != null && !Number.isInteger(assignment.order)) || ((assignment.templateId == null) !== (assignment.templateRevision == null)) || (assignment.templateId != null && (typeof assignment.templateId !== 'string' || !assignment.templateId.trim() || typeof assignment.templateRevision !== 'string' || !assignment.templateRevision.trim()))) throw new Error('Invalid occurrence assignment');
        if (assignment.workoutId) {
          const detail = await client.call('get_workout', { workout_id: assignment.workoutId });
          if (detail?.id !== assignment.workoutId || detail.ambiguous || !Array.isArray(detail.entries || detail.exercises)) throw new Error('Assignment workout could not be verified');
          workouts[assignment.workoutId] = detail;
        }
      }
      let currentMesocycle = null;
      try { const n = parseYaml(readFileSync(path.join(programKey, 'status.yaml'), 'utf8'))?.current_mesocycle; if (Number.isInteger(n) && n > 0) currentMesocycle = n; } catch { /* Unknown context remains unknown. */ }
      const reviewed = { scope, programKey, currentMesocycle, routines, details, workouts, proposed, fingerprint };
      if (options.dryRun) return ok('review', { ...reviewed, approval: hash(reviewed) });
      if (!input?.approval || hash(input.mapping) !== hash(proposed) || input.approval !== hash(reviewed)) throw new Error('Adoption needs approval of the exact reviewed mapping');
      const ids = proposed.assignments.map(a => a.occurrenceId);
      if (new Set(ids).size !== ids.length || new Set(proposed.assignments.filter(a => a.workoutId).map(a => a.workoutId)).size !== proposed.assignments.filter(a => a.workoutId).length) throw new Error('Duplicate occurrence or workout assignment');
      const markerPath = path.join(programDir(options), '.opengym-backend.json');
      const currentMarker = await readJson(markerPath, null);
      if (!currentMarker || currentMarker.version !== 2 || currentMarker.backend !== 'opengym' || hash(currentMarker.scope) !== hash(scope) || hash(currentMarker.program) !== hash(program)) throw new Error('Backend profile or server mismatch');
      const projectionPath = path.join(programDir(options), '.opengym-projection.json');
      const cachedProjection = await readJson(projectionPath, null);
      if (cachedProjection) await atomicJson(projectionPath, { ...cachedProjection, requiresAdoption: true });
      currentMarker.requiresAdoption = true;
      await atomicJson(markerPath, currentMarker);
      Object.assign(sidecar, currentMarker);
      state.adoptionEpochs ||= {}; state.adoptionEpochs[programKey] = randomUUID();
      state.mappings = { ...state.mappings, [programKey]: proposed.templates };
      rememberAdoptedBases(state, programKey, proposed.templates, details);
      state.assignmentHistory ||= [];
      const previous = state.assignments.filter(a => a.programKey === programKey);
      if (previous.length) state.assignmentHistory.push({ programKey, context: state.assignmentContexts?.[programKey] || null, assignments: previous, replacedAt: new Date().toISOString() });
      state.assignmentContexts ||= {}; state.assignmentContexts[programKey] = { currentMesocycle };
      state.assignments = [...state.assignments.filter(a => a.programKey !== programKey), ...proposed.assignments.map(a => ({ programKey, occurrenceId: a.occurrenceId, sessionId: a.sessionId, ...(a.order == null ? {} : { order: a.order }), templateId: a.templateId ?? null, templateRevision: a.templateRevision ?? null, ...(a.workoutId ? { workoutId: a.workoutId, verified: true, completedAt: workouts[a.workoutId].date || null } : {}) }))];
      Object.assign(state.workouts, workouts);
      for (const assignment of proposed.assignments.filter(a => a.workoutId)) {
        for (const job of state.jobs.filter(j => j.kind === 'log' && j.programKey === programKey && j.occurrenceId === assignment.occurrenceId && ['draft', 'retry_at', 'needs_review', 'uncertain', 'acknowledged'].includes(j.state))) {
          job.state = 'resolved'; job.workoutId = assignment.workoutId; delete job.retryAt; delete job.retryReason;
        }
      }
      await save();
      if (state.observation) await atomicJson(path.join(programDir(options), '.opengym-projection.json'), projection(state, state.observation.from, state.observation.to, state.observation.complete, state.observation.observedAt, programKey, program));
      if (sidecar.requiresAdoption) { delete sidecar.requiresAdoption; await atomicJson(path.join(programDir(options), '.opengym-backend.json'), sidecar); }
      return ok('adopted', { scope });
    }
    if (command === 'sync') {
      need('list_workouts','get_workout');
      if (!options.once) throw new Error('sync requires --once');
      const from = required(input?.from, 'from'), to = required(input?.to, 'to');
      const validDate = value => /^\d{4}-\d\d-\d\d$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
      if (!validDate(from) || !validDate(to) || from > to) throw new Error('Invalid date window');
      for (const job of state.jobs.filter(j => j.kind === 'log' && j.programKey === programKey)) {
        if (['uncertain','acknowledged'].includes(job.state)) await reconcile(client, state, job, save);
        else if (job.programKey === programKey && job.state === 'retry_at' && Date.parse(job.retryAt) <= Date.now()) {
          await dispatch(client, state, job, save, { need, fingerprint, programKey, logSchema, allowMutation, serverTimezone: config.serverTimezone });
        }
      }
      for (const job of state.jobs.filter(j => j.kind === 'publish' && j.programKey === programKey)) {
        if (['uncertain', 'acknowledged'].includes(job.state) && job.acknowledged) await reconcilePublication(client, state, job, save, publicationContext);
        else if (job.state === 'retry_at' && Date.parse(job.retryAt) <= Date.now()) await dispatchPublication(client, state, job, save, publicationContext);
      }
      const result = await history(client, from, to, state, save), observedAt = new Date().toISOString();
      try {
        const snapshot = await client.request('api/token/data');
        if (typeof snapshot?.rev === 'number' && Array.isArray(snapshot.state?.workouts)) for (const workout of result.observations) {
          const raw = snapshot.state.workouts.find(w => w.id && w.id === workout.id && w.d === workout.date);
          if (raw && Array.isArray(raw.entries)) workout.actualSnapshot = { revision: snapshot.rev, unit: snapshot.state.unit ?? null, entries: raw.entries.map(e => ({ exerciseId: e.id, sets: e.sets, note: e.note ?? null })), note: raw.note ?? null };
        }
      } catch { /* Native detail remains usable when scoped snapshot is unavailable. */ }
      for (const workout of result.observations) if (workout.id) state.workouts[workout.id] = workout;
      state.unresolvedObservations = result.observations.filter(x => !x.id);
      const complete = result.complete && !result.observations.some(x => !x.id);
      state.observation = { from, to, complete, observedAt, unresolved: result.observations.filter(x => !x.id).length, deletionStatus: 'unconfirmed', observedIds: result.observations.filter(x => x.id).map(x => x.id), ...(result.pending ? { pending: result.pending } : {}) };
      await save();
      await atomicJson(path.join(programDir(options), '.opengym-projection.json'), projection(state, from, to, complete, observedAt, programKey, program, Boolean(sidecar.requiresAdoption)));
      const { observedIds: _observedIds, ...publicObservation } = state.observation;
      return ok(complete ? 'synced' : 'incomplete', { ...publicObservation, pendingJobs: state.jobs.filter(j => j.programKey === programKey && ['retry_at', 'uncertain', 'acknowledged', 'needs_review', 'conflict'].includes(j.state)).map(({ id, kind, state, retryAt, reason, retryReason }) => ({ id, kind, state, retryAt, reason, retryReason })) }, ['Absence does not prove deletion', 'Active workout is unknown']);
    }
    if (command === 'log') {
      need('list_workouts','get_workout','log_workout');
      const payload = validateActual(input);
      if (!schemaAccepts(logSchema, { ...payload, dry_run: true })) throw new Error('Native log_workout schema does not accept the requested actual fields');
      if (payload.start != null) {
        try { new Intl.DateTimeFormat('en', { timeZone: config.serverTimezone }); } catch { throw new Error('Set serverTimezone to the MCP process IANA timezone and align Docker TZ'); }
        if (!config.serverTimezone || config.serverTimezone !== input.timezone) throw new Error('Explicit start requires serverTimezone matching the requested timezone; align MCP Docker TZ');
      }
      const id = hash({ kind: 'log', scope, programKey, payload, timezone: input.timezone, occurrenceId: input.occurrenceId, sessionId: input.sessionId });
      const canReviewAgain = job => job.remoteEffect === 'none' && !job.workoutId && !job.acknowledged && ['draft', 'retry_at', 'needs_review'].includes(job.state);
      let job = state.jobs.find(x => x.id === id), superseded = null;
      if (job && options.dryRun && canReviewAgain(job) && (job.state === 'needs_review' || job.fingerprint !== fingerprint)) {
        superseded = job; job = null;
      }
      if (!job && options.dryRun) {
        const prior = state.jobs.find(x => x.kind === 'log' && x.programKey === programKey && x.occurrenceId === input.occurrenceId && x.state === 'needs_review' && canReviewAgain(x));
        if (prior) superseded = prior;
      }
      if (!job && (state.jobs.some(x => x !== superseded && x.kind === 'log' && x.programKey === programKey && x.occurrenceId === input.occurrenceId) || state.assignments.some(x => x.programKey === programKey && x.occurrenceId === input.occurrenceId && x.workoutId))) return ok('needs_review', { reason: 'Occurrence already has a workout or another draft' });
      if (job && !options.dryRun && job.state !== 'draft') {
        if (['uncertain','acknowledged'].includes(job.state)) await reconcile(client, state, job, save);
        return ok(job.state, { id, workoutId: job.workoutId, retryAt: job.retryAt, retryReason: job.retryReason });
      }
      if (!job) {
        const scan = await history(client, payload.date, payload.date);
        if (!scan.complete || scan.observations.length) return ok('needs_review', { reason: 'Possible same-day workout collision or incomplete history' });
        const preview = await client.call('log_workout', { ...payload, dry_run: true });
        if (preview.logged !== false || preview.dry_run !== true || preview.problems || preview.duplicate || preview.duplicate_of || !matchesPreview(preview.would_log, payload)) return ok('needs_review', { reason: 'Workout preview was not accepted' });
        const reviewNonce = randomUUID();
        const approval = hash({ id, preview, fingerprint, reviewNonce });
        job = { id, kind: 'log', state: 'draft', remoteEffect: 'none', programKey, payload, timezone: input.timezone, occurrenceId: input.occurrenceId, sessionId: input.sessionId, preview, approval, fingerprint, reviewNonce, createdAt: new Date().toISOString() };
        state.jobs = [...state.jobs.filter(x => x !== superseded), job]; await save();
      }
      if (options.dryRun && job.remoteEffect !== 'none') return ok(job.state, { id, workoutId: job.workoutId });
      if (options.dryRun) return ok('review', { id, approval: job.approval, preview: job.preview, payload: job.payload });
      if (input.approval !== job.approval || job.fingerprint !== fingerprint) throw new Error('Workout approval is missing or stale');
      await dispatch(client, state, job, save, { need, fingerprint, programKey, logSchema, allowMutation, serverTimezone: config.serverTimezone });
      return ok(job.state, { id, workoutId: job.workoutId, retryAt: job.retryAt, retryReason: job.retryReason });
    }
    if (command === 'publish') return publish(client, state, save, publicationContext, input, options.dryRun);
    throw new Error('Unknown command');
  }, options.recoverLock);
}

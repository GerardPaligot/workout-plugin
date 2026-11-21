import { hash } from './store.mjs';

const ok = (state, data, warnings = []) => ({ ok: true, state, data, warnings });
const keys = (o, allowed) => o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).every(k => allowed.includes(k));
const clone = value => JSON.parse(JSON.stringify(value));
const comparable = routine => { const copy = clone(routine); delete copy.revision; return copy; };
const same = (a, b) => hash(a) === hash(b);

function parse(input) {
  if (!keys(input, ['templateId', 'revision', 'payload', 'approval', 'rebase'])) throw new Error('Unsupported publication field or coaching policy');
  if (typeof input.templateId !== 'string' || !input.templateId.trim() || typeof input.revision !== 'string' || !input.revision.trim()) throw new Error('Publication requires stable templateId and revision strings');
  if (input.rebase !== undefined && input.rebase !== true) throw new Error('rebase must be true when supplied');
  const p = input.payload;
  if (!keys(p, ['name', 'exercises', 'unit', 'weekdays'])) throw new Error('Unsupported routine field or progression policy');
  if (typeof p.name !== 'string' || !p.name.trim() || !['kg', 'lb'].includes(p.unit) || !Array.isArray(p.exercises) || !p.exercises.length) throw new Error('Routine requires name, unit and exercises');
  for (const e of p.exercises) {
    if (!keys(e, ['exercise', 'sets', 'reps', 'seconds', 'weight', 'rest_sec', 'note'])) throw new Error('Unsupported exercise field: ranges, per-side, supersets, RIR and progression require manual handling');
    if (typeof e.exercise !== 'string' || !e.exercise.trim() || !Number.isInteger(e.sets) || e.sets < 1 || (('reps' in e) === ('seconds' in e)) || !Number.isInteger(e.reps ?? e.seconds) || (e.reps ?? e.seconds) < 1 || !Number.isFinite(e.weight) || e.weight <= 0) throw new Error('Each exercise requires an explicit ID, sets, fixed reps or seconds, and positive fixed weight; zero and omitted loads use openGym defaults');
  }
  return { templateId: input.templateId, revision: input.revision, payload: clone(p), rebase: input.rebase === true };
}

function matches(routine, payload, readback = false) {
  return routine?.name === payload.name && routine.unit === payload.unit && Array.isArray(routine.exercises) && routine.exercises.length === payload.exercises.length && payload.exercises.every((e, i) => {
    const r = routine.exercises[i];
    return r.id === e.exercise && r.sets === e.sets && (e.reps === undefined || r.reps === e.reps) && (e.seconds === undefined || r.seconds === e.seconds || r.sec === e.seconds) && r.weight === e.weight && (e.rest_sec === undefined || (e.rest_sec === 0 ? r.rest_sec == null : r.rest_sec === e.rest_sec)) && (!readback || e.note === undefined || routine._publication?.routine?.ex?.[i]?.note === e.note);
  }) && (!readback || payload.weekdays === undefined || same([...payload.weekdays].sort(), routine._publication?.weekdays));
}
function effective(preview, payload, id) {
  return preview?.routine_id === id && Array.isArray(preview.exercises) && preview.exercises.length === payload.exercises.length && payload.exercises.every((e, i) => {
    const ex = preview.exercises[i], rows = ex?.opening_sets?.filter(row => row.phase === 'work');
    return ex?.id === e.exercise && rows?.length === e.sets && rows.every(row => row.w === e.weight && (e.reps === undefined || row.r === e.reps) && (e.seconds === undefined || row.sec === e.seconds));
  });
}
function baseFor(state, programKey, templateId) { return state.routineBases?.[programKey]?.[templateId] || null; }
function putBase(state, programKey, templateId, base) {
  state.routineBases ||= {}; state.routineBases[programKey] ||= {}; state.routineBases[programKey][templateId] = base;
}
export async function captureRoutine(client, id) {
  const detail = await client.call('get_routine', { routine_id: id });
  if (detail?.id !== id || !Array.isArray(detail.exercises) || !Number.isInteger(detail.revision)) throw new Error('Invalid routine readback');
  const snapshot = await client.request('api/token/data');
  const raw = snapshot?.state?.routines?.find(r => r.id === id);
  if (!raw || snapshot.rev !== detail.revision || !snapshot.state.week || typeof snapshot.state.week !== 'object') throw new Error('Scoped routine snapshot unavailable or changed');
  const names = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const weekdays = names.filter((_, i) => Array.isArray(snapshot.state.week[i]) && snapshot.state.week[i].includes(id)).sort();
  return { ...detail, _publication: { routine: raw, weekdays } };
}
async function current(client, id) {
  if (!id) return null;
  const list = await client.call('list_routines', {});
  if (!Array.isArray(list.routines)) throw new Error('Invalid routine list');
  if (!list.routines.some(r => r.id === id)) return null;
  return captureRoutine(client, id);
}
function result(job) { return ok(job.state, { id: job.id, routineId: job.routineId || null, retryAt: job.retryAt || null, reason: job.reason || null }); }
function approved(job, fingerprint) { return hash({ id: job.id, fingerprint, preview: job.preview, remote: job.remote, base: job.base, mapping: job.mapping, rebase: job.rebase }); }

function prescriptionFingerprint(payload) {
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, k === 'weekdays' && Array.isArray(value[k]) ? [...value[k]].sort() : canonical(value[k])])) : value;
  return hash(canonical(payload));
}

export async function publish(client, state, save, context, input, dryRun) {
  const desired = parse(input);
  const { need, fingerprint, programKey, schemas, schemaAccepts } = context;
  need('list_routines', 'get_routine', 'preview_session', 'create_routine', 'update_routine');
  const versionJobs = state.jobs.filter(j => j.kind === 'publish' && j.programKey === programKey && j.templateId === desired.templateId && j.revision === desired.revision);
  const fingerprints = new Set(versionJobs.filter(j => j.payload).map(j => prescriptionFingerprint(j.payload)));
  const published = (state.publications || []).filter(p => p.programKey === programKey && p.templateId === desired.templateId && p.revision === desired.revision);
  if (fingerprints.size > 1 || published.length > 1 || (fingerprints.size && !fingerprints.has(prescriptionFingerprint(desired.payload))) || (published.length && !fingerprints.size)) return ok('needs_review', { reason: 'Prescription revision is immutable or its history is inconsistent; use a new revision or reconcile the existing history' });
  const matching = versionJobs.filter(j => j.payload && prescriptionFingerprint(j.payload) === prescriptionFingerprint(desired.payload));
  let job = [...matching].reverse().find(j => j.rebase === desired.rebase) || [...matching].reverse().find(j => j.state === 'verified');
  let id = job?.id || hash({ kind: 'publish', programKey, ...desired, payload: prescriptionFingerprint(desired.payload) });
  if (job && job.state === 'verified') {
    const existing = await current(client, job.routineId);
    const base = baseFor(state, programKey, desired.templateId);
    if (!existing || !base || base.id !== job.routineId || !same(comparable(existing), comparable(base.snapshot))) {
      if (!desired.rebase || !existing || !base || base.id !== job.routineId) return ok('conflict', { reason: 'Verified routine was deleted or edited remotely', base: base?.snapshot || null, remote: existing });
      job = null;
      id = hash({ kind: 'publish', programKey, ...desired, payload: prescriptionFingerprint(desired.payload), remote: existing });
    }
    if (job && job.fingerprint !== fingerprint) return ok('needs_review', { reason: 'Capabilities or scope changed since publication' });
    if (job) {
    const opened = await client.call('preview_session', { routine_id: job.routineId });
    if (!matches(existing, desired.payload, true) || !effective(opened, desired.payload, job.routineId)) return ok('needs_review', { reason: 'Current effective targets differ from the local prescription' });
    return result(job);
    }
  }
  if (job && ['uncertain', 'acknowledged'].includes(job.state) && job.acknowledged) await reconcilePublication(client, state, job, save, context);
  if (job && (['uncertain', 'acknowledged', 'retry_at', 'dispatched', 'verified'].includes(job.state) || (job.state === 'needs_review' && job.routineId))) return result(job);
  const mapping = state.mappings?.[programKey]?.[desired.templateId] || null;
  const base = baseFor(state, programKey, desired.templateId);
  if (mapping && (!base || base.id !== mapping)) return ok('needs_review', { reason: 'Mapped routine has no explicitly reviewed baseline; adopt it again first' });
  if (!mapping && state.jobs.some(j => j.kind === 'publish' && j.programKey === programKey && j.templateId === desired.templateId && (['uncertain', 'acknowledged', 'dispatched'].includes(j.state) || (j.state === 'needs_review' && j.routineId)))) return ok('uncertain', { reason: 'An earlier create has an unknown outcome; do not recreate it' });
  const remote = await current(client, mapping);
  if (mapping && !remote) return ok('conflict', { reason: 'Mapped routine was deleted remotely; it will not be recreated', base });
  if (mapping && !same(comparable(base.snapshot), comparable(remote)) && !desired.rebase) return ok('conflict', { reason: 'Phone changes require an explicit reviewed rebase', base: base.snapshot, remote, desired: desired.payload });
  if (desired.rebase && !mapping) throw new Error('Rebase requires an adopted or previously published routine');
  const tool = mapping ? 'update_routine' : 'create_routine';
  const args = mapping ? { routine_id: mapping, ...desired.payload, expected_revision: remote.revision, dry_run: true } : { ...desired.payload, dry_run: true };
  if (!schemaAccepts(schemas[tool], args)) throw new Error('Native routine schema rejects this publication');
  const preview = await client.call(tool, args);
  if (preview.saved !== false || preview.dry_run !== true || preview.problems || !preview.would_save?.routine || !matches(preview.would_save.routine, desired.payload) || (desired.payload.weekdays !== undefined && !same([...desired.payload.weekdays].sort(), [...(preview.would_save.routine.weekdays || [])].sort()))) return ok('needs_review', { reason: 'Native routine preview differs from the requested fixed targets', preview });
  // Create dry-run IDs are random and are not identity or approval evidence.
  const stablePreview = clone(preview); if (!mapping) delete stablePreview.would_save.routine.id;
  if (!job || job.state !== 'draft' || !same(job.remote, remote) || !same(job.base, base) || job.fingerprint !== fingerprint || !same(job.preview, stablePreview)) {
    job = { id, kind: 'publish', state: 'draft', programKey, ...desired, mapping, base, remote, preview: stablePreview, fingerprint, createdAt: new Date().toISOString() };
    job.approval = approved(job, fingerprint);
    state.jobs = state.jobs.filter(j => j.id !== id); state.jobs.push(job); await save();
  }
  if (dryRun) return ok('review', { id, approval: job.approval, preview: job.preview, base: base?.snapshot || null, remote, desired: desired.payload, coverage: 'Fixed targets only; openGym progression and future session values are not controlled.' });
  if (input.approval !== job.approval) return ok('needs_review', { reason: 'Approval is missing or stale; review the current preview', approval: job.approval });
  await dispatchPublication(client, state, job, save, context);
  return result(job);
}

export async function dispatchPublication(client, state, job, save, context) {
  const { need, fingerprint, programKey, schemas, schemaAccepts } = context;
  if (!await context.allowMutation(job, save)) return;
  need('list_routines', 'get_routine', 'preview_session', 'create_routine', 'update_routine');
  const mapping = state.mappings?.[programKey]?.[job.templateId] || null, base = baseFor(state, programKey, job.templateId);
  const siblings = state.jobs.filter(j => j !== job && j.kind === 'publish' && j.programKey === programKey && j.templateId === job.templateId);
  const unresolvedCreate = siblings.some(j => !j.mapping && (['uncertain', 'dispatched', 'acknowledged'].includes(j.state) || (j.state === 'needs_review' && j.routineId)));
  if (!mapping && unresolvedCreate) { job.state = 'needs_review'; job.reason = 'Another create has an unresolved outcome; reconcile or adopt its identity'; delete job.retryAt; await save(); return; }
  const versionFingerprints = new Set(state.jobs.filter(j => j.kind === 'publish' && j.programKey === programKey && j.templateId === job.templateId && j.revision === job.revision && j.payload).map(j => prescriptionFingerprint(j.payload)));
  if (versionFingerprints.size !== 1 || !versionFingerprints.has(prescriptionFingerprint(job.payload))) { job.state = 'needs_review'; job.reason = 'Prescription revision history is inconsistent'; await save(); return; }
  if (job.programKey !== programKey || job.fingerprint !== fingerprint || job.approval !== approved(job, fingerprint) || !same(mapping, job.mapping) || !same(base, job.base)) { job.state = 'needs_review'; job.reason = 'Approval, scope, mapping or baseline changed'; await save(); return; }
  const remote = await current(client, mapping);
  if (!same(remote, job.remote)) { job.state = 'conflict'; job.reason = 'Remote routine or revision changed since review'; await save(); return; }
  const tool = mapping ? 'update_routine' : 'create_routine';
  const args = mapping ? { routine_id: mapping, ...job.payload, expected_revision: remote.revision } : { ...job.payload };
  if (!schemaAccepts(schemas[tool], { ...args, dry_run: false })) { job.state = 'needs_review'; job.reason = 'Native schema changed'; await save(); return; }
  const preview = await client.call(tool, { ...args, dry_run: true });
  if (preview.saved !== false || preview.dry_run !== true || preview.problems || !preview.would_save?.routine || !matches(preview.would_save.routine, job.payload)) { job.state = 'needs_review'; job.reason = 'Fresh native preview differs'; await save(); return; }
  const normalized = clone(preview); if (!mapping) delete normalized.would_save.routine.id;
  if (!same(normalized, job.preview)) { job.state = 'needs_review'; job.reason = 'Native preview changed'; await save(); return; }
  const now = Date.now(); state.writeTimes = (state.writeTimes || []).filter(time => now - time < 3600000);
  if (state.writeTimes.length >= 20) { job.state = 'retry_at'; job.retryAt = new Date(state.writeTimes[0] + 3600000).toISOString(); job.reason = 'local_write_budget'; await save(); return; }
  state.writeTimes.push(now); job.state = 'dispatched'; delete job.retryAt; await save();
  let response;
  try { response = await client.call(tool, { ...args, dry_run: false }); }
  catch (error) { job.state = ['rate_limited', 'native_rate_limited'].includes(error.code) && error.retryAt ? 'retry_at' : 'uncertain'; job.retryAt = error.retryAt; job.reason = error.code || 'lost_response'; await save(); return; }
  if (response.saved !== true || typeof response.routine?.id !== 'string' || !response.routine.id || (mapping && response.routine.id !== mapping)) { job.state = response.conflict ? 'conflict' : response.problems ? 'needs_review' : 'uncertain'; job.reason = response.message || 'Save was not acknowledged'; await save(); return; }
  job.routineId = response.routine.id; job.state = 'acknowledged'; job.acknowledged = true; await save();
  await reconcilePublication(client, state, job, save, context);
}

export async function reconcilePublication(client, state, job, save, context) {
  if (!job.acknowledged || !job.routineId || job.programKey !== context.programKey) return;
  const { programKey } = context;
  const mapping = state.mappings?.[programKey]?.[job.templateId] || null;
  if ((mapping && mapping !== job.routineId) || !same(baseFor(state, programKey, job.templateId), job.base) || job.fingerprint !== context.fingerprint) { job.state = 'needs_review'; job.reason = 'Routine mapping, baseline or capability changed during readback'; await save(); return; }
  try {
    const detail = await current(client, job.routineId);
    const opened = await client.call('preview_session', { routine_id: job.routineId });
    if (!matches(detail, job.payload, true) || !effective(opened, job.payload, job.routineId)) { job.state = 'needs_review'; job.reason = 'Saved routine or effective opening targets differ; inspect openGym progression'; await save(); return; }
    state.publications ||= [];
    const prior = state.publications.filter(p => p.programKey === programKey && p.templateId === job.templateId && p.revision === job.revision);
    if (prior.length > 1) { job.state = 'needs_review'; job.reason = 'Prescription revision history is inconsistent'; await save(); return; }
    state.mappings ||= {}; state.mappings[programKey] ||= {}; state.mappings[programKey][job.templateId] = job.routineId;
    putBase(state, programKey, job.templateId, { id: job.routineId, snapshot: detail });
    if (!prior.length) state.publications.push({ templateId: job.templateId, revision: job.revision, programKey, routineId: job.routineId, prescription: clone(job.payload), snapshot: detail, effective: opened, verifiedAt: new Date().toISOString() });
    else { state.verificationEvents ||= []; state.verificationEvents.push({ programKey, templateId: job.templateId, revision: job.revision, routineId: job.routineId, verifiedAt: new Date().toISOString() }); }
    job.state = 'verified'; job.reason = null; await save();
  } catch { job.state = 'uncertain'; job.reason = 'Acknowledged save could not be verified'; await save(); }
}

export function rememberAdoptedBases(state, programKey, templates, details) {
  for (const [templateId, id] of Object.entries(templates)) putBase(state, programKey, templateId, { id, snapshot: details[id] });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = join(import.meta.dirname, '..');
function runBundle(script, ...args) { return spawnSync(process.execPath, [join(root, 'scripts', script), ...args], { encoding: 'utf8' }); }
const program = '2026-01_sample-program';
function fixture() {
  const workspace = mkdtempSync(join(tmpdir(), 'workout-core-'));
  cpSync(join(root, 'test/fixtures/workspace'), workspace, { recursive: true });
  return { workspace, dir: join(workspace, 'programs', program) };
}
function run(script, ...args) {
  return spawnSync(process.execPath, [join(root, 'src', script), ...args], { encoding: 'utf8' });
}
const scope = { server: 'https://gym.example', profileId: 'one' };
const markerFor = (workspace, name = program) => ({ version: 2, backend: 'opengym', scope, program: { workspace: realpathSync(workspace), name }, configPath: '/private/config.json' });
function projection(workspace, name = program) {
  const now = new Date().toISOString();
  return { version: 2, scope, program: { workspace: realpathSync(workspace), name }, currentMesocycle: 1, observedAt: now, coverage: { from: '2020-01-01', to: '2099-12-31', complete: true }, freshnessMaxAgeMs: 86400000, activeUnknown: true, assignments: [], lastSession: null, nextSessionId: null, needs_mapping: false };
}
function save(dir, name, data) { writeFileSync(join(dir, `.opengym-${name}.json`), JSON.stringify(data)); }

test('state preserves local output and reports validated remote progress', () => {
  const {workspace, dir} = fixture();
  const local = JSON.parse(run('state.mjs', workspace).stdout);
  assert.equal(Object.hasOwn(local, 'backend'), false);
  save(dir, 'backend', markerFor(workspace)); save(dir, 'projection', projection(workspace));
  const remote = JSON.parse(run('state.mjs', workspace).stdout);
  assert.equal(remote.backend, 'opengym');
  assert.equal(remote.progress.status, 'fresh');
  assert.equal(remote.progress.nextSessionId, null);
  const completed = { occurrenceId: 'occ-1', sessionId: 'A', workoutId: 'workout-1', completedAt: '2026-01-01T10:00:00Z' };
  save(dir, 'projection', {...projection(workspace), assignments: [completed], lastSession: completed, nextSessionId: 'C'});
  const verified = JSON.parse(run('state.mjs', workspace).stdout).progress;
  assert.deepEqual(verified.lastSession, completed);
  assert.equal(verified.nextSessionId, 'C');
  const sessionsPath = join(dir, 'mesocycle-1', 'sessions.yaml');
  const sessions = readFileSync(sessionsPath, 'utf8');
  writeFileSync(sessionsPath, sessions.replace('id: C', 'id: X'));
  const unmapped = JSON.parse(run('state.mjs', workspace).stdout).progress;
  assert.equal(unmapped.status, 'unknown');
  assert.equal(unmapped.nextSessionId, null);
  assert.equal(unmapped.needs_mapping, true);
  assert.deepEqual(unmapped.lastSession, completed);
  writeFileSync(sessionsPath, sessions);
  save(dir, 'projection', {...projection(workspace), coverage: { from: '2000-01-01', to: '2000-12-31', complete: true }});
  assert.equal(JSON.parse(run('state.mjs', workspace).stdout).progress.status, 'stale');
  save(dir, 'projection', {...projection(workspace), observedAt: '2999-01-01T00:00:00Z'});
  assert.equal(JSON.parse(run('state.mjs', workspace).stdout).progress.status, 'stale');
  save(dir, 'projection', {...projection(workspace), observedAt: '2000-01-01T00:00:00Z'});
  assert.equal(JSON.parse(run('state.mjs', workspace).stdout).progress.status, 'stale');
  save(dir, 'projection', {...projection(workspace), scope: {...scope, profileId: 'other'}});
  assert.equal(JSON.parse(run('state.mjs', workspace).stdout).progress.status, 'unknown');
  save(dir, 'projection', {...projection(workspace), coverage: {...projection(workspace).coverage, complete: false}});
  assert.equal(JSON.parse(run('state.mjs', workspace).stdout).progress.status, 'stale');
});

test('external marker blocks pointer writes but permits local coaching changes', () => {
  const {workspace, dir} = fixture();
  const status = join(dir, 'status.yaml');
  const args = ['--workspace', workspace, 'update', 'program-status', '--program', program];
  const original = readFileSync(status, 'utf8');
  writeFileSync(join(dir, '.opengym-backend.json'), '{invalid');
  const denied = run('workout-data/cli.mjs', ...args, '--data', '{"last_session":"2026-01-10"}');
  assert.equal(denied.status, 1);
  assert.equal(JSON.parse(denied.stderr).code, 'external_progress');
  assert.equal(readFileSync(status, 'utf8'), original);
  const accepted = run('workout-data/cli.mjs', ...args, '--data', '{"current_week":2}');
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.match(readFileSync(status, 'utf8'), /current_week: 2/);
  const local = fixture();
  const permitted = run('workout-data/cli.mjs', '--workspace', local.workspace, 'update', 'program-status', '--program', program, '--data', '{"last_session":"2026-01-10"}');
  assert.equal(permitted.status, 0, permitted.stderr);
});


test('sidecars belong to the actual program and canonical workspace', () => {
  const {workspace, dir} = fixture();
  const completed = { occurrenceId: 'occ-1', sessionId: 'A', workoutId: 'w1', completedAt: '2026-01-01' };
  const sidecar = {...projection(workspace), assignments: [completed], lastSession: completed, nextSessionId: 'C'};
  save(dir, 'backend', markerFor(workspace)); save(dir, 'projection', sidecar);
  const alias = `${workspace}-alias`; symlinkSync(workspace, alias);
  assert.equal(JSON.parse(run('state.mjs', alias).stdout).progress.status, 'fresh');
  const other = '2026-02_other';
  const otherDir = join(workspace, 'programs', other);
  cpSync(dir, otherDir, {recursive: true});
  rmSync(dir, {recursive:true});
  const copied = JSON.parse(run('state.mjs', workspace).stdout);
  assert.equal(copied.progress.status, 'unknown');
  assert.equal(copied.progress.nextSessionId, null);
  save(otherDir, 'backend', markerFor(workspace, other));
  assert.equal(JSON.parse(run('state.mjs', workspace).stdout).progress.status, 'unknown');
  save(otherDir, 'projection', {...sidecar, program: {workspace: realpathSync(workspace), name: other}});
  assert.equal(JSON.parse(run('state.mjs', workspace).stdout).progress.status, 'fresh');
  save(otherDir, 'projection', {...sidecar, version: 1, program: {workspace: realpathSync(workspace), name: other}});
  assert.equal(JSON.parse(run('state.mjs', workspace).stdout).progress.status, 'unknown');
  save(otherDir, 'projection', {...sidecar, currentMesocycle: 2, program: {workspace: realpathSync(workspace), name: other}});
  assert.equal(JSON.parse(run('state.mjs', workspace).stdout).progress.status, 'unknown');
  save(otherDir, 'backend', {...markerFor(workspace, other), version: 1});
  assert.equal(JSON.parse(run('state.mjs', workspace).stdout).progress.status, 'unknown');
});

test('external rotation can advance blocks without changing legacy pointer; local validation remains strict', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'workout-lifecycle-'));
  cpSync(join(root, 'test/fixtures/workspace-rotation'), workspace, {recursive:true});
  const name = '2026-01_rotation-program'; const dir = join(workspace, 'programs', name);
  const next = join(dir, 'mesocycle-2'); mkdirSync(next);
  const sessions = readFileSync(join(dir, 'mesocycle-1/sessions.yaml'), 'utf8');
  writeFileSync(join(next, 'sessions.yaml'), sessions.replace('mesocycle: 1','mesocycle: 2').replace('id: A','id: D').replace('id: B','id: E').replace('id: C','id: F'));
  save(dir, 'backend', markerFor(workspace, name));
  save(dir, 'projection', {...projection(workspace, name), nextSessionId: 'B'});
  assert.equal(JSON.parse(runBundle('state.mjs', workspace).stdout).progress.nextSessionId, 'B');
  const args = ['--workspace',workspace,'update','program-status','--program',name];
  const update = runBundle('workout-data.mjs', ...args, '--data', '{"current_mesocycle":2,"current_week":1}');
  assert.equal(update.status, 0, update.stderr);
  assert.match(readFileSync(join(dir, 'status.yaml'),'utf8'), /next_session_id: B/);
  const after = JSON.parse(runBundle('state.mjs', workspace).stdout).progress;
  assert.equal(after.status, 'unknown');
  assert.equal(after.nextSessionId, null);
  assert.equal(runBundle('validate.mjs', workspace).status, 0);
  assert.equal(runBundle('workout-data.mjs', '--workspace', workspace, 'validate', '--program', name).status, 0);
  const nextPath = join(next, 'sessions.yaml');
  const validSessions = readFileSync(nextPath, 'utf8');
  writeFileSync(nextPath, validSessions.replace('id: D', 'id: D\n    days: [monday]'));
  assert.equal(runBundle('validate.mjs', workspace).status, 1);
  writeFileSync(nextPath, validSessions);
  const denied = runBundle('workout-data.mjs', ...args, '--data', '{"next_session_id":null}');
  assert.equal(JSON.parse(denied.stderr).code, 'external_progress');
  rmSync(join(dir, '.opengym-backend.json'));
  assert.equal(runBundle('validate.mjs', workspace).status, 1);
  const local = runBundle('workout-data.mjs', ...args, '--data', '{"next_session_id":"D"}');
  assert.equal(local.status, 0, local.stderr);
  assert.equal(runBundle('validate.mjs', workspace).status, 0);
});


test('program directory symlink cannot make an external sidecar trusted', () => {
  const {workspace, dir} = fixture();
  save(dir, 'backend', markerFor(workspace)); save(dir, 'projection', projection(workspace));
  const outside = mkdtempSync(join(tmpdir(), 'workout-external-'));
  cpSync(dir, join(outside, program), {recursive:true});
  rmSync(dir, {recursive:true}); symlinkSync(join(outside, program), dir);
  const state = JSON.parse(run('state.mjs', workspace).stdout);
  assert.equal(state.progress.status, 'unknown');
});


test('re-adoption withholds cached progress until both marker and projection permit it', () => {
  const { workspace, dir } = fixture();
  const completed = { occurrenceId: 'one', sessionId: 'A', workoutId: 'w1', completedAt: '2026-01-01' };
  const cached = {...projection(workspace), assignments: [completed], lastSession: completed, nextSessionId: 'C', requiresAdoption: false};
  const read = () => JSON.parse(run('state.mjs', workspace).stdout).progress;
  save(dir, 'backend', {...markerFor(workspace), requiresAdoption: false});
  save(dir, 'projection', cached);
  assert.equal(read().status, 'fresh');
  assert.equal(read().nextSessionId, 'C');
  save(dir, 'backend', {...markerFor(workspace), requiresAdoption: true});
  assert.equal(read().status, 'unknown');
  assert.equal(read().nextSessionId, null);
  assert.equal(read().needs_mapping, true);
  save(dir, 'backend', {...markerFor(workspace), requiresAdoption: false});
  save(dir, 'projection', {...cached, requiresAdoption: true});
  assert.equal(read().status, 'unknown');
  assert.equal(read().nextSessionId, null);
  assert.equal(read().needs_mapping, true);
  save(dir, 'projection', {...cached, requiresAdoption: 'false'});
  assert.equal(read().status, 'unknown');
  save(dir, 'projection', cached);
  save(dir, 'backend', {...markerFor(workspace), requiresAdoption: 'false'});
  assert.equal(read().status, 'unknown');
  const blocked = run('workout-data/cli.mjs', '--workspace', workspace, 'update', 'program-status', '--program', program, '--data', '{"next_session_id":null}');
  assert.equal(JSON.parse(blocked.stderr).code, 'external_progress');
});

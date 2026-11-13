import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = join(import.meta.dirname, '..');
const FIXTURE = join(ROOT, 'test', 'fixtures', 'workspace');

test('bundle freshness: committed public scripts match fresh esbuild output', () => {
  const out = mkdtempSync(join(tmpdir(), 'workout-bundle-'));
  const esbuild = join(ROOT, 'node_modules', '.bin', 'esbuild');
  const shared = ['--bundle', '--platform=node', '--format=esm', '--target=node20', '--out-extension:.js=.mjs'];
  execFileSync(esbuild, ['src/state.mjs', 'src/validate.mjs', ...shared, `--outdir=${out}`], { cwd: ROOT, stdio: 'pipe' });
  const nodeRequireBanner = '--banner:js=import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);';
  execFileSync(esbuild, ['src/workout-data/cli.mjs', ...shared, nodeRequireBanner, `--outfile=${join(out, 'workout-data.mjs')}`], { cwd: ROOT, stdio: 'pipe' });
  for (const f of ['state.mjs', 'validate.mjs', 'workout-data.mjs']) {
    assert.equal(readFileSync(join(out, f), 'utf8'), readFileSync(join(ROOT, 'scripts', f), 'utf8'),
      `scripts/${f} is stale: run npm run build`);
  }
});

function invokeWorkoutData(args, workspace = FIXTURE) {
  const cwd = mkdtempSync(join(tmpdir(), 'workout-cwd-'));
  try {
    return {
      status: 0,
      stdout: execFileSync('node', [join(ROOT, 'scripts', 'workout-data.mjs'), '--workspace', workspace, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
      stderr: '',
    };
  } catch (error) {
    return {
      status: error.status,
      stdout: error.stdout.toString(),
      stderr: error.stderr.toString(),
    };
  }
}

test('smoke: bundled workout-data CLI handles public commands from another cwd', () => {
  const program = '2026-01_sample-program';
  const status = invokeWorkoutData(['get', 'program-status', '--program', program]);
  assert.equal(status.status, 0);
  assert.equal(JSON.parse(status.stdout).data.status, 'active');

  const sessions = invokeWorkoutData(['list', 'session', '--program', program, '--mesocycle', '1', '--fields', 'id,name']);
  assert.equal(sessions.status, 0);
  assert.deepEqual(JSON.parse(sessions.stdout).items, [
    { id: 'A', name: 'Upper body' },
    { id: 'C', name: 'Circuit (optional)' },
  ]);

  const invalidWrite = invokeWorkoutData(['update', 'program-status', '--program', program, '--data', '{"unknown":true}']);
  assert.equal(invalidWrite.status, 1);
  assert.equal(JSON.parse(invalidWrite.stderr).code, 'invalid_payload');

  const validation = invokeWorkoutData(['validate', '--program', program]);
  assert.equal(validation.status, 0);
  assert.equal(JSON.parse(validation.stdout).ok, true);
});


test('smoke: bundled workout-data CLI removes a selected session exercise', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'workout-data-public-remove-'));
  cpSync(FIXTURE, workspace, { recursive: true });
  const result = invokeWorkoutData(['remove', 'session-exercise', '--program', '2026-01_sample-program', '--mesocycle', '1', '--id', 'A', '--order', 'A2', '--data', '{}'], workspace);
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.ok, true);
  assert.deepEqual(receipt.selector, { id: 'A', order: 'A2' });
  const sessions = readFileSync(join(workspace, 'programs', '2026-01_sample-program', 'mesocycle-1', 'sessions.yaml'), 'utf8');
  assert.doesNotMatch(sessions, /order: "A2"/);
  assert.match(sessions, /order: "A1"/);
});

test('smoke: bundled workout-data CLI rejects a duplicate session exercise order without writing', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'workout-data-public-duplicate-order-'));
  cpSync(FIXTURE, workspace, { recursive: true });
  const path = join(workspace, 'programs', '2026-01_sample-program', 'mesocycle-1', 'sessions.yaml');
  const original = readFileSync(path, 'utf8');
  const result = invokeWorkoutData(['add', 'session-exercise', '--program', '2026-01_sample-program', '--mesocycle', '1', '--id', 'A', '--data', '{"order":"A1","exercise":"seated_row","sets":3,"reps":"10"}'], workspace);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).code, 'already_exists');
  assert.equal(readFileSync(path, 'utf8'), original);
});

test('smoke: bundled workout-data CLI creates and validates a profile from another cwd', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'workout-bundle-create-'));
  const payload = '{"language":"en","units":{"load":"kg","length":"cm"},"equipment":[{"id":"chest_press","name":"Chest Press","category":"machine"}]}';
  const create = invokeWorkoutData(['create', 'profile', '--data', payload], workspace);
  assert.equal(create.status, 0, create.stderr);
  assert.equal(JSON.parse(create.stdout).ok, true);
  assert.match(readFileSync(join(workspace, 'profile.yaml'), 'utf8'), /language: en/);

  const validation = invokeWorkoutData(['validate', '--scope', 'workspace'], workspace);
  assert.equal(validation.status, 0, validation.stderr);
  assert.equal(JSON.parse(validation.stdout).validation.passed, true);
});

test('smoke: bundled state.mjs runs from another cwd against a fixture workspace', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'workout-cwd-'));
  const out = execFileSync('node', [join(ROOT, 'scripts', 'state.mjs'), FIXTURE], { cwd, encoding: 'utf8' });
  const parsed = JSON.parse(out);
  assert.equal(parsed.state, 'in_progress');
  assert.equal(parsed.skills['track'].allowed, true);
});

test('smoke: bundled state.mjs defaults to cwd as workspace', () => {
  const parsed = JSON.parse(execFileSync('node', [join(ROOT, 'scripts', 'state.mjs')], { cwd: FIXTURE, encoding: 'utf8' }));
  assert.equal(parsed.program, '2026-01_sample-program');
});

test('smoke: bundled validate.mjs passes on the fixture workspace from another cwd', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'workout-cwd-'));
  const out = execFileSync('node', [join(ROOT, 'scripts', 'validate.mjs'), FIXTURE], { cwd, encoding: 'utf8' });
  assert.match(out, /✓ \d+ valid file/);
});

test('smoke: bundled validate.mjs exits 1 on an invalid workspace', () => {
  const bad = mkdtempSync(join(tmpdir(), 'workout-bad-'));
  execFileSync('cp', ['-R', FIXTURE + '/.', bad]);
  execFileSync('sh', ['-c', `echo 'meta: { schema_version: 1 }\nlanguage: English' > ${bad}/profile.yaml`]);
  assert.throws(() => execFileSync('node', [join(ROOT, 'scripts', 'validate.mjs'), bad], { stdio: 'pipe' }), (e) => e.status === 1);
});

test('smoke: bundled state.mjs blocks coach when profile is missing', () => {
  const empty = mkdtempSync(join(tmpdir(), 'workout-empty-'));
  const parsed = JSON.parse(execFileSync('node', [join(ROOT, 'scripts', 'state.mjs'), empty], { encoding: 'utf8' }));
  assert.equal(parsed.state, 'needs_onboarding');
  assert.equal(parsed.skills['coach'].allowed, false);
  assert.equal(parsed.skills['onboarding'].allowed, true);
});

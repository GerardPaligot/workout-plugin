import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = join(import.meta.dirname, '..');
const FIXTURE = join(ROOT, 'test', 'fixtures', 'workspace');

test('bundle freshness: committed scripts/*.mjs match a fresh `npm run build`', () => {
  const out = mkdtempSync(join(tmpdir(), 'workout-bundle-'));
  const build = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts.build;
  const args = build.replace(/^esbuild /, '').split(' ').map((a) => (a.startsWith('--outdir=') ? `--outdir=${out}` : a));
  execFileSync(join(ROOT, 'node_modules', '.bin', 'esbuild'), args, { cwd: ROOT, stdio: 'pipe' });
  for (const f of ['state.mjs', 'validate.mjs']) {
    assert.equal(readFileSync(join(out, f), 'utf8'), readFileSync(join(ROOT, 'scripts', f), 'utf8'),
      `scripts/${f} is stale: run npm run build`);
  }
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

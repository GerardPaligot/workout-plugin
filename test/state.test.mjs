import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { detectState, computeSkills } from '../src/state.mjs';

function workspace({ profile = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'workout-state-'));
  mkdirSync(join(root, 'programs'));
  if (profile) writeFileSync(join(root, 'profile.yaml'), 'meta: { schema_version: 1 }\n');
  return root;
}
function writeProgram(root, slug, statusYaml, { mesocycles = [] } = {}) {
  const dir = join(root, 'programs', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'status.yaml'), statusYaml);
  for (const m of mesocycles) {
    const md = join(dir, `mesocycle-${m.n}`);
    mkdirSync(md, { recursive: true });
    if (m.sessions) writeFileSync(join(md, 'sessions.yaml'), 'meta: { schema_version: 1 }\nsessions: []\n');
    if (m.review) writeFileSync(join(md, 'review.md'), '# Review\n');
  }
  return dir;
}
const STATUS = (status, n = 1, week = 1) =>
  `meta: { schema_version: 1 }\nprogram: p\nstatus: ${status}\ncurrent_mesocycle: ${n}\ncurrent_week: ${week}\nstart_date: 2026-01-01\n`;

test('detectState: no program', () => {
  const root = workspace();
  assert.equal(detectState(root).state, 'no_program');
});

test('detectState: missing profile.yaml = needs_onboarding', () => {
  const root = workspace({ profile: false });
  writeProgram(root, '2026-01_p', STATUS('active'));
  assert.equal(detectState(root).state, 'needs_onboarding');
});

test('gate needs_onboarding: only onboarding allowed', () => {
  const root = workspace({ profile: false });
  const s = computeSkills(root, detectState(root));
  assert.equal(s['onboarding'].allowed, true);
  for (const n of ['coach', 'track', 'review-mesocycle', 'create-mesocycle', 'create-program', 'archive-program']) {
    assert.equal(s[n].allowed, false);
    assert.match(s[n].reason, /onboarding/);
  }
});

test('detectState: active program', () => {
  const root = workspace();
  writeProgram(root, '2026-01_p', STATUS('active'));
  const r = detectState(root);
  assert.equal(r.state, 'in_progress');
  assert.equal(r.program, '2026-01_p');
});

test('detectState: paused program', () => {
  const root = workspace();
  writeProgram(root, '2026-01_p', STATUS('paused'));
  assert.equal(detectState(root).state, 'paused');
});

test('detectState: completed program', () => {
  const root = workspace();
  writeProgram(root, '2026-01_p', STATUS('completed'));
  assert.equal(detectState(root).state, 'completed');
});

test('detectState: archives ignored', () => {
  const root = workspace();
  mkdirSync(join(root, 'programs', 'archives', 'old'), { recursive: true });
  writeFileSync(join(root, 'programs', 'archives', 'old', 'status.yaml'), STATUS('archived'));
  assert.equal(detectState(root).state, 'no_program');
});

test('detectState: two live programs = inconsistent', () => {
  const root = workspace();
  writeProgram(root, '2026-01_a', STATUS('active'));
  writeProgram(root, '2026-02_b', STATUS('completed'));
  assert.equal(detectState(root).state, 'inconsistent');
});

test('detectState: archived not moved = inconsistent', () => {
  const root = workspace();
  writeProgram(root, '2026-01_p', STATUS('archived'));
  assert.equal(detectState(root).state, 'inconsistent');
});

const MACRO_3 = 'meta: { schema_version: 1, version: 1, last_modified: 2026-01-01 }\nname: P\nstart_date: 2026-01-01\nend_date: 2026-06-30\nfrequency: "4"\nsplit: upper_lower\nmesocycles:\n  - { number: 1, name: A, weeks: { start: 1, end: 4 }, dates: { start: 2026-01-01, end: 2026-01-28 }, goal: x }\n  - { number: 2, name: B, weeks: { start: 5, end: 8 }, dates: { start: 2026-02-01, end: 2026-02-28 }, goal: y }\n  - { number: 3, name: C, weeks: { start: 9, end: 12 }, dates: { start: 2026-03-01, end: 2026-03-28 }, goal: z }\n';
function writeMacro(dir) { writeFileSync(join(dir, 'macrocycle.yaml'), MACRO_3); }

function skills(root) { return computeSkills(root, detectState(root)); }

test('gate no_program: only coach + create-program + onboarding', () => {
  const root = workspace();
  const s = skills(root);
  assert.equal(s['create-program'].allowed, true);
  assert.equal(s['coach'].allowed, true);
  assert.equal(s['onboarding'].allowed, true);
  assert.equal(s['track'].allowed, false);
  assert.equal(s['archive-program'].allowed, false);
});

test('gate in_progress: create-program blocked, track/coach ok', () => {
  const root = workspace();
  const dir = writeProgram(root, '2026-01_p', STATUS('active', 1), { mesocycles: [{ n: 1, sessions: true }] });
  writeMacro(dir);
  const s = skills(root);
  assert.equal(s['create-program'].allowed, false);
  assert.equal(s['track'].allowed, true);
  assert.equal(s['review-mesocycle'].allowed, true);
  assert.equal(s['archive-program'].allowed, false);
});

test('gate in_progress: create-mesocycle blocked without review', () => {
  const root = workspace();
  const dir = writeProgram(root, '2026-01_p', STATUS('active', 1), { mesocycles: [{ n: 1, sessions: true }] });
  writeMacro(dir);
  const s = skills(root);
  assert.equal(s['create-mesocycle'].allowed, false);
  assert.match(s['create-mesocycle'].reason, /Review/);
});

test('gate in_progress: create-mesocycle allowed after review', () => {
  const root = workspace();
  const dir = writeProgram(root, '2026-01_p', STATUS('active', 1), { mesocycles: [{ n: 1, sessions: true, review: true }] });
  writeMacro(dir);
  assert.equal(skills(root)['create-mesocycle'].allowed, true);
});

test('gate in_progress: create-mesocycle blocked at last planned mesocycle', () => {
  const root = workspace();
  const dir = writeProgram(root, '2026-01_p', STATUS('active', 3), { mesocycles: [{ n: 3, sessions: true, review: true }] });
  writeMacro(dir);
  assert.equal(skills(root)['create-mesocycle'].allowed, false);
});

test('gate review blocked if current block sessions missing', () => {
  const root = workspace();
  const dir = writeProgram(root, '2026-01_p', STATUS('active', 2), { mesocycles: [{ n: 2 }] });
  writeMacro(dir);
  assert.equal(skills(root)['review-mesocycle'].allowed, false);
});

test('gate completed: archive-program ok, create-program blocked', () => {
  const root = workspace();
  const dir = writeProgram(root, '2026-01_p', STATUS('completed', 3), { mesocycles: [{ n: 3, sessions: true, review: true }] });
  writeMacro(dir);
  const s = skills(root);
  assert.equal(s['archive-program'].allowed, true);
  assert.equal(s['create-program'].allowed, false);
  assert.match(s['create-program'].reason, /[Aa]rchive/);
});

test('gate inconsistent: every write blocked', () => {
  const root = workspace();
  writeProgram(root, '2026-01_a', STATUS('active'));
  writeProgram(root, '2026-02_b', STATUS('active'));
  const s = skills(root);
  assert.equal(s['coach'].allowed, true);
  for (const n of ['track', 'review-mesocycle', 'create-mesocycle', 'create-program', 'archive-program']) {
    assert.equal(s[n].allowed, false);
  }
});

test('CLI: prints JSON with state and skills, exit code 0', () => {
  const root = workspace();
  const out = execFileSync('node', [join(import.meta.dirname, '..', 'src', 'state.mjs'), root], { encoding: 'utf8' });
  const parsed = JSON.parse(out);
  assert.equal(parsed.state, 'no_program');
  assert.equal(parsed.skills['create-program'].allowed, true);
  assert.equal(parsed.skills['coach'].allowed, true);
});

test('CLI: reports needs_onboarding when profile.yaml is missing', () => {
  const root = workspace({ profile: false });
  const parsed = JSON.parse(execFileSync('node', [join(import.meta.dirname, '..', 'src', 'state.mjs'), root], { encoding: 'utf8' }));
  assert.equal(parsed.state, 'needs_onboarding');
  assert.equal(parsed.skills['onboarding'].allowed, true);
});

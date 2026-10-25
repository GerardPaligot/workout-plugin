import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SKILLS_DIR = join(import.meta.dirname, '..', 'skills');

const WORKFLOW_SKILLS = ['create-program', 'create-mesocycle', 'review-mesocycle', 'track', 'archive-program'];
const REFERENCE_SKILLS = [
  'lifting-biomechanics', 'training-principles', 'training-programming', 'program-structure',
  'biceps-training', 'back-training', 'shoulder-training', 'obliques-training',
  'chest-training', 'quadriceps-training', 'triceps-training',
];
const GATED_SKILLS = ['coach', ...WORKFLOW_SKILLS, ...REFERENCE_SKILLS]; // everything except onboarding
// Ungated utility skills: no profile.yaml prerequisite and no state.mjs gate (they must work on older workspaces).
const UNGATED_SKILLS = ['upgrade-workspace'];
const EXPECTED_SKILLS = ['onboarding', ...GATED_SKILLS, ...UNGATED_SKILLS];
const GATE_SENTENCE = 'stop and run the `onboarding` skill first';

const readSkill = (name) => {
  const p = join(SKILLS_DIR, name, 'SKILL.md');
  assert.ok(existsSync(p), `${name}/SKILL.md missing`);
  return readFileSync(p, 'utf8');
};
function assertFrontmatter(txt, name) {
  assert.match(txt, /^---\n[\s\S]*?\n---/, `${name}: frontmatter missing`);
  assert.match(txt, /\nname: /, `${name}: name field missing`);
  assert.match(txt, /\ndescription: /, `${name}: description field missing`);
}

test('skills: exactly the 19 expected skill directories', () => {
  const dirs = readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  assert.deepEqual(dirs, [...EXPECTED_SKILLS].sort());
});

for (const name of EXPECTED_SKILLS) {
  test(`skill ${name}: frontmatter name matches directory`, () => {
    const txt = readSkill(name);
    assertFrontmatter(txt, name);
    assert.match(txt, new RegExp(`\\nname: ${name}\\n`));
  });
  test(`skill ${name}: no personal paths, legacy paths or French`, () => {
    const txt = readSkill(name);
    for (const bad of ['/Use' + 'rs/', 'tools/', '.claude/skills/']) assert.ok(!txt.includes(bad), `${name}: contains ${bad}`);
    // Source citations keep the original (French) video titles verbatim.
    const prose = txt.split('\n').filter((l) => !l.startsWith('- Video:')).join('\n');
    assert.doesNotMatch(prose, /[àâçéèêëîïôûùüœ]/i, `${name}: accented (French) character`);
    assert.doesNotMatch(prose, /\b(séance|programme|charge cible|exercice|dos|épaules)\b/i, `${name}: French word`);
  });
}

for (const name of GATED_SKILLS) {
  test(`skill ${name}: onboarding gate wording present`, () => {
    const txt = readSkill(name);
    assert.ok(txt.includes('profile.yaml'), `${name}: profile.yaml prerequisite missing`);
    assert.ok(txt.includes(GATE_SENTENCE), `${name}: gate sentence missing`);
  });
}

for (const name of [...WORKFLOW_SKILLS, 'coach', 'onboarding']) {
  test(`skill ${name}: calls the plugin state script with the Codex fallback`, () => {
    const txt = readSkill(name);
    assert.ok(txt.includes('node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" .'), `${name}: state.mjs call missing`);
    assert.match(txt, /plugin root is the directory two levels above this SKILL\.md/, `${name}: Codex fallback missing`);
  });
}

for (const name of WORKFLOW_SKILLS) {
  test(`skill ${name}: reads gate skills["${name}"]`, () => {
    assert.ok(readSkill(name).includes(`skills["${name}"]`));
  });
}

for (const name of [...WORKFLOW_SKILLS, 'onboarding']) {
  test(`skill ${name}: validates with the plugin validate script`, () => {
    if (name === 'archive-program' || name === 'onboarding' || WORKFLOW_SKILLS.includes(name)) {
      assert.ok(readSkill(name).includes('node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs" .'));
    }
  });
}

for (const name of UNGATED_SKILLS) {
  test(`skill ${name}: ungated, validates and has the Codex fallback`, () => {
    const txt = readSkill(name);
    assert.ok(!txt.includes(GATE_SENTENCE), `${name}: must not carry the onboarding gate`);
    assert.ok(!txt.includes('scripts/state.mjs'), `${name}: must not call state.mjs`);
    assert.ok(txt.includes('node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs" .'));
    assert.match(txt, /plugin root is the directory two levels above this SKILL\.md/);
    assert.match(txt, /## What you do NOT do/);
    assert.match(txt, /`onboarding`/);
  });
}

test('skill coach: read-only', () => assert.match(readSkill('coach'), /read-only/i));

test('skill onboarding: no gate (it is the entry point) and writes profile.yaml', () => {
  const txt = readSkill('onboarding');
  assert.ok(!txt.includes(GATE_SENTENCE));
  assert.match(txt, /profile\.yaml/);
});

test('skills: custom exercises go to exercises.custom.yaml, never the catalog', () => {
  assert.match(readSkill('onboarding'), /exercises\.custom\.yaml/);
  assert.match(readSkill('create-program'), /exercises\.custom\.yaml/);
  assert.match(readSkill('program-structure'), /exercises\.custom\.yaml/);
});

test('skills: rotation scheduling is documented', () => {
  for (const name of ['program-structure', 'create-program', 'create-mesocycle', 'track']) {
    assert.ok(readSkill(name).includes('rotation'), `${name} mentions rotation`);
  }
  for (const name of ['create-program', 'program-structure']) {
    assert.ok(readSkill(name).includes('scheduling'), `${name} mentions scheduling`);
  }
  for (const name of ['track', 'create-mesocycle', 'program-structure', 'coach']) {
    assert.ok(readSkill(name).includes('next_session_id'), `${name} mentions next_session_id`);
  }
  assert.ok(!readSkill('training-programming').includes('a rotation is not represented'));
});

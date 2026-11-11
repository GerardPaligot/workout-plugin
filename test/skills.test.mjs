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
const MECHANICS_SKILLS = ['workout-data'];
const EXPECTED_SKILLS = ['onboarding', ...GATED_SKILLS, ...UNGATED_SKILLS, ...MECHANICS_SKILLS];
const GATE_SENTENCE = 'stop and run the `onboarding` skill first';
const YAML_WRITE_BOUNDARY = /Never\s+hand-edit `profile\.yaml`,\s*`status\.yaml`,\s*`goals\.yaml`,\s*`macrocycle\.yaml`,\s*or `sessions\.yaml`\./;

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

test('skills: exactly the 20 expected skill directories', () => {
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

const RESOURCE_WRITER_SKILLS = ['onboarding', ...WORKFLOW_SKILLS];
const CLI_PATH = 'node "${CLAUDE_PLUGIN_ROOT}/scripts/workout-data.mjs"';

for (const name of RESOURCE_WRITER_SKILLS) {
  test(`skill ${name}: uses the resource CLI with the Codex fallback`, () => {
    const txt = readSkill(name);
    assert.ok(txt.includes(CLI_PATH), `${name}: workout-data CLI call missing`);
    assert.match(txt, /plugin root is the directory two levels above this SKILL\.md/, `${name}: CLI fallback missing`);
  });
}

test('skill workout-data: provides CLI mechanics without a workflow gate', () => {
  const txt = readSkill('workout-data');
  assert.ok(txt.includes(CLI_PATH));
  assert.match(txt, /help \[resource\] \[--format json\|text\]/);
  assert.match(txt, /When unsure about selectors or payload fields, use `help <resource>`/);
  assert.match(txt, YAML_WRITE_BOUNDARY);
  assert.match(txt, /exercises\.custom\.yaml.*manual(?:ly)?[\s\S]*custom-catalog workflow/s);
  assert.match(txt, /upgrade-workspace.*catalog migrations/s);
  assert.ok(!txt.includes('scripts/state.mjs'));
  assert.ok(!txt.includes(GATE_SENTENCE));
});

test('skill program-structure: passes YAML template bodies to the CLI', () => {
  const txt = readSkill('program-structure');
  assert.match(txt, YAML_WRITE_BOUNDARY);
  assert.match(txt, /YAML templates inform the CLI create payloads/i);
  assert.match(txt, /Only Markdown templates are manually\s+rendered/i);
  assert.match(txt, /Put real dates.*in CLI create payloads for YAML files/i);
  assert.match(txt, /Replace date placeholders directly only when rendering Markdown templates/i);
  assert.doesNotMatch(txt, /then replace the `\{\.\.\.\}` and `YYYY-MM-DD` placeholders/i);
});

test('writer skills: use the CLI for all template-backed YAML writes', () => {
  for (const name of RESOURCE_WRITER_SKILLS) {
    const txt = readSkill(name);
    assert.match(txt, YAML_WRITE_BOUNDARY, `${name}: YAML write boundary missing`);
    assert.match(txt, /do\s+not fall back to a manual edit/i, `${name}: unsupported-operation boundary missing`);
  }
  assert.match(readSkill('review-mesocycle'), /write `review\.md`\s+directly/i);
  assert.match(readSkill('archive-program'), /move the directory/i);
  assert.match(readSkill('upgrade-workspace'), /does not mutate `exercises\.custom\.yaml`/);
});

test('writer skills: name only matrix-supported resource mutations', () => {
  const expected = {
    onboarding: ['create profile', 'update profile', 'add profile-equipment', 'update profile-equipment', 'remove profile-equipment'],
    track: ['update program-status', 'add status-pause', 'add status-note', 'add measurement', 'add reference-load'],
    'create-program': ['create program-status', 'create goals', 'create macrocycle', 'create sessions', 'update program-status'],
    'create-mesocycle': ['create sessions', 'update program-status'],
    'review-mesocycle': ['add measurement', 'add macrocycle-revision'],
    'archive-program': ['update program-status'],
  };
  for (const [name, calls] of Object.entries(expected)) {
    const txt = readSkill(name);
    for (const call of calls) assert.ok(txt.includes(call), `${name}: missing ${call}`);
  }

  const resourceVerbs = {
    profile: ['get', 'create', 'update'],
    'profile-equipment': ['list', 'get', 'add', 'update', 'remove'],
    'program-status': ['get', 'create', 'update'],
    'status-pause': ['list', 'add'],
    'status-note': ['list', 'add'],
    goals: ['get', 'create'],
    goal: ['list', 'get', 'add', 'update', 'remove'],
    measurement: ['list', 'add'],
    'reference-load': ['list', 'add'],
    macrocycle: ['get', 'create', 'update'],
    'mesocycle-plan': ['list', 'get', 'add', 'update', 'remove'],
    'macrocycle-revision': ['list', 'add'],
    'weekly-split': ['list', 'add'],
    'macrocycle-cardio': ['list', 'add'],
    sessions: ['get', 'create', 'update'],
    session: ['list', 'get', 'add', 'update', 'remove', 'move'],
    'session-exercise': ['list', 'add'],
    'session-cardio': ['list', 'add'],
  };
  const inlineMutationPattern = /`([a-z]+) ([a-z][a-z-]*)\b(?:\s+--[^`]*)?`/g;
  const commandMutationPattern = /scripts\/workout-data\.mjs"\s+([a-z]+) ([a-z][a-z-]*)\b/g;
  const assertSupportedMutation = (name, verb, resource) => {
    assert.ok(Object.hasOwn(resourceVerbs, resource), `${name}: unknown CLI resource ${resource}`);
    assert.ok(resourceVerbs[resource].includes(verb), `${name}: unsupported CLI mutation ${verb} ${resource}`);
  };
  for (const name of RESOURCE_WRITER_SKILLS) {
    const txt = readSkill(name);
    const references = [...txt.matchAll(inlineMutationPattern), ...txt.matchAll(commandMutationPattern)];
    assert.ok(references.length > 0, `${name}: no resource mutation references found`);
    for (const [, verb, resource] of references) {
      assertSupportedMutation(name, verb, resource);
    }
  }
  assert.throws(
    () => assertSupportedMutation('fixture', 'add', 'unknown-resource'),
    /unknown CLI resource unknown-resource/,
  );
  assert.throws(
    () => assertSupportedMutation('fixture', 'delete', 'profile'),
    /unsupported CLI mutation delete profile/,
  );
});

test('skill create-program: rotation status pointer follows macrocycle and sessions creation', () => {
  const txt = readSkill('create-program');
  assert.match(txt, /omit `next_session_id` from the `create program-status` payload/);
  const statusCreate = txt.indexOf('create program-status');
  const macrocycleCreate = txt.indexOf('create macrocycle');
  const sessionsCreate = txt.indexOf('create sessions --program <program-id> --mesocycle 1');
  const statusPointerUpdate = txt.indexOf('update program-status --program <program-id>');
  assert.ok(statusCreate >= 0 && macrocycleCreate > statusCreate, 'macrocycle must follow initial status creation');
  assert.ok(sessionsCreate > macrocycleCreate, 'sessions must follow macrocycle creation');
  assert.ok(statusPointerUpdate > sessionsCreate, 'rotation pointer must be updated after sessions creation');
});

test('writer skills: standalone validation stays only where workflow requires it', () => {
  for (const name of RESOURCE_WRITER_SKILLS.filter((name) => name !== 'archive-program')) {
    assert.ok(!readSkill(name).includes('scripts/validate.mjs'), `${name}: should rely on resource CLI validation`);
  }
  assert.ok(readSkill('archive-program').includes('node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs" .'));
});

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

test('skill upgrade-workspace: keeps catalog migration outside workout-data', () => {
  const txt = readSkill('upgrade-workspace');
  assert.ok(txt.includes('node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs" .'));
  assert.ok(!txt.includes('scripts/workout-data.mjs'));
  assert.match(txt, /does not mutate `exercises\.custom\.yaml`/);
  assert.match(txt, /catalog rename\s+migrations/);
});

const PERSONA_SENTENCE = 'If `profile.coach_style` is `nassim`, follow `${CLAUDE_PLUGIN_ROOT}/persona/nassim.md` for tone.';
for (const name of EXPECTED_SKILLS.filter((name) => !MECHANICS_SKILLS.includes(name))) {
  test(`skill ${name}: persona sentence present`, () => {
    assert.ok(readSkill(name).includes(name === 'upgrade-workspace' ? 'If `profile.yaml` exists and `profile.coach_style` is `nassim`, follow `${CLAUDE_PLUGIN_ROOT}/persona/nassim.md` for tone.' : PERSONA_SENTENCE), `${name}: persona sentence missing`);
  });
}

test('persona/nassim.md exists with guardrails', () => {
  const p = join(import.meta.dirname, '..', 'persona', 'nassim.md');
  assert.ok(existsSync(p));
  const txt = readFileSync(p, 'utf8');
  assert.match(txt, /never claims to be him/);
  assert.match(txt, /never override safety or accuracy|never overrides safety or accuracy/);
});

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

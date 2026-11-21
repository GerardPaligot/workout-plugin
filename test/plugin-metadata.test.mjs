import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';

const root = resolve(import.meta.dirname, '..');
const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const plugins = [
  { name: 'workout', path: '.' },
  { name: 'workout-opengym', path: 'plugins/workout-opengym' },
];

test('marketplaces and plugin manifests identify portable plugin roots', () => {
  const claude = readJson('.claude-plugin/marketplace.json');
  const codex = readJson('.agents/plugins/marketplace.json');
  for (const plugin of plugins) {
    const expectedPath = plugin.path === '.' ? './' : `./${plugin.path}`;
    assert.equal(claude.plugins.find((entry) => entry.name === plugin.name)?.source, expectedPath);
    const source = codex.plugins.find((entry) => entry.name === plugin.name)?.source;
    assert.deepEqual(source, { source: 'local', path: expectedPath });
    const claudeManifest = readJson(join(plugin.path, '.claude-plugin/plugin.json'));
    const codexManifest = readJson(join(plugin.path, '.codex-plugin/plugin.json'));
    assert.equal(claudeManifest.name, plugin.name);
    assert.equal(codexManifest.name, plugin.name);
    assert.equal(claudeManifest.version, codexManifest.version);
    assert.equal(codexManifest.skills, './skills/');
    assert.ok(claudeManifest.description && codexManifest.description);
  }
});

test('each plugin skill has valid frontmatter and its packaged assets exist', () => {
  for (const plugin of plugins) {
    const skills = join(root, plugin.path, 'skills');
    const directories = readdirSync(skills, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    assert.ok(directories.length > 0);
    for (const directory of directories) {
      const file = join(skills, directory.name, 'SKILL.md');
      const content = readFileSync(file, 'utf8');
      const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
      assert.ok(frontmatter, `${file}: missing frontmatter`);
      const metadata = parse(frontmatter[1]);
      assert.equal(metadata.name, directory.name);
      assert.ok(typeof metadata.description === 'string' && metadata.description.trim());
    }
  }
  for (const asset of [
    'catalog/exercises.yaml', 'persona/nassim.md', 'schemas/profile.schema.json',
    'templates/profile.yaml', 'scripts/state.mjs', 'scripts/validate.mjs',
    'scripts/workout-data.mjs', 'plugins/workout-opengym/skills/opengym/scripts/workout-opengym.mjs',
  ]) assert.ok(existsSync(join(root, asset)), `missing packaged asset: ${asset}`);
});

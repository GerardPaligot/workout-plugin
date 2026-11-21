import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const root = join(import.meta.dirname, '..');

test('marketplaces expose independent plugin roots and installer defaults to workout', () => {
  const claude = JSON.parse(readFileSync(join(root, '.claude-plugin/marketplace.json')));
  const codex = JSON.parse(readFileSync(join(root, '.agents/plugins/marketplace.json')));
  assert.equal(claude.plugins.find(p => p.name === 'workout-opengym').source, './plugins/workout-opengym');
  assert.equal(codex.plugins.find(p => p.name === 'workout-opengym').source.path, './plugins/workout-opengym');
  const defaultOutput = execFileSync(join(root, 'install.sh'), ['--dry-run'], {encoding:'utf8'});
  assert.match(defaultOutput, /plugin install workout@workout-plugin/);
  const companion = execFileSync(join(root, 'install.sh'), ['--dry-run', '--plugin', 'workout-opengym'], {encoding:'utf8'});
  assert.match(companion, /plugin install workout-opengym@workout-plugin/);
  assert.match(companion, /plugin add workout-opengym@workout-plugin/);
});


test('installer sends the selected plugin to available host CLIs', () => {
  const bin = mkdtempSync(join(tmpdir(), 'workout-hosts-'));
  const log = join(bin, 'calls');
  for (const host of ['claude', 'codex']) {
    const path = join(bin, host);
    writeFileSync(path, `#!/bin/sh\nprintf '%s\\n' '${host} '"$*" >> "$WORKOUT_CALLS"\n`);
    chmodSync(path, 0o755);
  }
  execFileSync(join(root, 'install.sh'), ['--plugin', 'workout-opengym', '--scope', 'project'], {
    env: {...process.env, PATH: `${bin}:/usr/bin:/bin`, WORKOUT_CALLS: log}, encoding: 'utf8',
  });
  const calls = readFileSync(log, 'utf8');
  assert.match(calls, /claude plugin install workout-opengym@workout-plugin --scope project/);
  assert.match(calls, /codex plugin add workout-opengym@workout-plugin/);
});

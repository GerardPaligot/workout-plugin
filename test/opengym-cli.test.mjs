import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('CLI returns a structured error for a missing configuration', () => {
  const result = spawnSync(process.execPath, ['src/opengym/cli.mjs', 'status', '--config', '/no/such/config'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.state, 'error');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
for (const scenario of ['semanticReplayIsNoop', 'legacyReconnectDoesNotDispatchBeforeAdoption']) {
  test(`dispatch regression: ${scenario}`, async () => {
    const { stdout } = await run(process.execPath, ['test/fixtures/opengym/dispatch/delta.mjs'], {
      env: { ...process.env, WORKOUT_RECHECK_CASE: scenario },
    });
    assert.equal(JSON.parse(stdout)[scenario].verdict, 'PASS');
  });
}

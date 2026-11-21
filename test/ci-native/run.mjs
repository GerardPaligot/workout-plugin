import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pin = 'e4a68a94c42a3c17cbd560d66ce2e46a7048ab99';
const upstream = process.argv[2];
assert(upstream && path.isAbsolute(upstream) && process.argv.length === 3, 'Usage: node test/ci-native/run.mjs <absolute-upstream-checkout>');
assert.equal(execFileSync('git', ['-C', upstream, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), pin, 'upstream checkout must be pinned');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = fs.mkdtempSync('/tmp/wn-');
let api, apiCompletion, mcp, proxy;
try {
  const archive = execFileSync('git', ['-C', upstream, 'archive', pin, 'api', 'mcp', 'frontend/src/lib', 'frontend/package.json'], { maxBuffer: 100 * 1024 * 1024 });
  const extract = spawnSync('tar', ['-xf', '-', '-C', root], { input: archive });
  assert.equal(extract.status, 0, 'extract upstream archive');
  for (const name of ['api', 'mcp']) {
    const modules = path.join(upstream, name, 'node_modules');
    assert(fs.existsSync(modules), `run npm ci in upstream ${name} first`);
    fs.symlinkSync(modules, path.join(root, name, 'node_modules'), 'dir');
  }
  const serverFile = path.join(root, 'api/server.js');
  const source = fs.readFileSync(serverFile, 'utf8');
  const original = 'server.listen(PORT, () =>';
  assert(source.includes(original), 'upstream API listener changed');
  fs.writeFileSync(serverFile, source.replace(original, "server.listen(PORT, '127.0.0.1', () =>"));
  const data = path.join(root, 'data'); fs.mkdirSync(data);
  const secret = crypto.randomBytes(32).toString('hex'); const uid = 'u_ci';
  fs.writeFileSync(path.join(data, 'secret'), secret);
  fs.writeFileSync(path.join(data, 'db.json'), JSON.stringify({ users: [{ id: uid, name: 'CI' }], creds: [], subs: [], invites: [] }));
  fs.writeFileSync(path.join(data, `state-${uid}.json`), JSON.stringify({ unit: 'kg', restSec: 120, routines: [], week: {}, workouts: [], exWeights: {}, customEx: [], _rev: 1, _wid: 'seed', _ts: 1000 }));
  api = spawn(process.execPath, ['server.js'], { cwd: path.join(root, 'api'), env: { ...process.env, PORT: '0', DATA_DIR: data, ADMIN_SOCKET_DIR: root, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost', MCP: 'on', TZ: 'Europe/Paris' }, stdio: ['ignore', 'pipe', 'pipe'] });
  apiCompletion = new Promise(resolve => {
    api.once('error', error => resolve({ error }));
    api.once('close', (code, signal) => resolve({ code, signal }));
  });
  const port = await new Promise((resolve, reject) => {
    let output = ''; const timeout = setTimeout(() => reject(Error('API startup timed out')), 15000);
    const collect = chunk => { output += chunk; const match = /gym-api on :(\d+)/.exec(output); if (match) { clearTimeout(timeout); resolve(match[1]); } };
    api.stdout.on('data', collect); api.stderr.on('data', collect);
    api.once('exit', () => { clearTimeout(timeout); reject(Error(`API exited before startup: ${output}`)); });
    api.once('error', reject);
  });
  const base = `http://127.0.0.1:${port}`;
  process.env.TZ = 'Europe/Paris';
  const { createMcpHandler } = await import(pathToFileURL(path.join(root, 'mcp/src/http.js')));
  mcp = http.createServer(createMcpHandler({ apiUrl: base, allowedOrigins: [] }));
  await new Promise((resolve, reject) => { mcp.once('error', reject); mcp.listen(0, '127.0.0.1', resolve); });
  proxy = http.createServer((req, res) => {
    const target = req.url.startsWith('/mcp') ? mcp.address().port : port;
    const forwarded = http.request({ hostname: '127.0.0.1', port: target, path: req.url, method: req.method, headers: req.headers }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
    forwarded.on('error', () => { res.writeHead(502); res.end(); }); req.pipe(forwarded);
  });
  await new Promise((resolve, reject) => { proxy.once('error', reject); proxy.listen(0, '127.0.0.1', resolve); });
  const payload = `${uid}:${Date.now() + 86400000}:0:c`;
  const cookie = 'gymsid=' + payload + '.' + crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const response = await fetch(base + '/api/tokens', { method: 'POST', headers: { Cookie: cookie, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'ci', scopes: { workouts: 'apply', plans: 'apply' } }) });
  assert.equal(response.status, 200, 'create token'); const token = (await response.json()).token; assert(token);
  const workspace = path.join(root, 'workspace'); fs.cpSync(path.join(repo, 'test/fixtures/workspace'), workspace, { recursive: true });
  const main = path.join(repo, 'scripts/workout-opengym.mjs');
  const nested = path.join(repo, 'plugins/workout-opengym/skills/opengym/scripts/workout-opengym.mjs');
  const standalone = path.join(root, 'standalone.mjs'); fs.copyFileSync(nested, standalone);
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ endpoint: `http://127.0.0.1:${proxy.address().port}`, profileId: uid, tokenEnv: 'OPENGYM_TOKEN', stateDir: path.join(root, 'state'), trustedPrivateHttp: true, serverTimezone: 'Europe/Paris' }));
  async function run(file, args) {
    const child = spawn(process.execPath, [file, ...args], { cwd: root, env: { ...process.env, OPENGYM_TOKEN: token, TZ: 'UTC' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.resume();
    const status = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { child.kill(); reject(Error(`CLI ${args[0]} timed out`)); }, 30000);
      child.once('error', reject);
      child.once('close', code => { clearTimeout(timeout); resolve(code); });
    });
    const result = JSON.parse(stdout);
    if (status !== 0 && !['rate_limited', 'native_rate_limited'].includes(result.error)) throw Error(`CLI ${args[0]} failed`);
    return result;
  }
  const mainHelp = await run(main, ['--help']);
  const standaloneHelp = await run(standalone, ['--help']);
  for (const help of [mainHelp, standaloneHelp]) {
    assert.equal(help.ok, true, 'help succeeded');
    assert.equal(help.state, 'help', 'structured help state');
    assert(Array.isArray(help.data?.commands) && help.data.commands.length > 0, 'structured help commands');
  }
  assert.deepEqual(mainHelp, standaloneHelp, 'main and standalone help');
  async function cli(command, input = {}, flags = []) {
    fs.writeFileSync(path.join(root, 'input.json'), JSON.stringify(input));
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await run(standalone, [command, '--config', path.join(root, 'config.json'), '--workspace', workspace, '--program', '2026-01_sample-program', '--input', path.join(root, 'input.json'), ...flags]);
      if (!['rate_limited', 'native_rate_limited'].includes(result.error)) return result;
      await new Promise(resolve => setTimeout(resolve, 65000));
    }
    throw Error('native rate limit persisted');
  }
  const expect = (result, state) => { assert.equal(result.ok, true, `expected successful ${state}`); assert.equal(result.state, state, `expected ${state}`); return result.data; };
  const connected = expect(await cli('connect'), 'connected');
  assert.deepEqual(connected.scopes, { workouts: 'apply', plans: 'apply', bodyweight: 'off', measurements: 'off', notes: 'off' });
  const routine = { templateId: 'B', revision: 'v1', payload: { name: 'CI routine', unit: 'kg', exercises: [{ exercise: '0047', sets: 3, reps: 5, weight: 50 }] } };
  const review = expect(await cli('publish', routine, ['--dry-run']), 'review');
  const approved = { ...routine, approval: review.approval };
  const published = expect(await cli('publish', approved), 'verified');
  const repeated = expect(await cli('publish', approved), 'verified'); assert.equal(repeated.routineId, published.routineId);
  const actual = { occurrenceId: 'o1', sessionId: 'A', timezone: 'Europe/Paris', payload: { date: '2026-07-19', start: '00:15', duration_min: 45, name: 'CI workout', note: 'session note', unit: 'kg', exercises: [{ exercise: '0025', sets: [{ reps: 5, weight: 100, rir: 2 }, { reps: 4, weight: 100, rpe: 8 }] }] } };
  const workoutReview = expect(await cli('log', actual, ['--dry-run']), 'review');
  const workoutApproved = { ...actual, approval: workoutReview.approval };
  const saved = expect(await cli('log', workoutApproved), 'verified');
  const workoutRepeat = expect(await cli('log', workoutApproved), 'verified'); assert.equal(workoutRepeat.workoutId, saved.workoutId);
  const range = { from: '2026-07-01', to: '2026-07-31' };
  expect(await cli('sync', range, ['--once']), 'synced');
  const history = expect(await cli('history', { ...range, limit: 50 }), 'history');
  assert(history.observations.some(item => item.id === saved.workoutId), 'saved workout in history');
  let snapshot;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(base + '/api/token/data', { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 429) { await new Promise(resolve => setTimeout(resolve, 65000)); continue; }
    assert.equal(r.status, 200); snapshot = (await r.json()).state; break;
  }
  assert(snapshot, 'native scoped readback');
  assert.equal(snapshot.routines.length, 1); const nativeRoutine = snapshot.routines[0];
  assert.equal(nativeRoutine.id, published.routineId); assert.equal(nativeRoutine.name, 'CI routine');
  assert.deepEqual(nativeRoutine.ex.map(({ id, sets, reps, weight }) => ({ id, sets, reps, weight })), [{ id: '0047', sets: 3, reps: 5, weight: 50 }]);
  assert.equal(snapshot.workouts.length, 1); const workout = snapshot.workouts[0];
  assert.equal(workout.id, saved.workoutId); assert.equal(workout.note, 'session note');
  assert.equal(workout.start, Date.parse('2026-07-18T22:15:00Z')); assert.equal(workout.end - workout.start, 45 * 60000);
  assert.equal(workout.entries.length, 1); assert.equal(workout.entries[0].id, '0025');
  assert.deepEqual(workout.entries[0].sets.map(({ w, r, rir, rpe }) => ({ w, r, ...(rir !== undefined ? { rir } : {}), ...(rpe !== undefined ? { rpe } : {}) })), [{ w: 100, r: 5, rir: 2 }, { w: 100, r: 4, rpe: 8 }]);
  console.log('Native openGym smoke passed: help, scopes, routine publish/repeat/readback, workout review/save/repeat/history and optional fields.');
} finally {
  try {
    if (proxy) await new Promise(resolve => proxy.close(resolve));
    if (mcp) await new Promise(resolve => mcp.close(resolve));
    if (api) {
      if (api.exitCode === null && api.signalCode === null) {
        api.kill('SIGTERM');
        const killTimer = setTimeout(() => api.kill('SIGKILL'), 3000);
        let deadline;
        try {
          await Promise.race([apiCompletion, new Promise((_, reject) => { deadline = setTimeout(() => reject(Error('API termination timed out')), 6000); })]);
        } finally { clearTimeout(killTimer); clearTimeout(deadline); }
      } else {
        await apiCompletion;
      }
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

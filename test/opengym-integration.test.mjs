import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const nativeSchema = JSON.parse(await readFile(new URL('./fixtures/opengym/native-contract.json', import.meta.url))).logSchema;

function cli(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['src/opengym/cli.mjs', ...args], { env: { ...process.env, OPENGYM_TOKEN: 'synthetic-secret', ...env } });
    let stdout = '', stderr = ''; child.stdout.on('data', x => stdout += x); child.stderr.on('data', x => stderr += x);
    child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr, body: JSON.parse(stdout) }));
  });
}

test('actuals can be freshly approved after adoption with or without pending sync', async () => {
  for (const scenario of ['freshActualReviewAfterAdoptionWithoutPendingSync', 'queuedPublicationAndActualsWaitForAdoption']) {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['test/fixtures/opengym/dispatch/recheck.mjs'], {
        env: {...process.env, WORKOUT_RECHECK_CASE: scenario, WORKOUT_RECHECK_BUNDLE: 'src/opengym/cli.mjs'}
      });
      let stdout = '', stderr = '';
      child.stdout.on('data', chunk => stdout += chunk);
      child.stderr.on('data', chunk => stderr += chunk);
      child.on('error', reject);
      child.on('close', code => resolve({code, stdout, stderr}));
    });
    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.equal(JSON.parse(result.stdout)[scenario].verdict, 'PASS');
  }
});
test('connect and history sync use scoped MCP and never project an unassigned workout', async t => {
  const temp = await mkdtemp(path.join(tmpdir(), 'opengym-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const seen = [];
  const server = createServer(async (req, res) => {
    seen.push({ url: req.url, authorization: req.headers.authorization, protocol: req.headers['mcp-protocol-version'] });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/base/api/token/me') return res.end(JSON.stringify({ user:{id:'profile',name:''}, token:{id:'t',name:'test',exp:null,scopes:{workouts:'view',plans:'off',bodyweight:'off',measurements:'off',notes:'off'}} }));
    if (req.url.endsWith('/api/token/data')) return res.end(JSON.stringify({rev: 1, state: {workouts: []}}));
    let raw = ''; for await (const chunk of req) raw += chunk;
    const request = JSON.parse(raw);
    if (request.method === 'notifications/initialized') { res.statusCode = 202; return res.end(); }
    let result;
    if (request.method === 'initialize') result = { protocolVersion:'2025-03-26', capabilities:{}, serverInfo:{name:'fake',version:'1'} };
    if (request.method === 'tools/list') result = { tools:['list_workouts','get_workout'].map(name => ({name,inputSchema:name === 'log_workout' ? nativeSchema : {type:'object',properties:{}}})) };
    if (request.method === 'tools/call') {
      const data = request.params.name === 'list_workouts' ? { matching_count:1, returned_count:1, truncated:false, workouts:[{id:'phone-1'}] } : { id:'phone-1', exercises:[] };
      result = { content:[{type:'text',text:JSON.stringify(data)}] };
    }
    res.end(JSON.stringify({ jsonrpc:'2.0', id:request.id, result }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  await mkdir(path.join(temp, 'workspace', 'programs', 'program'), {recursive:true});
  const config = path.join(temp,'config.json'), input = path.join(temp,'input.json');
  await writeFile(config, JSON.stringify({ endpoint:`http://127.0.0.1:${server.address().port}/base`, profileId:'profile', trustedPrivateHttp:true, stateDir:path.join(temp,'state') }));
  await writeFile(input, JSON.stringify({from:'2026-01-01',to:'2026-01-31'}));
  const common = ['--config',config,'--workspace',path.join(temp,'workspace'),'--program','program'];
  const connected = await cli(['connect',...common]); assert.equal(connected.body.state,'connected');
  const synced = await cli(['sync','--once','--input',input,...common]); assert.equal(synced.body.state,'synced');
  const projection = JSON.parse(await readFile(path.join(temp,'workspace','programs','program','.opengym-projection.json')));
  assert.equal(projection.coverage.complete,true); assert.deepEqual(projection.assignments,[]); assert.equal(projection.nextSessionId,null); assert.equal(projection.activeUnknown,true);
  assert.ok(seen.every(x => x.authorization === 'Bearer synthetic-secret')); assert.ok(seen.some(x => x.protocol === '2025-03-26'));
  assert.ok(!connected.stdout.includes('synthetic-secret')); assert.ok(!synced.stdout.includes('synthetic-secret'));
  const before = seen.length;
  await writeFile(config, JSON.stringify({endpoint:`http://127.0.0.1:${server.address().port}/base`,profileId:'other',trustedPrivateHttp:true,stateDir:path.join(temp,'state')}));
  const mismatch = await cli(['sync','--once','--input',input,...common]);
  assert.equal(mismatch.body.ok,false); assert.equal(seen.length,before); assert.ok(!mismatch.stdout.includes('synthetic-secret'));
});

test('completed workouts survive restart, reconcile lost replies, and retry explicit rate limits', async t => {
  const temp = await mkdtemp(path.join(tmpdir(), 'opengym-jobs-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const workouts = [], writes = [];
  let mode = 'normal', schemaRevision = 0, previews = 0;
  const server = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/token/me') return res.end(JSON.stringify({ user:{id:'p',name:''}, token:{id:'t',name:'test',exp:null,scopes:{workouts:'apply',plans:'off',bodyweight:'off',measurements:'off',notes:'off'}} }));
    if (req.url.endsWith('/api/token/data')) return res.end(JSON.stringify({rev: 1, state: {workouts: []}}));
    let raw = ''; for await (const chunk of req) raw += chunk;
    const request = JSON.parse(raw);
    if (request.method === 'notifications/initialized') { res.statusCode = 202; return res.end(); }
    let result;
    if (request.method === 'initialize') result = { protocolVersion:'2025-03-26' };
    if (request.method === 'tools/list') result = { tools:['list_workouts','get_workout','log_workout'].map(name => ({name,inputSchema:name === 'log_workout' ? {...nativeSchema, description: String(schemaRevision)} : {type:'object',properties:{}}})) };
    if (request.method === 'tools/call') {
      const {name, arguments: args} = request.params;
      let data;
      if (name === 'list_workouts') {
        const selected = workouts.filter(w => w.date >= args.from && w.date <= args.to);
        data = {matching_count:selected.length,returned_count:selected.length,truncated:false,workouts:selected};
      } else if (name === 'get_workout') {
        if (mode === 'readback-rate') { res.statusCode = 429; res.setHeader('retry-after','0'); return res.end('{}'); }
        data = workouts.find(w => w.id === args.workout_id);
      }
      else if (args.dry_run) {
        previews++;
        data = mode === 'preview-problems' ? {logged:false,problems:['temporarily unavailable']} : {logged:false,dry_run:true,would_log:{workout_id:'provisional',date:args.date,unit:args.unit,exercises:args.exercises.map(e=>({id:e.exercise,sets:e.sets}))}};
      }
      else {
        writes.push(args);
        if (mode === 'rate') { res.statusCode = 429; res.setHeader('retry-after','0'); return res.end('{}'); }
        if (mode === 'problems') { result = {content:[{type:'text',text:JSON.stringify({logged:false,problems:['invalid']})}]}; return res.end(JSON.stringify({jsonrpc:'2.0',id:request.id,result})); }
        const workout = {id:'w'+writes.length,date:args.date,unit:args.unit,entries:args.exercises.map(e => ({id:e.exercise,sets:e.sets.map(s => ({r:s.reps,w:s.weight,done:true,label:'extra'}))}))};
        workouts.push(workout);
        if (mode === 'drop') { req.socket.destroy(); return; }
        data = {logged:true,workout_id:workout.id};
      }
      result = {content:[{type:'text',text:JSON.stringify(data)}]};
    }
    res.end(JSON.stringify({jsonrpc:'2.0',id:request.id,result}));
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve)); t.after(() => server.close());
  await mkdir(path.join(temp,'workspace','programs','p'),{recursive:true});
  const config = path.join(temp,'config.json'), input = path.join(temp,'input.json');
  await writeFile(config,JSON.stringify({endpoint:'http://127.0.0.1:'+server.address().port,profileId:'p',trustedPrivateHttp:true,stateDir:path.join(temp,'state')}));
  const common = ['--config',config,'--workspace',path.join(temp,'workspace'),'--program','p'];
  const run = async (verb, data, flags=[]) => {
    if (data) await writeFile(input,JSON.stringify(data));
    return (await cli([verb,...common,...flags,...(data ? ['--input',input] : [])])).body;
  };
  assert.equal((await run('connect')).state,'connected');
  const actual = date => ({occurrenceId:date,sessionId:'A',timezone:'Europe/Paris',payload:{date,unit:'kg',exercises:[{exercise:'squat',sets:[{reps:5,weight:40}]}]}});
  const first = actual('2026-01-01');
  const invalid = structuredClone(first); invalid.payload.exercises[0].sets[0].weight = '40';
  assert.equal((await run('log',invalid,['--dry-run'])).ok,false); assert.equal(writes.length,0);
  const preview = await run('log',first,['--dry-run']);
  assert.equal(preview.state,'review'); assert.equal(writes.length,0);
  assert.equal((await run('log',first,['--dry-run'])).data.id,preview.data.id);
  assert.equal((await run('log',{...first,approval:preview.data.approval})).state,'verified');
  assert.equal((await run('log',{...first,approval:preview.data.approval})).state,'verified');
  assert.equal(writes.length,1);
  const lost = actual('2026-01-02'), lostPreview = await run('log',lost,['--dry-run']);
  mode = 'drop';
  assert.equal((await run('log',{...lost,approval:lostPreview.data.approval})).state,'uncertain');
  mode = 'normal';
  assert.equal((await run('sync',{from:'2026-01-01',to:'2026-01-03'},['--once'])).state,'synced');
  assert.equal(writes.length,2);
  assert.equal((await run('log',{...lost,approval:lostPreview.data.approval})).state,'needs_review');
  const limited = actual('2026-01-03'), limitedPreview = await run('log',limited,['--dry-run']);
  mode = 'rate'; assert.equal((await run('log',{...limited,approval:limitedPreview.data.approval})).state,'retry_at');
  mode = 'normal'; assert.equal((await run('sync',{from:'2026-01-01',to:'2026-01-03'},['--once'])).state,'synced');
  assert.equal(writes.length,4);
  assert.equal((await run('log',{...limited,approval:limitedPreview.data.approval})).state,'verified');
  const rejected = actual('2026-01-04'), rejectedPreview = await run('log',rejected,['--dry-run']);
  mode = 'problems'; assert.equal((await run('log',{...rejected,approval:rejectedPreview.data.approval})).state,'needs_review');
  assert.equal(workouts.length,3);
  const gated = actual('2026-01-05'), gatedPreview = await run('log',gated,['--dry-run']);
  mode = 'rate'; assert.equal((await run('log',{...gated,approval:gatedPreview.data.approval})).state,'retry_at');
  const markerPath = path.join(temp,'workspace','programs','p','.opengym-backend.json');
  const marker = JSON.parse(await readFile(markerPath)); marker.requiresAdoption = true;
  await writeFile(markerPath,JSON.stringify(marker)); mode = 'normal';
  const gatedSync = await run('sync',{from:'2026-01-01',to:'2026-01-05'},['--once']);
  assert.equal(gatedSync.state,'synced'); assert.equal(writes.length,6);
  assert.equal(gatedSync.data.pendingJobs.find(j => j.id === gatedPreview.data.id).state,'needs_review');
  assert.ok((await run('history',{limit:10})).data.observations.some(w => w.id));
  marker.requiresAdoption = false; await writeFile(markerPath,JSON.stringify(marker));
  // A changed capability context replaces only a draft with proven no remote effect.
  const draft = actual('2026-01-06'), draftReview = await run('log',draft,['--dry-run']);
  schemaRevision++;
  const refreshedDraft = await run('log',draft,['--dry-run']);
  assert.notEqual(refreshedDraft.data.approval,draftReview.data.approval);
  assert.equal((await run('log',{...draft,approval:draftReview.data.approval})).ok,false);
  assert.equal((await run('log',{...draft,approval:refreshedDraft.data.approval})).state,'verified');

  // A known refusal is safe to review again, but a later lost response is not.
  const ambiguous = actual('2026-01-07'), initial = await run('log',ambiguous,['--dry-run']);
  mode = 'rate'; assert.equal((await run('log',{...ambiguous,approval:initial.data.approval})).state,'retry_at');
  schemaRevision++; mode = 'normal';
  const fresh = await run('log',ambiguous,['--dry-run']);
  assert.notEqual(fresh.data.approval,initial.data.approval);
  assert.equal((await run('log',{...ambiguous,approval:initial.data.approval})).ok,false);
  mode = 'drop'; assert.equal((await run('log',{...ambiguous,approval:fresh.data.approval})).state,'uncertain');
  const afterDrop = writes.length; schemaRevision++; mode = 'normal';
  assert.notEqual((await run('log',ambiguous,['--dry-run'])).state,'review');
  await run('log',{...ambiguous,approval:fresh.data.approval});
  assert.equal(writes.length,afterDrop);

  // A quota error on readback follows a successful save and must retain its ID.
  const ack = actual('2026-01-08'), ackReview = await run('log',ack,['--dry-run']);
  mode = 'readback-rate';
  const ackResult = await run('log',{...ack,approval:ackReview.data.approval});
  assert.equal(ackResult.state,'uncertain'); assert.ok(ackResult.data.workoutId);
  const afterAck = writes.length; schemaRevision++; mode = 'normal';
  const ackPreview = await run('log',ack,['--dry-run']);
  assert.notEqual(ackPreview.state,'review'); assert.equal(ackPreview.data.workoutId,ackResult.data.workoutId);
  const reconciled = await run('log',{...ack,approval:ackReview.data.approval});
  assert.equal(reconciled.state,'verified'); assert.equal(reconciled.data.workoutId,ackResult.data.workoutId);
  assert.equal(writes.length,afterAck);
  // A rejected domain payload can be corrected without reusing its old approval.
  const invalidActual = actual('2026-01-09'), invalidReview = await run('log',invalidActual,['--dry-run']);
  mode = 'problems';
  assert.equal((await run('log',{...invalidActual,approval:invalidReview.data.approval})).state,'needs_review');
  mode = 'normal';
  const corrected = structuredClone(invalidActual); corrected.payload.exercises[0].sets[0].weight = 45;
  const correctedReview = await run('log',corrected,['--dry-run']);
  assert.equal(correctedReview.state,'review');
  assert.equal((await run('log',{...invalidActual,approval:invalidReview.data.approval})).state,'needs_review');
  assert.equal((await run('log',{...corrected,approval:correctedReview.data.approval})).state,'verified');
  // A transient submit-time preview refusal permits a new review without saving.
  const transient = actual('2026-01-10'), oldReview = await run('log',transient,['--dry-run']);
  const beforeWrites = writes.length;
  mode = 'preview-problems';
  assert.equal((await run('log',{...transient,approval:oldReview.data.approval})).state,'needs_review');
  assert.equal((await run('log',transient,['--dry-run'])).state,'needs_review');
  assert.equal((await run('log',{...transient,approval:oldReview.data.approval})).state,'needs_review');
  mode = 'normal';
  const beforePreviews = previews;
  const newReview = await run('log',transient,['--dry-run']);
  assert.equal(newReview.state,'review'); assert.ok(previews > beforePreviews);
  assert.notEqual(newReview.data.approval,oldReview.data.approval);
  assert.equal((await run('log',{...transient,approval:oldReview.data.approval})).ok,false);
  assert.equal(writes.length,beforeWrites);
  assert.equal((await run('log',{...transient,approval:newReview.data.approval})).state,'verified');
  assert.equal((await run('log',{...transient,approval:newReview.data.approval})).state,'verified');
  assert.equal(writes.length,beforeWrites + 1);
  const transientEdit = actual('2026-01-11'), editOld = await run('log',transientEdit,['--dry-run']);
  mode = 'preview-problems';
  assert.equal((await run('log',{...transientEdit,approval:editOld.data.approval})).state,'needs_review');
  mode = 'normal';
  const edited = structuredClone(transientEdit); edited.payload.exercises[0].sets[0].weight = 45;
  const editReview = await run('log',edited,['--dry-run']);
  assert.equal(editReview.state,'review');
  assert.equal((await run('log',{...transientEdit,approval:editOld.data.approval})).state,'needs_review');
  assert.equal(writes.length,beforeWrites + 1);
  assert.equal((await run('log',{...edited,approval:editReview.data.approval})).state,'verified');
  assert.equal(writes.length,beforeWrites + 2);
  server.close();
  const status = await cli(['status',...common],{OPENGYM_TOKEN:''});
  assert.equal(status.body.state,'status'); assert.equal(status.body.data.activeUnknown,true);
  assert.ok(!status.stdout.includes('synthetic-secret'));
});

test('incomplete and null-ID history cannot claim complete coverage', async t => {
  const temp = await mkdtemp(path.join(tmpdir(),'opengym-coverage-'));
  t.after(() => rm(temp,{recursive:true,force:true}));
  let mode = 'null';
  const server = createServer(async (req,res) => {
    res.setHeader('content-type','application/json');
    if (req.url === '/api/token/me') return res.end(JSON.stringify({user:{id:'p',name:''},token:{id:'t',name:'test',exp:null,scopes:{workouts:'view',plans:'off',bodyweight:'off',measurements:'off',notes:'off'}}}));
    if (req.url.endsWith('/api/token/data')) return res.end(JSON.stringify({rev: 1, state: {workouts: []}}));
    let raw=''; for await (const chunk of req) raw += chunk;
    const q=JSON.parse(raw);
    if (q.method === 'notifications/initialized') { res.statusCode=202; return res.end(); }
    let result;
    if (q.method === 'initialize') result={protocolVersion:'2025-03-26'};
    else if (q.method === 'tools/list') result={tools:['list_workouts','get_workout'].map(name=>({name,inputSchema:name === 'log_workout' ? nativeSchema : {type:'object',properties:{}}}))};
    else {
      const data=mode === 'null' ? {matching_count:1,returned_count:1,truncated:false,workouts:[{id:null,date:'2026-01-01'}]} : {matching_count:201,returned_count:0,truncated:true,workouts:[]};
      result={content:[{type:'text',text:JSON.stringify(data)}]};
    }
    res.end(JSON.stringify({jsonrpc:'2.0',id:q.id,result}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); t.after(()=>server.close());
  await mkdir(path.join(temp,'workspace','programs','p'),{recursive:true});
  const config=path.join(temp,'config.json'), input=path.join(temp,'input.json');
  await writeFile(config,JSON.stringify({endpoint:'http://127.0.0.1:'+server.address().port,profileId:'p',trustedPrivateHttp:true,stateDir:path.join(temp,'state')}));
  await writeFile(input,JSON.stringify({from:'2026-01-01',to:'2026-01-01'}));
  const common=['--config',config,'--workspace',path.join(temp,'workspace'),'--program','p'];
  assert.equal((await cli(['connect',...common])).body.state,'connected');
  assert.equal((await cli(['sync',...common,'--once','--input',input])).body.state,'incomplete');
  let projection=JSON.parse(await readFile(path.join(temp,'workspace','programs','p','.opengym-projection.json')));
  assert.equal(projection.coverage.complete,false); assert.deepEqual(projection.assignments,[]);
  const history = (await cli(['history',...common,'--input',input])).body;
  assert.equal(history.data.observations[0].id, null);
  assert.equal(history.data.observations[0].freshness, 'unresolved');
  assert.equal(history.data.observations[0].assignment, null);
  mode='truncated';
  assert.equal((await cli(['sync',...common,'--once','--input',input])).body.state,'incomplete');
  projection=JSON.parse(await readFile(path.join(temp,'workspace','programs','p','.opengym-projection.json')));
  assert.equal(projection.coverage.complete,false);
});

test('scoped store serializes writers and needs explicit stale-lock recovery', async t => {
  const {Store} = await import('../src/opengym/store.mjs');
  const temp=await mkdtemp(path.join(tmpdir(),'opengym-lock-')); t.after(()=>rm(temp,{recursive:true,force:true}));
  const store=new Store(temp,{server:'https://example.invalid/',profileId:'p'});
  let release; const barrier=new Promise(resolve=>{release=resolve;});
  let entered; const ready=new Promise(resolve=>{entered=resolve;});
  const first=store.run(async (state,save)=>{ state.jobs.push({id:'one'}); await save(); entered(); await barrier; });
  await ready;
  await assert.rejects(store.run(async()=>{}),/locked/);
  await assert.rejects(store.run(async()=>{},true),/still running/);
  release(); await first;
  await store.run(async state=>assert.equal(state.jobs[0].id,'one'));
  await mkdir(store.lock); await writeFile(path.join(store.lock,'owner.json'),JSON.stringify({pid:99999999,host:(await import('node:os')).hostname()}));
  await assert.rejects(store.run(async()=>{}),/locked/);
  await store.run(async state=>assert.equal(state.jobs[0].id,'one'),true);
});
test('simultaneous stale lock recoveries cannot remove a live replacement', async t => {
  const { Store } = await import('../src/opengym/store.mjs');
  const { fork } = await import('node:child_process');
  const { once } = await import('node:events');
  const { hostname } = await import('node:os');
  const temp = await mkdtemp(path.join(tmpdir(), 'opengym-recovery-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const scope = { server: 'https://example.invalid/', profileId: 'p' };
  const store = new Store(temp, scope);
  await mkdir(store.lock, { recursive: true });
  await writeFile(path.join(store.lock, 'owner.json'), JSON.stringify({ pid: 99999999, host: hostname() }));
  const worker = path.join(temp, 'worker.mjs');
  const moduleUrl = new URL('../src/opengym/store.mjs', import.meta.url).href;
  await writeFile(worker, `import { existsSync } from 'node:fs';
    import { Store } from ${JSON.stringify(moduleUrl)};
    const [root, release] = process.argv.slice(2);
    const original = process.kill.bind(process);
    process.kill = (pid, signal) => { try { return original(pid, signal); } catch (error) {
      if (error.code === 'ESRCH') { process.send('checked'); while (!existsSync(release)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10); }
      throw error;
    }};
    try { await new Store(root, ${JSON.stringify(scope)}).run(async () => { process.send('entered'); }, true); }
    catch (error) { process.send('rejected'); }
  `);
  const release = path.join(temp, 'release');
  const first = fork(worker, [temp, release], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  t.after(() => first.kill());
  const firstExit = once(first, 'exit');
  assert.equal((await once(first, 'message'))[0], 'checked');
  const second = fork(worker, [temp, release], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  t.after(() => second.kill());
  const secondExit = once(second, 'exit');
  assert.equal((await once(second, 'message'))[0], 'rejected');
  const entered = once(first, 'message');
  await writeFile(release, '');
  assert.equal((await entered)[0], 'entered');
  await Promise.all([firstExit, secondExit]);
});

test('HTTP trust is explicit and excludes public hosts', async () => {
  const {endpoint}=await import('../src/opengym/client.mjs');
  assert.throws(()=>endpoint({endpoint:'http://127.0.0.1'}));
  assert.throws(()=>endpoint({endpoint:'http://example.com',trustedPrivateHttp:true}));
  assert.equal(endpoint({endpoint:'http://127.0.0.1/base',trustedPrivateHttp:true}).href,'http://127.0.0.1/base/');
  assert.equal(endpoint({endpoint:'https://example.com/base'}).href,'https://example.com/base/');
});

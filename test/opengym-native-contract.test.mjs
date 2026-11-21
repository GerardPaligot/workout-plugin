import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { run } from '../src/opengym/engine.mjs';

const native = JSON.parse(await readFile(new URL('./fixtures/opengym/native-contract.json', import.meta.url)));

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'native-contract-'));
  await mkdir(path.join(root, 'programs', 'p'), {recursive:true});
  const previousFetch = globalThis.fetch, previousToken = process.env.OPENGYM_TOKEN;
  process.env.OPENGYM_TOKEN = 'synthetic';
  t.after(async () => { globalThis.fetch = previousFetch; if (previousToken === undefined) delete process.env.OPENGYM_TOKEN; else process.env.OPENGYM_TOKEN = previousToken; await rm(root,{recursive:true,force:true}); });
  const config = {endpoint:'http://localhost/base',trustedPrivateHttp:true,profileId:'profile',stateDir:path.join(root,'state'),serverTimezone:'UTC'};
  const options = {workspace:root,program:'p'};
  const identity = structuredClone(native.identity); identity.user.id = 'profile';
  const scopes = identity.token.scopes;
  const workouts = [], rawWorkouts = [], writes = [];
  let quota = false, previewQuota = false, corruptRecord = false;
  const response = (data, status=200) => new Response(JSON.stringify(data), {status,headers:{'content-type':'application/json'}});
  globalThis.fetch = async (url, request) => {
    const urlPath = new URL(url).pathname;
    if (urlPath === '/base/api/token/me') return response(identity);
    if (urlPath === '/base/api/token/data') return response({state:{workouts:rawWorkouts},rev:1});
    assert.equal(urlPath,'/base/mcp');
    const q = JSON.parse(request.body);
    if (q.method === 'notifications/initialized') return new Response(null,{status:202});
    let result;
    if (q.method === 'initialize') result = {protocolVersion:'2025-03-26'};
    else if (q.method === 'tools/list') result = {tools:['list_workouts','get_workout','list_routines','get_routine','log_workout'].map(name=>({name,inputSchema:name === 'log_workout' ? native.logSchema : {type:'object',properties:{}}}))};
    else {
      const {name,arguments:a} = q.params;
      let data;
      if (name === 'list_workouts') { const rows=workouts.filter(w=>w.date>=a.from&&w.date<=a.to); data={matching_count:rows.length,returned_count:rows.length,truncated:false,workouts:rows}; }
      else if (name === 'get_workout') data=workouts.find(w=>w.id===a.workout_id);
      else if (name === 'list_routines') data={routines:[]};
      else if (name === 'log_workout') {
        const view={workout_id:'new',date:a.date,unit:a.unit,start:a.start,name:a.name||'Workout',note:a.note,exercises:a.exercises.map(e=>({id:e.exercise,sets:e.sets}))};
        if (a.dry_run && previewQuota) result={isError:true,content:[{type:'text',text:'ERATE: quota reached'}]};
        else if (a.dry_run) data={logged:false,dry_run:true,would_log:view};
        else if (quota) result={isError:true,content:[{type:'text',text:'ERATE: log_workout already saved 20 workouts in the last hour; nothing was saved'}]};
        else {
          writes.push(a);
          const entries=a.exercises.map(e=>({id:e.exercise,sets:e.sets.map(s=>({r:s.reps,w:s.weight,sec:s.seconds,rir:s.rir,rpe:s.rpe}))}));
          workouts.push({id:'new',date:a.date,unit:a.unit,routine_name:a.name||'Workout',entries});
          rawWorkouts.push({id:'new',d:a.date,start:Date.parse(a.date+'T10:00:00Z'),end:Date.parse(a.date+'T10:00:00Z')+(a.duration_min||60)*60000,note:corruptRecord ? 'wrong' : a.note,entries});
          data={logged:true,...view};
        }
      }
      if (!result) result={content:[{type:'text',text:JSON.stringify(data)}]};
    }
    return response({jsonrpc:'2.0',id:q.id,result});
  };
  const invoke=(command,input,extra={})=>run(command,{...options,...extra},input,config,'config.json');
  await invoke('connect');
  return {invoke,scopes,workouts,writes,setQuota:v=>quota=v,setPreviewQuota:v=>previewQuota=v,setCorruptRecord:v=>corruptRecord=v};
}
const actual = () => ({occurrenceId:'o-1',sessionId:'A',timezone:'UTC',payload:{date:'2026-09-02',unit:'kg',exercises:[{exercise:'squat',sets:[{reps:5,weight:50}]}]}});
const review = async (f, input) => (await f.invoke('log',input,{dryRun:true})).data.approval;

test('scope map gates writes even when the tool is listed', async t => {
  const f=await fixture(t); f.scopes.workouts='view';
  await assert.rejects(f.invoke('log',actual(),{dryRun:true}), /scope/);
  assert.equal(f.writes.length,0);
});

test('adoption invalidates an earlier approved draft and preserves the adopted workout', async t => {
  const f=await fixture(t), input=actual(), approval=await review(f,input);
  f.workouts.push({id:'phone',date:'2026-09-03',unit:'kg',entries:[{id:'squat',sets:[{r:5,w:50}]}]});
  const proposed={templates:{},assignments:[{occurrenceId:'o-1',sessionId:'A',workoutId:'phone'}]};
  const adopted=await f.invoke('adopt',proposed,{dryRun:true});
  await f.invoke('adopt',{proposed,mapping:proposed,approval:adopted.data.approval});
  const result=await f.invoke('log',{...input,approval});
  assert.equal(result.state,'resolved'); assert.equal(result.data.workoutId,'phone'); assert.equal(f.writes.length,0);
});

test('native fields and effort survive save and scoped readback', async t => {
  const f=await fixture(t), input=actual();
  Object.assign(input.payload,{duration_min:35,note:'Training note',start:'10:00'});
  input.payload.exercises[0].sets[0].rir=2;
  const approval=await review(f,input), result=await f.invoke('log',{...input,approval});
  assert.equal(result.state,'verified'); assert.equal(f.writes.length,1);
  assert.equal(f.writes[0].duration_min,35); assert.equal(f.writes[0].note,'Training note'); assert.equal(f.writes[0].exercises[0].sets[0].rir,2);
  assert.equal((await f.invoke('log',{...input,approval})).state,'verified'); assert.equal(f.writes.length,1);
  const legacy=actual(); legacy.payload.duration=35;
  await assert.rejects(f.invoke('log',legacy,{dryRun:true}), /duration_min/);
});

test('native ERATE is a known rejection scheduled for retry', async t => {
  const f=await fixture(t), input=actual(), approval=await review(f,input); f.setQuota(true);
  const result=await f.invoke('log',{...input,approval});
  assert.equal(result.state,'retry_at'); assert.equal(result.data.retryReason,'upstream_tool_quota'); assert(Date.parse(result.data.retryAt) >= Date.now() + 3590000); assert.equal(f.writes.length,0);
  f.workouts.push({id:'phone',date:'2026-09-03',unit:'kg',entries:[{id:'squat',sets:[{r:5,w:50}]}]});
  const proposed={templates:{},assignments:[{occurrenceId:'o-1',sessionId:'A',workoutId:'phone'}]};
  const adoption=await f.invoke('adopt',proposed,{dryRun:true});
  await f.invoke('adopt',{proposed,mapping:proposed,approval:adoption.data.approval});
  f.setQuota(false);
  assert.equal((await f.invoke('log',{...input,approval})).state,'resolved');
  await f.invoke('sync',{from:'2026-09-02',to:'2026-09-03'},{once:true});
  assert.equal(f.writes.length,0);
});

test('native fixture preserves the captured scope map and read/write vocabulary', () => {
  assert.match(native.source, /e4a68a94c42a3c17cbd560d66ce2e46a7048ab99/);
  assert.equal(native.identity.token.scopes.workouts,'apply');
  assert('duration_min' in native.logSchema.properties); assert('note' in native.logSchema.properties);
  assert(!('duration' in native.logSchema.properties)); assert(!('notes' in native.logSchema.properties));
  assert.equal(native.preview.would_log.exercises[0].sets[0].rir,2);
  assert.equal(native.detail.entries[0].sets[0].r,5); assert(!('rir' in native.detail.entries[0].sets[0]));
  assert.equal(native.record.entries[0].sets[0].rir,2); assert.equal(native.record.note,'session note');
});

test('preview quota refusal cannot create or dispatch an approved draft', async t => {
  const f=await fixture(t), input=actual(); f.setPreviewQuota(true);
  await assert.rejects(f.invoke('log',input,{dryRun:true}), error=>error.code==='native_rate_limited');
  f.setPreviewQuota(false);
  await assert.rejects(f.invoke('log',{...input,approval:'invented'}), /approval/);
  assert.equal(f.writes.length,0);
});

test('a mismatched scoped note prevents verification and linking', async t => {
  const f=await fixture(t), input=actual(); input.payload.note='Observed note';
  const approval=await review(f,input); f.setCorruptRecord(true);
  const result=await f.invoke('log',{...input,approval});
  assert.equal(result.state,'needs_review'); assert.equal(f.writes.length,1);
});

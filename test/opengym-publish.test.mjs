import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { publish, dispatchPublication } from '../src/opengym/publication.mjs';

const nativeTools = JSON.parse(await readFile(new URL('./fixtures/opengym/routine-schemas.json', import.meta.url)));
const schemas = Object.fromEntries(nativeTools.map(t => [t.name, t.inputSchema]));
const accepts = (s, v) => !!s && (s.type === 'object' ? v && typeof v === 'object' && !Array.isArray(v) && (s.required || []).every(k => k in v) && Object.entries(v).every(([k,x]) => accepts(s.properties?.[k],x)) : s.type === 'array' ? Array.isArray(v) && v.every(x=>accepts(s.items,x)) : s.type === 'string' ? typeof v === 'string' : s.type === 'integer' ? Number.isInteger(v) : s.type === 'number' ? typeof v === 'number' : s.type === 'boolean' ? typeof v === 'boolean' : false);
function fixture() {
  const state = {jobs:[], mappings:{}, publications:[]}; let remote = null, revision = 1, writes = 0, mode = 'normal', random = 0;
  const context = {need(){}, allowMutation: async () => true, fingerprint:'cap', programKey:'program', schemas, schemaAccepts:accepts};
  const client = {async request() { return {rev:revision,state:{routines:remote ? [{id:remote.id,name:remote.name,ex:remote.exercises.map(e=>({id:e.id}))}] : [],week:{}}}; }, async call(name,a) {
    if (name === 'list_routines') return {routines:remote ? [{id:remote.id}] : []};
    if (name === 'get_routine') return {...remote,revision};
    if (name === 'preview_session') return {routine_id:remote.id,exercises:remote.exercises.map(e=>({id:e.id,opening_sets:Array.from({length:e.sets},()=>({phase:'work',w:mode === 'effective' ? e.weight + 5 : e.weight,r:e.reps,sec:e.sec || 0}))}))};
    if (name === 'create_routine' || name === 'update_routine') {
      const routine = {id: a.routine_id || (a.dry_run ? 'provisional-'+ ++random : 'confirmed'),name:a.name,unit:a.unit,exercises:a.exercises.map(e=>({id:e.exercise,sets:e.sets,reps:e.reps,weight:e.weight}))};
      if (a.dry_run) return {saved:false,dry_run:true,would_save:{routine},revision};
      if (mode === 'rate') {const error=new Error('quota');error.code='native_rate_limited';error.retryAt=new Date(Date.now()-1).toISOString();throw error;}
      writes++; remote = routine; revision++;
      if (mode === 'lost') throw new Error('lost response');
      return {saved:true,routine,revision};
    }
    throw new Error(name);
  }};
  const save=async()=>{};
  return {state,context,client,save, get writes(){return writes}, setMode(v){mode=v}, edit(){remote.name='phone edit';revision++}, remove(){remote=null;revision++}};
}
const input = () => ({templateId:'stable-A',revision:'r1',payload:{name:'Strength',unit:'kg',exercises:[{exercise:'0025',sets:3,reps:5,weight:50}]}});
async function review(f, p) {return publish(f.client,f.state,f.save,f.context,p,true)}
async function commit(f,p,r) {return publish(f.client,f.state,f.save,f.context,{...p,approval:r.data.approval},false)}

test('create ignores provisional ID, verifies once, and updates only after reviewed rebase',async()=>{
 const f=fixture(), p=input(), r=await review(f,p); assert.equal(r.state,'review'); assert.equal(r.data.preview.would_save.routine.id,undefined);
 assert.equal((await commit(f,p,r)).state,'verified'); assert.equal(f.writes,1); assert.equal(f.state.publications[0].routineId,'confirmed');
 assert.equal((await commit(f,p,r)).state,'verified'); assert.equal(f.writes,1);
 f.edit(); const next={...p,revision:'r2'}; assert.equal((await review(f,next)).state,'conflict');
 const rebased={...next,rebase:true}, rr=await review(f,rebased); assert.equal(rr.state,'review'); assert.equal(rr.data.remote.name,'phone edit');
 assert.equal((await commit(f,rebased,rr)).state,'verified'); assert.equal(f.writes,2);
 f.remove(); assert.equal((await review(f,{...p,revision:'r3'})).state,'conflict'); assert.equal(f.writes,2);
});
test('lost create is never replayed and unsupported policies fail before dispatch',async()=>{
 const f=fixture(), p=input(), r=await review(f,p); f.setMode('lost'); assert.equal((await commit(f,p,r)).state,'uncertain'); assert.equal((await commit(f,p,r)).state,'uncertain'); assert.equal(f.writes,1);
 await assert.rejects(review(f,{...p,payload:{...p.payload,progression:'linear'}}),/Unsupported/);
});
test('queued rate rejection revalidates and effective mismatch is not verified',async()=>{
 const f=fixture(), p=input(), r=await review(f,p); f.setMode('rate'); assert.equal((await commit(f,p,r)).state,'retry_at');
 f.context.fingerprint='changed'; await dispatchPublication(f.client,f.state,f.state.jobs[0],f.save,f.context); assert.equal(f.state.jobs[0].state,'needs_review'); assert.equal(f.writes,0);
 const g=fixture(), q=input(), qr=await review(g,q); g.setMode('effective'); assert.equal((await commit(g,q,qr)).state,'needs_review'); assert.equal(g.state.publications.length,0);
});

test('CLI publishes through the native MCP JSON protocol and reads the result back', async t => {
  const { createServer } = await import('node:http');
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { promisify } = await import('node:util');
  const execFile = promisify((await import('node:child_process')).execFile);
  const root = await mkdtemp(path.join(tmpdir(), 'publication-cli-')); await mkdir(path.join(root,'programs','p'),{recursive:true});
  let routine = null, rev = 1, writes = 0;
  const server = createServer(async (req,res) => {
    const send = data => {res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(data));};
    if (req.url === '/api/token/me') return send({user:{id:'profile',name:'P'},token:{id:'token',name:'T',exp:null,scopes:{plans:'apply',workouts:'apply',bodyweight:'off',measurements:'off',notes:'off'}}});
    if (req.url === '/api/token/data') return send({rev,state:{routines:routine?[{id:routine.id,name:routine.name,ex:routine.exercises.map(e=>({id:e.id}))}]:[],week:{}}});
    let body=''; for await (const chunk of req) body+=chunk; const q=JSON.parse(body);
    if (q.method === 'notifications/initialized') {res.writeHead(202); return res.end();}
    let result;
    if (q.method === 'initialize') result={protocolVersion:'2025-03-26'};
    else if (q.method === 'tools/list') result={tools:['list_routines','get_routine','preview_session','create_routine','update_routine'].map(name=>({name,inputSchema:schemas[name]||{type:'object',properties:{}}}))};
    else {
      const {name,arguments:a}=q.params; let data;
      if (name === 'list_routines') data={routines:routine?[{id:routine.id}]:[]};
      if (name === 'get_routine') data={...routine,revision:rev};
      if (name === 'preview_session') data={routine_id:routine.id,exercises:routine.exercises.map(e=>({id:e.id,opening_sets:Array.from({length:e.sets},()=>({phase:'work',w:e.weight,r:e.reps}))}))};
      if (name === 'create_routine' || name === 'update_routine') {
        const next={id:a.routine_id||(a.dry_run?'provisional':'confirmed'),name:a.name,unit:a.unit,exercises:a.exercises.map(e=>({id:e.exercise,sets:e.sets,reps:e.reps,weight:e.weight}))};
        if(a.dry_run) data={saved:false,dry_run:true,would_save:{routine:next},revision:rev};
        else {routine=next;rev++;writes++;data={saved:true,routine,revision:rev};}
      }
      result={content:[{type:'text',text:JSON.stringify(data)}]};
    }
    send({jsonrpc:'2.0',id:q.id,result});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.close();await rm(root,{recursive:true,force:true});});
  const config=path.join(root,'config.json'), file=path.join(root,'input.json');
  await writeFile(config,JSON.stringify({endpoint:`http://127.0.0.1:${server.address().port}/`,trustedPrivateHttp:true,profileId:'profile',stateDir:path.join(root,'state')}));
  const command=async (verb,p,extra=[])=>{if(p)await writeFile(file,JSON.stringify(p));const args=[new URL('../src/opengym/cli.mjs',import.meta.url).pathname,verb,'--config',config,'--workspace',root,'--program','p',...(p?['--input',file]:[]),...extra];return JSON.parse((await execFile(process.execPath,args,{env:{...process.env,OPENGYM_TOKEN:'synthetic'}})).stdout);};
  assert.equal((await command('connect')).state,'connected');
  const p=input(), review=await command('publish',p,['--dry-run']); assert.equal(review.state,'review');
  assert.equal((await command('publish',{...p,approval:review.data.approval})).state,'verified');
  assert.equal((await command('publish',{...p,approval:review.data.approval})).state,'verified'); assert.equal(writes,1);
  const reordered={...p,payload:{unit:'kg',exercises:[{weight:50,reps:5,sets:3,exercise:'0025'}],name:'Strength'}};
  const same=await command('publish',reordered,['--dry-run']); assert.equal(same.state,'verified'); assert.equal(same.data.routineId,'confirmed');
  assert.equal((await command('publish',{...reordered,rebase:true},['--dry-run'])).state,'verified'); assert.equal(writes,1);
  routine.name='Phone edit'; rev++;
  assert.equal((await command('publish',reordered,['--dry-run'])).state,'conflict'); assert.equal(writes,1);
  const sameRebase = await command('publish',{...reordered,rebase:true},['--dry-run']);
  assert.equal(sameRebase.state,'review');
  assert.equal((await command('publish',{...reordered,rebase:true},['--dry-run'])).data.approval,sameRebase.data.approval);
  const updated={...p,revision:'r2'};
  assert.equal((await command('publish',updated,['--dry-run'])).state,'conflict');
  const rebased={...updated,rebase:true}, next=await command('publish',rebased,['--dry-run']);
  assert.equal(next.state,'review'); assert.equal(next.data.remote.name,'Phone edit');
  assert.equal((await command('publish',{...rebased,approval:next.data.approval})).state,'verified'); assert.equal(writes,2);
  routine=null; rev++; assert.equal((await command('publish',{...p,revision:'r3'},['--dry-run'])).state,'conflict'); assert.equal(writes,2);
});

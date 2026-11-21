import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import path from 'node:path';

export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function readJson(file, fallback) { try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; } }
export async function atomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temp, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); } finally { await handle.close(); }
  try { await rename(temp, file); const dir = await open(path.dirname(file), 'r'); try { await dir.sync(); } finally { await dir.close(); } } catch (error) { await rm(temp, { force: true }); throw error; }
}
export class Store {
  constructor(root, scope) {
    this.dir = path.join(root || path.join(homedir(), '.local', 'share', 'workout-opengym'), hash(scope));
    this.file = path.join(this.dir, 'state.json'); this.lock = path.join(this.dir, 'lock'); this.scope = scope;
  }
  async run(fn, recover = false) {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const gate = path.join(this.dir, 'acquisition');
    try { await mkdir(gate); } catch (error) {
      if (error.code === 'EEXIST') throw new Error('Store acquisition interrupted or in progress; inspect acquisition directory manually');
      throw error;
    }
    try {
    try { await mkdir(this.lock); } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (!recover) throw new Error('Store locked; inspect lock owner and use --recover-lock only after confirming it is stale');
      const owner = await readJson(path.join(this.lock, 'owner.json'), null);
      if (!owner || owner.host !== hostname() || !Number.isInteger(owner.pid)) throw new Error('Cannot establish stale lock owner');
      try { process.kill(owner.pid, 0); throw new Error('Lock owner is still running'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
      await rm(this.lock, { recursive: true }); await mkdir(this.lock);
    }
    } finally { await rm(gate, { recursive: true, force: true }); }
    try {
      await atomicJson(path.join(this.lock, 'owner.json'), { pid: process.pid, host: hostname(), startedAt: new Date().toISOString() });
      const state = await readJson(this.file, { version: 1, scope: this.scope, mappings: {}, assignments: [], workouts: {}, publications: [], jobs: [], observation: null });
      if (state.version !== 1 || hash(state.scope) !== hash(this.scope) || !Array.isArray(state.jobs) || !Array.isArray(state.assignments) || !state.workouts || typeof state.workouts !== 'object') throw new Error('Invalid scoped store');
      const save = () => atomicJson(this.file, state);
      return await fn(state, save);
    } finally { await rm(this.lock, { recursive: true, force: true }); }
  }
}

#!/usr/bin/env node
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { readJson } from './store.mjs';
import { programDir, run } from './engine.mjs';

async function main(argv) {
  const command = argv.shift();
  if (command === '--help' || command === 'help') return { ok: true, state: 'help', data: { commands: ['connect', 'search', 'adopt', 'publish', 'log', 'sync', 'status', 'history'], options: ['--config FILE', '--workspace DIR', '--program NAME', '--input FILE', '--state-dir DIR', '--dry-run', '--once', '--recover-lock'], config: { endpoint: 'https://openGym.example/', profileId: 'profile ID', tokenEnv: 'OPENGYM_TOKEN', serverTimezone: 'IANA timezone matching the MCP process (required for explicit start; configured, not remotely verified)' }, actualFields: 'Use duration_min and note; start is HH:MM; sets use reps or seconds and explicit weight including 0 for bodyweight. Legacy duration and notes aliases are unsupported.', input: { publish: { templateId: 'stable local ID', revision: 'stable local revision', payload: { name: 'Routine name', unit: 'kg', exercises: [{ exercise: 'verified remote exercise ID', sets: 3, reps: 5, weight: 50 }] }, approval: 'approval from publish --dry-run; omit for review', rebase: 'true only to review and accept remote edits' }, adoptReview: { templates: { A: 'remote-routine-id' }, assignments: [{ occurrenceId: 'occ-1', sessionId: 'A', workoutId: 'remote-workout-id', order: 1, templateId: 'local template ID or null', templateRevision: 'known revision or null' }, { occurrenceId: 'occ-2', sessionId: 'B', order: 2 }] }, adoptCommit: { approval: 'approval from review', proposed: 'exact review input object', mapping: 'same exact review input object' }, search: { query: 'exercise name' }, sync: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }, history: { from: 'YYYY-MM-DD (optional)', to: 'YYYY-MM-DD (optional)', limit: '1-200, default 50; cached observations include IDs for adopt' }, log: { occurrenceId: 'ID', sessionId: 'ID', timezone: 'IANA timezone', payload: { date: 'YYYY-MM-DD', unit: 'kg', exercises: [{ exercise: 'remote exercise ID', sets: [{ reps: 5, weight: 40 }] }] } }, logCommit: { occurrenceId: 'ID', sessionId: 'ID', timezone: 'Europe/Paris', payload: { date: '2026-01-01', unit: 'kg', exercises: [{ exercise: 'remote exercise ID', sets: [{ reps: 5, weight: 40 }] }] }, approval: 'approval from log review' } } } };
  const options = {};
  const names = { '--config':'config', '--workspace':'workspace', '--program':'program', '--input':'input', '--state-dir':'stateDir' };
  const flags = { '--dry-run':'dryRun', '--once':'once', '--recover-lock':'recoverLock' };
  while (argv.length) {
    const arg = argv.shift();
    if (names[arg]) { if (!argv.length || argv[0].startsWith('--')) throw new Error(`Missing value for ${arg}`); options[names[arg]] = argv.shift(); }
    else if (flags[arg]) options[flags[arg]] = true;
    else throw new Error('Unknown option');
  }
  if (!['connect','search','adopt','publish','log','sync','status','history'].includes(command)) throw new Error('Expected connect, search, adopt, publish, log, sync, status or history');
  let sidecar = null;
  if (options.workspace && options.program && /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(options.program)) sidecar = await readJson(path.join(programDir(options), '.opengym-backend.json'), null);
  if (sidecar && !(command === 'connect' && options.config) && (sidecar.version !== 2 || sidecar.backend !== 'opengym' || sidecar.program?.workspace !== realpathSync(options.workspace) || sidecar.program?.name !== options.program)) throw new Error('Backend program binding mismatch; reconnect with --config');
  if (command === 'connect' && sidecar && !options.config && (sidecar.version !== 2 || sidecar.program?.workspace !== realpathSync(options.workspace) || sidecar.program?.name !== options.program)) throw new Error('Reconnect requires explicit --config');
  const configPath = path.resolve(options.config || sidecar?.configPath || path.join(homedir(), '.config', 'workout-opengym', 'config.json'));
  const config = await readJson(configPath);
  if (!options.stateDir && sidecar?.stateDir) options.stateDir = sidecar.stateDir;
  const input = options.input ? await readJson(path.resolve(options.input)) : null;
  return run(command, options, input, config, configPath);
}
main(process.argv.slice(2)).then(result => { process.stdout.write(JSON.stringify(result) + '\n'); if (!result.ok || ['blocked','error'].includes(result.state)) process.exitCode = 1; }).catch(error => {
  const message = error.code && /^http_\d+$|^rate_limited$|^network_uncertain$|^rpc_error$|^tool_error$|^invalid_/.test(error.code) ? error.code : error.code === 'ENOENT' ? 'File not found' : error instanceof SyntaxError ? 'Invalid JSON' : error instanceof TypeError ? 'Invalid configuration or input' : error.message;
  process.stdout.write(JSON.stringify({ ok: false, state: 'error', error: message }) + '\n'); process.exitCode = 1;
});

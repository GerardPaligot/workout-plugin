import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const nonempty = (value) => typeof value === 'string' && value.length > 0;
const timestamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const date = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && timestamp(value) && new Date(value).toISOString().slice(0, 10) === value;
const scopeValid = (scope) => scope && nonempty(scope.server) && nonempty(scope.profileId);
const assignmentValid = (a) => a && nonempty(a.occurrenceId) && nonempty(a.sessionId) && nonempty(a.workoutId) && timestamp(a.completedAt);

// A present but unreadable marker still selects external authority for writes.
export function readBackend(programDir) {
  const path = join(programDir, '.opengym-backend.json');
  try { lstatSync(path); } catch (error) { return error.code === 'ENOENT' ? null : { valid: false }; }
  let marker;
  try { marker = JSON.parse(readFileSync(path, 'utf8')); } catch { return { valid: false }; }
  let identity;
  try {
    const workspace = realpathSync(resolve(programDir, '../..'));
    const name = basename(programDir);
    if (realpathSync(programDir) !== join(workspace, 'programs', name)) return { valid: false };
    identity = { workspace, name };
  } catch { return { valid: false }; }
  if (marker?.version !== 2 || marker.program?.workspace !== identity.workspace || marker.program?.name !== identity.name || marker.backend !== 'opengym' || (marker.requiresAdoption !== undefined && typeof marker.requiresAdoption !== 'boolean') || !scopeValid(marker.scope) || !nonempty(marker.configPath) || (marker.stateDir !== undefined && !nonempty(marker.stateDir))) return { valid: false };
  return { valid: true, scope: marker.scope, program: identity, requiresAdoption: marker.requiresAdoption === true };
}

export function readProgress(programDir, backend, currentMesocycle, now = Date.now()) {
  const unknown = { status: 'unknown', lastSession: null, nextSessionId: null, needs_mapping: true };
  if (!backend?.valid || backend.requiresAdoption) return unknown;
  let p;
  try { p = JSON.parse(readFileSync(join(programDir, '.opengym-projection.json'), 'utf8')); } catch { return unknown; }
  if (p?.requiresAdoption === true || (p?.requiresAdoption !== undefined && typeof p.requiresAdoption !== 'boolean')) return unknown;
  if (p?.version !== 2 || p.program?.workspace !== backend.program.workspace || p.program?.name !== backend.program.name || !Number.isSafeInteger(p.currentMesocycle) || p.currentMesocycle < 1 || p.currentMesocycle !== currentMesocycle || !scopeValid(p.scope) || p.scope.server !== backend.scope.server || p.scope.profileId !== backend.scope.profileId || !timestamp(p.observedAt) || !p.coverage || !date(p.coverage.from) || !date(p.coverage.to) || Date.parse(p.coverage.from) > Date.parse(p.coverage.to) || typeof p.coverage.complete !== 'boolean' || !Number.isFinite(p.freshnessMaxAgeMs) || p.freshnessMaxAgeMs <= 0 || p.activeUnknown !== true || !Array.isArray(p.assignments) || !p.assignments.every(assignmentValid) || !(p.lastSession === null || assignmentValid(p.lastSession)) || !(p.nextSessionId === null || nonempty(p.nextSessionId)) || typeof p.needs_mapping !== 'boolean') return unknown;
  const age = now - Date.parse(p.observedAt);
  const today = new Date(now).toISOString().slice(0, 10);
  const coversToday = p.coverage.from.slice(0, 10) <= today && p.coverage.to.slice(0, 10) >= today;
  return { status: age < 0 || age > p.freshnessMaxAgeMs || !p.coverage.complete || !coversToday ? 'stale' : 'fresh', observedAt: p.observedAt, coverage: p.coverage, activeUnknown: true, assignments: p.assignments, lastSession: p.lastSession, nextSessionId: p.nextSessionId, needs_mapping: p.needs_mapping };
}

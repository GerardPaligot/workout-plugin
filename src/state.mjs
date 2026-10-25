import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadYaml } from './common.mjs';

export const SKILLS = ['coach', 'track', 'review-mesocycle', 'create-mesocycle', 'create-program', 'archive-program', 'onboarding'];

const STATE_BY_STATUS = { active: 'in_progress', paused: 'paused', completed: 'completed' };

export function detectState(root) {
  const empty = { state: 'no_program', programDir: null, program: null, status: null };
  if (!existsSync(join(root, 'profile.yaml'))) return { ...empty, state: 'needs_onboarding' };

  const base = join(root, 'programs');
  if (!existsSync(base)) return empty;

  const candidates = [];
  for (const entry of readdirSync(base)) {
    if (entry === 'archives' || entry.startsWith('.')) continue;
    const full = join(base, entry);
    if (!statSync(full).isDirectory()) continue;
    const sf = join(full, 'status.yaml');
    if (!existsSync(sf)) continue;
    let status = null;
    try { status = loadYaml(sf); } catch { status = null; }
    candidates.push({ programDir: full, program: entry, status });
  }

  const archivedPresent = candidates.some((c) => c.status?.status === 'archived');
  const live = candidates.filter((c) => ['active', 'paused', 'completed'].includes(c.status?.status));

  if (live.length > 1 || archivedPresent) {
    return { state: 'inconsistent', programDir: null, program: null, status: null,
      anomaly: archivedPresent ? 'archived program not moved out of programs/' : 'multiple non-archived programs' };
  }
  if (live.length === 0) return empty;

  const p = live[0];
  return { state: STATE_BY_STATUS[p.status.status], programDir: p.programDir, program: p.program, status: p.status };
}

function plannedMesocycleCount(programDir) {
  const f = join(programDir, 'macrocycle.yaml');
  if (!existsSync(f)) return null;
  try {
    const macro = loadYaml(f);
    return Array.isArray(macro?.mesocycles) ? macro.mesocycles.length : null;
  } catch { return null; }
}

export function computeSkills(root, ctx) {
  const { state, programDir, status } = ctx;
  const skills = {};
  const set = (n, allowed, reason) => { skills[n] = allowed ? { allowed: true } : { allowed: false, reason }; };

  set('onboarding', true);

  if (state === 'needs_onboarding') {
    for (const n of ['coach', 'track', 'review-mesocycle', 'create-mesocycle', 'create-program', 'archive-program']) {
      set(n, false, 'Profile missing: run onboarding first');
    }
    return skills;
  }

  set('coach', true);

  if (state === 'inconsistent') {
    for (const n of ['track', 'review-mesocycle', 'create-mesocycle', 'create-program', 'archive-program']) {
      set(n, false, `Inconsistent state: ${ctx.anomaly}. Fix programs/ before any write.`);
    }
    return skills;
  }

  if (state === 'no_program') {
    set('create-program', true);
    set('track', false, 'No active program');
    set('review-mesocycle', false, 'No active program');
    set('create-mesocycle', false, 'No active program');
    set('archive-program', false, 'No program to archive');
    return skills;
  }

  const m = status.current_mesocycle;
  const currentSessions = join(programDir, `mesocycle-${m}`, 'sessions.yaml');
  const hasCurrentSessions = existsSync(currentSessions);

  if (state === 'completed') {
    set('archive-program', true);
    set('create-program', false, 'Archive the completed program first');
    set('track', false, 'Program completed');
    set('create-mesocycle', false, 'Program completed');
    set('review-mesocycle', hasCurrentSessions, hasCurrentSessions ? undefined : `mesocycle-${m}/sessions.yaml missing`);
    return skills;
  }

  // in_progress | paused
  set('create-program', false, 'A program is already active');
  set('archive-program', false, `Program not completed (status: ${status.status})`);
  set('track', true);
  set('review-mesocycle', hasCurrentSessions, hasCurrentSessions ? undefined : `mesocycle-${m}/sessions.yaml missing`);

  const currentReview = join(programDir, `mesocycle-${m}`, 'review.md');
  const nextSessions = join(programDir, `mesocycle-${m + 1}`, 'sessions.yaml');
  const plannedCount = plannedMesocycleCount(programDir);
  let reason = null;
  if (!existsSync(currentReview)) reason = `Review mesocycle ${m} first (mesocycle-${m}/review.md missing)`;
  else if (plannedCount !== null && m >= plannedCount) reason = `Last planned mesocycle (${plannedCount}) reached: complete, then archive`;
  else if (existsSync(nextSessions)) reason = `mesocycle-${m + 1}/sessions.yaml already exists`;
  set('create-mesocycle', reason === null, reason);

  return skills;
}

export function main(root) {
  const ctx = detectState(root);
  const skills = computeSkills(root, ctx);
  const out = {
    state: ctx.state,
    program: ctx.program,
    current_mesocycle: ctx.status?.current_mesocycle ?? null,
    current_week: ctx.status?.current_week ?? null,
    skills,
  };
  if (ctx.anomaly) out.anomaly = ctx.anomaly;
  console.log(JSON.stringify(out, null, 2));
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(resolve(process.argv[2] || '.')));

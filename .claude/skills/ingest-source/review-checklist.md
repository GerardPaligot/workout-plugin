# Review checklist for ingest-source (step 6)

You are a fresh reviewer of the workout plugin at the repo root. Do NOT edit files. Audit ALL `skills/*/SKILL.md`, not only the touched ones (the caller lists those). Return findings ranked by severity (high / medium / low), each with file, line, problem, suggested fix.

## Checks
1. Frontmatter: exactly `name` and `description`; `name` == directory name; description is a double-quoted string "<summary>. Use when: <triggers>."; telegraphic.
2. Sources: final `## Sources` section in knowledge skills; entries match `- Video: "<original title>" (<author>) — "<English title>" <url>` (English part only when the original isn't English; URL optional, older entries have none) or `- EMG study (<year>): <description>` or `- Study: <description>` (when year unknown); French titles only on `- Video:` lines, with `— "<English>"`; no duplicate entries across skills for the same source unless each really uses it.
3. Prerequisite: knowledge skills start with the intact `> **Prerequisite:**` blockquote; workflow skills (archive-program, create-mesocycle, create-program, review-mesocycle, track, coach) use a `## Prerequisite` section instead; both are valid; `onboarding` has none.
4. Cross-references: plain backticked skill names, all pointing to existing skills. Check both directions: when skill A cites or builds on topic B (e.g. stretch-position content in a muscle skill vs `lifting-biomechanics`), B should reference A where pertinent. Flag missing and dangling refs.
5. Coach table: `skills/coach/SKILL.md` `## Skills to consult by topic` covers every knowledge skill and topic.
6. Duplication and contradiction: same claim stated in several skills, or skills giving conflicting numbers/advice (sets, reps, RIR, rest, frequency, volume). Name the skills and quote both.
7. Style: telegraphic, no filler, no URLs outside Sources, no `/Users/`, `tools/`, `.claude/skills/`, no French outside `- Video:` lines; no maintainer/process meta-text in shipped skills (e.g. "flagged", "not resolved", "for the maintainer", "transcript", "proposal"); tensions phrased for end users ("Two views: ...").
8. Docs consistency: README skill count, skills table, knowledge-skills line match the `skills/` directories; `test/skills.test.mjs` lists match them.
9. Run `npm test`; include the summary and any failure output.

## Output
Ranked findings list, then "npm test: pass/fail (n tests)". No praise, no restating the checklist.

---
name: ingest-source
description: "Fold a new training source (PDF, blog post, YouTube video transcript) into the plugin's knowledge skills. Maintainer-only. Use when: the user shares a book/article/video/study to add, asks to ingest, integrate or review a source, or wants to know if a source is already covered."
---

# Ingest Source

Maintainer workflow: turn one external source into reviewed edits of `skills/*/SKILL.md`. Nothing is written to `skills/` before explicit user approval.

## 1. Read the source
- PDF: Read tool, by page ranges.
- Blog post: WebFetch.
- YouTube: needs a transcript (pasted or file path). If only a URL is given, ask for the transcript.
- Extract training-relevant claims. Tag each with evidence level: study, expert opinion, anecdote.

## 2. Already reviewed?
Grep the `## Sources` section of every `skills/*/SKILL.md` for title, author, URL. If found: report where, ask whether to continue (e.g. re-review for missed claims) or stop.

## 3. Map claims to skills
- Read the knowledge skills; read workflow skills too when a claim changes behavior.
- Per claim: target skill + section, class = new / reinforces / contradicts / out of scope.
- Propose a new knowledge skill only if claims fit no existing one.

## 4. Propose (no repo writes yet)
Present to the user:
- Per skill: concise diff-like summary of edits.
- New `## Sources` entry per touched skill.
- Contradictions: both positions, with evidence levels.
- Save to `specs/ingest-source/<YYYY-MM-DD>-<source-slug>.md` (scratch, not committed).

Wait for explicit approval. Apply only the approved subset.

## 5. Apply
- English content. French only on `- Video:` lines: keep original title, add `— "<English>"` (as in `training-programming`).
- Sources formats: `- Video: "<title>" (<author>) <url>` (URL when available); `- EMG study (<year>): <description>`.
- Match surrounding style: telegraphic, same section layout.
- Keep the `> **Prerequisite:**` blockquote intact.
- New skill: frontmatter exactly `name` (== dir name) + double-quoted `description` ("<summary>. Use when: <triggers>."); `# Title`, topic sections, final `## Sources`; gated blockquote copied from a sibling knowledge skill; add to the lists in `test/skills.test.mjs`.
- Cross-refs: plain backticked names, e.g. `` `lifting-biomechanics` skill ``.

## 6. Review agent
Dispatch a fresh subagent (Agent tool) with the contents of [review-checklist.md](review-checklist.md) plus the list of touched skills. It audits ALL plugin skills, runs `npm test`, returns findings ranked by severity. Show findings to the user, then fix the agreed ones.

## 7. Docs check
- `README.md`: skill count ("ships N skills"), `## Skills` table, knowledge-skills line, `## Attribution` (only if a new kind of source).
- `skills/coach/SKILL.md` topic table covers any new knowledge skill.
- Run `npm test`; report the result.

## What you do NOT do
- Write to the repo before explicit approval.
- Commit (the user does).
- Edit workflow-skill logic unless a claim requires it and the user approved.
- Invent claims, numbers or citations beyond the source.
- Touch `.claude/` or `specs/` content in commits or shipped skills.
- Resolve contradictions silently: flag them.

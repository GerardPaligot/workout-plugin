# workout

A strength-training coach plugin for **Claude Code** and **OpenAI Codex**. It ships 18 skills (workflow + exercise knowledge), a shared exercise catalog, YAML schemas and templates, and two zero-dependency Node scripts (`state.mjs`, `validate.mjs`) that gate which skill may run and validate your data files.

## Skills

Workflow (read/write files in your workspace):

| Skill | Purpose |
|---|---|
| `onboarding` | Record language, units and available equipment in `profile.yaml`. **Always run first.** |
| `create-program` | Build a new program (macrocycle, goals, first mesocycle). |
| `create-mesocycle` | Build the next mesocycle's sessions. |
| `track` | Update real-time status, log loads and measurements. |
| `review-mesocycle` | Review a finished mesocycle and plan adjustments. |
| `archive-program` | Close a completed program and archive it. |
| `coach` | Read-only answers to training questions. |

Knowledge (consulted by the others): `program-structure`, `training-programming`, `training-principles`, `lifting-biomechanics`, `biceps-training`, `back-training`, `shoulder-training`, `obliques-training`, `chest-training`, `quadriceps-training`, `triceps-training`.

## Onboarding-first flow

Every skill except `onboarding` requires `profile.yaml` at the workspace root. If it is missing, the skill stops and runs `onboarding`; the state script reports `needs_onboarding` and blocks every other skill (including `coach`). After onboarding, `state.mjs` computes which workflow skills are allowed (for example `create-program` only when no program is active, `archive-program` only when a program is completed).

## Workspace layout

Run the plugin from your own workspace directory (any folder; it is the CLI argument of the scripts, default: current directory):

```
<workspace>/
├── profile.yaml            # written by onboarding
├── exercises.custom.yaml   # optional: your own exercises/equipment
└── programs/
    ├── archives/
    └── YYYY-MM_program-name/ (status.yaml, goals.yaml, macrocycle.yaml, mesocycle-N/sessions.yaml, review.md)
```

Templates, schemas and the exercise catalog live in the plugin and are never edited. Add missing exercises or equipment in `exercises.custom.yaml` (same format as `catalog/exercises.yaml`). New ids only: a slug or equipment id that already exists in the catalog is rejected by the validator.

## Install

One command, installs into every CLI found on `PATH` (Claude Code, Codex), straight from GitHub:

```bash
curl -fsSL https://raw.githubusercontent.com/GerardPaligot/workout-plugin/main/install.sh | bash -s -- --source GerardPaligot/workout-plugin
```

Or from a clone:

```bash
./install.sh                         # from a local clone
./install.sh --source <git-url>      # or from a git URL / owner/repo
./install.sh --scope project         # Claude Code scope: user (default) | project | local
./install.sh --dry-run               # print the commands only
```

The Codex CLI has no scope option (user-level only).

Equivalent manual commands:

```bash
# Claude Code
claude plugin marketplace add <path-or-git-url> [--scope user|project|local]
claude plugin install workout@workout-plugin [--scope user|project|local]

# Codex
codex plugin marketplace add <path-or-git-url>
codex plugin add workout@workout-plugin
```

### Update / uninstall

```bash
# Claude Code
claude plugin marketplace update workout-plugin
claude plugin update workout@workout-plugin
claude plugin uninstall workout@workout-plugin

# Codex
codex plugin marketplace upgrade workout-plugin   # git marketplaces; re-add a local path to refresh
codex plugin remove workout@workout-plugin
```

### Codex path fallback

Skills call the scripts as `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" .`. Claude Code substitutes `${CLAUDE_PLUGIN_ROOT}`; Codex documents no such variable. Each skill therefore states the fallback: *the plugin root is the directory two levels above that SKILL.md*. Always run the scripts from the workspace root.

## Development

```bash
npm install     # dev dependencies only (esbuild, ajv, js-yaml)
npm run build   # bundle src/*.mjs -> scripts/*.mjs (self-contained, committed)
npm test        # unit tests, skill checks, bundle freshness, smoke tests
claude plugin validate .
```

`scripts/` contains generated bundles: edit `src/`, rebuild and commit both. A test fails if the bundles are stale. Node >= 20.11.

## Attribution

The skills' **Sources** sections cite third-party material (YouTube videos and EMG / biomechanics studies). They are credited to their respective authors; the plugin only summarises them for coaching purposes and is not affiliated with or endorsed by them.

## License

Licensed under the [Apache License 2.0](LICENSE).

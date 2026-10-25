#!/usr/bin/env bash
# Install the `workout` plugin into Claude Code and/or OpenAI Codex (whichever are on PATH).
# Uses only official CLI subcommands.
#
# Usage: ./install.sh [--source <path|git-url|owner/repo>] [--scope user|project|local] [--dry-run]
#   --source   marketplace source (default: this repo's directory)
#   --scope    Claude Code install scope (default: user). Codex has no scope option: always user-level.
#   --dry-run  print the commands without running them
set -euo pipefail

PLUGIN=workout
MARKETPLACE=workout-plugin
SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCOPE=user
DRY=0

usage() { sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --source) [ $# -ge 2 ] || { echo "error: --source needs a value" >&2; exit 2; }; SOURCE="$2"; shift 2 ;;
    --scope)  [ $# -ge 2 ] || { echo "error: --scope needs a value" >&2; exit 2; }; SCOPE="$2"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

case "$SCOPE" in user|project|local) ;; *) echo "error: --scope must be user, project or local" >&2; exit 2 ;; esac

run() {
  if [ "$DRY" = 1 ]; then printf '[dry-run] %s\n' "$*"; else "$@"; fi
}

found=0

if command -v claude >/dev/null 2>&1 || [ "$DRY" = 1 ]; then
  if command -v claude >/dev/null 2>&1; then found=1; echo "== Claude Code (scope: $SCOPE)"; else echo "== Claude Code not found (dry-run: showing commands anyway)"; fi
  if [ "$DRY" = 0 ] && claude plugin marketplace list 2>/dev/null | grep -q "$MARKETPLACE"; then
    echo "marketplace '$MARKETPLACE' already added, refreshing"
    run claude plugin marketplace update "$MARKETPLACE"
  else
    run claude plugin marketplace add "$SOURCE" --scope "$SCOPE"
  fi
  if [ "$DRY" = 0 ] && claude plugin list 2>/dev/null | grep -q "$PLUGIN@$MARKETPLACE"; then
    echo "plugin '$PLUGIN@$MARKETPLACE' already installed"
  else
    run claude plugin install "$PLUGIN@$MARKETPLACE" --scope "$SCOPE"
  fi
else
  echo "-- claude not found, skipping Claude Code"
fi

if command -v codex >/dev/null 2>&1 || [ "$DRY" = 1 ]; then
  if command -v codex >/dev/null 2>&1; then found=1; echo "== Codex (user-level; --scope not supported)"; else echo "== Codex not found (dry-run: showing commands anyway)"; fi
  if [ "$DRY" = 0 ] && codex plugin marketplace list 2>/dev/null | grep -q "$MARKETPLACE"; then
    echo "marketplace '$MARKETPLACE' already added, upgrading"
    run codex plugin marketplace upgrade "$MARKETPLACE" || true
  else
    run codex plugin marketplace add "$SOURCE"
  fi
  # `codex plugin add` on an installed plugin re-installs; harmless.
  run codex plugin add "$PLUGIN@$MARKETPLACE"
else
  echo "-- codex not found, skipping Codex"
fi

if [ "$found" = 0 ] && [ "$DRY" = 0 ]; then
  echo "error: neither 'claude' nor 'codex' found on PATH" >&2
  exit 1
fi
echo "Done. Restart your CLI session to load the plugin."

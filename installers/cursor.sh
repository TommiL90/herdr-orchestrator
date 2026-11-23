#!/bin/sh
# Install hcorc, herdorc and the ten roles into cursor: the orchestrators as skills (/hcorc), the roles as subagents, the commands as skills, the guard hook.
#
#   installers/cursor.sh                     for your user, in ~/.cursor
#   installers/cursor.sh --scope project [--project DIR]   in DIR/.cursor (default: current dir)
#   installers/cursor.sh --agents herdorc    one orchestrator only (the roles always install)
#   installers/cursor.sh --dry-run | --force | --uninstall [--scope ...]
#
# Every installed file is a symlink to its generated copy in this clone's dist/.
# --scope user (the default) and --scope global are the same. Rerun after git pull.
ROOT=$(cd "$(dirname "$0")/.." && pwd)
. "$ROOT/installers/_lib.sh"
case "${1:-}" in -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0;; esac
need_python
exec python3 "$ROOT/install.py" --cli cursor "$@"

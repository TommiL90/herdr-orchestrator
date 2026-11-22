#!/bin/sh
# Install hcorc, herdorc and the ten roles into opencode: primary agents, subagents, /<agent>-* commands.
#
#   installers/opencode.sh                     for your user, in ~/.config/opencode
#   installers/opencode.sh --scope project [--project DIR]   in DIR/.opencode (default: current dir)
#   installers/opencode.sh --agents herdorc    one orchestrator only (the roles always install)
#   installers/opencode.sh --dry-run | --force | --uninstall [--scope ...]
#
# Every installed file is a symlink to its generated copy in this clone's dist/.
# --scope user (the default) and --scope global are the same. Rerun after git pull.
ROOT=$(cd "$(dirname "$0")/.." && pwd)
. "$ROOT/installers/_lib.sh"
case "${1:-}" in -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0;; esac
need_python
exec python3 "$ROOT/install.py" --cli opencode "$@"

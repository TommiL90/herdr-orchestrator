#!/bin/sh
# Install hcorc and herdorc into pi: /hcorc loads the orchestrator's prompt, the commands as prompt templates, the guard as an extension. pi has no subagents, so no roles.
#
#   installers/pi.sh                     for your user, in ~/.pi/agent (or $PI_CODING_AGENT_DIR)
#   installers/pi.sh --scope project [--project DIR]   in DIR/.pi (default: current dir)
#   installers/pi.sh --agents herdorc    one orchestrator only
#   installers/pi.sh --dry-run | --force | --uninstall [--scope ...]
#
# Every installed file is a symlink to its generated copy in this clone's dist/.
# --scope user (the default) and --scope global are the same. Rerun after git pull.
ROOT=$(cd "$(dirname "$0")/.." && pwd)
. "$ROOT/installers/_lib.sh"
case "${1:-}" in -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0;; esac
need_python
exec python3 "$ROOT/install.py" --cli pi "$@"

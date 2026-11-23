#!/bin/sh
# Install hcorc, herdorc and the ten roles into Grok Build: agents (grok --agent hcorc), the roles as agents its subagents can run, the commands as skills, the guard hook.
#
#   installers/grok.sh                     for your user, in ~/.grok (or $GROK_HOME)
#   installers/grok.sh --scope project [--project DIR]   in DIR/.grok (default: current dir)
#   installers/grok.sh --agents herdorc    one orchestrator only (the roles always install)
#   installers/grok.sh --dry-run | --force | --uninstall [--scope ...]
#
# Every installed file is a symlink to its generated copy in this clone's dist/.
# --scope user (the default) and --scope global are the same. Rerun after git pull.
ROOT=$(cd "$(dirname "$0")/.." && pwd)
. "$ROOT/installers/_lib.sh"
case "${1:-}" in -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0;; esac
need_python
exec python3 "$ROOT/install.py" --cli grok "$@"

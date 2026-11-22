#!/bin/sh
# Install the Skills panel into the Herdr desktop app (any CLI): the orc-skills
# mod, linked from this clone's dist/, plus a button beside the tab bar and a
# collapsible column. One of Herdr's own layouts is cloned first.
#
#   installers/herdr-app.sh [--dry-run] [--force] [--uninstall]
#
# The third-party mods (filetree, gitview, agent-flow...): installers/herdr-app-extras.sh.
ROOT=$(cd "$(dirname "$0")/.." && pwd)
. "$ROOT/installers/_lib.sh"
case "${1:-}" in -h|--help) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0;; esac
need_python
exec python3 "$ROOT/install.py" --herdr-app "$@"

#!/bin/sh
# Install orc-flow, herdorc's live graph, into the herdr terminal multiplexer
# (any CLI): `herdr plugin link` to this clone's herdr/plugins/orc-flow, and the
# prefix+shift+z keybinding in herdr's config.toml. Needs Node.js 22.5+.
#
#   installers/herdr.sh [--dry-run] [--uninstall]
ROOT=$(cd "$(dirname "$0")/.." && pwd)
. "$ROOT/installers/_lib.sh"
case "${1:-}" in -h|--help) sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'; exit 0;; esac
need_python
exec python3 "$ROOT/install.py" --herdr "$@"

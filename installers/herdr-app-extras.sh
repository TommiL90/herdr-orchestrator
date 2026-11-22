#!/bin/sh
# Install third-party Herdr app mods, each pinned to a reviewed commit
# (herdr-app/extras.json): herdr-nvim, gitview, file-icons, filetree,
# markdown-panel, agent-flow (patched for orc.py handoffs). It downloads their
# code from GitHub; herdr-nvim and gitview also download their release binary.
#
#   installers/herdr-app-extras.sh [--only filetree,gitview] [--list]
#                                  [--dry-run] [--force] [--uninstall]
ROOT=$(cd "$(dirname "$0")/.." && pwd)
. "$ROOT/installers/_lib.sh"
case "${1:-}" in -h|--help) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0;; esac
need_python
exec python3 "$ROOT/herdr-app/extras.py" "$@"

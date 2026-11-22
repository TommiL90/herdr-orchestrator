#!/bin/sh
# Opens the orc-flow pane: `open.sh overlay|split|tab`. Used by the plugin's actions.
#
# The pane is told which pane was focused when it was opened (ORC_FLOW_ORIGIN): when
# herdorc's pane can't be told by its label, the pane you opened orc-flow from is taken
# as the lead. And its placement (ORC_FLOW_PLACEMENT): in an overlay, Enter focuses a pane
# and closes the overlay.
set -u
herdr_bin="${HERDR_BIN_PATH:-herdr}"
root="$(cd "$(dirname "$0")/.." && pwd)"
placement="${1:-overlay}"
case "$placement" in overlay|split|tab) ;; *) echo "usage: open.sh overlay|split|tab" >&2; exit 2 ;; esac

origin="$("$herdr_bin" api snapshot 2>/dev/null | node -e '
let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
  try { const r = JSON.parse(s).result.snapshot; process.stdout.write(r.focused_pane_id || ""); } catch {}
});' 2>/dev/null)"
# A pane id is `w1:p3`; anything else is not passed on.
case "$origin" in *[!A-Za-z0-9:_-]*|"") origin="" ;; esac

set -- plugin pane open --plugin orc-flow --entrypoint graph --placement "$placement" \
  --cwd "$root" --env "ORC_FLOW_PLACEMENT=$placement" --focus
[ -n "$origin" ] && set -- "$@" --env "ORC_FLOW_ORIGIN=$origin"
[ "$placement" = split ] && set -- "$@" --direction right
exec "$herdr_bin" "$@"

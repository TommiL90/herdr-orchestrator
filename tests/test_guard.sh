#!/usr/bin/env bash
# Tests for shared/bin/guard.py. Uses an isolated herdr-core session
# (HC_SESSION=orc-guard-test) and a scratch herdorc state file; touches
# nothing of the user's real terminals.
set -u
cd "$(dirname "$0")/.."
GUARD=shared/bin/guard.py
# The guard reads the session's main agent from the environment: start neutral.
unset CLAUDE_CODE_AGENT
# Point herdr at no server: ownership checks must not reach the user's real session.
export HERDR_SOCKET_PATH="$(mktemp -d)/no-herdr.sock"
export HC_SESSION=orc-guard-test
hc run --bg --name boss -- sleep 300 >/dev/null
hc run --bg --name kid --parent boss --no-notify -- sleep 300 >/dev/null
hc run --bg --name other --no-parent -- sleep 300 >/dev/null
export HC_TERMINAL_ID
HC_TERMINAL_ID=$(hc get boss --json | python3 -c 'import json,sys;print(json.load(sys.stdin)["address"])')
STATE_DIR="$HOME/.local/state/orc"; mkdir -p "$STATE_DIR"
unset HERDR_SESSION
export HERDR_WORKSPACE_ID=orc-guard-test
unset HERDR_PANE_ID
STATE="$STATE_DIR/herdorc-default-$HERDR_WORKSPACE_ID.pane-none.json"
echo '{"panes":{"w1:p7":"gentle-ai-worker"},"tabs":["w1:t3"]}' > "$STATE"

E=$(mktemp); O=$(mktemp); pass=0; fail=0
# t <expect> <agent> <command>: expect 0 (allow), 2 (block) or ask (the user confirms).
t() {
  local exp=$1 ag=$2 cmd=$3 rc
  printf '%s' "$cmd" | python3 -c 'import json,sys;print(json.dumps({"agent_type":sys.argv[1],"tool_input":{"command":sys.stdin.read()}}))' "$ag" \
    | "$GUARD" 2>"$E" >"$O"; rc=$?
  [ "$rc" = 0 ] && grep -q '"permissionDecision": "ask"' "$O" && rc=ask
  if [ "$rc" = "$exp" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL exp=$exp rc=$rc [$ag] $cmd :: $(cat "$E")"; fi
}

# not an orchestrator: always allowed
t 0 ""              'hc server stop'
t 0 general-purpose 'herdr'
# quoting: operators inside quotes are text
t 0 hcorc           "echo 'hc kill other; hc rm other'"
t 0 hcorc           'printf "%s" "a | hc attach x"'
# hcorc allowed
t 0 hcorc 'hc ls'
t 0 hcorc 'hc read --lines 50 kid'
t 0 hcorc 'hc wait --children any --timeout 540'
t 0 hcorc 'hc kill kid; hc rm kid'
t 0 hcorc 'hc run --help'
t 0 hcorc 'HC_SESSION=scratch hc server stop'
t 0 hcorc 'herdr pane list'
t 0 "plugin:hcorc" 'hc ls'
# hcorc blocked
t 2 hcorc 'hc'
t 2 hcorc 'hc attach kid'
t 2 hcorc 'hc run --bg --name x'
t 2 hcorc 'hc read'
t 2 hcorc 'hc kill other'
t 2 hcorc 'hc ls && hc kill other'
t 2 hcorc $'hc ls\nhc rm other'
t 2 hcorc 'hc server stop'
t 2 hcorc 'hc send kid --force y'
t 2 hcorc 'herdr-app do tab.close --id x --confirmed true'
t 2 "plugin:hcorc" 'hc update'
# herdorc allowed
t 0 herdorc 'herdr agent list'
t 0 herdorc 'herdr pane list --workspace w1'
t 0 herdorc 'herdr --help'
t 0 herdorc 'herdr agent prompt gentle-ai-worker "go; then herdr server stop"'
t 0 herdorc 'herdr --session test server stop'
t ask herdorc 'hc server stop'
t ask herdorc 'herdr-app do space.close --id s1'
t 0 herdorc 'hc ls'
# herdorc blocked
t 2 herdorc 'herdr'
t 2 herdorc 'herdr session attach main'
t 2 herdorc 'herdr agent attach x'
t 2 herdorc 'herdr server stop'
t 2 herdorc 'herdr update'
t 2 herdorc 'herdr machine add box'
t 2 herdorc 'herdr workspace close w1'
t 2 herdorc 'herdr pane close w1:p9'
t 2 herdorc 'herdr tab close w1:t1'
t 2 herdorc 'herdr worktree create x --trust-repository'
t 2 herdorc 'herdr integration install claude'
# ownership needs a live pane/tab with the recorded label and terminal: a recorded id
# alone (no herdr answering here) is not enough. tests/test_orc_herdr.sh covers the live case.
t 2 herdorc 'herdr pane close w1:p7'
t 2 herdorc 'herdr tab close w1:t3'

# the other multiplexer: its destructive commands need the user's confirmation
t ask hcorc 'herdr server stop'
t ask hcorc 'herdr pane close w1:p9'
t 0 hcorc 'herdr --session scratch server stop'
t 2 hcorc 'herdr pane list; hc server stop'

# HC_SESSION only exempts hc, the last value wins, and nested shells never inherit it
t ask hcorc 'HC_SESSION=x herdr server stop'
t 2 herdorc 'HC_SESSION=x herdr pane close w1:p9'
t 2 hcorc 'HC_SESSION=x herdr-app do space.close --id s1'
t 2 hcorc "HC_SESSION=x bash -c 'unset HC_SESSION; hc server stop'"
t 2 hcorc "HC_SESSION=x bash -c 'hc server stop'"
t 2 hcorc "HC_SESSION=x HC_SESSION=$HC_SESSION hc server stop"
t 0 hcorc 'env -u HC_SESSION HC_SESSION=x hc server stop' # set again after -u: another session
t 2 hcorc 'HC_SESSION=x env -u HC_SESSION hc server stop'
t 2 hcorc 'HC_SESSION=x env -i hc server stop'
t 2 herdorc 'herdr --session other --session default server stop'
t 0 herdorc 'herdr --session default --session other server stop'
t 2 herdorc 'herdr session stop default'
t 2 herdorc 'herdr session delete main'
t 0 herdorc 'herdr session list'

# redirections are not commands; heredocs are data unless a shell reads them
t 2 hcorc '>/dev/null hc server stop'
t 2 hcorc '2>&1 hc update'
t 0 hcorc 'hc read kid 2>&1'
t 0 hcorc 'hc kill kid >/dev/null'
t 0 hcorc 'hc kill kid 2>/dev/null; hc rm kid &>/dev/null'
t 2 hcorc 'hc read 2>&1'
t 0 hcorc $'cat > notes.md <<\'EOF\'\nhc server stop is the user\'s call\nEOF'
t 2 hcorc $'bash <<EOF\nhc server stop\nEOF'
t 2 hcorc $'echo "it\'s"\nhc server stop'
t 0 hcorc 'command -v hc'
t 0 hcorc 'hc wait --children=any --timeout 540'

# session exemption: only a literal session other than the current one
t 0 herdorc 'herdr --session=scratch server stop'
t 2 herdorc 'herdr --session=default server stop'
t 2 herdorc 'herdr --session default pane close w1:p9'
HERDR_SESSION=work t 2 herdorc 'herdr --session work server stop'
HERDR_SESSION=work t 2 herdorc 'herdr --session=work server stop'
HERDR_SESSION=work t 0 herdorc 'herdr --session test server stop'
t 2 herdorc 'herdr --session "$HERDR_SESSION" server stop'
t 2 hcorc "HC_SESSION=$HC_SESSION hc server stop"
t 2 hcorc 'HC_SESSION=$HC_SESSION hc server stop'
HC_SESSION= t 2 hcorc 'HC_SESSION=default hc server stop'
HC_SESSION= t 2 hcorc 'HC_SESSION= hc server stop'

# wrappers, subshells, nested shells and substitutions
t 2 hcorc "bash -c 'hc server stop'"
t 2 hcorc "sh -lc 'hc update'"
t 2 hcorc '(hc server stop)'
t 2 hcorc 'nohup hc server stop'
t 2 hcorc 'env -i hc server stop'
t 2 hcorc 'env -u FOO PATH=/x hc server stop'
t 2 hcorc "env -S 'hc server stop'"
t 2 hcorc 'timeout 5s hc server stop'
t 2 hcorc 'timeout -s KILL 10 hc update'
t 2 hcorc 'sudo -u me hc update'
t 2 hcorc 'xargs -n1 hc kill'
t 2 hcorc 'echo "$(hc server stop)"'
t 2 hcorc 'echo `hc update`'
t 2 hcorc 'eval hc server stop'
t 2 hcorc 'if true; then hc update; fi'
t 2 herdorc "bash -c 'herdr server stop'"
t 0 hcorc 'timeout 30 hc read kid --lines 20'
t 0 hcorc 'grep -rn hc README.md'

# heredocs and comments: a quoted `<<` or a comment hides no later line, and a
# heredoc read by a shell later in the line is checked
t 2 hcorc $'echo "a <<X"\nhc server stop'
t 2 hcorc $'cd /tmp && bash <<EOF\nhc server stop\nEOF'
t 0 hcorc $'cat <<\'EOF\' > notes.md\nhc server stop\nEOF'
t 2 hcorc $'echo hi # a note\nhc server stop'
t 2 hcorc $'echo "# not a comment"; hc server stop'
t 0 hcorc 'echo done # hc server stop'

# closing a tab needs verified panes: a failed `pane list` is no empty tab
STUB=$(mktemp -d)
cat > "$STUB/herdr" <<'SH'
#!/bin/sh
case "$1 $2" in
  "pane list") [ "${STUB_PANES:-}" = fail ] && exit 1
    echo '{"result":{"panes":[{"pane_id":"w1:p7","tab_id":"w1:t3","label":"gentle-ai-worker","terminal_id":"term7"}]}}' ;;
  "tab list") echo '{"result":{"tabs":[{"tab_id":"w1:t3","label":"herdorc · roles"}]}}' ;;
  *) exit 1 ;;
esac
SH
chmod +x "$STUB/herdr"
PATH="$STUB:$PATH" t 0 herdorc 'herdr tab close w1:t3'
PATH="$STUB:$PATH" STUB_PANES=fail t 2 herdorc 'herdr tab close w1:t3'
rm -rf "$STUB"

# internal subagents of an orchestrator session follow its rules
CLAUDE_CODE_AGENT=hcorc t 2 gentle-ai-worker 'hc server stop'
CLAUDE_CODE_AGENT=herdorc t 2 gentle-ai-verify 'herdr server stop'
CLAUDE_CODE_AGENT=hcorc t 0 gentle-ai-worker 'hc ls'

echo "guard: pass=$pass fail=$fail"
hc kill kid >/dev/null 2>&1; hc kill other >/dev/null 2>&1; hc kill boss >/dev/null 2>&1
hc server stop >/dev/null 2>&1
rm -f "$E" "$O" "$STATE"
[ "$fail" = 0 ]

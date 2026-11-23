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

# Every CLI's hook format. Outside Claude Code no variable names the agent:
# `orc.py --as <agent>` records the CLI session it runs in, and the guard that
# same CLI starts looks it up. A perl process stands in for the CLI, in a
# throwaway HOME (leads.json lives there).
FAKE=$(mktemp -d)
cat > "$FAKE/cli.pl" <<'PL'
# fake-cli.pl <record: 0|1> <format>[:<input shape>] <command>: prints the guard's rc, then its output.
my ($record, $spec, $cmd) = @ARGV;
my ($fmt, $shape) = split /:/, $spec; $shape //= $fmt;
system("python3", "shared/bin/orc.py", "--as", "herdorc", "skills", "--json") if $record;
my $j = sub { my $s = shift; $s =~ s/(["\\])/\\$1/g; $s =~ s/\n/\\n/g; "\"$s\"" };
my $in = $shape eq "agy" ? '{"toolCall":{"name":"run_command","args":{"CommandLine":' . $j->($cmd) . '}}}'
       : ($shape eq "pi" && $ENV{PI_IN}) ? '{"command":' . $j->($cmd) . ',"session_id":' . $j->($ENV{PI_IN}) . '}'
       : ($shape eq "cursor" || $shape eq "opencode" || $shape eq "pi") ? '{"command":' . $j->($cmd) . '}'
       : $shape eq "grokcut" ? '{"hook_event_name":"PreToolUse","toolName":"run_terminal_command","toolInput":' . $j->('{"command":"' . $cmd . ' [truncated]') . ',"toolInputTruncated":true}'
       : $shape eq "grok" ? '{"hook_event_name":"PreToolUse","toolName":"run_terminal_command","toolInput":{"command":' . $j->($cmd) . '},"tool_name":"run_terminal_command","tool_input":{"command":' . $j->($cmd) . '}}'
       : '{"tool_input":{"command":' . $j->($cmd) . '}}';
open(my $p, "|-", "shared/bin/guard.py --format $fmt >$ENV{FAKE}/out 2>&1") or die;
print $p $in; close($p);
print $? >> 8, "\n";
PL
# f <expect> <format> <command> [record]: expect 0 (allowed, no decision), deny, ask
# (agy/cursor JSON) or 2 (codex/opencode refuse; for an ask the text says how to confirm).
f() {
  local exp=$1 fmt=$2 cmd=$3 rec=${4:-1} rc out got
  rc=$(HOME=$FAKE/home FAKE=$FAKE perl "$FAKE/cli.pl" "$rec" "$fmt" "$cmd" 2>/dev/null | tail -1); out=$(cat "$FAKE/out")
  got=$rc
  case "$out" in
    *'"decision": "deny"'*|*'"permission": "deny"'*) got=deny ;;
    *'"force_ask"'*|*'"permission": "ask"'*|*'"decision": "ask"'*) got=ask ;;
  esac
  [ "$rc" = 2 ] && case "$out" in *ORC_CONFIRMED=1*) got=2ask ;; esac
  [ "$got" = 0 ] && [ -n "$out" ] && got="0+output"
  if [ "$got" = "$exp" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL exp=$exp got=$got [$fmt] $cmd :: $out"; fi
}
mkdir -p "$FAKE/home"
f deny     agy      'herdr server stop'
f ask      agy      'hc server stop'
f 0        agy      'herdr pane list'
f deny     cursor   'herdr server stop'
f ask      cursor   'hc server stop'
f 0        cursor   'ls'
f 2        codex    'herdr server stop'
f 2ask     codex    'hc server stop'
f 0        codex    'ORC_CONFIRMED=1 hc server stop'
f 2        codex    'ORC_CONFIRMED=1 herdr server stop'
f 2        opencode 'herdr server stop'
f 2ask     opencode 'hc server stop'
f 0        opencode 'ORC_CONFIRMED=1 hc server stop'
f deny     grok     'herdr server stop'
f ask      grok     'hc server stop'
f 0        grok     'herdr pane list'
f deny     pi       'herdr server stop'
f ask      pi       'hc server stop'
f 0        pi       'ls'
# confirming is for codex/opencode only: a CLI that can ask still asks
f ask      cursor   'ORC_CONFIRMED=1 hc server stop'
f ask      grok     'ORC_CONFIRMED=1 hc server stop'
f ask      pi       'ORC_CONFIRMED=1 hc server stop'
# Grok also runs Claude Code's and Cursor's hook files: their guards stay out of its calls
f 0        claude:grok 'herdr server stop'
f 0        cursor:grok 'herdr server stop'
# Grok cuts an input past 128 KiB to a string: unreadable, so an orchestrator's call is refused
f deny     grok:grokcut 'cat > big.txt <<EOF'
f 0        grok:grokcut 'cat > big.txt <<EOF' 0
# a CLI session that never ran orc.py --as is not the orchestrator
f 0        cursor   'herdr server stop' 0
f 0        codex    'herdr server stop' 0
f 0        grok     'herdr server stop' 0
f 0        pi       'herdr server stop' 0
# pi keeps its process across /new and /resume: orc.py --as records the conversation
# (PI_SESSION_ID), the extension sends the one a call comes from (PI_IN here)
export PI_SESSION_ID=s1 PI_IN=s1; f deny pi 'herdr server stop'
export PI_IN=s2; f 0 pi 'herdr server stop'
unset PI_SESSION_ID PI_IN
HOME=$FAKE/home ORC_LEADS=$FAKE/leads.json python3 -c "
import os, sys; sys.path.insert(0, 'shared/bin'); import orc_state as s
os.environ['PI_SESSION_ID'] = 's1'; s.record_lead('herdorc')
os.environ['PI_SESSION_ID'] = 's2'; s.record_lead('hcorc')
assert [s.lead_of_session(c) for c in ('s1', 's2', 's3', '')] == ['herdorc', 'hcorc', '', 'hcorc']
del os.environ['PI_SESSION_ID']; s.record_lead('herdorc')  # a CLI that names no conversation
assert s.lead_of_session('s3') == 'herdorc'
" && pass=$((pass+1)) || { fail=$((fail+1)); echo "FAIL leads per conversation"; }
# another tool's call (agy) is not a shell command
printf '%s' '{"toolCall":{"name":"view_file","args":{"CommandLine":"herdr server stop"}}}' | HOME=$FAKE/home shared/bin/guard.py --format agy >"$FAKE/out" 2>&1
if [ $? = 0 ] && [ ! -s "$FAKE/out" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL agy view_file"; fi
# the OpenCode plugin passes the session's agent: an orchestrator agent needs no record
printf '%s' '{"command":"herdr server stop","agent_type":"herdorc"}' | HOME=$FAKE/home shared/bin/guard.py --format opencode >/dev/null 2>&1
if [ $? = 2 ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL opencode agent_type"; fi
rm -rf "$FAKE"

echo "guard: pass=$pass fail=$fail"
hc kill kid >/dev/null 2>&1; hc kill other >/dev/null 2>&1; hc kill boss >/dev/null 2>&1
hc server stop >/dev/null 2>&1
rm -f "$E" "$O" "$STATE"
[ "$fail" = 0 ]

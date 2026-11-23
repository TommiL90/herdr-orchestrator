#!/usr/bin/env bash
# orc.py and orc_state.py without a multiplexer: the herdorc state file under
# concurrent writers, and the phase hook. A throwaway HOME, stub hc / herdr /
# herdr-app on PATH; nothing reaches the user's terminals.
#   bash tests/test_runtime.sh
set -u
cd "$(dirname "$0")/.."
# orc.py --as records the calling CLI session as an orchestrator: keep that out of real state.
export ORC_LEADS="$(mktemp)"
REPO=$PWD; ORC=$REPO/shared/bin/orc.py
pass=0; fail=0
check() { if eval "$2"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $1"; fi; }

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
export HOME=$T/home; mkdir -p "$HOME" "$T/bin"
unset CLAUDE_CODE_AGENT HC_TERMINAL_ID HERDR_SESSION HERDR_SOCKET_PATH HERDR_APP_HOME XDG_CONFIG_HOME
for b in hc herdr herdr-app; do
  printf '#!/bin/sh\necho "%s $*" >> "%s/calls"\nexit 1\n' "$b" "$T" > "$T/bin/$b"; chmod +x "$T/bin/$b"
done
export PATH="$T/bin:$PATH"

# 1. 20 writers at once, each recording one pane: none is lost, the file stays JSON.
STATE=$HOME/.local/state/orc/herdorc-default-w1.json
for i in $(seq 1 20); do
  python3 -c "
import sys; sys.path.insert(0, '$REPO/shared/bin'); import orc_state as s
s.update_herdorc_state('$STATE', lambda st: st['panes'].__setitem__('w1:p$i', {'name': 'r$i', 'terminal': 't$i'}))" &
done
wait
check "concurrent writers keep every pane" "python3 -c \"import json;d=json.load(open('$STATE'));assert len(d['panes'])==20,d\""
check "no temp files left behind" "[ -z \"\$(ls -A '$HOME/.local/state/orc' | grep '\\.tmp\$')\" ]"

# 2. herdr's session from the socket path, as orc-flow reads it
check "session from HERDR_SOCKET_PATH" "[ \"\$(HERDR_SOCKET_PATH=/x/sessions/work/herdr.sock python3 -c \"import sys;sys.path.insert(0,'$REPO/shared/bin');import orc_state;print(orc_state.herdr_session())\")\" = work ]"

# 3. the phase hook
hook() { printf '%s' "$1" | env HERDR_ENV=1 HERDR_PANE_ID=w1:p1 HERDR_WORKSPACE_ID=w1 "$ORC" phase --hook; }
PF=$HOME/.local/state/orc/phase-herdorc-default-w1_p1.json
hook '{"agent_type": "herdorc", "agent_id": "a1", "tool_name": "Read", "tool_input": {}}'
check "a subagent's tool call does not change the phase" "[ ! -e '$PF' ]"
hook '["not", "a", "dict"]'
check "non-object hook input is ignored" "[ ! -e '$PF' ]"
hook '{"agent_type": "herdorc", "tool_name": "Read", "tool_input": {}}'
check "the hook works without CLAUDE_CODE_AGENT (agent from the input)" "grep -q 'herdr pane rename w1:p1 herdorc · exploring' '$T/calls' && grep -q exploring '$PF'"
rm -f "$PF"; printf '%s' '{"agent_type": "herdorc", "tool_name": "Read", "tool_input": {}}' | env HERDR_ENV=1 "$ORC" phase --hook
check "a backend that cannot start leaves the phase file alone" "[ ! -e '$PF' ] && ! ls '$HOME/.local/state/orc' | grep -q '^phase-herdorc-default-none'"

# 4. A prune decided from lists read earlier never drops a pane recorded since.
check "a prune keeps entries added or changed after the lists were read" "python3 -c \"
import sys; sys.path.insert(0, '$REPO/shared/bin'); import orc_state as s
before = {'panes': {'w1:p1': {'name': 'a', 'terminal': 't1'}, 'w1:p2': {'name': 'b', 'terminal': 't2'}}, 'tabs': {}}
pruned = {'panes': {'w1:p1': {'name': 'a', 'terminal': 't1'}}, 'tabs': {}}  # p2 gone from the lists
cur = {'panes': dict(before['panes'], **{'w1:p3': {'name': 'c', 'terminal': 't3'}}), 'tabs': {'w1:t9': {'title': 'x'}}}
out = s.apply_prune(cur, before, pruned)
assert set(out['panes']) == {'w1:p1', 'w1:p3'}, out
assert out['tabs'] == {'w1:t9': {'title': 'x'}}, out
cur['panes']['w1:p2'] = {'name': 'b', 'terminal': 'tNEW'}  # rewritten meanwhile: not ours to judge
assert 'w1:p2' in s.apply_prune(cur, before, pruned)['panes']
\""

# 5. A named session given only by its socket path names the phase file too.
check "phase file follows the session in HERDR_SOCKET_PATH" "env -u HERDR_SESSION HERDR_SOCKET_PATH=/x/sessions/work/herdr.sock HERDR_PANE_ID=w1:p4 python3 -c \"
import sys; sys.path.insert(0, '$REPO/shared/bin'); import orc
assert orc._phase_file('herdorc').name == 'phase-herdorc-work-w1_p4.json', orc._phase_file('herdorc')
\""

# 6. a tab is ours only when herdr shows at least one pane in it, all of them ours
check "a tab with no pane in the list is not owned" "python3 -c \"
import sys; sys.path.insert(0, '$REPO/shared/bin'); import orc_state as s
st = {'panes': {'w1:p2': {'name': 'r', 'terminal': 't2'}}, 'tabs': {'w1:t2': {'title': 'herdorc · r'}, 'w1:t3': {'title': 'herdorc · x'}}}
panes = [{'pane_id': 'w1:p2', 'tab_id': 'w1:t2', 'label': 'r', 'terminal_id': 't2'}]
tabs = [{'tab_id': 'w1:t2', 'label': 'herdorc · r'}, {'tab_id': 'w1:t3', 'label': 'herdorc · x'}]
_, owned, _ = s.herdr_owned(st, panes, tabs); assert owned == {'w1:t2'}, owned\""
check "the first format's workspace file is never adopted" "python3 -c \"
import os, sys; sys.path.insert(0, '$REPO/shared/bin'); import orc_state as s
assert not hasattr(s, 'adopt_legacy_state')
assert s.herdorc_state_path('default', 'w1', 'w1:p1').name == 'herdorc-default-w1.pane-w1_p1.json'\""

# 7. `orc.py flow`: the graph opens beside the orchestrator's own pane, not the focused one.
F=$T/flowbin; mkdir -p "$F"
cat > "$F/herdr" <<SH
#!/bin/sh
echo "herdr \$*" >> "$T/flow-calls"
case "\$1 \$2" in
  "plugin list") [ -n "\${NO_PLUGIN:-}" ] && { echo '{"result":{"plugins":[]}}'; exit 0; }
    echo '{"result":{"plugins":[{"plugin_id":"orc-flow","enabled":true,"plugin_root":"/p/orc-flow"}]}}' ;;
  "plugin pane") echo '{"result":{}}' ;;
  *) exit 1 ;;
esac
SH
cat > "$F/herdr-app" <<SH
#!/bin/sh
echo "herdr-app \$*" >> "$T/flow-calls"
case "\$1" in
  ls) echo '{"spaces":[{"id":"sp1","tabs":[{"id":"tb1","terminals":[{"terminal":"t9","pane":"p9"},{"terminal":"t7","pane":"p7"}]}]}]}' ;;
  do) echo '{}' ;;
esac
SH
cat > "$F/hc" <<SH
#!/bin/sh
echo '{}'
SH
chmod +x "$F"/*
FL() { PATH="$F:$PATH" "$@"; }
FL env HERDR_ENV=1 HERDR_PANE_ID=w1:p3 HERDR_WORKSPACE_ID=w1 "$ORC" --as herdorc flow > "$T/flow-out"
check "herdorc flow: orc-flow split right of its own pane, focus kept" "grep -q '\"opened\": true' '$T/flow-out' && grep -q -- 'plugin pane open --plugin orc-flow --entrypoint graph --placement split --direction right --target-pane w1:p3 --cwd /p/orc-flow --env ORC_FLOW_PLACEMENT=split --env ORC_FLOW_ORIGIN=w1:p3 --no-focus' '$T/flow-calls'"
check "herdorc flow without the plugin says how to install it" "! FL env NO_PLUGIN=1 HERDR_ENV=1 HERDR_PANE_ID=w1:p3 HERDR_WORKSPACE_ID=w1 '$ORC' --as herdorc flow > '$T/flow-out' && grep -q 'installers/herdr.sh' '$T/flow-out'"
: > "$T/flow-calls"
check "hcorc flow without the agent-flow mod says how to install it" "! FL env HC_TERMINAL_ID=t7 HERDR_APP_HOME='$T/app' '$ORC' --as hcorc flow > '$T/flow-out' && grep -q 'herdr-app-extras.sh --only agent-flow' '$T/flow-out' && ! grep -q 'pane.split' '$T/flow-calls'"
mkdir -p "$T/app/mods/agent-flow"
FL env HC_TERMINAL_ID=t7 HERDR_APP_HOME="$T/app" "$ORC" --as hcorc flow > "$T/flow-out"
check "hcorc flow: agent-flow split right of its own pane" "grep -q '\"opened\": true' '$T/flow-out' && grep -q -- 'herdr-app do pane.split --direction right --pane p7 --mod agent-flow' '$T/flow-calls'"

# 8. hcorc's phase: with orc-panes it goes in the orc.phase label its pane header
# shows (the pane keeps the name it was given); without it, on a herdr-app with
# pane.rename, it is the pane's name; with neither, nothing shows.
: > "$T/calls"
printf '%s' '{"agent_type": "hcorc", "tool_name": "Read", "tool_input": {}}' | env HC_TERMINAL_ID=t7 HERDR_APP_HOME="$T/app2" "$ORC" phase --hook
check "hcorc phase without orc-panes labels nothing" "! grep -q 'hc label' '$T/calls'"
mkdir -p "$T/app2/mods/orc-panes"; rm -f "$HOME/.local/state/orc/phase-hcorc-t7.json"
printf '%s' '{"agent_type": "hcorc", "tool_name": "Read", "tool_input": {}}' | env HC_TERMINAL_ID=t7 HERDR_APP_HOME="$T/app2" "$ORC" phase --hook
check "hcorc phase goes in the orc.phase label with orc-panes" "grep -q 'hc label t7 orc.phase=hcorc · exploring' '$T/calls'"
env HC_TERMINAL_ID=t7 HERDR_APP_HOME="$T/app2" "$ORC" --as hcorc phase clear >/dev/null
check "phase clear removes the label" "grep -q 'hc label t7 orc.phase=\$' '$T/calls'"
check "status names the pane header as the indicator" "env HC_TERMINAL_ID=t7 HERDR_APP_HOME='$T/app2' python3 -c \"
import sys; sys.path.insert(0, '$REPO/shared/bin'); import orc
assert orc.HcBackend().phase_surface() == 'pane header'\""
RN=$T/rename-bin; mkdir -p "$RN"
cat > "$RN/herdr-app" <<SH
#!/bin/sh
echo "herdr-app \$*" >> "$T/calls"
case "\$1" in
  commands) echo '[{"name":"pane.rename"},{"name":"pane.split"}]' ;;
  ls) echo '{"spaces":[{"id":"sp1","tabs":[{"id":"tb1","terminals":[{"terminal":"t9","pane":"p9"},{"terminal":"t7","pane":"p7"}]}]}]}' ;;
  do) echo '{}' ;;
esac
SH
chmod +x "$RN/herdr-app"; RN() { PATH="$RN:$PATH" "$@"; }
: > "$T/calls"; rm -f "$HOME/.local/state/orc/phase-hcorc-t7.json"
printf '%s' '{"agent_type": "hcorc", "tool_name": "Read", "tool_input": {}}' | RN env HC_TERMINAL_ID=t7 HERDR_APP_HOME="$T/app2" "$ORC" phase --hook
check "with orc-panes the phase stays a label, the pane name is left alone" "grep -q 'hc label t7 orc.phase=hcorc · exploring' '$T/calls' && ! grep -q 'pane.rename' '$T/calls'"
: > "$T/calls"; rm -f "$HOME/.local/state/orc/phase-hcorc-t7.json"
printf '%s' '{"agent_type": "hcorc", "tool_name": "Read", "tool_input": {}}' | RN env HC_TERMINAL_ID=t7 HERDR_APP_HOME="$T/app" "$ORC" phase --hook
check "without orc-panes the phase is the pane name (herdr-app 0.1.17+)" "grep -q 'herdr-app do pane.rename --pane p7 --name hcorc · exploring' '$T/calls' && ! grep -q 'hc label' '$T/calls'"
RN env HC_TERMINAL_ID=t7 HERDR_APP_HOME="$T/app" "$ORC" --as hcorc phase clear >/dev/null
check "phase clear unnames the pane" "grep -q 'herdr-app do pane.rename --pane p7 --name \$' '$T/calls'"
: > "$T/calls"
check "created role panes get their role as Herdr pane name" "RN env HC_TERMINAL_ID=t7 python3 -c \"
import sys; sys.path.insert(0, '$REPO/shared/bin'); import orc
b = orc.HcBackend.__new__(orc.HcBackend)
b.name_panes([{'name': 'gentle-ai-worker', 'address': 't9'}, {'name': 'x', 'error': 'no'}])\" && grep -q 'herdr-app do pane.rename --pane p9 --name gentle-ai-worker' '$T/calls' && [ \$(grep -c 'pane.rename' '$T/calls') = 1 ]"

echo "runtime: pass=$pass fail=$fail"
[ "$fail" = 0 ]

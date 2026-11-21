#!/usr/bin/env bash
# Integration test for shared/bin/orc.py (herdorc backend) and the herdorc
# guard rules against a REAL herdr server, isolated from the user's sessions:
# a named herdr session (orc-test) whose TUI runs inside an isolated
# herdr-core session (HC_SESSION=orc-herdr-test). Both are stopped at the end.
#   bash tests/test_orc_herdr.sh             # layout, roles, ownership, phase
#   bash tests/test_orc_herdr.sh --agent     # also launch claude (haiku) via ensure
set -u
cd "$(dirname "$0")/.."
ORC=shared/bin/orc.py
WITH_AGENT=${1:-}
pass=0; fail=0
check() { if eval "$2"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $1"; fi; }
j() { python3 -c "import json,sys; d=json.load(sys.stdin); $1"; }

export HC_SESSION=orc-herdr-test
SESSION=orc-test-$$
hc run --bg --no-notify --name herdr-tui -- herdr --session $SESSION >/dev/null
cleanup() {
  herdr session stop $SESSION >/dev/null 2>&1; herdr session delete $SESSION >/dev/null 2>&1
  hc kill herdr-tui >/dev/null 2>&1; hc server stop >/dev/null 2>&1
  rm -f ~/.local/state/orc/herdorc-$SESSION-* ~/.local/state/orc/phase-herdorc-$SESSION-*
}
trap cleanup EXIT
for _ in $(seq 1 20); do herdr --session $SESSION pane list >/dev/null 2>&1 && break; sleep 0.5; done

# The caller context herdr injects into a pane (verified to target only this session).
export HERDR_ENV=1 HERDR_SESSION=$SESSION HERDR_WORKSPACE_ID=w1 HERDR_TAB_ID=w1:t1 HERDR_PANE_ID=w1:p1
export HERDR_SOCKET_PATH="$HOME/.config/herdr/sessions/$SESSION/herdr.sock"
export CLAUDE_CODE_AGENT=herdorc
layout() { herdr pane list --workspace w1 | j '
by={}
for p in d["result"]["panes"]: by.setdefault(p["tab_id"],[]).append(p.get("label") or "-")
print(by)'; }
tablabels() { herdr tab list --workspace w1 | j 'print([t.get("label") for t in d["result"]["tabs"]])'; }

# 1. panes core -> 2 tabs: explore+worker, verify
P=$($ORC panes core)
check "panes created 3" "[ \"\$(echo '$P' | j 'print(len([c for c in d[\"created\"] if \"error\" not in c]))')\" = 3 ]"
echo "layout: $(layout)"; echo "tabs: $(tablabels)"
check "tab labels" "tablabels | grep -q 'herdorc · explore + worker' && tablabels | grep -q 'herdorc · verify'"
check "explore+worker share a tab" "layout | grep -q \"'gentle-ai-explore', 'gentle-ai-worker'\""

# 2. rerun reuses everything
P2=$($ORC panes core)
check "rerun reuses 3, creates 0" "[ \"\$(echo '$P2' | j 'print(len(d[\"reused\"]), len(d[\"created\"]))')\" = '3 0' ]"

# 3. role lookup
check "role lookup: mine, no agent" "$ORC role gentle-ai-worker | j 'p=d[\"panes\"][0]; assert p[\"mine\"] and not p[\"has_agent\"], p'"

# 4. ensure -> worker-2 split into the tab that has room (verify's)
E=$($ORC ensure gentle-ai-worker)
check "ensure names worker-2" "echo '$E' | grep -q '\"name\": \"gentle-ai-worker-2\"'"
check "worker-2 joined verify tab" "layout | grep -q \"'gentle-ai-verify', 'gentle-ai-worker-2'\""

# 5. a role name taken by a pane that is not ours
FOREIGN=$(herdr pane split w1:p1 --direction down --no-focus | j 'print(d["result"]["pane"]["pane_id"])')
herdr pane rename "$FOREIGN" jd-judge-a >/dev/null
J=$($ORC panes judges)
check "foreign judge-a reported, judge-b created" "echo '$J' | j 'assert [t[\"name\"] for t in d[\"taken_by_others\"]]==[\"jd-judge-a\"] and [c[\"name\"] for c in d[\"created\"]]==[\"jd-judge-b\"], d'"

# 6. guard ownership with the real state file
MINE=$($ORC role gentle-ai-verify | j 'print(d["panes"][0]["address"])')
g() { printf '%s' "$1" | python3 -c 'import json,sys;print(json.dumps({"agent_type":"herdorc","tool_input":{"command":sys.stdin.read()}}))' | shared/bin/guard.py 2>/dev/null; echo $?; }
check "guard allows closing my pane" "[ \"\$(g 'herdr pane close $MINE')\" = 0 ]"
check "guard blocks closing a foreign pane" "[ \"\$(g 'herdr pane close $FOREIGN')\" = 2 ]"
check "guard blocks closing the caller pane" "[ \"\$(g 'herdr pane close w1:p1')\" = 2 ]"

# 6b. ownership is verified against the live pane, not just recorded
STATE=~/.local/state/orc/herdorc-$SESSION-w1.json
check "state records terminal ids" "python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert d[\"panes\"] and all(v.get(\"terminal\") for v in d[\"panes\"].values()), d' $STATE"
VTAB=$($ORC role gentle-ai-verify | j 'print(d["panes"][0]["tab"])')
check "guard allows closing my tab" "[ \"\$(g 'herdr tab close $VTAB')\" = 0 ]"
W2=$($ORC role gentle-ai-worker | j 'print([p["address"] for p in d["panes"] if p["name"]=="gentle-ai-worker-2"][0])')
herdr pane rename "$W2" someone-else >/dev/null
check "relabelled pane: guard blocks closing it" "[ \"\$(g 'herdr pane close $W2')\" = 2 ]"
check "relabelled pane: its tab is no longer closable" "[ \"\$(g 'herdr tab close $VTAB')\" = 2 ]"
$ORC status >/dev/null
check "relabelled pane pruned from the state file" "! grep -q '\"$W2\"' $STATE"

# 6c. bad input stops before anything is created
NPANES() { herdr pane list --workspace w1 | j 'print(len(d["result"]["panes"]))'; }
BEFORE=$(NPANES); $ORC ensure gentle-ai-explore --launch cursor >/dev/null 2>&1; RC=$?; AFTER=$(NPANES)
check "unknown harness: exits, no pane created" "[ $RC != 0 ] && [ $BEFORE = $AFTER ]"
$ORC panes jugdes >/dev/null 2>&1; RC=$?; AFTER2=$(NPANES)
check "unknown role: rejected, no pane created" "[ $RC != 0 ] && [ $BEFORE = $AFTER2 ]"

# 7. phase indicator on the orchestrator's pane label, restored on clear
label() { herdr pane get w1:p1 | j 'print(d["result"]["pane"].get("label") or "")'; }
$ORC phase researching >/dev/null
check "label shows explicit phase" "[ \"\$(label)\" = 'herdorc · researching' ]"
echo '{"agent_type":"herdorc","tool_name":"Read","tool_input":{"file_path":"/x"}}' | $ORC phase --hook
check "explicit survives inferred exploring" "[ \"\$(label)\" = 'herdorc · researching' ]"
echo '{"agent_type":"herdorc","tool_name":"Edit","tool_input":{"file_path":"/x/y.py"}}' | $ORC phase --hook
check "strong inferred replaces explicit" "[ \"\$(label)\" = 'herdorc · implementing' ]"
$ORC phase clear >/dev/null
check "clear returns the pane to herdr's automatic label" "! label | grep -q '^herdorc'"
check "status: indicator active" "$ORC status | grep -q 'phase indicator: active (pane label)'"
check "--as herdorc works without CLAUDE_CODE_AGENT (other CLIs)" "env -u CLAUDE_CODE_AGENT $ORC --as herdorc status | grep -q 'phase indicator: active'"
check "no agent and no --as is refused" "! env -u CLAUDE_CODE_AGENT $ORC status >/dev/null 2>&1"

# 8. optional: a real CLI through ensure (agent start + pointer prompt + report file)
if [ "$WITH_AGENT" = "--agent" ]; then
  R=~/.local/state/orc/reports; mkdir -p $R/handoffs
  H=$R/handoffs/orc-test-ping.md
  printf 'Task: write the single word PONG to %s/orc-test-ping.md, then reply with one line: "PONG %s/orc-test-ping.md". Do nothing else.\n' "$R" "$R" > $H
  rm -f $R/orc-test-ping.md
  A=$($ORC ensure gentle-ai-explore --launch claude --model haiku --handoff $H)
  echo "$A" | head -20
  check "agent started" "echo '$A' | j 'assert d.get(\"started\"), d'"
  check "pointer prompt sent" "echo '$A' | j 'assert d.get(\"prompt_sent\"), d'"
  NAME=$(echo "$A" | j 'print(d["name"])')
  herdr agent wait "$NAME" --timeout 240000 >/dev/null 2>&1
  echo "agent status: $(herdr agent get "$NAME" | j 'print(d["result"]["agent"]["agent_status"])')"
  for _ in $(seq 1 30); do [ -s $R/orc-test-ping.md ] && break; sleep 2; done
  check "report file written by the role agent" "grep -q PONG $R/orc-test-ping.md 2>/dev/null"
  herdr agent read "$NAME" --source recent-unwrapped --lines 40 | tail -c 1500
  rm -f $H $R/orc-test-ping.md
fi

echo "orc(herdr): pass=$pass fail=$fail"
[ "$fail" = 0 ]

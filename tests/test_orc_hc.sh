#!/usr/bin/env bash
# Integration test for shared/bin/orc.py (hcorc backend) against the real
# herdr-app window: Herdr desktop has no isolated session to test in. It creates
# a temporary space WITHOUT moving focus, treats that space's root terminal as
# the orchestrator, and closes the space at the end (its children end with it).
# It only ever stops terminals it created, by the address hc gave it, and removes
# the phase file it wrote. No agent CLI is launched.
set -u
cd "$(dirname "$0")/.."
# orc.py --as records the calling CLI session as an orchestrator: keep that out of real state.
export ORC_LEADS="$(mktemp)"
ORC=shared/bin/orc.py
pass=0; fail=0
check() { if eval "$2"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $1"; fi; }

out=$(herdr-app do space.new --name orc-test --focus false)
SP=$(echo "$out" | python3 -c 'import json,sys;print(json.load(sys.stdin)["space"])')
ROOT=$(echo "$out" | python3 -c 'import json,sys;print(json.load(sys.stdin)["terminal"])')
export HC_TERMINAL_ID=$ROOT CLAUDE_CODE_AGENT=hcorc
FOREIGN=
cleanup() {
  [ -n "$FOREIGN" ] && { hc kill "$FOREIGN" >/dev/null 2>&1; hc rm "$FOREIGN" >/dev/null 2>&1; }
  herdr-app do space.close --id "$SP" --confirmed true >/dev/null 2>&1
  rm -f ~/.local/state/orc/phase-hcorc-"$ROOT".json
}
trap cleanup EXIT
sleep 1

# 1. panes core: 3 roles -> 2 tabs (2 + 1)
P=$($ORC panes core)
check "panes created 3" "[ \"\$(echo '$P' | python3 -c 'import json,sys;print(len([c for c in json.load(sys.stdin)[\"created\"] if \"error\" not in c]))')\" = 3 ]"
sleep 1
TABS=$(herdr-app ls | python3 -c "
import json,sys
for s in json.load(sys.stdin)['spaces']:
    if s['id']=='$SP':
        for tb in s['tabs']: print(tb['name'], '|', ','.join(t['name'] or t['terminal'] for t in tb['terminals']))
")
echo "$TABS"
check "tab with explore+worker" "echo \"\$TABS\" | grep -q 'gentle-ai-explore' && echo \"\$TABS\" | grep -q 'hcorc · explore + worker'"
check "tab with verify alone" "echo \"\$TABS\" | grep -q 'hcorc · verify | gentle-ai-verify'"

# 2. second run reuses, creates nothing
P2=$($ORC panes core)
check "rerun reuses 3" "[ \"\$(echo '$P2' | python3 -c 'import json,sys;d=json.load(sys.stdin);print(len(d[\"reused\"]), len(d[\"created\"]))')\" = '3 0' ]"

# 3. role lookup
R=$($ORC role gentle-ai-worker)
check "role lookup mine, no agent" "echo '$R' | python3 -c 'import json,sys;p=json.load(sys.stdin)[\"panes\"][0];assert p[\"mine\"] and not p[\"has_agent\"]'"

# 4. ensure on an existing role -> <role>-2, placed in the tab that has room
E=$($ORC ensure gentle-ai-worker)
check "ensure names worker-2" "echo '$E' | grep -q '\"name\": \"gentle-ai-worker-2\"'"
sleep 1
check "worker-2 joined verify tab" "herdr-app ls | python3 -c \"
import json,sys
for s in json.load(sys.stdin)['spaces']:
    if s['id']=='$SP':
        names=[[t['name'] for t in tb['terminals']] for tb in s['tabs']]
        assert any(set(n)=={'gentle-ai-verify','gentle-ai-worker-2'} for n in names), names
\""

# 4b. bad input stops before anything is created
nkids() { hc ls --json | python3 -c "import json,sys;print(sum(1 for t in json.load(sys.stdin)['terminals'] if t.get('parent')=='$ROOT'))"; }
BEFORE=$(nkids); $ORC ensure gentle-ai-explore --launch cursor >/dev/null 2>&1; RC=$?
check "unknown harness: exits, no terminal created" "[ $RC != 0 ] && [ $BEFORE = \$(nkids) ]"
$ORC panes jugdes >/dev/null 2>&1; RC=$?
check "unknown role: rejected, no terminal created" "[ $RC != 0 ] && [ $BEFORE = \$(nkids) ]"

# 5. a name taken by a terminal that is not ours -> reported, not reused
#    Skipped when the user already has a jd-judge-a: the test must not touch it.
if hc ls --json | python3 -c "import json,sys;sys.exit(any(t.get('name','').startswith('jd-judge') for t in json.load(sys.stdin)['terminals']))"; then
  FOREIGN=$(hc run --bg --json --no-parent --no-notify --name jd-judge-a -- sleep 120 | python3 -c 'import json,sys;print(json.load(sys.stdin)["address"])')
  J=$($ORC panes judges)
  check "foreign judge-a reported as taken" "echo '$J' | python3 -c 'import json,sys;d=json.load(sys.stdin);assert [t[\"name\"] for t in d[\"taken_by_others\"]]==[\"jd-judge-a\"] and [c[\"name\"] for c in d[\"created\"]]==[\"jd-judge-b\"], d'"
  hc kill "$FOREIGN" >/dev/null; hc rm "$FOREIGN" >/dev/null; FOREIGN=
else
  echo "skip: a jd-judge terminal of yours exists; not testing names taken by others"
fi

# 6. phase: explicit survives a weaker inferred phase, a strong one replaces it.
#    herdr-app without pane.rename shows nothing and leaves the layout alone.
own_tab_name() { herdr-app ls | python3 -c "
import json,sys
for s in json.load(sys.stdin)['spaces']:
    for tb in s['tabs']:
        if any(t['terminal']=='$ROOT' for t in tb['terminals']): print(tb['name'])"; }
BEFORE=$(own_tab_name)
$ORC phase researching >/dev/null
echo '{"agent_type":"hcorc","tool_name":"Read","tool_input":{"file_path":"/x"}}' | $ORC phase --hook
check "explicit survives inferred exploring" "grep -q researching ~/.local/state/orc/phase-hcorc-$ROOT.json"
echo '{"agent_type":"hcorc","tool_name":"Edit","tool_input":{"file_path":"/x/y.py"}}' | $ORC phase --hook
check "strong inferred replaces explicit" "grep -q implementing ~/.local/state/orc/phase-hcorc-$ROOT.json"
$ORC phase clear >/dev/null
check "tab name untouched by phase" "[ \"\$(own_tab_name)\" = '$BEFORE' ]"
if herdr-app commands | grep -q '"pane.rename"'; then
  check "status: indicator active" "$ORC status | grep -q 'phase indicator: active (pane name)'"
else  # without pane.rename the orc-panes mod shows it: an app home of the test's own, with and without it
  APPHOME=$(mktemp -d)
  check "status: indicator inactive without orc-panes" "HERDR_APP_HOME=$APPHOME $ORC status | grep -q 'phase indicator: inactive'"
  mkdir -p "$APPHOME/mods/orc-panes"
  check "status: indicator in the pane header with orc-panes" "HERDR_APP_HOME=$APPHOME $ORC status | grep -q 'phase indicator: active (pane header)'"
  rm -rf "$APPHOME"
fi
rm -f ~/.local/state/orc/phase-hcorc-$ROOT.json

# 7. status runs
$ORC status | head -8

echo "orc(hc): pass=$pass fail=$fail"
[ "$fail" = 0 ]

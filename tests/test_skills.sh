#!/usr/bin/env bash
# orc.py skills: same-name conflicts between project/user skills and the
# orchestrator's copies, in a throwaway HOME and project.
#   bash tests/test_skills.sh
set -u
cd "$(dirname "$0")/.."
ORC=$PWD/shared/bin/orc.py
pass=0; fail=0
check() { if eval "$2"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $1"; fi; }
j() { python3 -c "import json,sys; d=json.load(sys.stdin); $1"; }
mk() { mkdir -p "$1"; printf -- '---\nname: %s\ndescription: x\n---\nbody\n' "$2" > "$1/SKILL.md"; }

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
export HOME=$T/home; unset XDG_CONFIG_HOME CODEX_HOME
mkdir -p "$T/proj" && cd "$T/proj" && git init -q

check "no conflicts reported" "$ORC skills | grep -q 'no same-name conflicts'"

mk "$HOME/.agents/skills/testing" testing
mk "$HOME/.claude/skills/consensus" consensus
mk "$T/proj/.claude/skills/testing" testing
mk "$T/proj/.opencode/skills/review" requesting-code-review   # same name, other folder
mk "$T/proj/.claude/skills/unrelated" unrelated
mkdir -p "$HOME/.gemini/config" && ln -s "$HOME/.agents/skills" "$HOME/.gemini/config/skills"
mkdir -p "$T/proj/.claude/skills/delivery" && touch "$T/proj/.claude/skills/delivery/.orc-generated" && mk "$T/proj/.claude/skills/delivery" delivery

S=$($ORC skills --json)
check "project copy wins over user and orchestrator" "echo '$S' | j 'c={x[\"skill\"]:x for x in d[\"conflicts\"]}[\"testing\"]; assert c[\"use\"][\"scope\"]==\"project\" and [s[\"scope\"] for s in c[\"shadows\"]]==[\"user\",\"orchestrator\"], c'"
check "user copy wins over orchestrator" "echo '$S' | j 'c={x[\"skill\"]:x for x in d[\"conflicts\"]}[\"consensus\"]; assert c[\"use\"][\"scope\"]==\"user\", c'"
check "matched by frontmatter name, not folder" "echo '$S' | j 'assert \"requesting-code-review\" in [x[\"skill\"] for x in d[\"conflicts\"]]'"
check "symlinked dirs counted once" "echo '$S' | j 'c={x[\"skill\"]:x for x in d[\"conflicts\"]}[\"testing\"]; assert len(c[\"shadows\"])==2, c'"
check "old generated copies ignored, unrelated skills ignored" "echo '$S' | j 'n=[x[\"skill\"] for x in d[\"conflicts\"]]; assert \"delivery\" not in n and \"unrelated\" not in n, n'"
check "--json lists every skill once per copy, winner marked" "echo '$S' | j 'r=[x for x in d[\"skills\"] if x[\"name\"]==\"testing\"]; assert [(x[\"scope\"],x[\"used\"]) for x in r]==[(\"project\",True),(\"user\",False),(\"orchestrator\",False)], r; assert any(x[\"name\"]==\"unrelated\" and x[\"used\"] for x in d[\"skills\"])'"
check "text output names the winner" "$ORC skills | grep -q -- '- testing: uses project'"

echo "skills: pass=$pass fail=$fail"
[ "$fail" = 0 ]

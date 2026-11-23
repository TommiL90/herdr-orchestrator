#!/usr/bin/env bash
# orc.py skills: same-name conflicts between project/user skills and the
# orchestrator's copies, in a throwaway HOME and project.
#   bash tests/test_skills.sh
set -u
cd "$(dirname "$0")/.."
# orc.py --as records the calling CLI session as an orchestrator: keep that out of real state.
export ORC_LEADS="$(mktemp)"
ORC=$PWD/shared/bin/orc.py
pass=0; fail=0
check() { if eval "$2"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $1"; fi; }
j() { python3 -c "import json,sys; d=json.load(sys.stdin); $1"; }
mk() { mkdir -p "$1"; printf -- '---\nname: %s\ndescription: x\n---\nbody\n' "$2" > "$1/SKILL.md"; }

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
# Every location install.py reads from the environment, so nothing outside $T is touched.
export HOME=$T/home; unset XDG_CONFIG_HOME CODEX_HOME GROK_HOME PI_CODING_AGENT_DIR HERDR_APP_HOME
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

# the home folder is not a project: a terminal that starts there sees user skills
H=$(cd "$HOME" && $ORC skills --json)
check "cwd = HOME: ~/.claude/skills counts as user, not project" "echo '$H' | j 'r=[x for x in d[\"skills\"] if x[\"name\"]==\"consensus\"]; assert r and all(x[\"scope\"]!=\"project\" for x in r), r'"
# The Skills panel's toasts: a project copy that shadows the user's and the orchestrator's
# keeps their global signature, so coming back from that project repeats no toast.
R=${ORC%/shared/bin/orc.py}
check "skills toasts: one global signature, under a project copy too" "node --input-type=module -e '
  const { unseen } = await import(process.argv[1]);
  const [p, h] = [JSON.parse(process.argv[2]), JSON.parse(process.argv[3])];
  const seen = {}, n = (d) => unseen(seen, d.project, d.conflicts).length;
  const got = [n(p), n(h), n(p), n(h)];
  if (!(got[0] > 0 && got.slice(1).every((x) => x === 0))) throw new Error(JSON.stringify(got));
' '$R/herdr-app/mods/orc-skills/seen.js' '$S' '$H'"
ln -s "$T/nowhere" "$T/proj/.claude/skills/broken"; mkdir -p "$T/proj/.claude/skills/odd/SKILL.md"
check "broken links and SKILL.md folders are skipped" "$ORC skills --json | j 'assert all(\"broken\" not in x[\"path\"] and \"/odd/\" not in x[\"path\"] for x in d[\"skills\"])'"

# A skill's references: its References section, any `references/` or `../` path in
# SKILL.md, and the Markdown links of its reference files. Other `.md` names in the
# body are files of the user's project (plan.md, checks.md), not the skill's.
check "shared skill references resolve relative to the file that names them" "python3 -c '
import os, re, glob
LINK = r\"\\]\\(([^)\\s]+)\\)\"
TICK = r\"\`([\\w./-]+\\.md)\`\"
def target(ref):
    ref = ref.split(\"#\")[0]
    return None if not ref.endswith(\".md\") or re.match(r\"\\w+://\", ref) else ref
broken = []
def look(base, name, refs):
    for ref in sorted(set(filter(None, map(target, refs)))):
        if not os.path.exists(os.path.join(base, ref)): broken.append(f\"{name}: {ref}\")
for skill in sorted(glob.glob(\"$R/shared/skills/*/SKILL.md\")):
    base = os.path.dirname(skill); name = os.path.basename(base)
    text = open(skill, encoding=\"utf-8\").read()
    m = re.search(r\"^## References\\n([\\s\\S]*?)(?=^## |\\Z)\", text, re.M)
    refs = re.findall(LINK, m.group(1)) + re.findall(TICK, m.group(1)) if m else []
    refs += [r for r in re.findall(LINK, text) + re.findall(TICK, text) if r.startswith((\"references/\", \"../\"))]
    look(base, name + \"/SKILL.md\", refs)
    for doc in sorted(glob.glob(os.path.join(base, \"references\", \"*.md\"))):
        look(os.path.dirname(doc), name + \"/references/\" + os.path.basename(doc), re.findall(LINK, open(doc, encoding=\"utf-8\").read()))
assert not broken, broken
'"

echo "skills: pass=$pass fail=$fail"
[ "$fail" = 0 ]

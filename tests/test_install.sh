#!/usr/bin/env bash
# install.py in a throwaway HOME and project: every CLI, both scopes, rerun,
# conflicts, hooks merge, uninstall. Touches nothing outside a temp dir.
#   bash tests/test_install.sh
set -u
cd "$(dirname "$0")/.."
REPO=$PWD
pass=0; fail=0
check() { if eval "$2"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $1"; fi; }

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
export HOME=$T/home; unset XDG_CONFIG_HOME CODEX_HOME
mkdir -p "$HOME/.claude" "$T/proj"
echo '{"theme": "dark", "hooks": {"PreToolUse": [{"matcher": "Edit", "hooks": [{"type": "command", "command": "mine.sh"}]}]}}' > "$HOME/.claude/settings.json"
# --no-mods: never touch the real Claude plugin state; the mods get a dry-run check below.
I() { python3 "$REPO/install.py" --cli claude,opencode,agy,codex,cursor --no-mods "$@"; }

# 1. global install, every CLI
check "global install succeeds" "I >/dev/null"
for f in .claude/agents/hcorc.md .claude/agents/review-risk.md .claude/commands/herdorc-panes.md \
         .config/opencode/agents/herdorc.md .config/opencode/commands/hcorc-status.md \
         .gemini/config/agents/hcorc/agent.md .gemini/config/agents/jd-judge-a/agent.md \
         .codex/hcorc.config.toml .codex/agents/gentle-ai-worker.toml \
         .cursor/skills/herdorc/SKILL.md .cursor/skills/herdorc/prompt.md .cursor/agents/review-refuter.md; do
  check "installed $f" "[ -s '$HOME/$f' ]"
done
S=$HOME/.claude/settings.json
check "user settings kept (theme, own hook)" "python3 -c \"import json;d=json.load(open('$S'));assert d['theme']=='dark';assert any(h['hooks'][0]['command']=='mine.sh' for h in d['hooks']['PreToolUse'])\""
check "guard + phase hooks added once, absolute" "[ \$(grep -c 'shared/bin/guard.py' '$S') = 1 ] && grep -q '$REPO/shared/bin/orc.py phase --hook' '$S'"
check "settings backup written" "[ -f '$S.orc-backup' ]"

# 2. per-CLI content
check "claude prompt: hooks text, own vocabulary, no --as" "grep -q 'A PreToolUse hook' $HOME/.claude/agents/hcorc.md && grep -q '# Tool vocabulary (Claude Code)' $HOME/.claude/agents/hcorc.md && ! grep -q -- '--as hcorc' $HOME/.claude/agents/hcorc.md"
check "opencode prompt: glossary, --as, no-hook rules, mode primary" "grep -q '# Tool vocabulary (OpenCode)' $HOME/.config/opencode/agents/hcorc.md && grep -q -- 'orc.py --as hcorc' $HOME/.config/opencode/agents/hcorc.md && grep -q 'No hook enforces' $HOME/.config/opencode/agents/hcorc.md && grep -q '^mode: primary' $HOME/.config/opencode/agents/hcorc.md"
check "opencode read-only role denies edit, worker does not" "grep -q 'effect: deny' $HOME/.config/opencode/agents/review-risk.md && ! grep -q 'permissions' $HOME/.config/opencode/agents/gentle-ai-worker.md"
check "opencode command runs under its agent" "grep -q '^agent: herdorc' $HOME/.config/opencode/commands/herdorc-panes.md"
check "agy roles: subagent only, exact tools" "grep -q '^mainAgent: false' $HOME/.gemini/config/agents/review-risk/agent.md && grep -q 'run_command' $HOME/.gemini/config/agents/review-risk/agent.md && ! grep -q -E 'mcp__|Bash' $HOME/.gemini/config/agents/review-risk/agent.md"
check "herdorc embeds the herdr skill" "grep -q 'The \`herdr\` skill follows' $HOME/.gemini/config/agents/herdorc/agent.md"
check "codex TOML parses; sandbox by role" "python3 -c \"
import tomllib;h='$HOME/.codex'
w=tomllib.load(open(h+'/agents/gentle-ai-worker.toml','rb'));r=tomllib.load(open(h+'/agents/review-risk.toml','rb'));p=tomllib.load(open(h+'/hcorc.config.toml','rb'))
assert w['sandbox_mode']=='workspace-write' and r['sandbox_mode']=='read-only' and r['name']=='review-risk'
assert 'Tool vocabulary (Codex CLI)' in p['developer_instructions']\""
check "cursor skill points at its prompt; read-only role" "grep -q \"$HOME/.cursor/skills/hcorc/prompt.md\" $HOME/.cursor/skills/hcorc/SKILL.md && grep -q '^readonly: true' $HOME/.cursor/agents/review-risk.md && ! grep -q readonly $HOME/.cursor/agents/gentle-ai-worker.md"
check "no unfilled placeholders or conditionals anywhere" "! grep -r -l -E '\{\{[A-Z_]+\}\}|<!-- (if:|endif)' $HOME/.claude $HOME/.config $HOME/.gemini $HOME/.codex $HOME/.cursor"

# 3. rerun is a no-op
check "rerun writes nothing" "I | grep -q '^\[claude\] wrote 0 of'"
check "rerun keeps one guard hook" "[ \$(grep -c 'shared/bin/guard.py' '$S') = 1 ]"

# 4. project scope + a file we did not write
mkdir -p "$T/proj/.opencode/agents"; echo "mine" > "$T/proj/.opencode/agents/hcorc.md"
OUT=$(I --scope project --project "$T/proj" 2>&1)
check "foreign file blocks that CLI only" "echo \"\$OUT\" | grep -q 'opencode\] not installed' && [ \"\$(cat $T/proj/.opencode/agents/hcorc.md)\" = mine ] && [ -s $T/proj/.claude/agents/hcorc.md ]"
check "project claude hooks are absolute (not this repo)" "grep -q '$REPO/shared/bin/guard.py' $T/proj/.claude/settings.json"
check "--force overwrites it" "I --scope project --project '$T/proj' --cli opencode --force >/dev/null && grep -q 'mode: primary' $T/proj/.opencode/agents/hcorc.md"
check "codex profiles shared by both scopes" "[ -s $HOME/.codex/herdorc.config.toml ]"

# 5. --agents narrows and removes the dropped one
I --agents hcorc >/dev/null
check "dropped orchestrator removed, roles kept" "[ ! -e $HOME/.claude/agents/herdorc.md ] && [ ! -e $HOME/.gemini/config/agents/herdorc ] && [ -s $HOME/.claude/agents/review-risk.md ]"

# 6. uninstall
I --uninstall >/dev/null
check "global uninstall removes our files" "[ ! -e $HOME/.claude/agents/hcorc.md ] && [ ! -e $HOME/.cursor/skills/hcorc ] && [ ! -e $HOME/.gemini/config/agents/review-risk ]"
check "codex profile kept while the project install uses it" "[ -s $HOME/.codex/hcorc.config.toml ]"
check "hooks removed, user settings kept" "! grep -q 'shared/bin/guard.py' '$S' && grep -q mine.sh '$S' && grep -q dark '$S'"
I --uninstall --scope project --project "$T/proj" >/dev/null
check "project uninstall removes the rest" "[ ! -e $T/proj/.claude/agents/hcorc.md ] && [ ! -e $HOME/.codex/hcorc.config.toml ]"
check "status empty" "python3 '$REPO/install.py' --status | grep -q 'no installs'"

# 7. the Claude-only mods: planned for claude, never for another CLI
if [ -f "$REPO/.claude-plugin/marketplace.json" ] && command -v claude >/dev/null; then
  check "dry-run plans the mod plugins for claude" "python3 '$REPO/install.py' --cli claude --dry-run | grep -q 'would run: claude plugin install'"
  check "no mods for other CLIs" "! python3 '$REPO/install.py' --cli opencode,agy,codex,cursor --dry-run | grep -q 'claude plugin'"
fi

# 8. a broken settings.json aborts without writing
echo '{oops' > "$S"
check "invalid settings.json refused" "! I --cli claude >/dev/null 2>&1 && [ \"\$(cat '$S')\" = '{oops' ]"

echo "install: pass=$pass fail=$fail"
[ "$fail" = 0 ]

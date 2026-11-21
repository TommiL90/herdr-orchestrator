# herdr-orchestrators

Two primary orchestrator agents that run the ODD workflow (Direct,
Checks-only and Full Lean lanes) and delegate to role agents in terminal
panes. A role pane can run any coding CLI. When no pane is available, the
orchestrator falls back to the internal subagent of the same name.

| Agent | Drives | Role panes |
|---|---|---|
| `hcorc` | Herdr desktop: `herdr-app` + herdr-core `hc` | named `hc` terminals, two per tab, in tabs `hcorc · <roles>` |
| `herdorc` | the herdr terminal multiplexer (`herdr`) | labelled herdr panes, two per tab; follows the upstream `herdr` skill, embedded verbatim |

The ten roles are `gentle-ai-explore`, `gentle-ai-worker`,
`gentle-ai-verify`, `jd-judge-a`, `jd-judge-b`, `review-risk`,
`review-readability`, `review-reliability`, `review-resilience` and
`review-refuter`.

The prompts work in any CLI. `install.py` generates each CLI's files from one
set of sources and maps the neutral tool terms ("ask tool", "subagent tool",
"shell tool") to that CLI's real tools.

## Install

```sh
git clone git@github.com:TommiL90/herdr-orchestrators.git
cd herdr-orchestrators
python3 install.py                      # every supported CLI on PATH, for all projects
```

| Option | Effect |
|---|---|
| `--cli claude,opencode,agy,codex,cursor` | only these CLIs (default: the ones on PATH) |
| `--scope project --project DIR` | install into one project instead of your user config |
| `--agents hcorc` | one orchestrator only (the roles always install) |
| `--dry-run` | show what would change |
| `--uninstall` | remove what install.py wrote (same `--cli`/`--scope` selection) |
| `--status` | installs recorded on this machine (`~/.local/state/orc/installs.json`) |
| `--force` | also overwrite files install.py did not write (refused by default) |
| `--no-mods` | skip the Claude Code-only mods (plugins in `mods/`) |

Generated files embed the clone's absolute path. After `git pull`, or after
moving the clone, run `python3 install.py` again. A rerun only rewrites what
changed and removes files it no longer produces.

## What each CLI gets

| CLI | Orchestrators | Roles | Start | Notes |
|---|---|---|---|---|
| Claude Code | agents | subagents | `claude --agent hcorc` | `/hcorc-status`, `/hcorc-panes`, `/hcorc-cleanup`; guard and phase hooks in `settings.json`; the `orc-cache` mod as a plugin |
| OpenCode | `mode: primary` agents | `mode: subagent` (read-only roles deny edits) | `opencode`, pick with Tab | same slash commands |
| Antigravity (`agy`) | `mainAgent` agents | subagents with exact tool names | `agy --agent hcorc` | project scope: see Limitations |
| Codex CLI | profiles `~/.codex/<name>.config.toml` | custom agents (`.toml`, sandbox per role) | `codex -p hcorc` | profiles are global even with `--scope project` |
| Cursor CLI | skills: `/hcorc` loads the prompt for the session | subagents (`readonly` for read-only roles) | `cursor-agent`, then `/hcorc` | no custom primary agents in Cursor |

Global locations: `~/.claude`, `~/.config/opencode`, `~/.gemini/config`,
`~/.codex` (or `$CODEX_HOME`), `~/.cursor`. Project locations: `.claude`,
`.opencode`, `.agents`, `.codex`, `.cursor`.

Start an orchestrator from inside a Herdr pane (`hcorc`) or a herdr pane
(`herdorc`). Outside one, it still works but uses internal subagents only.

### Limitations

- Hooks exist only in Claude Code. In the other CLIs the guardrails are hard
  rules in the prompt, and the agent reports its own ODD phase. The mods in
  `mods/` are Claude Code-only by design; the orchestrators work without them.
- Antigravity: the project-scope files go where its docs say
  (`.agents/agents/<name>/agent.md`). In testing, `agy agents` listed them
  only in a folder it already knew as a project. Global scope worked
  everywhere.
- Codex has no way to choose a custom primary agent. A profile layers the
  prompt as `developer_instructions`.
- Cursor has no custom primary agents. `/hcorc` (Option+Enter keeps it as a
  sticky mode) tells the agent to load the full prompt.

## Requirements

- Python 3.9 or later; the scripts use only the standard library.
- `hcorc`: Herdr desktop (`herdr-app`, `hc`). `herdorc`: `herdr` 0.9.x.
- Optional: the Engram and CodeGraph MCP servers. The prompts use them when
  they are configured.

## Layout

```
install.py               generator + installer for every CLI and scope
shared/core/odd-core.md  ODD core prompt (ported from tomidev-shell)
shared/docs/             ODD reference docs, read at runtime
shared/roles/            role prompts + roles.json (tools, model)
shared/skills/           skills, read by path (never copied into a CLI)
shared/vendor/herdr/     upstream herdr skill + UPSTREAM.json
shared/bin/orc.py        runtime helper: role lookup, role panes, ensure, phase (`--as <agent>` outside Claude)
shared/bin/guard.py      Claude Code PreToolUse guard for hc / herdr commands
layers/                  per-orchestrator layers, shared section, slash-command templates
mods/, .claude-plugin/   Claude Code-only plugins (orc-cache: prompt-cache meter, wait guard) + marketplace
scripts/                 port scripts (tomidev-shell -> shared/), herdr skill sync, build-agents.py
tests/                   test_install.sh, test_guard.sh, test_orc_herdr.sh, test_orc_hc.sh
```

## Development

- Edit the sources (`shared/`, `layers/`), never the generated files. Then
  run `python3 install.py`, or `python3 scripts/build-agents.py` to rebuild
  only this repo's `.claude/`.
- Layers can hold `<!-- if:hooks -->` / `<!-- if:commands -->` blocks (and
  `if:!…`). They are kept or dropped by what each CLI supports.
- `python3 scripts/sync-herdr-skill.py` checks the vendored herdr skill
  against upstream; `--update` refreshes it.
- Tests: `bash tests/test_install.sh` needs nothing. `test_guard.sh`,
  `test_orc_herdr.sh` and `test_orc_hc.sh` need `herdr` / Herdr desktop and
  use isolated sessions.

## License

MIT (see `LICENSE`). Third-party material keeps its own license: see `NOTICE`.

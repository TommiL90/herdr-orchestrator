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

Clone the repo on the machine, then run the scripts from the clone. Nothing
is copied: every installed file is a symlink into the clone.

```sh
git clone https://github.com/TommiL90/herdr-orchestrator.git
cd herdr-orchestrator
./install.sh                 # everything this machine has
./install.sh --extras        # plus the third-party Herdr app mods (below)
```

`./install.sh` installs into each coding CLI on PATH, adds the Skills panel
if the Herdr app is installed, and links orc-flow if `herdr` is on PATH. It
skips what the machine does not have. `--uninstall` removes all of it,
`--status` lists what is installed, and `--dry-run` shows what would change.

One target at a time: `installers/<target>.sh`, each with `--help`.

| Script | Installs | Scope |
|---|---|---|
| `installers/claude.sh` | agents, slash commands, hooks, the Claude Code-only mods | user or project |
| `installers/opencode.sh` | primary agents, subagents, slash commands | user or project |
| `installers/agy.sh` | main agents, subagents | user or project |
| `installers/codex.sh` | roles as custom agents, orchestrators as profiles | user or project (profiles: user) |
| `installers/cursor.sh` | orchestrators as skills, roles as subagents | user or project |
| `installers/herdr-app.sh` | the Skills panel in the Herdr app | user |
| `installers/herdr.sh` | orc-flow in the herdr TUI, with its keybinding | user |
| `installers/herdr-app-extras.sh` | third-party Herdr app mods, pinned | user |

```sh
installers/agy.sh                                  # for your user: ~/.gemini/config
installers/agy.sh --scope project --project ~/code/app   # for one project: ~/code/app/.agents
installers/agy.sh --uninstall --scope project --project ~/code/app
```

There are two scopes. `user` (the default) installs into your home folder,
where the CLI reads it in every project; `global` is the same scope under its
old name, since none of these CLIs has a machine-wide folder. `project`
installs into one project's folder. The CLI scripts also take these options:

| Option | Effect |
|---|---|
| `--scope user\|project`, `--project DIR` | where to install (project default: current dir) |
| `--agents hcorc` | one orchestrator only (the roles always install) |
| `--dry-run` | show what would change |
| `--uninstall` | remove what the script wrote (same `--scope`) |
| `--force` | also overwrite files the scripts did not write (refused by default) |
| `--no-mods` | `claude.sh` only: skip the Claude Code-only mods (plugins in `mods/`) |

The scripts are thin wrappers around `python3 install.py` (`--cli`,
`--herdr-app`, `--herdr`) and `python3 herdr-app/extras.py`, which take the
same options. They need Python 3.9 or later; orc-flow also needs Node.js
22.5 or later.

### How the links work

`install.py` generates each CLI's files into the clone's `dist/`
(git-ignored), and every file in a CLI's folder is a link to its file there.
`ls -l` shows what came from this repo. The Herdr desktop mods are built in
`dist/` too, and each folder in Herdr's `mods/` is one link to its build;
Herdr refuses a mod file whose real path is outside the mod's folder. orc-flow
is linked by herdr itself (`herdr plugin link` to `herdr/plugins/orc-flow`).

After `git pull`, run `./install.sh` again: the links stay, and their
targets are regenerated. A rerun only rewrites what changed and removes the
links it no longer produces. Moving or deleting the clone breaks every link;
`./install.sh --status` flags broken links, and running it from the new
place repairs them. Files that are merged rather than linked,
because other tools share them, are Claude Code's `settings.json` (hooks),
the Herdr layout and `keys.json`, and herdr's `config.toml`. Copies left by older versions of the installer turn into
links on the next run.

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

### Skills panel in Herdr desktop

`installers/herdr-app.sh` adds a **Skills** button beside Herdr's tab
bar. It opens a collapsible panel next to Files and Changes. The panel shows
which skills the orchestrator will use in the focused terminal's project:
its own skills, the project's and yours. It also lists each same-name
conflict, with the copy that wins (project, then user, then the
orchestrator's) and the copies it shadows. The button shows how many
conflicts there are, and a toast appears when they change. The panel only
reads; it works with every CLI, because it runs `orc.py skills --json`.

Herdr's own layouts are read-only. If the shown layout is one of them, the
installer clones `main` as `main-orc` and switches to it; your own layout
gets the two nodes in place. Herdr's mods (tabs, Files, Changes...) stay
Herdr's and keep updating, but the clone's structure does not. To rebuild
it from a newer `main`, run `installers/herdr-app.sh --uninstall`, then
`installers/herdr-app.sh`.
The mod lives in `herdr-app/mods/orc-skills/`.

### Third-party Herdr app mods

`installers/herdr-app-extras.sh` (or `./install.sh --extras`) installs the
Herdr app mods this setup uses. Each one is pinned in
`herdr-app/extras.json` to the commit whose code was reviewed:

| Mod | From | Gives |
|---|---|---|
| herdr-nvim | ChmaraX/herdr-nvim | Neovim beside the agents (`cmd-e`, `cmd-o`, `cmd-shift-e`) |
| gitview | ChmaraX/herdr-gitview | the Changes panel (`cmd-shift-g`, `cmd-g`) |
| file-icons | cybertron288/herdr-mods | the Files panel with icons, in a split (`cmd-shift-f`) |
| filetree | cybertron288/herdr-mods | a file tree in the Files slot |
| markdown-panel | jlopezlira/herdr-kanso | rendered markdown (`cmd-shift-m`) |
| agent-flow | MarcozVD/herdr-agent-flow | the agents as a graph (`ctrl-shift-g`, `cmd-alt-g`), patched to draw `orc.py` handoffs |

It downloads their code from GitHub. herdr-nvim and gitview run their own
installers, which also download their release binary (checked against its
SHA-256) and edit the shown layout; herdr-nvim needs Neovim 0.10 or later.
The others are built into `dist/` and linked. Keys go only where
`keys.json` has them free. `--only filetree,gitview` picks some, `--list`
says what each is, and `--uninstall` takes them out, giving the Files slot
and the keys back. A mod folder the scripts did not write is refused;
`--force` moves it to `<herdr home>/<name>.before-orc` and puts it back on
uninstall.

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

## herdorc's graph in herdr: orc-flow

`herdr/plugins/orc-flow/` is a herdr plugin that draws herdorc and its role
panes as a live graph: each pane's CLI, model and status, the tool call in
progress, and the messages between them in the last 10 minutes (prompts and
handoffs down, answers read back up). It works with any CLI in any pane; it
reads each pane's session through herdr's `agent_session` field, and which
panes are herdorc's from herdorc's state file. It is a port of the Herdr
desktop mod herdr-agent-flow.

```sh
installers/herdr.sh          # herdr plugin link + prefix+shift+z, which opens it as an overlay
```

The actions `orc-flow.open-split` and `orc-flow.open-tab` open it in a split
or a tab. It needs Node.js 22.5 or newer. Details:
`herdr/plugins/orc-flow/README.md`.

## Requirements

- Python 3.9 or later; the scripts use only the standard library.
- `hcorc`: Herdr desktop (`herdr-app`, `hc`). `herdorc`: `herdr` 0.9.x.
- Optional: the Engram and CodeGraph MCP servers. The prompts use them when
  they are configured.

## Layout

```
install.sh               installs everything this machine has (runs the scripts below)
installers/              one script per target: claude, opencode, agy, codex, cursor, herdr-app, herdr, herdr-app-extras
install.py               generator + installer for every CLI and scope, the Skills panel and orc-flow
shared/core/odd-core.md  ODD core prompt (ported from tomidev-shell)
shared/docs/             ODD reference docs, read at runtime
shared/roles/            role prompts + roles.json (tools, model)
shared/skills/           skills, read by path (never copied into a CLI)
shared/vendor/herdr/     upstream herdr skill + UPSTREAM.json
shared/bin/orc.py        runtime helper: role lookup, role panes, ensure, phase (`--as <agent>` outside Claude)
shared/bin/guard.py      Claude Code PreToolUse guard for hc / herdr commands
layers/                  per-orchestrator layers, shared section, slash-command templates
herdr-app/mods/          Herdr desktop mods, any CLI (orc-skills: the Skills panel; install.py --herdr-app)
herdr-app/extras.*       third-party Herdr app mods, pinned (extras.json), and their installer
mods/, .claude-plugin/   Claude Code-only plugins (orc-cache: prompt-cache meter, wait guard) + marketplace
scripts/                 port scripts (tomidev-shell -> shared/), herdr skill sync, build-agents.py
herdr/plugins/orc-flow/  herdr plugin, any CLI: herdorc and its role panes as a live graph (Node)
tests/                   test_install.sh, test_guard.sh, test_orc_herdr.sh, test_orc_hc.sh
```

## Development

- Edit the sources (`shared/`, `layers/`), never the generated files. Then
  run `./install.sh`, or `python3 scripts/build-agents.py` to rebuild
  only this repo's `.claude/`.
- Layers can hold `<!-- if:hooks -->` / `<!-- if:commands -->` blocks (and
  `if:!…`). They are kept or dropped by what each CLI supports.
- `python3 scripts/sync-herdr-skill.py` checks the vendored herdr skill
  against upstream; `--update` refreshes it.
- Tests: `bash tests/test_install.sh` needs nothing. `test_guard.sh`,
  `test_orc_herdr.sh` and `test_orc_hc.sh` need `herdr` / Herdr desktop and
  use isolated sessions. `node --test herdr/plugins/orc-flow/test/` tests
  the orc-flow plugin and needs nothing but Node.js 22.5 or newer.

## License

MIT (see `LICENSE`). Third-party material keeps its own license: see `NOTICE`.

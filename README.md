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
and pane names if the Herdr app is installed, and links orc-flow if `herdr` is on PATH. It
skips what the machine does not have. `--uninstall` removes all of it,
`--status` lists what is installed, and `--dry-run` shows what would change.

One target at a time: `installers/<target>.sh`, each with `--help`.

| Script | Installs | Scope |
|---|---|---|
| `installers/claude.sh` | agents, slash commands, hooks, the Claude Code-only mods | user or project |
| `installers/opencode.sh` | primary agents, subagents, slash commands, the guard plugin | user or project |
| `installers/agy.sh` | main agents, subagents, commands as skills, the guard hook | user or project |
| `installers/codex.sh` | roles as custom agents, orchestrators as profiles, commands as skills, the guard hook | user or project (profiles: user) |
| `installers/cursor.sh` | orchestrators as skills, roles as subagents, commands as skills, the guard hook | user or project |
| `installers/grok.sh` | agents, roles as agents for its subagents, commands as skills, the guard hook | user or project |
| `installers/pi.sh` | orchestrator prompts loaded by `/hcorc`, commands as prompt templates, the guard extension (no roles: pi has no subagents) | user or project |
| `installers/herdr-app.sh` | the Skills panel and pane names in the Herdr app | user |
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
22.13 or later.

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
because other tools share them, are each CLI's hooks file (Claude Code's
`settings.json`, `hooks.json` for agy, Codex and Cursor; Grok's guard is a
hooks file of its own, linked like the rest),
the Herdr layout and `keys.json`, and herdr's `config.toml`. Copies left by older versions of the installer turn into
links on the next run.

## What each CLI gets

| CLI | Orchestrators | Roles | Start | Notes |
|---|---|---|---|---|
| Claude Code | agents | subagents | `claude --agent hcorc` | `/hcorc-status`, `/hcorc-panes`, `/hcorc-cleanup`, `/hcorc-flow`; guard and phase hooks in `settings.json`; the `orc-cache`, `orc-graph` and `orc-context` mods as plugins (the last two open their pane with `/orc-graph`, `/orc-context`, or by themselves with their `openPane` option) |
| OpenCode | `mode: primary` agents | `mode: subagent` (read-only roles deny edits) | `opencode`, pick with Tab | same slash commands; the guard as the plugin `plugins/herdr-orchestrators-guard.js` |
| Antigravity (`agy`) | `mainAgent` agents with their tools listed (agy gives an agent without `tools` only read-only ones) | subagents with agy's own tool names | `agy --agent hcorc` | `/hcorc-status` etc. as skills; the guard as the `herdr-orchestrators` hook in `hooks.json`; project scope: see Limitations |
| Codex CLI | profiles `~/.codex/<name>.config.toml` | custom agents (`.toml`; a role keeps its parent's sandbox, since Codex applies no `sandbox_mode` to roles) | `codex -p hcorc` | `$hcorc-status` etc. as skills; the guard in `hooks.json` (approve it once in `/hooks`); profiles are global even with `--scope project` |
| Cursor CLI | skills: `/hcorc` loads the prompt for the session | subagents (`readonly` for read-only roles) | `cursor-agent`, then `/hcorc` | `/hcorc-status` etc. as skills; the guard on `beforeShellExecution` in `hooks.json`; no custom primary agents in Cursor |
| Grok Build | agents in `agents/`, with no `tools` list (Grok then gives them every tool) | agents its `spawn_subagent` runs by name (read-only roles say so in their prompt) | `grok --agent hcorc` | `/hcorc-status` etc. as skills; the guard as `hooks/herdr-orchestrators.json` (Claude Code's hook format) |
| pi | `/hcorc` loads the prompt for the session (pi has no named agents) | none: pi has no subagents, so roles run in panes | `pi`, then `/hcorc` | `/hcorc-status` etc. as prompt templates; the guard as the extension `extensions/herdr-orchestrators-guard.ts`, which asks in pi's own dialog |

Every CLI gets the same commands and the same guard. `/<agent>-flow` opens
the flow graph in a pane to the right of the orchestrator's own (`orc.py
flow`): the agent-flow mod in Herdr app for hcorc, the orc-flow plugin in
herdr for herdorc, without taking the focus. It needs that mod or plugin
installed (`installers/herdr-app-extras.sh --only agent-flow`,
`installers/herdr.sh`). Where a CLI has no
command files (agy, Codex, Cursor, Grok), each command is a skill only the user
invokes (`disable-model-invocation`, and Codex's
`allow_implicit_invocation: false`); they go to `.agents/skills` (Codex,
Cursor, Grok) or agy's own `skills/`, and CLIs that read the same folder share one
copy. pi gets them as prompt templates, which only the user runs. The phase hook stays Claude Code-only: elsewhere the agent reports its
own ODD phase.

Waits are bounded (270 s check-ins by default) so the orchestrator stays
reachable; the prompts make no promise about the prompt cache, whose lifetime
depends on the provider and plan (5 minutes or 1 hour on Anthropic, longer or
unspecified elsewhere). In Claude Code the `orc-cache` mod knows the real
lifetime: its wait guard sends back a wait that would outlast the cache, and
its `warm` option (off by default) renews the cache during a wait with a
one-word fork of the orchestrator's last request, 30 s before it lapses. Each
ping costs a cache read (0.1x the prompt); it stops after the pings that still
cost less than one rewrite (11 on a 5-minute cache, 19 on a 1-hour one), and
with it on the guard allows waits up to what those pings cover from now (the
entry's time left plus 270 s per ping on a 5-minute cache: 3,270 s from a
fresh entry). A background wait pings only once its task runs, and stops when
the task ends; a failed ping stops them for that wait. Another CLI's native cache
keep-alive can join the same way, as an option, once it shows it saves more
than it costs.

Global locations: `~/.claude`, `~/.config/opencode`, `~/.gemini/config`,
`~/.codex` (or `$CODEX_HOME`), `~/.cursor`, `~/.grok` (or `$GROK_HOME`),
`~/.pi/agent` (or `$PI_CODING_AGENT_DIR`). Project locations: `.claude`,
`.opencode`, `.agents`, `.codex`, `.cursor`, `.grok`, `.pi`.

No orchestrator file narrows its tools. agy is the one CLI that needs a list
(an agent without one gets only read-only tools), so its agents list agy's own
tool names; in the others an agent without a list keeps every tool, the shell
included.

Start an orchestrator from inside a Herdr pane (`hcorc`) or a herdr pane
(`herdorc`). Outside one, it still works but uses internal subagents only.

### Skills panel in Herdr desktop

`installers/herdr-app.sh` adds a **Skills** button beside Herdr's tab
bar. It opens a collapsible panel next to Files and Changes. The panel shows
which skills the orchestrator will use in the focused terminal's project:
its own skills, the project's and yours. It also lists each same-name
conflict, with the copy that wins (project, then user, then the
orchestrator's) and the copies it shadows. The button shows how many
conflicts there are, and a toast appears when they change. The command
palette (Herdr 0.1.18+) opens it too: "Skills: same-name conflicts". The panel only
reads; it works with every CLI, because it runs `orc.py skills --json`.

Herdr's own layouts are read-only. If the shown layout is one of them, the
installer clones `main` as `main-orc` and switches to it; your own layout
gets the two nodes in place. The button and the tab bar share a row, held by
a column named `tabs-row`, so a tab bar that grows taller (better-tabs, below)
grows the whole bar. Herdr's mods (tabs, Files, Changes...) stay
Herdr's and keep updating, but the clone's structure does not. To rebuild
it from a newer `main`, run `installers/herdr-app.sh --uninstall`, then
`installers/herdr-app.sh`.
The mod lives in `herdr-app/mods/orc-skills/`.

### Pane names in Herdr desktop

Herdr desktop names panes since 0.1.17 (Rename at the top of the pane menu,
`pane.rename`), and its own pane header shows that name. Headers copied from
an older Herdr, as herdr-nvim's (Preview/Source button), don't.
`installers/herdr-app.sh` also installs the `orc-panes` mod, which becomes
the pane header of the same layout. It is the header that layout already
had, with only the name changed: the installer copies that header's code
under `orc-panes/base/` (Herdr's own, or herdr-nvim's, whose Preview button
stays) and keeps it in the header's `props.replaces` for the uninstall. The
name shown is, in this order:

- `orc.phase`: hcorc's ODD phase (`hcorc · exploring`), from `orc.py phase`,
  a terminal label, so the name you gave the pane stays;
- the name Herdr gives the pane (the pane menu's Rename);
- `orc.pane-name`: a name given with an older orc-panes, which had its own
  rename dialog and key (a reinstall takes that key back);
- the terminal's own name (`hc run --name`);
- otherwise, what the header showed before.

`orc.py panes` and `ensure` also name each role pane they create after its
role (`pane.rename`), so any header shows it. Without orc-panes, hcorc's
phase is the orchestrator pane's name, as herdorc's is in herdr, and
clearing the phase unnames it. The copied header does not follow updates:
after Herdr or herdr-nvim updates its header, run `installers/herdr-app.sh`
again (`herdr-app-extras.sh` does this by itself around herdr-nvim's
installer). The mod lives in `herdr-app/mods/orc-panes/`.

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
| better-tabs | munza/herdr-mods | the tab bar: tabs drag to reorder, wrap onto more lines and name themselves after what runs in them, with a ⋮ menu for panel buttons |

It downloads their code from GitHub. herdr-nvim and gitview run their own
installers, which also download their release binary (checked against its
SHA-256) and edit the shown layout; herdr-nvim needs Neovim 0.10 or later.
The others are built into `dist/` and linked. Keys go only where
`keys.json` has them free. `--only filetree,gitview` picks some, `--list`
says what each is, and `--uninstall` takes them out, giving the Files slot,
the tab bar and the keys back. better-tabs' names are real tab renames (a name
you typed stays), so they remain after an uninstall; renaming a tab to
nothing gives its number back. While herdr-nvim's or gitview's installer
edits the layout, `orc-panes` hands the pane header back, then draws through
the one they leave. A mod folder the scripts did not write is refused;
`--force` moves it to `<herdr home>/<name>.before-orc` and puts it back on
uninstall.

### Limitations

- The guard blocks an orchestrator's destructive commands on its own
  multiplexer and asks you before a destructive command of the other one
  (`herdr` for hcorc, `hc`/`herdr-app` for herdorc); its queries and other
  commands run. Claude Code, agy, Cursor and Grok ask you in their own prompt,
  and pi's guard extension in pi's dialog (in pi's print mode, with no one to
  ask, it refuses). Codex
  and OpenCode hooks can only refuse, so there the guard refuses and tells the
  agent to ask you; after your yes it reruns the call with a leading
  `ORC_CONFIRMED=1`, which the guard accepts for those calls only (never for a
  blocked one). That confirmation rests on the agent asking first.
- Outside Claude Code no variable names the running agent. `orc.py --as
  <agent>` records the CLI process it runs under in
  `~/.local/state/orc/leads.json`, and the guard that CLI starts looks it up
  (OpenCode's plugin also passes the session's agent). So the guard applies
  once the orchestrator has run `orc.py` in that CLI session, which its
  session start does; a restarted CLI is a new session. pi keeps one process
  across `/new` and `/resume`, so there the record is per conversation: a new
  conversation is no orchestrator until it runs `/hcorc` (or `/herdorc`).
- OpenCode 2.x runs the guard plugin through its `execute.before` hook, and
  1.x from 1.18.29 through the same plugin's 1.x hook; earlier releases don't
  load it.
- Grok cuts a call's input past 128 KiB. The guard can't read such a command,
  so in an orchestrator session it refuses the call and says to pass long text
  in a file.
- Codex runs a new or changed hook only after you approve it in `/hooks`.
  Cursor documents its hooks for the editor; `cursor-agent` ships the same
  hook runner, but its shell hooks are not documented separately.
- The mods in `mods/` are Claude Code-only by design; the orchestrators work
  without them.
- Two herdorc in one herdr workspace each control only the panes and tabs they
  created: each keeps its own record, per lead pane, in `~/.local/state/orc/`.
  orc-flow's graph shows both.
- Antigravity: the project-scope files go where its docs say
  (`.agents/agents/<name>/agent.md`). In testing, `agy agents` listed them
  only in a folder it already knew as a project. Global scope worked
  everywhere.
- Codex has no way to choose a custom primary agent. A profile layers the
  prompt as `developer_instructions`.
- Cursor has no custom primary agents. `/hcorc` (Option+Enter keeps it as a
  sticky mode) tells the agent to load the full prompt.
- Grok Build also reads Claude Code's agents (as subagents), commands and
  hooks, and Cursor's hooks. With those installed as well, Grok can list two
  `/hcorc-status`, and a role may run from either CLI's copy (same name, same
  role file). Claude
  Code's guard runs on Grok's calls but stays neutral there (no Claude agent
  is named), Grok reports Cursor's as a hook it does not run, and Grok's own
  guard checks the calls. Project-scope hooks run only in a project you trust
  (`/hooks-trust`). Grok's agents take no edit-tool denylist here, so its
  read-only roles rest on their prompt, as in Codex.
- pi has no named agents, no subagents and no ask or todo tool unless an
  extension adds them. `/hcorc` loads the full prompt for the session;
  `pi --append-system-prompt ~/.pi/agent/herdr-orchestrators/hcorc.md` puts
  it in the system prompt instead. Roles run in panes only, and questions come
  as numbered options in the reply.

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
or a tab. It needs Node.js 22.13 or newer. Details:
`herdr/plugins/orc-flow/README.md`.

## Requirements

- Python 3.9 or later; the scripts use only the standard library.
- `hcorc`: Herdr desktop (`herdr-app`, `hc`). `herdorc`: `herdr` 0.9.x.
- Optional: the Engram and CodeGraph MCP servers. The prompts use them when
  they are configured.

## Layout

```
install.sh               installs everything this machine has (runs the scripts below)
installers/              one script per target: claude, opencode, agy, codex, cursor, grok, pi, herdr-app, herdr, herdr-app-extras
install.py               generator + installer for every CLI and scope, the Skills panel and orc-flow
shared/core/odd-core.md  ODD core prompt (ported from tomidev-shell)
shared/docs/             ODD reference docs, read at runtime
shared/roles/            role prompts + roles.json (tools, model)
shared/skills/           skills, read by path (never copied into a CLI)
shared/vendor/herdr/     upstream herdr skill + UPSTREAM.json
shared/bin/orc.py        runtime helper: role lookup, role panes, ensure, phase (`--as <agent>` outside Claude)
shared/bin/guard.py      guard for hc / herdr commands, one hook format per CLI (--format)
layers/                  per-orchestrator layers, shared section, slash-command templates
herdr-app/mods/          Herdr desktop mods, any CLI (orc-skills: the Skills panel; install.py --herdr-app)
herdr-app/extras.*       third-party Herdr app mods, pinned (extras.json), and their installer
mods/, .claude-plugin/   Claude Code-only plugins (orc-cache: prompt-cache meter, wait guard, opt-in keep-alive; orc-graph, orc-context: panes) + marketplace herdr-orchestrators
scripts/                 port scripts (tomidev-shell -> shared/), herdr skill sync, build-agents.py
herdr/plugins/orc-flow/  herdr plugin, any CLI: herdorc and its role panes as a live graph (Node)
tests/                   test_install.sh, test_skills.sh, test_runtime.sh, test_guard.sh, test_orc_herdr.sh, test_orc_hc.sh
```

## Development

- Edit the sources (`shared/`, `layers/`), never the generated files. Then
  run `./install.sh`, or `python3 scripts/build-agents.py` to rebuild
  only this repo's `.claude/`.
- Layers can hold `<!-- if:hooks -->` (phase hook: Claude Code),
  `<!-- if:guard -->` and `<!-- if:commands -->` blocks (and `if:!…`). They
  are kept or dropped by what each CLI supports.
- `python3 scripts/sync-herdr-skill.py` checks the vendored herdr skill
  against upstream; `--update` refreshes it.
- Tests: `bash tests/test_install.sh`, `test_skills.sh` and
  `test_runtime.sh` need nothing. `test_guard.sh`, `test_orc_herdr.sh` and
  `test_orc_hc.sh` need `herdr` / Herdr desktop and use isolated sessions.
  The desktop suite opens a temporary window and checks that its terminal
  process, tabs and role mapping survive a Core restart. Pass
  `--core /path/to/herdr-core` to test a release binary and optionally
  `--profile ~/.config/herdr-app --layout my-layout --check-mod my-mod` to
  exercise a copy of an installed layout and check an optional mod.
  `claude plugin test mods/<mod>` tests a Claude Code mod. `node --test herdr/plugins/orc-flow/test/` tests
  the orc-flow plugin and needs nothing but Node.js 22.13 or newer.

## License

MIT (see `LICENSE`). Third-party material keeps its own license: see `NOTICE`.

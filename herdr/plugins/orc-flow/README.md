# orc-flow

A herdr plugin that draws `herdorc` and its role panes as a live graph:

```
 orc-flow app  ·  lead herdorc (w1:p1, label)                         23:15:56

 ◐ herdorc            claude   Opus 4.7           working   Bash herdr agent wait  ctx 82k · 12 tools
 ├─▶ ◐ gentle-ai-worker   codex    gpt-5.1-codex      working   exec_command npm test   ↓1
 ├─▶ ✓ review-risk        claude   Haiku 4.5          done      last 1m ago             ↓1 ↑1
 └── · gentle-ai-verify   —                           no agent

 Messages  (prompts and handoffs ↓, answers read back ↑, delegations)
   23:15:25  herdorc ⇠ review-risk  answer read
   23:15:17  herdorc → review-risk  message
```

For each pane it shows the CLI running there, the model, herdr's status, the
tool call in progress, and the context size and tool count of the lead's
turn. Below the tree is a log of the messages between the panes from the last
10 minutes. Edges with a message in the last 90 seconds are drawn bright.
Claude Code subagents inside the lead or a role pane show under that pane.
Other agents and role panes in the workspace that herdorc did not open are
listed apart.

It works with any coding CLI in any pane. Models and messages come from the
CLIs whose session files it can read: Claude Code, Codex, opencode, Oh My Pi
and pi. Other CLIs show with their status only.

It is a port of [herdr-agent-flow](https://github.com/MarcozVD/herdr-agent-flow)
(MIT, Copyright 2026 MarcozVD), a Herdr desktop mod, to the herdr terminal
multiplexer. See `LICENSE`.

## Install

Needs herdr 0.9.5 or newer and Node.js 22.5 or newer on `PATH`.

```sh
herdr plugin link /path/to/herdr-orchestrators/herdr/plugins/orc-flow
```

Then run the `setup-keys` action once to bind `prefix+shift+z`:

```sh
herdr plugin action invoke orc-flow.setup-keys
```

It adds a block between `# >>> orc-flow keys` and `# <<< orc-flow keys` to
herdr's `config.toml`, backs the file up first (`config.toml.orc-flow.bak`),
and reloads the config. If `prefix+shift+z` is already bound, the block is
written commented out. The split and tab placements are in the block as
comments: give them a key to use them. `remove-keys` deletes the block.

To remove the plugin: run `remove-keys`, then `herdr plugin unlink orc-flow`.

## Use

| Action | Opens the graph |
|---|---|
| `orc-flow.open` (`prefix+shift+z`) | as an overlay over the focused pane; closing it restores the layout |
| `orc-flow.open-split` | in a split beside the focused pane |
| `orc-flow.open-tab` | in its own tab |

Keys in the graph: `j`/`k` or the arrows select a pane, `Enter` focuses it
(in an overlay, it also closes the overlay), `d` shows or hides the selected
pane's recent tool calls, `r` refreshes, `q` or `Esc` closes.

`node bin/orc-flow.mjs --once` prints one frame and exits; `--json` prints
the model. Both read the herdr session of the shell they run in.

## Where the data comes from

All of it is read; the plugin never sends anything to a pane.

- **Panes and agents**: `herdr api snapshot`, every 2.5 seconds. herdr's
  `agent_session` field names each pane's session exactly, so a pane is
  paired with its transcript by id. A pane without that field (no herdr
  integration for its CLI) is matched by CLI and folder, and the graph marks
  the guess with `~`.
- **Which panes are herdorc's**: herdorc's state file,
  `~/.local/state/orc/herdorc-<session>-<workspace>.json`, written by
  `shared/bin/orc.py`. A recorded pane counts while its label and terminal
  still match, as in `orc_state.herdr_owned()`. These panes are drawn as the
  lead's children.
- **Which pane is herdorc**: herdr has no parent link, so in this order: the
  pane labelled `herdorc…` (orc.py shows herdorc's ODD phase there) or with an
  agent named so; the pane found that way before, while it holds the same
  terminal; the agent that sent messages to herdorc's role panes; the pane the
  plugin was opened from; the only agent that is not a role pane.
- **Models, tools and messages**: `lib/scan.cjs` reads Claude Code
  transcripts, Codex's state DB and rollout files, opencode's DB (read-only)
  and Oh My Pi / pi session files. It returns tool names, short hints and
  message targets, never prompts or tool output. It reads only what was
  appended since the last scan; the offsets are cached in
  `$TMPDIR/herdr-orc-flow/`.

A message is any of these in a pane's tool calls:

| Counts as | Command |
|---|---|
| message to `<target>` | `herdr agent prompt <target> …`, `herdr pane send-text <target> …` |
| message to the role pane | `orc.py ensure <role> [--name <pane>] … --handoff <file>` |
| answer read back from `<target>` | `herdr agent read <target>`, `herdr pane read <target>`, reading `…/reports/<pane-name>-<task>.md` |
| message (hcorc forms) | `hc send <target>`, `<hc from="…">` tags, Claude Code's `SendMessage` |

A target can be a pane id, a pane label or an agent name.

## Changes from agent-flow

- `scan.cjs` takes herdr's panes and their `agent_session` instead of reading
  every live Claude Code session and walking the process tree. Codex rollout
  files are read too, so a herdorc running in Codex shows its messages. It
  adds herdr's message forms and "answers read back", and finds every target
  in a command, not only the first.
- `model.js` is unchanged except: `normalize()` (herdr-app's `agents()` and
  `terminals()`) moved to `lib/herdr.mjs` for herdr's API, a node answers to
  every name in `names`, and answers read back count as replies.
- `main.js` (the gpui-kit view) is replaced by a terminal UI:
  `lib/view.mjs` draws, `bin/orc-flow.mjs` runs it. The diagram shapes, map,
  timeline and examples are not ported.

## Development

```sh
node --test test/
```

`lib/herdr.mjs` copies `ROLES` and the state file path rule from
`shared/roles/roles.json` and `shared/bin/orc_state.py`; the test
`statePath matches shared/bin/orc_state.py` compares the path with Python's.
To try the plugin, link it in a herdr whose config is isolated
(`XDG_CONFIG_HOME=<dir>`) and use a named `herdr --session`: `plugin link`
writes to herdr's config, which every session shares.

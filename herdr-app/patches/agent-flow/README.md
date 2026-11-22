# agent-flow: orc.py handoffs

[herdr-agent-flow](https://github.com/MarcozVD/herdr-agent-flow) is a Herdr app
mod. It draws the agents of a space as a graph: the lead on top, the panes it
started below, and the messages between them. It counts a message when an agent
runs `hc send <pane>`.

hcorc gives a role pane its first task differently. It runs
`orc.py ensure <role> --handoff <file>`, which opens the pane with the task
already in its prompt and never runs `hc send`. Without this patch, agent-flow
shows the pane but not the message that started it.

## What the patch changes

`orc-handoff.patch` changes `mods/agent-flow/scan.cjs`:

- Commands are read as shell words (quotes, `;`, `&&`, `|`, backslash-newline
  continuations, `#` comments, `bash -c '...'`), so an option's value is never taken for a
  pane: `hc send --if idle <pane>` counts as a message to `<pane>`.
- A command `orc.py [--as <agent>] ensure <role> [--name <pane>] --launch <cli> --handoff <file>`
  (`--prompt-file` is the same option, and options may come before `<role>`)
  counts as a message once ensure's JSON answer confirms delivery with
  `prompt_delivered_at_launch` or `prompt_sent`. The answer names the pane
  that received it, including any suffix chosen by orc.py.
- `ensure` without `--launch` starts nothing, and without `--handoff` it only
  opens the pane, so neither counts.
- As with `hc send`, only the pane name leaves the scan, never the handoff.
- `CACHE_VERSION` goes from 2 to 7, so transcripts read before the patch (or
  with an earlier version of it) are read again.

`orc-handoff-test.patch` adds a test of these rules to `test/scan.test.js`.
Only an agent-flow checkout needs it; the installed mod has no tests.

Both patches are made against agent-flow commit
`1201a7c5aeec5eb5e8a2190355da694c7de8f0d3` (2026-11-20).

## Apply to the installed mod

Herdr never updates agent-flow: it's not one of Herdr's shipped mods. The patch
is lost only when a new agent-flow is copied over the installed one. Apply it
again after that:

```sh
patch -p1 -d ~/.config/herdr-app < herdr-app/patches/agent-flow/orc-handoff.patch
herdr-app check ~/.config/herdr-app/mods/agent-flow
```

Run `patch` with `--dry-run` first. If a hunk fails, agent-flow has changed
`target()` in `scan.cjs`. Port the change by hand, then make both patches again
from the new version.

## Check in an agent-flow checkout

```sh
patch -p1 < orc-handoff.patch
patch -p1 < orc-handoff-test.patch
node --test   # Node 22 or newer
```

## Seeing it

agent-flow draws a message for 10 minutes only. To see the patch work, give
hcorc a task that opens a new role pane, and look at the graph while that pane
works. The line from hcorc to the pane should light up, and its box should show
`↓1`.

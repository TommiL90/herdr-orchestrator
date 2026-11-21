---
description: ({{AGENT}} only) Close role panes you created, after confirming
argument-hint: [pane-name ...]
disable-model-invocation: true
allowed-tools: Bash({{ORC}} preflight {{AGENT}})
---

## Orchestrator state

!`{{ORC}} preflight {{AGENT}}`

## Targets

$ARGUMENTS

## What to do

1. Candidates: the panes named in Targets, or all role panes whose owner is
   you if Targets is empty. Never a pane owned by someone else.
2. Leave out panes that are `working` or `blocked`, or whose last result you
   have not accepted yet, unless the user named them explicitly; say why.
3. Ask the user to confirm the exact list (multi-select) before closing.
4. Close each confirmed pane with your layer's cleanup command. Keep report
   and handoff files.
5. Report what was closed and what was kept.

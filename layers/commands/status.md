---
description: ({{AGENT}} only) Show role panes, who owns them, their agents and status
disable-model-invocation: true
allowed-tools: Bash({{ORC}} preflight {{AGENT}})
---

## Orchestrator state

!`{{ORC}} preflight {{AGENT}}`

## What to do

Summarize the state above for the user as a table: role pane, address, owner
(you or someone else), agent, status. Then name which of the three core roles
(gentle-ai-explore, gentle-ai-worker, gentle-ai-verify) have no pane yet; the
other roles get panes only on request (`{{CMD}}{{AGENT}}-panes judges|review|all`).
For any pane whose status is `blocked` or `error`, read its screen and say
exactly what it needs. Change nothing.

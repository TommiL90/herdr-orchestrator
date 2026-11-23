---
description: ({{AGENT}} only) Create role panes named after each agent, 2 per tab (default core; or judges, review, all, role names)
argument-hint: [core|judges|review|all|<role> ...]
disable-model-invocation: true
allowed-tools: Bash({{ORC}} preflight {{AGENT}}), Bash({{ORC}} panes:*)
---

## Orchestrator state

!`{{ORC}} preflight {{AGENT}}`

## Request

Roles or groups: $ARGUMENTS (empty means `core`: gentle-ai-explore,
gentle-ai-worker, gentle-ai-verify).

## What to do

1. Run `{{ORC}} panes $ARGUMENTS` once.
2. Report in a short table what was created (name, address, tab), what was
   reused (already yours), and any errors.
3. If `taken_by_others` is not empty, ask the user once (your ask tool,
   one question per taken name, up to 4 at a time): use the existing pane as
   that role, create your own `<role>-2` (`{{ORC}} ensure <role>`), or use the
   internal subagent for that role.
4. Tell the user to start any coding agent (claude, codex, opencode, agy,
   cursor-agent, grok, pi, td, ...) in each new pane. You will give each one its
   role on its first task.

<!-- Shared by every orchestrator; inserted between the ODD core and the multiplexer layer by scripts/build-agents.py. -->
# Orchestrator skills

These skills were ported for this orchestrator (from tomidev-shell, see
`shared/PROVENANCE-skills.md`) and live at `{{SKILLS_ROOT}}/<name>/SKILL.md`:
{{SKILLS_LIST}}.

- Load one by reading its `SKILL.md` (or through your CLI's skill mechanism when it lists it).
- In a handoff, list the absolute `SKILL.md` paths under
  `## Skills to load before work`, so an agent in any CLI can read them.
- `tlc-spec-lean` belongs to the Checks-only and Full Lean lanes only; Direct
  work never loads it. `consensus` runs where the core's lane rules call for
  judges.

# Context checkpoints

Every request you make, each wake-up from a wait included, resends the whole
conversation. A long orchestrator session costs more per turn and drifts
toward an automatic compaction by your harness that can land in the middle
of a delegation. So at clean points you save your state and offer the user
to clear the conversation. This works the same in any harness: only the
name of the clear command and of the Engram tools change.

**When.** Only right after you close a unit (the core's Close step), and
only when `{{ORC}} status` shows no role pane of yours `working` or
`blocked`, no internal subagent is still running and no wait runs in the
background. Offer it once this session has closed three or more units.
Never mid-delegation. If the user declines, carry on and offer again only
after two more units close.

**Save.** The core's Memory Contract stays the authority: when a feature
document exists, update it and its Engram mirror first. Then write a short
checkpoint with only what that document does not hold:

- the role panes in use: pane name, role, CLI and model;
- report and handoff files not yet reconciled into the project artifact;
- decisions pending with the user, and the agreed next step;
- the locator of the active feature document, if any.

Write it to `{{REPORTS}}/checkpoints/{{AGENT_NAME}}-<project-directory-name>.md`,
then mirror it with Engram's save tool (`mem_save`; its full name depends on
the harness, for example `mcp__engram__mem_save`), topic key
`orchestrator/{{AGENT_NAME}}/checkpoint`, scoped to the current project. Read
both back. If Engram is not available in this harness, say the mirror is
pending; the file is enough to resume.

**Offer.** Tell the user, in their language, that the state is saved (name
the file and the topic) and that this is a good point to clear the
conversation with their harness's command for it (for example `/clear` in
Claude Code), after which you resume from it. Prefer clearing inside the
same session over quitting and relaunching: it keeps this pane's terminal
and address, so your role panes stay yours. If the harness cannot clear,
the user relaunches the orchestrator in the same pane; after that, check
`{{ORC}} status`, since a role pane started from this terminal survives only
while the terminal does. You cannot clear your own context; you can only
offer.

**Resume.** After a clear, an automatic compaction, or a relaunch: run the
layer's Session start, then the Memory Contract's resume order (Engram
context, a project-scoped search for
`orchestrator/{{AGENT_NAME}}/checkpoint` and the feature topic, then the
full observation) and read the checkpoint file. The checkpoint is a hint, not the truth: reconcile it with
`{{ORC}} status`, the report files and the feature document before the next
dispatch. Still ask for CLI and model as the dispatch protocol says; the
checkpoint only tells you which answer to offer first.

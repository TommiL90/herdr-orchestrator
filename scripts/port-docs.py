#!/usr/bin/env python3
"""Port tomidev-shell orchestrator docs to the hcorc/herdorc shared docs.

Each adaptation is an exact, unique replacement. The same table produces the
ported files and the PROVENANCE audit trail, and a reverse check proves that
only logged adaptations changed.
"""
import pathlib
import sys

TOMIDEV = pathlib.Path(__import__("os").environ.get("TOMIDEV_SHELL") or pathlib.Path(__file__).resolve().parents[3] / "tomidev-shell")  # a tomidev-shell clone ($TOMIDEV_SHELL or ../../tomidev-shell)
SRC = TOMIDEV / "assets"
ROOT = pathlib.Path(__file__).resolve().parents[1]
DST = ROOT / "shared/docs"
PROV = ROOT / "shared/PROVENANCE-docs.md"
COMMIT = "6ae777532"

DISPATCH = "the layer's Role dispatch protocol"

# (id, section, rule, old, new, notes)
# old: exact substring (must occur once) or ("line", prefix) to replace one whole line.
A = {}

A["orchestrator-delegation.md"] = [
    ("D1", "Preamble", "1",
     "Bind this to the parent Pi session only, on delegation or routing triggers.",
     "Bind this to the parent orchestrator session only, on delegation or routing triggers.", None),
    ("D2", "## Handoff", "8",
     "The runtime still enforces Allowed edit surfaces and safety, not a particular plan filename or directory.",
     "Allowed edit surfaces and safety still bind (enforced by instruction and verification, not by the runtime), not a particular plan filename or directory.", None),
    ("D3", "## Handoff", "9",
     "Before delegating, declare a subject via `orchestrator_session_id` (reference).",
     "Before delegating, declare a short task subject (reference).",
     "Tool `orchestrator_session_id` has no equivalent; the rule (declare a subject before delegating) is kept."),
    ("D4", "#### Delegation Triggers (intro)", "2",
     "stop and delegate through the runtime's subagent mechanism before continuing",
     f"stop and delegate through {DISPATCH} before continuing", None),
    ("D5", "#### Delegation Triggers, 4. Track", "4",
     "optional available Engram mirror and `todo` defaults",
     "optional available Engram mirror and todo-list defaults (the session's todo list tool, e.g. TodoWrite, when available)", None),
    ("D6", "#### Delegation Triggers, 5. Writer trigger", "9",
     "the retired document-path admission gate is not a reason",
     "a document-path admission gate (none exists here) is not a reason",
     "Pi runtime admission gate has no equivalent; the rule (it is never a reason to manufacture a builtin feature contract) is kept."),
    ("D7", "#### Delegation Triggers, 5. Writer trigger", "4",
     "fallback feature document, mirror and `todo`; no automatic commits",
     "fallback feature document, mirror and todo list; no automatic commits", None),
    ("D8", "#### Delegation Triggers, 7. Context backstop", "8",
     ("line", "7. **Context backstop:**"),
     "7. **Context backstop:** when the context backstop applies, pause and delegate the next bounded unit of work that needs several steps. No runtime signals it here (Claude Code and the other CLIs send no such signal): the orchestrator judges it by instruction from its own context use, for example a long accumulated thread or an imminent compaction.",
     "\"when the runtime signals it\" -> \"when the context backstop applies\" plus one sentence stating there is no runtime signal and the orchestrator judges it by instruction."),
    ("D9", "#### Delegation Triggers (writer chain paragraph)", "2",
     ("line", "For a large task's bounded writes, prefer"),
     f"For a large task's bounded writes, prefer `gentle-ai-worker` dispatched through {DISPATCH} (a herdr pane when available, else the internal Claude Code subagent of the same name), then a user-configured `worker`. If neither worker is available (no pane and no internal subagent), report it as unavailable: in Claude Code the Agent tool already is the internal-subagent path, so there is no separate native fallback. If no delegation mechanism is available, stop and explain the blocker. If the generic writer chain is unavailable, use the layer's internal-subagent path or stop.",
     "\"the installed package-owned `gentle-ai-worker`\" -> \"`gentle-ai-worker` dispatched through the layer's Role dispatch protocol (...)\"; \"If neither worker definition exists, fall back to the native `Agent` even when `subagent_*` tools are available.\" -> \"If neither worker is available (no pane and no internal subagent), report it as unavailable: in Claude Code the Agent tool already is the internal-subagent path, so there is no separate native fallback.\"; \"use the documented native generic fallback or stop\" -> \"use the layer's internal-subagent path or stop\". Sentence \"If no delegation mechanism is available, stop and explain the blocker.\" unchanged."),
    ("D10", "## Launch", "8",
     "(runtime-enforced) or isolated worktrees.",
     "(enforced by instruction and verification, not by the runtime) or isolated worktrees.", None),
    ("D11", "## Launch", "10",
     "Pass the session's resolved skill paths under",
     "Pass the skill paths the orchestrator resolved itself for the session under", None),
    ("D12", "## Launch", "2",
     "Check the agent's declared `tools` in `subagent_list_agents` before launching:",
     "Check the role's declared `tools` before launching (its internal subagent definition, or the CLI running in the target pane):", None),
    ("D13", "## Launch", "3",
     ("line", "- Background (policy on,"),
     f"- Background (policy on, a background-capable dispatch present): internal subagents use the Agent tool's `run_in_background`, which returns a task id at once; pane dispatch is asynchronous by nature, and {DISPATCH} defines how to wait. End the turn and resume on the completion notification; never sleep or poll for status. Otherwise run in the foreground. Detail: reference.",
     "\"`subagent_run` present\" -> \"a background-capable dispatch present\"; \"omit `mode`; it returns a task id at once\" -> Agent tool `run_in_background` + pane asynchronous wording; \"its `gentle-agents.result` completion message\" -> \"the completion notification\"; \"poll `subagent_status`\" -> \"poll for status\"."),
    ("D14", "#### Key Learnings closing block", "2",
     "or their native `Agent` fallback",
     "whether dispatched to a herdr pane or to the internal Claude Code subagent of the same name", None),
    ("D15", "#### Key Learnings closing block", "8, 7",
     "Engram automatically extracts and persists the items; the worker does not parse the block or call passive-capture tools; this is separate from explicit `mem_save`.",
     "Engram extracts and persists the items automatically only where its passive-capture hook is installed for the CLI that ran the role (for internal Claude Code subagents, the Engram plugin's SubagentStop hook); neither Claude Code nor the other CLIs guarantee it otherwise. The worker does not parse the block or call passive-capture tools; this is separate from explicit `mcp__engram__mem_save`.",
     "Automatic extraction was a runtime guarantee in the source; now conditional on an installed hook (rule 8). `mem_save` -> `mcp__engram__mem_save` (rule 7)."),
]

A["orchestrator-delegation-reference.md"] = [
    ("R1", "Preamble", "1",
     "Bind this to the parent Pi session only.",
     "Bind this to the parent orchestrator session only.", None),
    ("R2", "## Session subject and display identity", "9",
     "before delegation or cross-session coordination, call `orchestrator_session_id`: short, non-sensitive `subject`.",
     f"before delegation or cross-session coordination, declare a short, non-sensitive `subject` (no runtime tool records it here; use it to name the dispatch, for example the pane or worker label {DISPATCH} uses).",
     "Tool call removed; the subject rules (short, non-sensitive, not for small direct tasks, batched, no private detail) are kept."),
    ("R3", "## Session subject and display identity", "9",
     "It preserves canonical names/human renames;",
     "Preserve canonical names/human renames;",
     "Subject \"It\" (the removed tool) -> imperative, so the rule survives without the tool."),
    ("R4", "### Publish and find classified work", "9",
     "Publish explicit `state.work` with `orchestrator_session_id` or `subagent_run.work`;\nnever publish private history. Opt into search with `orchestrator_list.filter`.\nFollow tool schemas and `docs/gentle-agents-activity.md` for usage.\n",
     "No runtime work catalog exists here. For any work shared across sessions or panes,\nnever publish private history.\n",
     "Mechanism removed (publish via `orchestrator_session_id`/`subagent_run.work`, search opt-in via `orchestrator_list.filter`, `docs/gentle-agents-activity.md`); rule \"never publish private history\" kept verbatim."),
    ("R5", "### Publish and find classified work", "9",
     "Consented read-only helpers capture validated root work and exact task annotations\non the owner's current catalog page; unmatched notes are not current work.\nClassification stays untrusted and non-authoritative. Existing caps and supported\nmodel-cost dialog grants apply.",
     "Unmatched notes are not current work.\nClassification stays untrusted and non-authoritative. Existing caps apply.",
     "Removed: \"Consented read-only helpers capture validated root work and exact task annotations on the owner's current catalog page\" (catalog helpers, no equivalent) and \"and supported model-cost dialog grants\" (Pi model-cost dialog, no equivalent). Kept: \"unmatched notes are not current work\", \"Classification stays untrusted and non-authoritative\", \"Existing caps ... apply\"."),
    ("R6", "## Pi Runtime Overlays (heading)", "1",
     "## Pi Runtime Overlays",
     "## Runtime Overlays", None),
    ("R7", "## Runtime Overlays", "1, 2",
     "These sections bind generic delegation to Pi's runtime,",
     f"These sections bind generic delegation to the orchestrator's runtime (Claude Code plus {DISPATCH}),", None),
    ("R8", "### Delegation Rules", "4, 9",
     "Progress is published automatically from the todo list: never call `orchestrator_session_id` just to report status.",
     "Progress shows in the todo list (the session's todo list tool, e.g. TodoWrite, when available); no runtime publishes it elsewhere: never declare a subject or publish state just to report status.",
     "Automatic publication from the todo list was a Pi/gentle-agents mechanism; tool `orchestrator_session_id` removed; the rule (no call just to report status) is kept."),
    ("R9", "### Delegation Rules", "9",
     "and publish own `state` only for objective",
     "and share own `state` (with the user or across sessions and panes) only for objective", None),
    ("R10", "### Delegation Rules", "9",
     "helper reasoning requires explicit model-cost UI permission.",
     "helper reasoning requires the user's explicit permission for its model cost (no model-cost UI dialog exists here).", None),
    ("R11", "#### Pi Trigger Runtime Bindings (heading)", "1",
     "#### Pi Trigger Runtime Bindings",
     "#### Trigger Runtime Bindings", None),
    ("R12", "#### Trigger Runtime Bindings", "2",
     "Once a trigger fires, the parent MUST delegate through the best available subagent runtime. Prefer `subagent_run` when present; otherwise use Pi's native `Agent`; never fall back to an external pane, terminal, session, window, or remote worker.",
     f"Once a trigger fires, the parent MUST delegate through the best available subagent runtime: {DISPATCH}. Prefer a herdr pane for the role when available; otherwise use the internal Claude Code subagent of the same name (Agent tool); never fall back to a pane, terminal, session, window, or remote worker outside that protocol.",
     "The source forbade any external pane; herdr panes are now the primary dispatch, so the prohibition is kept for anything outside the layer's protocol (see ambiguity A2)."),
    ("R13", "#### Trigger Runtime Bindings, 1. Evidence-budget rule", "2, 9",
     ("line", "1. **Evidence-budget rule**: when the reading exceeds"),
     f"1. **Evidence-budget rule**: when the reading exceeds the evidence budget, launch the closest read-only mapping role with fresh context and a narrow mapping task that returns a handoff of at most ~2k tokens with `path:line` evidence. Route generic exploration first to `gentle-ai-explore` through {DISPATCH} (a herdr pane when available); if no pane is available, use the internal Claude Code subagent of the same name with the same read-only mapping task and report the fallback; with neither available, report it as unavailable.",
     "Removed pi-subagents builtins \"`scout`, `context-builder`, or\" (rule 9); \"subagent\" -> \"role\"; \"the installed package-owned `gentle-ai-explore`; if missing or unusable, use native `Agent` with the same read-only mapping task and report the fallback\" -> pane / internal subagent / unavailable chain (rule 2)."),
    ("R14", "#### Trigger Runtime Bindings, 4. Context backstop", "8",
     "4. **Context backstop**: when the runtime signals the context backstop,",
     "4. **Context backstop**: when the context backstop applies (judged by the orchestrator; no runtime signals it here),", None),
    ("R15", "#### 2. Simple Delegation", "2",
     "Prefer the `subagent_*` tools (`subagent_run`, status/result helpers) when the Pi Subagents extension is installed, because they run the user's configured project/global subagent definitions and preserve history/background behavior.",
     f"Prefer {DISPATCH} (a herdr pane when available, else the internal Claude Code subagent of the same name), because it runs the user's configured role definitions and preserves history/background behavior.",
     "\"project/global subagent definitions\" -> \"role definitions\"; \"they\" -> \"it\"."),
    ("R16", "Background block marker (open)", "9",
     "<!-- gentle-pi:background-subagents -->",
     "<!-- background-subagents -->", "Pi package render marker renamed; block boundaries kept."),
    ("R17", "Background block marker (close)", "9",
     "<!-- /gentle-pi:background-subagents -->",
     "<!-- /background-subagents -->", None),
    ("R18", "#### Background Subagent Policy", "3",
     "If the policy is off OR the `subagent_run` tool is unavailable, run every delegation in the foreground — `mode: \"task\"` when `subagent_*` tools exist, otherwise the native `Agent` fallback — always.",
     f"If the policy is off OR no background-capable dispatch is available, run every delegation in the foreground — the Agent tool without `run_in_background` for internal subagents; for pane dispatch, wait for its result as {DISPATCH} defines before continuing — always.", None),
    ("R19", "#### Background Subagent Policy", "3",
     "When the policy is on and `subagent_run` is available:",
     "When the policy is on and background-capable dispatch is available (the Agent tool's `run_in_background` for internal subagents, or pane dispatch):", None),
    ("R20", "#### Background Subagent Policy, bullet 1", "3",
     ("line", "- The runtime already defaults `subagent_run`"),
     "- Claude Code does not default to background, so pass the Agent tool's `run_in_background: true` for ordinary internal-subagent delegation; pane dispatch is asynchronous by nature. Either returns at once (a task id or the pane/worker identity); the terminal stays free and the human keeps typing. Pass a `label` of three to six words naming the work (the Agent tool's `description`, or the pane/worker name the layer uses).",
     "\"The runtime already defaults `subagent_run` to `mode: \"background\"` under this policy in interactive and RPC sessions, so omit `mode` for ordinary delegation.\" -> explicit `run_in_background: true` + pane asynchronous; \"It returns a task id at once\" -> \"Either returns at once (a task id or the pane/worker identity)\"; label rule (three to six words) kept, mapped to Agent `description` or pane/worker name."),
    ("R21", "#### Background Subagent Policy, bullet 2", "3, 9",
     ("line", "- A child `agent_end`"),
     f"- A child that ends a turn retains its latest answer, but that is not completion: its CLI or subagent may still retry, compact, or run a queued follow-up. Treat the task as finished only once it has settled (for internal subagents, the Agent tool's completion notification; for panes, the completion condition {DISPATCH} defines); only then release its slot, publish its background result, or terminate it. If it exits first, report failure with its retained answer as diagnostics.",
     "Pi events `agent_end` / `agent_settled` -> \"ends a turn\" / \"has settled (...)\"; \"Pi may still\" -> \"its CLI or subagent may still\"; \"queue slot\" -> \"slot\" (no runtime queue). Failure rule kept verbatim."),
    ("R22", "#### Background Subagent Policy, bullet 3", "3",
     ("line", "- When a background task settles"),
     f"- When a background task settles, its result arrives as a message in this session (for internal subagents, one completion notification per task; for panes, as {DISPATCH} defines) and starts a new turn if you are idle. Wait for it: end the turn once launches and any non-overlapping work are done. Never sleep or periodically poll status or results for completion or cache maintenance; pane waits follow the layer. Retain the task ID (or pane/worker identity). Check status (a pane's state, as the layer defines) only at a real orchestration decision boundary: user-requested inspection, relevant scope change, input request, or suspected abnormal behavior. Never relaunch equivalent work merely because it is queued or running. Cache warming belongs to the CLI's native runtime, never to model-driven maintenance turns.",
     "\"(custom type `gentle-agents.result`, one per task)\" -> internal notification / pane per layer; \"poll `subagent_status`/`subagent_result`\" -> \"poll status or results\" + \"pane waits follow the layer\"; \"Retain the task ID.\" -> \"+ (or pane/worker identity)\"; \"Use `subagent_status` only at\" -> \"Check status (a pane's state, as the layer defines) only at\"; \"Pi's native runtime\" -> \"the CLI's native runtime\"."),
    ("R23", "#### Background Subagent Policy, bullet 5", "3",
     ("line", "- Use `mode: \"task\"` only when"),
     "- Run an internal subagent in the foreground (no `run_in_background`) only when the subagent must ask the human something mid-flight (foreground dialogs, such as permission prompts, reach the human; background dialogs may not; a pane's CLI asks the human in its own pane) or when the human asked to wait.",
     "\"Use `mode: \"task\"`\" -> \"Run an internal subagent in the foreground (no `run_in_background`)\"; \"(task-mode dialogs reach the human; background dialogs are dismissed)\" -> Claude Code / pane equivalents."),
    ("R24", "#### Background Subagent Policy, bullet 6", "9",
     "the runner queues beyond `max_concurrency`.",
     "no runner queues here, so stay within any concurrency limit the layer sets.", None),
    ("R25", "#### Background Subagent Policy, bullet 7", "3, 9",
     ("line", "- Finished tasks persist across restarts;"),
     "- Finished tasks persist across restarts only where the session or pane still holds their result; running internal subagents are stopped when the orchestrator session exits and must be relaunched, never claimed as recovered; a pane's work counts as recovered only from what the pane observably shows.",
     "\"Finished tasks persist across restarts\" (Pi guarantee) -> conditional; \"running ones are stopped when pi exits\" -> \"running internal subagents are stopped when the orchestrator session exits\"; rule \"must be relaunched, never claimed as recovered\" kept; pane clause added."),
    ("R26", "#### 2. Simple Delegation (waiting)", "3",
     "use `bash_background` with the wait inside the command",
     "use the Bash tool's `run_in_background` (or the layer's background runner) with the wait inside the command", None),
    ("R27", "#### 2. Simple Delegation (verification)", "2",
     "also requires `gentle-ai-verify` (or the native `Agent` fallback, with the same",
     f"also requires `gentle-ai-verify` through {DISPATCH} (a herdr pane, or the internal Claude Code subagent of the same name as fallback, with the same", None),
    ("R28", "#### 2. Simple Delegation (generic fallback)", "2",
     "if `subagent_*` tools are unavailable, fall back to Pi's native `Agent` tool in the current runtime; never fall back to an external pane, terminal, session, window, or remote worker.",
     f"if no herdr pane is available for the role, fall back to the internal Claude Code subagent of the same name (Agent tool) in the current runtime, per {DISPATCH}; never fall back to a pane, terminal, session, window, or remote worker outside that protocol.",
     "See ambiguity A2 (external-pane prohibition)."),
    ("R29", "#### Pi Subagent Model Routing (heading)", "1",
     "#### Pi Subagent Model Routing",
     "#### Subagent Model Routing", None),
    ("R30", "#### Subagent Model Routing", "2, 9",
     ("line", "For generic Pi subagents"),
     "For generic subagents (`gentle-ai-explore`, `gentle-ai-worker`, `gentle-ai-verify`, a user-configured `worker`, or other general agents), do not pass the `model` parameter by default. Let the role's own configuration resolve model and thinking: the internal subagent definition's frontmatter, the CLI and settings the user chose for the pane, global subagent config, and runtime defaults.",
     "\"generic Pi subagents (`delegate`, `worker`, `scout`, `context-builder`, `oracle`, `planner`, `researcher`, ...)\" -> the destination's generic roles + user-configured `worker`; \"Let `pi-subagents` resolve model and thinking from `.pi/settings.json`, `.pi/subagents.json`, global subagent config, and runtime defaults\" -> internal definition frontmatter / pane CLI settings / global subagent config / runtime defaults."),
    ("R31", "## Pi Delegation Bindings (heading)", "1",
     "## Pi Delegation Bindings",
     "## Delegation Bindings", None),
    ("R32", "## Delegation Bindings", "2, 9",
     "- Use `scout`/`context-builder` to compress",
     "- Use `gentle-ai-explore` to compress", None),
    ("R33", "## Delegation Bindings", "8",
     "(runtime-enforced) or isolated worktrees.",
     "(enforced by instruction and verification, not by the runtime) or isolated worktrees.", None),
    ("R34", "## Delegation Bindings", "9",
     ("line", "- Use `outputMode: \"file-only\"`"),
     "- For large child reports, have the child write the full report to a file outside the repository and return its path; summarize only decisions, blockers, and paths in the parent thread.",
     "pi-subagents parameter removed; the rule (large reports stay out of the parent thread; summarize only decisions, blockers, and paths) is kept."),
    ("R35", "### Canonical Lightweight Workflows", "2, 9",
     "scout maps flow/files",
     "explorer maps flow/files", None),
]

A["orchestrator-memory.md"] = [
    ("M1", "Preamble", "1",
     "Bind this to the parent Pi session only,",
     "Bind this to the parent orchestrator session only,", None),
    ("M2", "### Organic feature continuity", "7",
     "then mirror through the existing injected Engram save tool.",
     "then mirror through `mcp__engram__mem_save` (Engram MCP, only when callable).", None),
    ("M3", "### Organic feature continuity (resume)", "7",
     "On resume, use `mem_context`, then project/feature-scoped `mem_search`, and `mem_get_observation` for the full saved document;",
     "On resume, use `mcp__engram__mem_context`, then project/feature-scoped `mcp__engram__mem_search`, and `mcp__engram__mem_get_observation` for the full saved document;",
     "`mem_get_observation` is not in rule 7's list but is the same Engram MCP family; mapped the same way."),
    ("M4", "### Organic feature continuity (resume)", "7",
     "Use the injected equivalents of these existing memory tools, never invent availability.",
     "Use these Engram MCP tools only when callable, never invent availability.", None),
    ("M5", "### Organic feature continuity (todo projection)", "4",
     "The existing `todo` tool is the required session/UI projection",
     "The session's todo list tool (e.g. TodoWrite), when available, is the required session/UI projection", None),
    ("M6", "### Organic feature continuity (todo projection)", "4",
     "create or rebuild the visible `todo` list",
     "create or rebuild the visible todo list", None),
    ("M7", "Memory lifecycle rule", "7",
     "call the injected Engram review tool with action `list`",
     "call the Engram review tool (`mcp__engram__mem_review`) with action `list`",
     "Verified: `mcp__engram__mem_review` accepts action `list` | `mark_reviewed`."),
    ("M8", "Memory lifecycle rule", "7",
     "If the injected Engram review tool is unavailable, do not fail the task. Continue with the injected Engram context/search tools,",
     "If the Engram review tool (`mcp__engram__mem_review`) is unavailable, do not fail the task. Continue with the Engram context/search tools (`mcp__engram__mem_context`, `mcp__engram__mem_search`),", None),
    ("M9", "Memory lifecycle rule", "7",
     "Do NOT call the injected Engram review tool with action `mark_reviewed` automatically.",
     "Do NOT call `mcp__engram__mem_review` with action `mark_reviewed` automatically.", None),
]

A["orchestrator-prompts.md"] = [
    ("P1", "Preamble", "1",
     "Bind this to the parent Pi session only.",
     "Bind this to the parent orchestrator session only.", None),
    ("P2", "### Lossless Blocking Prompts, Native route", "5, 9",
     ("line", "- Native route:"),
     "- Native route: For every strictly closed single-select envelope, use `AskUserQuestion` only when it is available in the current interactive session and the complete envelope is exactly representable as one question with 2-4 ordered options. It always adds a free-text \"Other\" entry that cannot be closed: for every closed envelope, including consent prompts, maintenance authorizations, and any exact opaque-token decision, treat an \"Other\" answer as typed input under Answer validation below (accept it only when it matches exactly one presented option), never as a new choice. Pass each closed-envelope option's user-facing label and description; `AskUserQuestion` has no opaque `value`, so keep each option's envelope-owned canonical option token on the orchestrator side, keyed by its exact presented label. A closed selection returns exactly one presented label; map it to the envelope-owned choice and its canonical token once, then select any envelope-owned continuation or invocation once where present. A custom selection returns free text through the \"Other\" entry; never pass it through opaque-token mapping (Answer validation alone decides it). Do not re-parse a closed selection's ordinal; map its returned label by exact match only. For an open/free-text envelope, use `AskUserQuestion` only when it can represent it (its \"Other\" entry carries the free text), never for a closed domain. Otherwise fall through to the Fallback clause below.",
     "`ask_user_choice` -> `AskUserQuestion` (rule 5); \"in the current interactive TUI\" -> \"in the current interactive session\" (rule 9); \"It shows a \"Type your answer\" free-text entry unless closed: pass `allowCustomResponse: false` for every such envelope, ...\" -> AskUserQuestion's always-on \"Other\" entry routed through Answer validation (rule 9, no equivalent of `allowCustomResponse: false`); \"plus its envelope-owned canonical option token as opaque `value`. A closed selection returns exactly one `value` as an opaque token; map it to the envelope-owned choice once\" -> token kept orchestrator-side, keyed by exact label; \"returns free text through `customResponse`\" -> \"through the \"Other\" entry\"; \"Do not re-parse a closed selection's label or ordinal.\" -> \"Do not re-parse a closed selection's ordinal; map its returned label by exact match only.\"; \"`ask_user_question` is the externally owned open/free-text questionnaire: use it only for an open/free-text envelope it can represent, never for a closed domain.\" -> \"For an open/free-text envelope, use `AskUserQuestion` only when it can represent it (...), never for a closed domain.\" Ordering, 2-4 option bound, Fallback fall-through kept."),
]

A["orchestrator-skills.md"] = [
    ("S1", "Preamble", "1",
     "Bind this to the parent Pi session only,",
     "Bind this to the parent orchestrator session only,", None),
    ("S2", "## Skill Registry Protocol (effective view)", "10",
     ("line", "The effective view is"),
     "The effective view is the session's available-skills listing (`<available_skills>` where the CLI renders it; in Claude Code, the skills listed for the Skill tool) plus the on-disk rows the orchestrator resolves itself: on each primary-session agent start, it lists the `SKILL.md` files found in project and other agents' skill directories that the session did not load (every skill when the session renders no available-skills listing); there are no on-disk rows when there are none. An on-disk row whose name is also in the available-skills listing won precedence (a project copy outranks a user or package copy); use the on-disk row. In the available-skills listing the `Trigger / description` is the skill's description (`<description>`) and the `Path` is its location (`<location>`); when the listing shows no path, resolve the exact `SKILL.md` path on disk. Use this view to select skills and delegate:",
     "\"`<available_skills>`\" -> \"the session's available-skills listing (...)\"; \"the on-disk rows of the `Effective session skills` system-prompt block: on each enabled primary-session agent start, that block lists the skills found ... that Pi did not load (every skill when Pi renders no `<available_skills>`), and is absent when there are none\" -> \"the on-disk rows the orchestrator resolves itself: on each primary-session agent start, it lists the `SKILL.md` files found ... that the session did not load (...); there are no on-disk rows when there are none\"; \"A block row\" / \"the block's row\" -> \"An on-disk row\" / \"the on-disk row\"; precedence rule kept verbatim; added \"when the listing shows no path, resolve the exact `SKILL.md` path on disk\"."),
    ("S3", "## Skill Registry Protocol (view unavailable)", "10",
     "The view is unavailable only when neither `<available_skills>` nor the block is present:",
     "The view is unavailable only when neither the available-skills listing nor the orchestrator's on-disk resolution is available:", None),
    ("S4", "## Intent-Driven Skill Discovery", "10",
     "do not treat injected `<available_skills>` as complete.",
     "do not treat the session's available-skills listing as complete.", None),
    ("S5", "## Intent-Driven Skill Discovery, Discovery order 1", "10",
     "1. Consult `<available_skills>` and the `Effective session skills` block, when present,",
     "1. Consult the available-skills listing and the orchestrator's on-disk rows, when present,", None),
    ("S6", "## Intent-Driven Skill Discovery, Discovery order 3", "1, 10",
     "not a complete Pi view.",
     "not a complete session view.", None),
    ("S7", "Common intent hints table", "10",
     "| Tomidev harness & lanes    | `tomidev`                              |",
     "| Product / web UI design    | `gentle-ui-design`                     |",
     "The `tomidev` skill describes the Tomidev Shell harness and is not ported (the ODD core replaces it); "
     "`gentle-ui-design` is ported (shared/PROVENANCE-skills.md) and takes its row."),
]

A["orchestrator-tracking.md"] = [
    ("T1", "Preamble", "1",
     "Bind this to the parent Pi session only.",
     "Bind this to the parent orchestrator session only.", None),
    ("T2", "Preamble", "X",
     "(see `orchestrator.md` Task Size)",
     "(see the always-on core's Task Size)",
     "`orchestrator.md` (Tomidev always-on core) is ported by another agent to an unknown destination path; reference neutralized (ambiguity A11)."),
    ("T3", "#### Authorization and progress", "X",
     "Size every task by the always-on Task Size section (`orchestrator.md`);",
     "Size every task by the always-on Task Size section;", None),
    ("T4", "#### Authorization and progress (close gate)", "4",
     "in the feature document or `todo` is still pending",
     "in the feature document or todo list is still pending", None),
    ("T5", "#### Signaling the ODD phase to the Gentle prompt (heading)", "6, 9",
     "#### Signaling the ODD phase to the Gentle prompt",
     "#### Signaling the ODD phase to the layer's phase indicator", None),
    ("T6", "#### Signaling the ODD phase", "6, 9, 4",
     ("line", "When the Tomidev Shell prompt is active"),
     "When the layer's ODD phase indicator is active, its working label is inferred automatically from the primary session's tool activity by the layer's hook: read-only tools show `exploring`, edits `implementing`, test/typecheck/lint/build runs `checking`, user questions `deciding`, and todo-list or feature-document edits `planning`. Explicit reports through the layer's ODD phase indicator refine that label with phases tools cannot show (for example `authorizing`, `researching`, `deciding`, `closing`). An explicit report survives following read-only tool calls, while a stronger inferred phase (`deciding`, `planning`, `implementing`, `checking`) replaces it. Report a phase through the layer's ODD phase indicator only when the primary session's own ODD phase actually changes, never per tool call, per thought, or on a fixed cadence; clear it only to leave the current phase before its turn ends. Its bounded vocabulary covers the ODD protocol steps above, not a strict one-to-one mapping: `authorizing` (1), `exploring` (2), `researching`/`deciding` (3), `deciding` again for step 4's classify decision (no dedicated label), `planning` (5), `implementing` (6), `checking`/`closing` (7). This is a best-effort UI label, not a source of truth: with no inferred or reported phase it falls back to a generic working indicator, unknown tools and ambiguous shell commands leave it unchanged, and an invalid token never clears an already-reported phase. Never report it from a subagent or background/child task; it reports only the primary session's own phase.",
     "\"When the Tomidev Shell prompt is active, its working label is inferred automatically\" -> \"When the layer's ODD phase indicator is active, its working label is inferred automatically ... by the layer's hook\" (rules 6, 9; both layers ship a PostToolUse inference hook); \"`todo` or feature-document edits\" -> \"todo-list or feature-document edits\" (rule 4); \"`gentle_odd_phase` refines that label\" -> \"Explicit reports through the layer's ODD phase indicator refine that label\" (rule 6); \"; an explicit report survives\" -> \". An explicit report survives\"; \"Call `gentle_odd_phase` only when\" -> \"Report a phase through the layer's ODD phase indicator only when\" (rule 6); \"call it with `clear` only to leave\" -> \"clear it only to leave\" (rule 6); \"Never call it from a subagent\" -> \"Never report it from a subagent\" (rule 6). Vocabulary mapping, best-effort semantics, primary-session-only rule kept verbatim."),
    ("T7", "## Delivery", "9",
     "Recommend a split only when `diff_budget` reports",
     "Recommend a split only when the diff budget (the `diff_budget` script where the project ships it; otherwise a production-line count of the branch diff against its base) reports",
     "`diff_budget` is the Tomidev package script `diff_budget.py`; thresholds >400 production lines and >=2 independent units kept."),
]

A["orchestrator-verification.md"] = [
    ("V1", "## Project verification integration", "8",
     "Runtime safety and exact parent-authorized command boundaries remain binding.",
     "Safety and exact parent-authorized command boundaries remain binding, enforced by instruction and verification, not by the runtime.", None),
    ("V2", "## Verification rule (normative)", "8, 9",
     "while a tool call is in flight the runner's stall watchdog uses `tool_stall_timeout_ms` (default 30 minutes) instead of the `stall_timeout_ms` idle budget.",
     "while a tool call is in flight, do not treat the writer as stalled or idle; no runtime watchdog applies here.",
     "Pi runner watchdog (`tool_stall_timeout_ms`, default 30 minutes, vs the `stall_timeout_ms` idle budget) has no equivalent and is removed with its 30-minute figure; the rule (foreground commands are live work, not silence) is kept."),
    ("V3", "## Verification rule (normative), after table", "8",
     "(runtime admits its launch on a `Risk: item N` line or sentence, a feature-document task line, or past the context backstop)",
     "(launch it only on a `Risk: item N` line or sentence, a feature-document task line, or past the context backstop; this admission holds by instruction and verification, not by the runtime)", None),
    ("V4", "## Parallel review protocol, 4. Verify handoff", "8",
     "the runtime removes each subagent's own TMPDIR, which holds that copy;",
     "no runtime removes it here, so whoever created the copy removes it when done;", None),
]

A["orchestrator-writer.md"] = [
    ("W1", "Preamble", "1",
     "Parent Pi session only.",
     "Parent orchestrator session only.", None),
    ("W2", "Preamble", "9, 2",
     "Configured per-agent models (`subagents.json` `model_profiles`) still apply",
     "Configured per-agent models (the internal subagent definition's `model`, or the CLI and model the user configured for the pane) still apply", None),
    ("W3", "Preamble, Parallelism", "2, 3",
     "launch every independent unit in the same turn via `subagent_run` with `mode: \"background\"`,",
     f"launch every independent unit in the same turn through {DISPATCH} (pane dispatch is asynchronous by nature; internal subagents use the Agent tool's `run_in_background: true`),", None),
    ("W4", "#### Allowed edit surfaces (MANDATORY)", "8",
     "neither the writer nor the human supplies them. After",
     "neither the writer nor the human supplies them. Claude Code and the other CLIs do not enforce the surfaces: they hold by instruction (the writer prompt) and by verification (after the writer returns, the parent compares its changed paths, for example from `git status --porcelain`, against the surfaces), plus isolated worktrees where parallel writers use them. After",
     "Sentence added: runtime enforcement (writer confinement) replaced by instruction + post-return verification + isolated worktrees."),
    ("W5", "#### Allowed edit surfaces (MANDATORY)", "8",
     "After an admission rejection, repair",
     "After an admission rejection (the writer's own refusal or the parent's pre-launch or post-return check; no runtime admission gate exists here), repair", None),
    ("W6", "#### Allowed edit surfaces (MANDATORY)", "2",
     "(`gentle-ai-worker`, a user-configured `worker`, or the native `Agent` fallback)",
     "(`gentle-ai-worker` in a herdr pane or as the internal Claude Code subagent of the same name, or a user-configured `worker`)", None),
    ("W7", "#### Allowed edit surfaces (MANDATORY), test scratch", "8, 9",
     "The runtime owns session scratch; `/td:scratch` lists or cleans recorded clones and worktrees.",
     "No runtime owns session scratch here: whoever creates scratch clones and worktrees records and cleans them.", None),
]

ORDER = [
    "orchestrator-delegation.md",
    "orchestrator-delegation-reference.md",
    "orchestrator-memory.md",
    "orchestrator-prompts.md",
    "orchestrator-skills.md",
    "orchestrator-tracking.md",
    "orchestrator-verification.md",
    "orchestrator-writer.md",
]


def header(name):
    return (f"<!-- Ported from tomidev-shell@{COMMIT} assets/{name}; adapted for Claude Code "
            f"(hcorc/herdorc). Adaptations: shared/PROVENANCE-docs.md -->\n\n")


def apply(name):
    text = (SRC / name).read_text(encoding="utf-8")
    log = []
    for aid, section, rule, old, new, notes in A[name]:
        if isinstance(old, tuple):
            prefix = old[1]
            lines = text.split("\n")
            idx = [i for i, l in enumerate(lines) if l.startswith(prefix)]
            if len(idx) != 1:
                sys.exit(f"{name} {aid}: line prefix matched {len(idx)} times: {prefix!r}")
            original = lines[idx[0]]
            lines[idx[0]] = new
            text = "\n".join(lines)
        else:
            n = text.count(old)
            if n != 1:
                sys.exit(f"{name} {aid}: substring matched {n} times: {old!r}")
            original = old
            text = text.replace(old, new)
        log.append((aid, section, rule, original, new, notes))
    return text, log


def reverse_check(name, ported, log):
    body = ported[len(header(name)):]
    for aid, _s, _r, original, new, _n in reversed(log):
        if body.count(new) != 1:
            sys.exit(f"reverse {name} {aid}: new text occurs {body.count(new)} times")
        body = body.replace(new, original)
    if body != (SRC / name).read_text(encoding="utf-8"):
        sys.exit(f"reverse {name}: reconstructed text differs from source")


def q(s):
    return s.replace("\n", " ⏎ ")


def main():
    logs = {}
    for name in ORDER:
        text, log = apply(name)
        ported = header(name) + text
        reverse_check(name, ported, log)
        (DST / name).write_text(ported, encoding="utf-8")
        logs[name] = log
        print(f"{name}: {len(log)} adaptations + header")
    PROV.write_text(render(logs), encoding="utf-8")
    print("PROVENANCE written")


def render(logs):
    out = [PRE]
    out.append("## Summary\n\n| File | Adaptations (excluding header) |\n|---|---|\n")
    for name in ORDER:
        out.append(f"| `docs/{name}` | {len(logs[name])} |\n")
    out.append(f"| **Total** | **{sum(len(v) for v in logs.values())}** |\n\n")
    out.append("Every file also received adaptation **G0** (rule: Output): the provenance comment line plus one blank line prepended above the original first line.\n\n")
    for name in ORDER:
        out.append(f"## `docs/{name}`\n\nSource: `assets/{name}` @ `{COMMIT}`. Adaptations: {len(logs[name])} (+ G0).\n\n")
        for aid, section, rule, original, new, notes in logs[name]:
            out.append(f"- **{aid}** · Section: {section} · Rule {rule}\n")
            out.append(f"  - Original: «{q(original)}»\n")
            out.append(f"  - New: «{q(new)}»\n")
            if notes:
                out.append(f"  - Detail: {notes}\n")
        out.append("\n")
    out.append(POST)
    return "".join(out)


PRE = f"""# Provenance: orchestrator reference documents

Audit trail for the eight orchestrator reference documents in `shared/docs/`, ported from Tomidev Shell
(`tomidev-shell`, commit `{COMMIT}`, tomidev 1.3.0, `assets/`) to the
Claude Code orchestrators `hcorc` and `herdorc`.

Ported text never names a removed source mechanism except where a conditional fallback still uses it (`diff_budget`, T7); the removed mechanisms are recorded only here.

Method: each adaptation is one exact, unique replacement applied to an otherwise byte-identical copy of the
source. A reverse check (re-applying every logged replacement backwards) reconstructs each source file
exactly, which proves no unlogged change exists. Text, rules, thresholds, numbers, ordering and headings not
listed below are verbatim.

## Rules legend

1. Identity: "Tomidev Shell" (and "Pi" as the runtime/session name) -> "the orchestrator". "ODD" / "Organic Driven Development" kept.
2. Delegation tool: `subagent_run`, `subagent_*`, Pi subagents, package-owned Pi agents, native `Agent` fallback -> dispatch to the role through the layer's Role dispatch protocol (herdr pane when available, else the internal Claude Code subagent of the same name).
3. Background: background subagents -> Agent tool `run_in_background` for internal subagents; pane dispatch asynchronous (layer defines waiting); `bash_background` -> Bash tool `run_in_background` or the layer's background runner.
4. `todo` tool -> the session's todo list tool (e.g. TodoWrite), when available.
5. `ask_user` (here `ask_user_choice` / `ask_user_question`) -> `AskUserQuestion`.
6. `gentle_odd_phase` -> the layer's ODD phase indicator (only on real phase change, primary session only, never from a subagent, best effort).
7. Memory: `mem_*` -> `mcp__engram__mem_*` (Engram MCP, only when callable); Engram rules kept.
8. Runtime-enforced guarantees (Allowed edit surfaces, writer admission, child safety, confinement, launch seams, context backstop and other runtime signals) -> rule kept, stated as enforced by instruction and verification (and isolated worktrees where allowed), not by the runtime.
9. Tomidev slash commands, Pi extensions, TUI labels, package internals with no equivalent -> mechanism removed, carried rule kept.
10. Skill registry: the orchestrator resolves `SKILL.md` paths itself and lists them under `## Skills to load before work`; fallbacks kept.
11. Existing Claude Code / MCP tool names unchanged.
12. Generated technical artifacts stay in English.
X. Cross-reference to a source file outside this port's scope, neutralized (same treatment the task prescribes for the full-delegation profile).

## Out of scope and dropped references

- `assets/orchestrator-full-delegation.md` and `assets/orchestrator-full-delegation-card.md` were not ported. None of the eight ported files references them (checked with `grep -n full-delegation`), so no reference had to be dropped.
- `assets/orchestrator.md` (the always-on core) is ported by another agent. Its two references in `orchestrator-tracking.md` were neutralized (T2, T3). References to sections of the core by name (Task Size, Mechanisms, Risk line, **Authorized work continuity**, `## Memory Contract`, `## Skill Registry Protocol`, `## Intent-Driven Skill Discovery`) are kept verbatim.

"""

POST = """## Reviewed and kept verbatim on purpose

These source fragments were examined and left unchanged because they still hold or are not runtime-specific:

- Role and skill names: `gentle-ai-explore`, `gentle-ai-worker`, `gentle-ai-verify`, `jd-judge-a`, `jd-judge-b`, `review-refuter`, `requesting-code-review`, `consensus`, `delivery`, `comment-writer`, `tlc-spec-lean`, `clean-code`, `testing`, `ego-browser`, and the `tomidev` skill row in the skills intent table (see ambiguity A12).
- `gentle-ai-worker`'s Verification contract, `## Known environmental failures`, `status: partial`, `status: interaction_required`, `skill_resolution` values (`paths-injected`, `fallback-registry`, `fallback-path`, `none`): role contracts, not runtime.
- `.atl/skill-registry.md` (shared disk registry, not Pi-specific).
- "Use the platform's native bounded worker for delegated-direct work." (platform-neutral wording).
- "When a code-execution tool such as `codemode` is available, ..." (conditional; dormant where no such tool exists; see ambiguity A10).
- "No TUI toggle or per-task chat choice activates this policy." (negative statement, still true).
- "Background subagent policy: on|off (capability: ready|absent)" status line wording (see ambiguity A13).
- Issue references `(gentle-shell#1731)` and `(#1713)` in `orchestrator-verification.md` (provenance; see ambiguity A15).
- The Spanish ordinal aliases `la N` and `opción N` in Answer validation (user-facing answer domain, not a generated artifact).
- `## Specs` / `## Tasks` / `## Log`, `S#`, `C#`, `L1`, `.agents/designs/features/<feature>/` and every threshold (3 calls, ~10k tokens, ~5 lookups, ~2k tokens, 100+ lines, 400 lines, 3 rounds, 2-4 options, 1-5 Key Learnings items, 20 characters, 4 words). The one number removed is the Pi runner's 30-minute `tool_stall_timeout_ms` default (V2), because no runtime watchdog exists here.

## Ambiguities (decisions taken, flagged for review)

- **A1 Native generic `Agent` fallback.** Source: "If neither worker definition exists, fall back to the native `Agent` even when `subagent_*` tools are available." and "if missing or unusable, use native `Agent`". The Pi native `Agent` was a *generic* agent without the role definition. Mapped, per the task instructions, to "no pane and no internal subagent: report it as unavailable". Alternative not taken: fall back to Claude Code's `general-purpose` subagent with the same constraints. (D9, D14, R12, R13, R27, R28, W6)
- **A2 External-pane prohibition.** Source: "never fall back to an external pane, terminal, session, window, or remote worker." Herdr panes are now the primary dispatch, so the literal rule would forbid the design. Kept as "never fall back to a pane, terminal, session, window, or remote worker outside that protocol". (R12, R28)
- **A3 Context backstop.** Source: "when the runtime signals it" / "when the runtime signals the context backstop". No CLI sends such a signal. Mapped to an orchestrator judgment ("a long accumulated thread or an imminent compaction"). Other mentions ("past the context backstop", "the Context backstop below", "the context backstop" in writer.md) kept verbatim and now depend on that judgment. (D8, R14, V3)
- **A4 Session subject and classified work.** Source: "call `orchestrator_session_id`: short, non-sensitive `subject`" and the whole "Publish and find classified work" section (`state.work`, `orchestrator_list.filter`, catalog helpers, model-cost dialog grants). Mechanism removed; rules kept; the subject is suggested as the pane or worker label. Whether the layer should actually use it that way is for the layer authors. (D3, R2-R5, R8-R10)
- **A5 AskUserQuestion vs closed envelopes.** Source: "pass `allowCustomResponse: false` for every such envelope" and "its envelope-owned canonical option token as opaque `value`". `AskUserQuestion` always offers a free-text "Other" entry and has no opaque value. Mapped: "Other" answers go through Answer validation (must match exactly one presented option); canonical tokens are kept orchestrator-side keyed by exact label. Source "`ask_user_question` is the externally owned open/free-text questionnaire" also mapped to `AskUserQuestion` (rule 5 gives one target for both). (P2)
- **A6 Skill effective view.** Source: "`<available_skills>` plus the on-disk rows of the `Effective session skills` system-prompt block ... that Pi did not load". Claude Code's skill listing shows no paths and nothing injects that block. Mapped to the orchestrator's own on-disk resolution; which directories count as "project and other agents' skill directories" is left unspecified, as in the source. (S2-S6)
- **A7 Phase indicator inference.** Resolved: both layers ship a PostToolUse hook that infers the phase from tool activity, so the text states the inference as the layer's hook (no extra sentence).
- **A8 `diff_budget`.** Source: "Recommend a split only when `diff_budget` reports >400 production lines and >=2 independent units". `diff_budget.py` is a Tomidev package script. Mapped to the script where shipped, else a production-line count of the branch diff. (T7)
- **A9 Todo statuses.** Source (`orchestrator-memory.md`, unchanged): "project them as `dropped`" and "mark it `blocked`". TodoWrite only has `pending`, `in_progress`, `completed`; how to project `dropped`/`blocked` is not defined. Text left verbatim.
- **A10 `codemode`.** Source (unchanged): "When a code-execution tool such as `codemode` is available, refresh the Engram mirror inside one script". No such tool in Claude Code; the clause is conditional and stays dormant.
- **A11 `orchestrator.md` references.** Source: "(see `orchestrator.md` Task Size)" and "(`orchestrator.md`)". Destination path of the ported core is unknown; neutralized to "the always-on core". (T2, T3)
- **A12 `tomidev` skill.** Source row: "Tomidev harness & lanes | `tomidev`". No `tomidev` skill exists under `~/.claude/skills` or `~/.agents/skills`. Row kept verbatim (discovery step 5 already reports a missing skill); remove or rename it if the destination has an ODD skill.
- **A13 Background semantics for panes.** Source: "A child `agent_end` ... `agent_settled`", "background dialogs are dismissed", "the runner queues beyond `max_concurrency`", "Finished tasks persist across restarts; running ones are stopped when pi exits", and the rendered "Background subagent policy" status line. Each mapped to a Claude Code / pane equivalent that defers pane specifics to the layer; the status line now has to come from the ported core. (R18-R25)
- **A14 Key Learnings capture.** Source: "Engram automatically extracts and persists the items". True for internal Claude Code subagents only when the Engram plugin's SubagentStop hook is installed (verified in the local plugin), not guaranteed for pane CLIs. Made conditional; no orchestrator-side `mcp__engram__mem_capture_passive` call was added. (D15)
- **A15 Issue references.** Source: "## Parallel review protocol (gentle-shell#1731)" and "(#1713)". These point into the source project's tracker. Kept verbatim (heading rule).
- **A16 `outputMode: "file-only"`.** Mapped to "have the child write the full report to a file outside the repository and return its path". Read-only roles writing a scratch file outside the repository is an assumption. (R34)
- **A17 Per-agent models.** Source: "`subagents.json` `model_profiles`" and "`.pi/settings.json`, `.pi/subagents.json`". Mapped to the internal subagent definition's `model` / the pane CLI's configuration. (W2, R30)
- **A18 Scratch ownership.** Source: "the runtime removes each subagent's own TMPDIR" and "The runtime owns session scratch; `/td:scratch` lists or cleans". Mapped to "whoever created it removes or cleans it". (V4, W7)
- **A19 Stall watchdog number.** Source: "the runner's stall watchdog uses `tool_stall_timeout_ms` (default 30 minutes) instead of the `stall_timeout_ms` idle budget". Removed with the mechanism; only "live work, not silence" remains. If a pane wait needs a ceiling, the layer has to set one. (V2)

## Verification

- Forward: every replacement matched its source text exactly once (script aborts otherwise).
- Reverse: for each file, stripping the header and undoing every logged replacement reproduces the source byte-for-byte.
- `diff` between each source and destination file shows only the hunks listed above plus the header.
"""

if __name__ == "__main__":
    main()

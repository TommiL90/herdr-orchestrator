# Provenance: orchestrator reference documents

Audit trail for the eight orchestrator reference documents in `shared/docs/`, ported from Tomidev Shell
(`tomidev-shell`, commit `6ae777532`, tomidev 1.3.0, `assets/`) to the
orchestrators `hcorc` and `herdorc` (any coding CLI).

Ported text never names a removed source mechanism except where a conditional fallback still uses it (`diff_budget`, T7); the removed mechanisms are recorded only here.

Method: each adaptation is one exact, unique replacement applied to an otherwise byte-identical copy of the
source. A reverse check (re-applying every logged replacement backwards) reconstructs each source file
exactly, which proves no unlogged change exists. Text, rules, thresholds, numbers, ordering and headings not
listed below are verbatim.

## Rules legend

1. Identity: "Tomidev Shell" (and "Pi" as the runtime/session name) -> "the orchestrator". "ODD" / "Organic Driven Development" kept.
2. Delegation tool: `subagent_run`, `subagent_*`, Pi subagents, package-owned Pi agents, native `Agent` fallback -> dispatch to the role through the layer's Role dispatch protocol (role pane when available, else the internal subagent of the same name).
3. Background: background subagents -> the subagent tool's background option for internal subagents; pane dispatch asynchronous (layer defines waiting); `bash_background` -> Bash tool background mode or the layer's background runner.
4. `todo` tool -> the todo tool, when available.
5. `ask_user` (here `ask_user_choice` / `ask_user_question`) -> the ask tool.
6. `gentle_odd_phase` -> the layer's ODD phase indicator (only on real phase change, primary session only, never from a subagent, best effort).
7. Memory: `mem_*` -> `mcp__engram__mem_*` (Engram MCP, only when callable); Engram rules kept.
8. Runtime-enforced guarantees (Allowed edit surfaces, writer admission, child safety, confinement, launch seams, context backstop and other runtime signals) -> rule kept, stated as enforced by instruction and verification (and isolated worktrees where allowed), not by the runtime.
9. Tomidev slash commands, Pi extensions, TUI labels, package internals with no equivalent -> mechanism removed, carried rule kept.
10. Skill registry: the orchestrator resolves `SKILL.md` paths itself and lists them under `## Skills to load before work`; fallbacks kept.
11. Tool names are neutral (ask tool, subagent tool, shell tool, todo tool; MCP tools by server and tool name); each CLI's prompt maps them to its own tools.
12. Generated technical artifacts stay in English.
13. Artifact file names follow the skill that writes them: tlc-spec-lean records mutations in `mutations.json`.
X. Cross-reference to a source file outside this port's scope, neutralized (same treatment the task prescribes for the full-delegation profile).

## Out of scope and dropped references

- `assets/orchestrator-full-delegation.md` and `assets/orchestrator-full-delegation-card.md` were not ported. None of the eight ported files references them (checked with `grep -n full-delegation`), so no reference had to be dropped.
- `assets/orchestrator.md` (the always-on core) is ported by another agent. Its two references in `orchestrator-tracking.md` were neutralized (T2, T3). References to sections of the core by name (Task Size, Mechanisms, Risk line, **Authorized work continuity**, `## Memory Contract`, `## Skill Registry Protocol`, `## Intent-Driven Skill Discovery`) are kept verbatim.

## Summary

| File | Adaptations (excluding header) |
|---|---|
| `docs/orchestrator-delegation.md` | 15 |
| `docs/orchestrator-delegation-reference.md` | 35 |
| `docs/orchestrator-memory.md` | 10 |
| `docs/orchestrator-prompts.md` | 2 |
| `docs/orchestrator-skills.md` | 7 |
| `docs/orchestrator-tracking.md` | 7 |
| `docs/orchestrator-verification.md` | 4 |
| `docs/orchestrator-writer.md` | 7 |
| **Total** | **87** |

Every file also received adaptation **G0** (rule: Output): the provenance comment line plus one blank line prepended above the original first line.

## `docs/orchestrator-delegation.md`

Source: `assets/orchestrator-delegation.md` @ `6ae777532`. Adaptations: 15 (+ G0).

- **D1** · Section: Preamble · Rule 1
  - Original: «Bind this to the parent Pi session only, on delegation or routing triggers.»
  - New: «Bind this to the parent orchestrator session only, on delegation or routing triggers.»
- **D2** · Section: ## Handoff · Rule 8
  - Original: «The runtime still enforces Allowed edit surfaces and safety, not a particular plan filename or directory.»
  - New: «Allowed edit surfaces and safety still bind (enforced by instruction and verification, not by the runtime), not a particular plan filename or directory.»
- **D3** · Section: ## Handoff · Rule 9
  - Original: «Before delegating, declare a subject via `orchestrator_session_id` (reference).»
  - New: «Before delegating, declare a short task subject (reference).»
  - Detail: Tool `orchestrator_session_id` has no equivalent; the rule (declare a subject before delegating) is kept.
- **D4** · Section: #### Delegation Triggers (intro) · Rule 2
  - Original: «stop and delegate through the runtime's subagent mechanism before continuing»
  - New: «stop and delegate through the layer's Role dispatch protocol before continuing»
- **D5** · Section: #### Delegation Triggers, 4. Track · Rule 4
  - Original: «optional available Engram mirror and `todo` defaults»
  - New: «optional available Engram mirror and todo-list defaults (the todo tool, when available)»
- **D6** · Section: #### Delegation Triggers, 5. Writer trigger · Rule 9
  - Original: «the retired document-path admission gate is not a reason»
  - New: «a document-path admission gate (none exists here) is not a reason»
  - Detail: Pi runtime admission gate has no equivalent; the rule (it is never a reason to manufacture a builtin feature contract) is kept.
- **D7** · Section: #### Delegation Triggers, 5. Writer trigger · Rule 4
  - Original: «fallback feature document, mirror and `todo`; no automatic commits»
  - New: «fallback feature document, mirror and todo list; no automatic commits»
- **D8** · Section: #### Delegation Triggers, 7. Context backstop · Rule 8
  - Original: «7. **Context backstop:** when the runtime signals it, pause and delegate the next bounded unit of work that needs several steps.»
  - New: «7. **Context backstop:** when the context backstop applies, pause and delegate the next bounded unit of work that needs several steps. No runtime signals it here (no CLI sends such a signal): the orchestrator judges it by instruction from its own context use, for example a long accumulated thread or an imminent compaction.»
  - Detail: "when the runtime signals it" -> "when the context backstop applies" plus one sentence stating there is no runtime signal and the orchestrator judges it by instruction.
- **D9** · Section: #### Delegation Triggers (writer chain paragraph) · Rule 2
  - Original: «For a large task's bounded writes, prefer the installed package-owned `gentle-ai-worker`, then a user-configured `worker`. If neither worker definition exists, fall back to the native `Agent` even when `subagent_*` tools are available. If no delegation mechanism is available, stop and explain the blocker. If the generic writer chain is unavailable, use the documented native generic fallback or stop.»
  - New: «For a large task's bounded writes, prefer `gentle-ai-worker` dispatched through the layer's Role dispatch protocol (a role pane when available, else the internal subagent of the same name), then a user-configured `worker`. If neither worker is available (no pane and no internal subagent), report it as unavailable: the subagent tool already is the internal-subagent path, so there is no separate native fallback. If no delegation mechanism is available, stop and explain the blocker. If the generic writer chain is unavailable, use the layer's internal-subagent path or stop.»
  - Detail: "the installed package-owned `gentle-ai-worker`" -> "`gentle-ai-worker` dispatched through the layer's Role dispatch protocol (...)"; "If neither worker definition exists, fall back to the native `Agent` even when `subagent_*` tools are available." -> "If neither worker is available (no pane and no internal subagent), report it as unavailable: the subagent tool already is the internal-subagent path, so there is no separate native fallback."; "use the documented native generic fallback or stop" -> "use the layer's internal-subagent path or stop". Sentence "If no delegation mechanism is available, stop and explain the blocker." unchanged.
- **D10** · Section: ## Launch · Rule 8
  - Original: «(runtime-enforced) or isolated worktrees.»
  - New: «(enforced by instruction and verification, not by the runtime) or isolated worktrees.»
- **D11** · Section: ## Launch · Rule 10
  - Original: «Pass the session's resolved skill paths under»
  - New: «Pass the skill paths the orchestrator resolved itself for the session under»
- **D12** · Section: ## Launch · Rule 2
  - Original: «Check the agent's declared `tools` in `subagent_list_agents` before launching:»
  - New: «Check the role's declared `tools` before launching (its internal subagent definition, or the CLI running in the target pane):»
- **D13** · Section: ## Launch · Rule 3
  - Original: «- Background (policy on, `subagent_run` present): omit `mode`; it returns a task id at once. End the turn and resume on its `gentle-agents.result` completion message; never sleep or poll `subagent_status`. Otherwise run in the foreground. Detail: reference.»
  - New: «- Background (policy on, a background-capable dispatch present): internal subagents use the subagent tool's background option, which returns a task id at once; pane dispatch is asynchronous by nature, and the layer's Role dispatch protocol defines how to wait. End the turn and resume on the completion notification; never sleep or poll for status. Otherwise run in the foreground. Detail: reference.»
  - Detail: "`subagent_run` present" -> "a background-capable dispatch present"; "omit `mode`; it returns a task id at once" -> the subagent tool's background option + pane asynchronous wording; "its `gentle-agents.result` completion message" -> "the completion notification"; "poll `subagent_status`" -> "poll for status".
- **D14** · Section: #### Key Learnings closing block · Rule 2
  - Original: «or their native `Agent` fallback»
  - New: «whether dispatched to a role pane or to the internal subagent of the same name»
- **D15** · Section: #### Key Learnings closing block · Rule 8, 7
  - Original: «Engram automatically extracts and persists the items; the worker does not parse the block or call passive-capture tools; this is separate from explicit `mem_save`.»
  - New: «Engram extracts and persists the items automatically only where its passive-capture hook is installed for the CLI that ran the role (for internal subagents, the Engram plugin's SubagentStop hook); no CLI guarantees it otherwise. The worker does not parse the block or call passive-capture tools; this is separate from explicit Engram's `mem_save`.»
  - Detail: Automatic extraction was a runtime guarantee in the source; now conditional on an installed hook (rule 8). `mem_save` -> Engram's `mem_save` (rule 7).

## `docs/orchestrator-delegation-reference.md`

Source: `assets/orchestrator-delegation-reference.md` @ `6ae777532`. Adaptations: 35 (+ G0).

- **R1** · Section: Preamble · Rule 1
  - Original: «Bind this to the parent Pi session only.»
  - New: «Bind this to the parent orchestrator session only.»
- **R2** · Section: ## Session subject and display identity · Rule 9
  - Original: «before delegation or cross-session coordination, call `orchestrator_session_id`: short, non-sensitive `subject`.»
  - New: «before delegation or cross-session coordination, declare a short, non-sensitive `subject` (no runtime tool records it here; use it to name the dispatch, for example the pane or worker label the layer's Role dispatch protocol uses).»
  - Detail: Tool call removed; the subject rules (short, non-sensitive, not for small direct tasks, batched, no private detail) are kept.
- **R3** · Section: ## Session subject and display identity · Rule 9
  - Original: «It preserves canonical names/human renames;»
  - New: «Preserve canonical names/human renames;»
  - Detail: Subject "It" (the removed tool) -> imperative, so the rule survives without the tool.
- **R4** · Section: ### Publish and find classified work · Rule 9
  - Original: «Publish explicit `state.work` with `orchestrator_session_id` or `subagent_run.work`; ⏎ never publish private history. Opt into search with `orchestrator_list.filter`. ⏎ Follow tool schemas and `docs/gentle-agents-activity.md` for usage. ⏎ »
  - New: «No runtime work catalog exists here. For any work shared across sessions or panes, ⏎ never publish private history. ⏎ »
  - Detail: Mechanism removed (publish via `orchestrator_session_id`/`subagent_run.work`, search opt-in via `orchestrator_list.filter`, `docs/gentle-agents-activity.md`); rule "never publish private history" kept verbatim.
- **R5** · Section: ### Publish and find classified work · Rule 9
  - Original: «Consented read-only helpers capture validated root work and exact task annotations ⏎ on the owner's current catalog page; unmatched notes are not current work. ⏎ Classification stays untrusted and non-authoritative. Existing caps and supported ⏎ model-cost dialog grants apply.»
  - New: «Unmatched notes are not current work. ⏎ Classification stays untrusted and non-authoritative. Existing caps apply.»
  - Detail: Removed: "Consented read-only helpers capture validated root work and exact task annotations on the owner's current catalog page" (catalog helpers, no equivalent) and "and supported model-cost dialog grants" (Pi model-cost dialog, no equivalent). Kept: "unmatched notes are not current work", "Classification stays untrusted and non-authoritative", "Existing caps ... apply".
- **R6** · Section: ## Pi Runtime Overlays (heading) · Rule 1
  - Original: «## Pi Runtime Overlays»
  - New: «## Runtime Overlays»
- **R7** · Section: ## Runtime Overlays · Rule 1, 2
  - Original: «These sections bind generic delegation to Pi's runtime,»
  - New: «These sections bind generic delegation to the orchestrator's runtime (the coding CLI it runs in plus the layer's Role dispatch protocol),»
- **R8** · Section: ### Delegation Rules · Rule 4, 9
  - Original: «Progress is published automatically from the todo list: never call `orchestrator_session_id` just to report status.»
  - New: «Progress shows in the todo list (the todo tool, when available); no runtime publishes it elsewhere: never declare a subject or publish state just to report status.»
  - Detail: Automatic publication from the todo list was a Pi/gentle-agents mechanism; tool `orchestrator_session_id` removed; the rule (no call just to report status) is kept.
- **R9** · Section: ### Delegation Rules · Rule 9
  - Original: «and publish own `state` only for objective»
  - New: «and share own `state` (with the user or across sessions and panes) only for objective»
- **R10** · Section: ### Delegation Rules · Rule 9
  - Original: «helper reasoning requires explicit model-cost UI permission.»
  - New: «helper reasoning requires the user's explicit permission for its model cost (no model-cost UI dialog exists here).»
- **R11** · Section: #### Pi Trigger Runtime Bindings (heading) · Rule 1
  - Original: «#### Pi Trigger Runtime Bindings»
  - New: «#### Trigger Runtime Bindings»
- **R12** · Section: #### Trigger Runtime Bindings · Rule 2
  - Original: «Once a trigger fires, the parent MUST delegate through the best available subagent runtime. Prefer `subagent_run` when present; otherwise use Pi's native `Agent`; never fall back to an external pane, terminal, session, window, or remote worker.»
  - New: «Once a trigger fires, the parent MUST delegate through the best available subagent runtime: the layer's Role dispatch protocol. Prefer a role pane for the role when available; otherwise use the internal subagent of the same name (subagent tool); never fall back to a pane, terminal, session, window, or remote worker outside that protocol.»
  - Detail: The source forbade any external pane; role panes are now the primary dispatch, so the prohibition is kept for anything outside the layer's protocol (see ambiguity A2).
- **R13** · Section: #### Trigger Runtime Bindings, 1. Evidence-budget rule · Rule 2, 9
  - Original: «1. **Evidence-budget rule**: when the reading exceeds the evidence budget, launch `scout`, `context-builder`, or the closest read-only mapping subagent with fresh context and a narrow mapping task that returns a handoff of at most ~2k tokens with `path:line` evidence. Route generic exploration first to the installed package-owned `gentle-ai-explore`; if missing or unusable, use native `Agent` with the same read-only mapping task and report the fallback.»
  - New: «1. **Evidence-budget rule**: when the reading exceeds the evidence budget, launch the closest read-only mapping role with fresh context and a narrow mapping task that returns a handoff of at most ~2k tokens with `path:line` evidence. Route generic exploration first to `gentle-ai-explore` through the layer's Role dispatch protocol (a role pane when available); if no pane is available, use the internal subagent of the same name with the same read-only mapping task and report the fallback; with neither available, report it as unavailable.»
  - Detail: Removed pi-subagents builtins "`scout`, `context-builder`, or" (rule 9); "subagent" -> "role"; "the installed package-owned `gentle-ai-explore`; if missing or unusable, use native `Agent` with the same read-only mapping task and report the fallback" -> pane / internal subagent / unavailable chain (rule 2).
- **R14** · Section: #### Trigger Runtime Bindings, 4. Context backstop · Rule 8
  - Original: «4. **Context backstop**: when the runtime signals the context backstop,»
  - New: «4. **Context backstop**: when the context backstop applies (judged by the orchestrator; no runtime signals it here),»
- **R15** · Section: #### 2. Simple Delegation · Rule 2
  - Original: «Prefer the `subagent_*` tools (`subagent_run`, status/result helpers) when the Pi Subagents extension is installed, because they run the user's configured project/global subagent definitions and preserve history/background behavior.»
  - New: «Prefer the layer's Role dispatch protocol (a role pane when available, else the internal subagent of the same name), because it runs the user's configured role definitions and preserves history/background behavior.»
  - Detail: "project/global subagent definitions" -> "role definitions"; "they" -> "it".
- **R16** · Section: Background block marker (open) · Rule 9
  - Original: «<!-- gentle-pi:background-subagents -->»
  - New: «<!-- background-subagents -->»
  - Detail: Pi package render marker renamed; block boundaries kept.
- **R17** · Section: Background block marker (close) · Rule 9
  - Original: «<!-- /gentle-pi:background-subagents -->»
  - New: «<!-- /background-subagents -->»
- **R18** · Section: #### Background Subagent Policy · Rule 3
  - Original: «If the policy is off OR the `subagent_run` tool is unavailable, run every delegation in the foreground — `mode: "task"` when `subagent_*` tools exist, otherwise the native `Agent` fallback — always.»
  - New: «If the policy is off OR no background-capable dispatch is available, run every delegation in the foreground — the subagent tool in the foreground for internal subagents; for pane dispatch, wait for its result as the layer's Role dispatch protocol defines before continuing — always.»
- **R19** · Section: #### Background Subagent Policy · Rule 3
  - Original: «When the policy is on and `subagent_run` is available:»
  - New: «When the policy is on and background-capable dispatch is available (the subagent tool's background option for internal subagents, or pane dispatch):»
- **R20** · Section: #### Background Subagent Policy, bullet 1 · Rule 3
  - Original: «- The runtime already defaults `subagent_run` to `mode: "background"` under this policy in interactive and RPC sessions, so omit `mode` for ordinary delegation. It returns a task id at once; the terminal stays free and the human keeps typing. Pass a `label` of three to six words naming the work.»
  - New: «- The CLIs do not default to background, so use the subagent tool's background option for ordinary internal-subagent delegation; pane dispatch is asynchronous by nature. Either returns at once (a task id or the pane/worker identity); the terminal stays free and the human keeps typing. Pass a `label` of three to six words naming the work (the subagent tool's `description`, or the pane/worker name the layer uses).»
  - Detail: "The runtime already defaults `subagent_run` to `mode: "background"` under this policy in interactive and RPC sessions, so omit `mode` for ordinary delegation." -> explicit `run_in_background: true` + pane asynchronous; "It returns a task id at once" -> "Either returns at once (a task id or the pane/worker identity)"; label rule (three to six words) kept, mapped to Agent `description` or pane/worker name.
- **R21** · Section: #### Background Subagent Policy, bullet 2 · Rule 3, 9
  - Original: «- A child `agent_end` retains its latest answer but is not completion: Pi may still retry, compact, or run a queued follow-up. Treat the task as finished only at `agent_settled`; only then release its queue slot, publish its background result, or terminate it. If it exits first, report failure with its retained answer as diagnostics.»
  - New: «- A child that ends a turn retains its latest answer, but that is not completion: its CLI or subagent may still retry, compact, or run a queued follow-up. Treat the task as finished only once it has settled (for internal subagents, the subagent tool's completion notification; for panes, the completion condition the layer's Role dispatch protocol defines); only then release its slot, publish its background result, or terminate it. If it exits first, report failure with its retained answer as diagnostics.»
  - Detail: Pi events `agent_end` / `agent_settled` -> "ends a turn" / "has settled (...)"; "Pi may still" -> "its CLI or subagent may still"; "queue slot" -> "slot" (no runtime queue). Failure rule kept verbatim.
- **R22** · Section: #### Background Subagent Policy, bullet 3 · Rule 3
  - Original: «- When a background task settles, its result arrives as a message in this session (custom type `gentle-agents.result`, one per task) and starts a new turn if you are idle. Wait for it: end the turn once launches and any non-overlapping work are done. Never sleep or periodically poll `subagent_status`/`subagent_result` for completion or cache maintenance. Retain the task ID. Use `subagent_status` only at a real orchestration decision boundary: user-requested inspection, relevant scope change, input request, or suspected abnormal behavior. Never relaunch equivalent work merely because it is queued or running. Cache warming belongs to Pi's native runtime, never to model-driven maintenance turns.»
  - New: «- When a background task settles, its result arrives as a message in this session (for internal subagents, one completion notification per task; for panes, as the layer's Role dispatch protocol defines) and starts a new turn if you are idle. Wait for it: end the turn once launches and any non-overlapping work are done. Never sleep or periodically poll status or results for completion or cache maintenance; pane waits follow the layer. Retain the task ID (or pane/worker identity). Check status (a pane's state, as the layer defines) only at a real orchestration decision boundary: user-requested inspection, relevant scope change, input request, or suspected abnormal behavior. Never relaunch equivalent work merely because it is queued or running. Cache warming belongs to the CLI's native runtime, never to model-driven maintenance turns.»
  - Detail: "(custom type `gentle-agents.result`, one per task)" -> internal notification / pane per layer; "poll `subagent_status`/`subagent_result`" -> "poll status or results" + "pane waits follow the layer"; "Retain the task ID." -> "+ (or pane/worker identity)"; "Use `subagent_status` only at" -> "Check status (a pane's state, as the layer defines) only at"; "Pi's native runtime" -> "the CLI's native runtime".
- **R23** · Section: #### Background Subagent Policy, bullet 5 · Rule 3
  - Original: «- Use `mode: "task"` only when the subagent must ask the human something mid-flight (task-mode dialogs reach the human; background dialogs are dismissed) or when the human asked to wait.»
  - New: «- Run an internal subagent in the foreground (not in the background) only when the subagent must ask the human something mid-flight (foreground dialogs, such as permission prompts, reach the human; background dialogs may not; a pane's CLI asks the human in its own pane) or when the human asked to wait.»
  - Detail: "Use `mode: "task"`" -> "Run an internal subagent in the foreground (not in the background)"; "(task-mode dialogs reach the human; background dialogs are dismissed)" -> Claude Code / pane equivalents.
- **R24** · Section: #### Background Subagent Policy, bullet 6 · Rule 9
  - Original: «the runner queues beyond `max_concurrency`.»
  - New: «no runner queues here, so stay within any concurrency limit the layer sets.»
- **R25** · Section: #### Background Subagent Policy, bullet 7 · Rule 3, 9
  - Original: «- Finished tasks persist across restarts; running ones are stopped when pi exits and must be relaunched, never claimed as recovered.»
  - New: «- Finished tasks persist across restarts only where the session or pane still holds their result; running internal subagents are stopped when the orchestrator session exits and must be relaunched, never claimed as recovered; a pane's work counts as recovered only from what the pane observably shows.»
  - Detail: "Finished tasks persist across restarts" (Pi guarantee) -> conditional; "running ones are stopped when pi exits" -> "running internal subagents are stopped when the orchestrator session exits"; rule "must be relaunched, never claimed as recovered" kept; pane clause added.
- **R26** · Section: #### 2. Simple Delegation (waiting) · Rule 3
  - Original: «use `bash_background` with the wait inside the command»
  - New: «use the shell tool's background mode (or the layer's background runner) with the wait inside the command»
- **R27** · Section: #### 2. Simple Delegation (verification) · Rule 2
  - Original: «also requires `gentle-ai-verify` (or the native `Agent` fallback, with the same»
  - New: «also requires `gentle-ai-verify` through the layer's Role dispatch protocol (a role pane, or the internal subagent of the same name as fallback, with the same»
- **R28** · Section: #### 2. Simple Delegation (generic fallback) · Rule 2
  - Original: «if `subagent_*` tools are unavailable, fall back to Pi's native `Agent` tool in the current runtime; never fall back to an external pane, terminal, session, window, or remote worker.»
  - New: «if no role pane is available for the role, fall back to the internal subagent of the same name (subagent tool) in the current runtime, per the layer's Role dispatch protocol; never fall back to a pane, terminal, session, window, or remote worker outside that protocol.»
  - Detail: See ambiguity A2 (external-pane prohibition).
- **R29** · Section: #### Pi Subagent Model Routing (heading) · Rule 1
  - Original: «#### Pi Subagent Model Routing»
  - New: «#### Subagent Model Routing»
- **R30** · Section: #### Subagent Model Routing · Rule 2, 9
  - Original: «For generic Pi subagents (`delegate`, `worker`, `scout`, `context-builder`, `oracle`, `planner`, `researcher`, or other general agents), do not pass the `model` parameter by default. Let `pi-subagents` resolve model and thinking from `.pi/settings.json`, `.pi/subagents.json`, global subagent config, and runtime defaults.»
  - New: «For generic subagents (`gentle-ai-explore`, `gentle-ai-worker`, `gentle-ai-verify`, a user-configured `worker`, or other general agents), do not pass the `model` parameter by default. Let the role's own configuration resolve model and thinking: the internal subagent definition's frontmatter, the CLI and settings the user chose for the pane, global subagent config, and runtime defaults.»
  - Detail: "generic Pi subagents (`delegate`, `worker`, `scout`, `context-builder`, `oracle`, `planner`, `researcher`, ...)" -> the destination's generic roles + user-configured `worker`; "Let `pi-subagents` resolve model and thinking from `.pi/settings.json`, `.pi/subagents.json`, global subagent config, and runtime defaults" -> internal definition frontmatter / pane CLI settings / global subagent config / runtime defaults.
- **R31** · Section: ## Pi Delegation Bindings (heading) · Rule 1
  - Original: «## Pi Delegation Bindings»
  - New: «## Delegation Bindings»
- **R32** · Section: ## Delegation Bindings · Rule 2, 9
  - Original: «- Use `scout`/`context-builder` to compress»
  - New: «- Use `gentle-ai-explore` to compress»
- **R33** · Section: ## Delegation Bindings · Rule 8
  - Original: «(runtime-enforced) or isolated worktrees.»
  - New: «(enforced by instruction and verification, not by the runtime) or isolated worktrees.»
- **R34** · Section: ## Delegation Bindings · Rule 9
  - Original: «- Use `outputMode: "file-only"` for large child reports and summarize only decisions, blockers, and paths in the parent thread.»
  - New: «- For large child reports, have the child write the full report to a file outside the repository and return its path; summarize only decisions, blockers, and paths in the parent thread.»
  - Detail: pi-subagents parameter removed; the rule (large reports stay out of the parent thread; summarize only decisions, blockers, and paths) is kept.
- **R35** · Section: ### Canonical Lightweight Workflows · Rule 2, 9
  - Original: «scout maps flow/files»
  - New: «explorer maps flow/files»

## `docs/orchestrator-memory.md`

Source: `assets/orchestrator-memory.md` @ `6ae777532`. Adaptations: 10 (+ G0).

- **M1** · Section: Preamble · Rule 1
  - Original: «Bind this to the parent Pi session only,»
  - New: «Bind this to the parent orchestrator session only,»
- **M2** · Section: ### Organic feature continuity · Rule 7
  - Original: «then mirror through the existing injected Engram save tool.»
  - New: «then mirror through Engram's `mem_save` (Engram MCP, only when callable).»
- **M3** · Section: ### Organic feature continuity (resume) · Rule 7
  - Original: «On resume, use `mem_context`, then project/feature-scoped `mem_search`, and `mem_get_observation` for the full saved document;»
  - New: «On resume, use Engram's `mem_context`, then project/feature-scoped Engram's `mem_search`, and Engram's `mem_get_observation` for the full saved document;»
  - Detail: `mem_get_observation` is not in rule 7's list but is the same Engram MCP family; mapped the same way.
- **M4** · Section: ### Organic feature continuity (resume) · Rule 7
  - Original: «Use the injected equivalents of these existing memory tools, never invent availability.»
  - New: «Use these Engram MCP tools only when callable, never invent availability.»
- **M5** · Section: ### Organic feature continuity (todo projection) · Rule 4
  - Original: «The existing `todo` tool is the required session/UI projection»
  - New: «The todo tool, when available, is the required session/UI projection»
- **M6** · Section: ### Organic feature continuity (todo projection) · Rule 4
  - Original: «create or rebuild the visible `todo` list»
  - New: «create or rebuild the visible todo list»
- **M7** · Section: Memory lifecycle rule · Rule 7
  - Original: «call the injected Engram review tool with action `list`»
  - New: «call the Engram review tool (Engram's `mem_review`) with action `list`»
  - Detail: Verified: Engram's `mem_review` accepts action `list` | `mark_reviewed`.
- **M8** · Section: Memory lifecycle rule · Rule 7
  - Original: «If the injected Engram review tool is unavailable, do not fail the task. Continue with the injected Engram context/search tools,»
  - New: «If the Engram review tool (Engram's `mem_review`) is unavailable, do not fail the task. Continue with the Engram context/search tools (Engram's `mem_context`, Engram's `mem_search`),»
- **M9** · Section: Memory lifecycle rule · Rule 7
  - Original: «Do NOT call the injected Engram review tool with action `mark_reviewed` automatically.»
  - New: «Do NOT call Engram's `mem_review` with action `mark_reviewed` automatically.»
- **M10** · Section: ### Organic feature continuity (fallback only) · Rule 13
  - Original: «proofs.md, mutations.md, verification.md»
  - New: «proofs.md, mutations.json, verification.md»
  - Detail: tlc-spec-lean and the core (PROVENANCE-core.md 26) name the file mutations.json.

## `docs/orchestrator-prompts.md`

Source: `assets/orchestrator-prompts.md` @ `6ae777532`. Adaptations: 2 (+ G0).

- **P1** · Section: Preamble · Rule 1
  - Original: «Bind this to the parent Pi session only.»
  - New: «Bind this to the parent orchestrator session only.»
- **P2** · Section: ### Lossless Blocking Prompts, Native route · Rule 5, 9
  - Original: «- Native route: For every strictly closed single-select envelope, use `ask_user_choice` only when it is available in the current interactive TUI and the complete envelope is exactly representable as one question with 2-4 ordered options. It shows a "Type your answer" free-text entry unless closed: pass `allowCustomResponse: false` for every such envelope, including consent prompts, maintenance authorizations, and any exact opaque-token decision. Pass each closed-envelope option's user-facing label and description plus its envelope-owned canonical option token as opaque `value`. A closed selection returns exactly one `value` as an opaque token; map it to the envelope-owned choice once, then select any envelope-owned continuation or invocation once where present. A custom selection returns free text through `customResponse`; never pass it through opaque-token mapping. Do not re-parse a closed selection's label or ordinal. `ask_user_question` is the externally owned open/free-text questionnaire: use it only for an open/free-text envelope it can represent, never for a closed domain. Otherwise fall through to the Fallback clause below.»
  - New: «- Native route: For every strictly closed single-select envelope, use the ask tool only when it is available in the current interactive session and the complete envelope is exactly representable as one question with 2-4 ordered options. It always adds a free-text "Other" entry that cannot be closed: for every closed envelope, including consent prompts, maintenance authorizations, and any exact opaque-token decision, treat an "Other" answer as typed input under Answer validation below (accept it only when it matches exactly one presented option), never as a new choice. Pass each closed-envelope option's user-facing label and description; the ask tool has no opaque `value`, so keep each option's envelope-owned canonical option token on the orchestrator side, keyed by its exact presented label. A closed selection returns exactly one presented label; map it to the envelope-owned choice and its canonical token once, then select any envelope-owned continuation or invocation once where present. A custom selection returns free text through the "Other" entry; never pass it through opaque-token mapping (Answer validation alone decides it). Do not re-parse a closed selection's ordinal; map its returned label by exact match only. For an open/free-text envelope, use the ask tool only when it can represent it (its "Other" entry carries the free text), never for a closed domain. Otherwise fall through to the Fallback clause below.»
  - Detail: `ask_user_choice` -> the ask tool (rule 5); "in the current interactive TUI" -> "in the current interactive session" (rule 9); "It shows a "Type your answer" free-text entry unless closed: pass `allowCustomResponse: false` for every such envelope, ..." -> the ask tool's always-on "Other" entry routed through Answer validation (rule 9, no equivalent of `allowCustomResponse: false`); "plus its envelope-owned canonical option token as opaque `value`. A closed selection returns exactly one `value` as an opaque token; map it to the envelope-owned choice once" -> token kept orchestrator-side, keyed by exact label; "returns free text through `customResponse`" -> "through the "Other" entry"; "Do not re-parse a closed selection's label or ordinal." -> "Do not re-parse a closed selection's ordinal; map its returned label by exact match only."; "`ask_user_question` is the externally owned open/free-text questionnaire: use it only for an open/free-text envelope it can represent, never for a closed domain." -> "For an open/free-text envelope, use the ask tool only when it can represent it (...), never for a closed domain." Ordering, 2-4 option bound, Fallback fall-through kept.

## `docs/orchestrator-skills.md`

Source: `assets/orchestrator-skills.md` @ `6ae777532`. Adaptations: 7 (+ G0).

- **S1** · Section: Preamble · Rule 1
  - Original: «Bind this to the parent Pi session only,»
  - New: «Bind this to the parent orchestrator session only,»
- **S2** · Section: ## Skill Registry Protocol (effective view) · Rule 10
  - Original: «The effective view is `<available_skills>` plus the on-disk rows of the `Effective session skills` system-prompt block: on each enabled primary-session agent start, that block lists the skills found in project and other agents' skill directories that Pi did not load (every skill when Pi renders no `<available_skills>`), and is absent when there are none. A block row whose name is also in `<available_skills>` won precedence (a project copy outranks a user or package copy); use the block's row. In `<available_skills>` the `Trigger / description` is `<description>` and the `Path` is `<location>`. Use this view to select skills and delegate:»
  - New: «The effective view is the session's available-skills listing (`<available_skills>` where the CLI renders it, or whatever skill list the CLI gives its agent) plus the on-disk rows the orchestrator resolves itself: on each primary-session agent start, it lists the `SKILL.md` files found in project and other agents' skill directories that the session did not load (every skill when the session renders no available-skills listing); there are no on-disk rows when there are none. An on-disk row whose name is also in the available-skills listing won precedence (a project copy outranks a user or package copy); use the on-disk row. In the available-skills listing the `Trigger / description` is the skill's description (`<description>`) and the `Path` is its location (`<location>`); when the listing shows no path, resolve the exact `SKILL.md` path on disk. Use this view to select skills and delegate:»
  - Detail: "`<available_skills>`" -> "the session's available-skills listing (...)"; "the on-disk rows of the `Effective session skills` system-prompt block: on each enabled primary-session agent start, that block lists the skills found ... that Pi did not load (every skill when Pi renders no `<available_skills>`), and is absent when there are none" -> "the on-disk rows the orchestrator resolves itself: on each primary-session agent start, it lists the `SKILL.md` files found ... that the session did not load (...); there are no on-disk rows when there are none"; "A block row" / "the block's row" -> "An on-disk row" / "the on-disk row"; precedence rule kept verbatim; added "when the listing shows no path, resolve the exact `SKILL.md` path on disk".
- **S3** · Section: ## Skill Registry Protocol (view unavailable) · Rule 10
  - Original: «The view is unavailable only when neither `<available_skills>` nor the block is present:»
  - New: «The view is unavailable only when neither the available-skills listing nor the orchestrator's on-disk resolution is available:»
- **S4** · Section: ## Intent-Driven Skill Discovery · Rule 10
  - Original: «do not treat injected `<available_skills>` as complete.»
  - New: «do not treat the session's available-skills listing as complete.»
- **S5** · Section: ## Intent-Driven Skill Discovery, Discovery order 1 · Rule 10
  - Original: «1. Consult `<available_skills>` and the `Effective session skills` block, when present,»
  - New: «1. Consult the available-skills listing and the orchestrator's on-disk rows, when present,»
- **S6** · Section: ## Intent-Driven Skill Discovery, Discovery order 3 · Rule 1, 10
  - Original: «not a complete Pi view.»
  - New: «not a complete session view.»
- **S7** · Section: Common intent hints table · Rule 10
  - Original: «| Tomidev harness & lanes    | `tomidev`                              |»
  - New: «| Product / web UI design    | `gentle-ui-design`                     |»
  - Detail: The `tomidev` skill describes the Tomidev Shell harness and is not ported (the ODD core replaces it); `gentle-ui-design` is ported (shared/PROVENANCE-skills.md) and takes its row.

## `docs/orchestrator-tracking.md`

Source: `assets/orchestrator-tracking.md` @ `6ae777532`. Adaptations: 7 (+ G0).

- **T1** · Section: Preamble · Rule 1
  - Original: «Bind this to the parent Pi session only.»
  - New: «Bind this to the parent orchestrator session only.»
- **T2** · Section: Preamble · Rule X
  - Original: «(see `orchestrator.md` Task Size)»
  - New: «(see the always-on core's Task Size)»
  - Detail: `orchestrator.md` (Tomidev always-on core) is ported by another agent to an unknown destination path; reference neutralized (ambiguity A11).
- **T3** · Section: #### Authorization and progress · Rule X
  - Original: «Size every task by the always-on Task Size section (`orchestrator.md`);»
  - New: «Size every task by the always-on Task Size section;»
- **T4** · Section: #### Authorization and progress (close gate) · Rule 4
  - Original: «in the feature document or `todo` is still pending»
  - New: «in the feature document or todo list is still pending»
- **T5** · Section: #### Signaling the ODD phase to the Gentle prompt (heading) · Rule 6, 9
  - Original: «#### Signaling the ODD phase to the Gentle prompt»
  - New: «#### Signaling the ODD phase to the layer's phase indicator»
- **T6** · Section: #### Signaling the ODD phase · Rule 6, 9, 4
  - Original: «When the Tomidev Shell prompt is active, its working label is inferred automatically from the primary session's tool activity: read-only tools show `exploring`, edits `implementing`, test/typecheck/lint/build runs `checking`, user questions `deciding`, and `todo` or feature-document edits `planning`. `gentle_odd_phase` refines that label with phases tools cannot show (for example `authorizing`, `researching`, `deciding`, `closing`); an explicit report survives following read-only tool calls, while a stronger inferred phase (`deciding`, `planning`, `implementing`, `checking`) replaces it. Call `gentle_odd_phase` only when the primary session's own ODD phase actually changes, never per tool call, per thought, or on a fixed cadence; call it with `clear` only to leave the current phase before its turn ends. Its bounded vocabulary covers the ODD protocol steps above, not a strict one-to-one mapping: `authorizing` (1), `exploring` (2), `researching`/`deciding` (3), `deciding` again for step 4's classify decision (no dedicated label), `planning` (5), `implementing` (6), `checking`/`closing` (7). This is a best-effort UI label, not a source of truth: with no inferred or reported phase it falls back to a generic working indicator, unknown tools and ambiguous shell commands leave it unchanged, and an invalid token never clears an already-reported phase. Never call it from a subagent or background/child task; it reports only the primary session's own phase.»
  - New: «When the layer's ODD phase indicator is active and the CLI runs the layer's phase hook, its working label is inferred automatically from the primary session's tool activity: read-only tools show `exploring`, edits `implementing`, test/typecheck/lint/build runs `checking`, user questions `deciding`, and todo-list or feature-document edits `planning`. Explicit reports through the layer's ODD phase indicator refine that label with phases tools cannot show (for example `authorizing`, `researching`, `deciding`, `closing`). In a CLI with no hooks nothing is inferred: the orchestrator reports every phase change itself. An explicit report survives following read-only tool calls, while a stronger inferred phase (`deciding`, `planning`, `implementing`, `checking`) replaces it. Report a phase through the layer's ODD phase indicator only when the primary session's own ODD phase actually changes, never per tool call, per thought, or on a fixed cadence; clear it only to leave the current phase before its turn ends. Its bounded vocabulary covers the ODD protocol steps above, not a strict one-to-one mapping: `authorizing` (1), `exploring` (2), `researching`/`deciding` (3), `deciding` again for step 4's classify decision (no dedicated label), `planning` (5), `implementing` (6), `checking`/`closing` (7). This is a best-effort UI label, not a source of truth: with no inferred or reported phase it falls back to a generic working indicator, unknown tools and ambiguous shell commands leave it unchanged, and an invalid token never clears an already-reported phase. Never report it from a subagent or background/child task; it reports only the primary session's own phase.»
  - Detail: "When the Tomidev Shell prompt is active, its working label is inferred automatically" -> "When the layer's ODD phase indicator is active, its working label is inferred automatically ... by the layer's hook" (rules 6, 9; both layers ship a PostToolUse inference hook); "`todo` or feature-document edits" -> "todo-list or feature-document edits" (rule 4); "`gentle_odd_phase` refines that label" -> "Explicit reports through the layer's ODD phase indicator refine that label" (rule 6); "; an explicit report survives" -> ". An explicit report survives"; "Call `gentle_odd_phase` only when" -> "Report a phase through the layer's ODD phase indicator only when" (rule 6); "call it with `clear` only to leave" -> "clear it only to leave" (rule 6); "Never call it from a subagent" -> "Never report it from a subagent" (rule 6). Vocabulary mapping, best-effort semantics, primary-session-only rule kept verbatim.
- **T7** · Section: ## Delivery · Rule 9
  - Original: «Recommend a split only when `diff_budget` reports»
  - New: «Recommend a split only when the diff budget (the `diff_budget` script where the project ships it; otherwise a production-line count of the branch diff against its base) reports»
  - Detail: `diff_budget` is the Tomidev package script `diff_budget.py`; thresholds >400 production lines and >=2 independent units kept.

## `docs/orchestrator-verification.md`

Source: `assets/orchestrator-verification.md` @ `6ae777532`. Adaptations: 4 (+ G0).

- **V1** · Section: ## Project verification integration · Rule 8
  - Original: «Runtime safety and exact parent-authorized command boundaries remain binding.»
  - New: «Safety and exact parent-authorized command boundaries remain binding, enforced by instruction and verification, not by the runtime.»
- **V2** · Section: ## Verification rule (normative) · Rule 8, 9
  - Original: «while a tool call is in flight the runner's stall watchdog uses `tool_stall_timeout_ms` (default 30 minutes) instead of the `stall_timeout_ms` idle budget.»
  - New: «while a tool call is in flight, do not treat the writer as stalled or idle; no runtime watchdog applies here.»
  - Detail: Pi runner watchdog (`tool_stall_timeout_ms`, default 30 minutes, vs the `stall_timeout_ms` idle budget) has no equivalent and is removed with its 30-minute figure; the rule (foreground commands are live work, not silence) is kept.
- **V3** · Section: ## Verification rule (normative), after table · Rule 8
  - Original: «(runtime admits its launch on a `Risk: item N` line or sentence, a feature-document task line, or past the context backstop)»
  - New: «(launch it only on a `Risk: item N` line or sentence, a feature-document task line, or past the context backstop; this admission holds by instruction and verification, not by the runtime)»
- **V4** · Section: ## Parallel review protocol, 4. Verify handoff · Rule 8
  - Original: «the runtime removes each subagent's own TMPDIR, which holds that copy;»
  - New: «no runtime removes it here, so whoever created the copy removes it when done;»

## `docs/orchestrator-writer.md`

Source: `assets/orchestrator-writer.md` @ `6ae777532`. Adaptations: 7 (+ G0).

- **W1** · Section: Preamble · Rule 1
  - Original: «Parent Pi session only.»
  - New: «Parent orchestrator session only.»
- **W2** · Section: Preamble · Rule 9, 2
  - Original: «Configured per-agent models (`subagents.json` `model_profiles`) still apply»
  - New: «Configured per-agent models (the internal subagent definition's `model`, or the CLI and model the user configured for the pane) still apply»
- **W3** · Section: Preamble, Parallelism · Rule 2, 3
  - Original: «launch every independent unit in the same turn via `subagent_run` with `mode: "background"`,»
  - New: «launch every independent unit in the same turn through the layer's Role dispatch protocol (pane dispatch is asynchronous by nature; internal subagents use the subagent tool's background option),»
- **W4** · Section: #### Allowed edit surfaces (MANDATORY) · Rule 8
  - Original: «neither the writer nor the human supplies them. After»
  - New: «neither the writer nor the human supplies them. No CLI enforces the surfaces: they hold by instruction (the writer prompt) and by verification (after the writer returns, the parent compares its changed paths, for example from `git status --porcelain`, against the surfaces), plus isolated worktrees where parallel writers use them. After»
  - Detail: Sentence added: runtime enforcement (writer confinement) replaced by instruction + post-return verification + isolated worktrees.
- **W5** · Section: #### Allowed edit surfaces (MANDATORY) · Rule 8
  - Original: «After an admission rejection, repair»
  - New: «After an admission rejection (the writer's own refusal or the parent's pre-launch or post-return check; no runtime admission gate exists here), repair»
- **W6** · Section: #### Allowed edit surfaces (MANDATORY) · Rule 2
  - Original: «(`gentle-ai-worker`, a user-configured `worker`, or the native `Agent` fallback)»
  - New: «(`gentle-ai-worker` in a role pane or as the internal subagent of the same name, or a user-configured `worker`)»
- **W7** · Section: #### Allowed edit surfaces (MANDATORY), test scratch · Rule 8, 9
  - Original: «The runtime owns session scratch; `/td:scratch` lists or cleans recorded clones and worktrees.»
  - New: «No runtime owns session scratch here: whoever creates scratch clones and worktrees records and cleans them.»

## Reviewed and kept verbatim on purpose

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
- **A5 the ask tool vs closed envelopes.** Source: "pass `allowCustomResponse: false` for every such envelope" and "its envelope-owned canonical option token as opaque `value`". the ask tool always offers a free-text "Other" entry and has no opaque value. Mapped: "Other" answers go through Answer validation (must match exactly one presented option); canonical tokens are kept orchestrator-side keyed by exact label. Source "`ask_user_question` is the externally owned open/free-text questionnaire" also mapped to the ask tool (rule 5 gives one target for both). (P2)
- **A6 Skill effective view.** Source: "`<available_skills>` plus the on-disk rows of the `Effective session skills` system-prompt block ... that Pi did not load". Claude Code's skill listing shows no paths and nothing injects that block. Mapped to the orchestrator's own on-disk resolution; which directories count as "project and other agents' skill directories" is left unspecified, as in the source. (S2-S6)
- **A7 Phase indicator inference.** Resolved: both layers ship a PostToolUse hook that infers the phase from tool activity, so the text states the inference as the layer's hook (no extra sentence).
- **A8 `diff_budget`.** Source: "Recommend a split only when `diff_budget` reports >400 production lines and >=2 independent units". `diff_budget.py` is a Tomidev package script. Mapped to the script where shipped, else a production-line count of the branch diff. (T7)
- **A9 Todo statuses.** Source (`orchestrator-memory.md`, unchanged): "project them as `dropped`" and "mark it `blocked`". the todo tool only has `pending`, `in_progress`, `completed`; how to project `dropped`/`blocked` is not defined. Text left verbatim.
- **A10 `codemode`.** Source (unchanged): "When a code-execution tool such as `codemode` is available, refresh the Engram mirror inside one script". No such tool in Claude Code; the clause is conditional and stays dormant.
- **A11 `orchestrator.md` references.** Source: "(see `orchestrator.md` Task Size)" and "(`orchestrator.md`)". Destination path of the ported core is unknown; neutralized to "the always-on core". (T2, T3)
- **A12 `tomidev` skill.** Source row: "Tomidev harness & lanes | `tomidev`". No `tomidev` skill exists under `~/.claude/skills` or `~/.agents/skills`. Row kept verbatim (discovery step 5 already reports a missing skill); remove or rename it if the destination has an ODD skill.
- **A13 Background semantics for panes.** Source: "A child `agent_end` ... `agent_settled`", "background dialogs are dismissed", "the runner queues beyond `max_concurrency`", "Finished tasks persist across restarts; running ones are stopped when pi exits", and the rendered "Background subagent policy" status line. Each mapped to a Claude Code / pane equivalent that defers pane specifics to the layer; the status line now has to come from the ported core. (R18-R25)
- **A14 Key Learnings capture.** Source: "Engram automatically extracts and persists the items". True for internal subagents only when the Engram plugin's SubagentStop hook is installed (verified in the local plugin), not guaranteed for pane CLIs. Made conditional; no orchestrator-side Engram's `mem_capture_passive` call was added. (D15)
- **A15 Issue references.** Source: "## Parallel review protocol (gentle-shell#1731)" and "(#1713)". These point into the source project's tracker. Kept verbatim (heading rule).
- **A16 `outputMode: "file-only"`.** Mapped to "have the child write the full report to a file outside the repository and return its path". Read-only roles writing a scratch file outside the repository is an assumption. (R34)
- **A17 Per-agent models.** Source: "`subagents.json` `model_profiles`" and "`.pi/settings.json`, `.pi/subagents.json`". Mapped to the internal subagent definition's `model` / the pane CLI's configuration. (W2, R30)
- **A18 Scratch ownership.** Source: "the runtime removes each subagent's own TMPDIR" and "The runtime owns session scratch; `/td:scratch` lists or cleans". Mapped to "whoever created it removes or cleans it". (V4, W7)
- **A19 Stall watchdog number.** Source: "the runner's stall watchdog uses `tool_stall_timeout_ms` (default 30 minutes) instead of the `stall_timeout_ms` idle budget". Removed with the mechanism; only "live work, not silence" remains. If a pane wait needs a ceiling, the layer has to set one. (V2)

## Verification

- Forward: every replacement matched its source text exactly once (script aborts otherwise).
- Reverse: for each file, stripping the header and undoing every logged replacement reproduces the source byte-for-byte.
- `diff` between each source and destination file shows only the hunks listed above plus the header.

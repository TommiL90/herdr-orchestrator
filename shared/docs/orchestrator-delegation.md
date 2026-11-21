<!-- Ported from tomidev-shell@6ae777532 assets/orchestrator-delegation.md; adapted for Claude Code (hcorc/herdorc). Adaptations: shared/PROVENANCE-docs.md -->

# Orchestrator — Delegation Card (lazy-loaded)

Bind this to the parent orchestrator session only, on delegation or routing triggers. Read `orchestrator-delegation-reference.md` only when a situation names it (per-action table, Work Routing Ladder, workflows, background, fallback, and language detail).

## Handoff

Project workflow and tracking are the authority. Do not create duplicate artifacts or require Engram beside project tracking. Use the project's actual artifact path, format and acceptance IDs (for example `Spec: docs/proposals/cache.rst`); task IDs are required only when the project uses them. Builtin lane and logbook instructions below fill undefined aspects only. Allowed edit surfaces and safety still bind (enforced by instruction and verification, not by the runtime), not a particular plan filename or directory.

Subagent-facing prompts should be written in English by default, even when the user speaks Spanish. Generated technical artifacts default to English regardless of the persona; forward this to the executor (language domain detail: reference). Write the handoff instructions in English, but never translate, condense, or paraphrase the user's requirements: pass them by reference to the feature document's `## Specs` (`Spec: .agents/designs/features/<feature>/ (read until "## Log"). Do T#; S#.`), or include the user's request verbatim when no feature document exists.

Exceptions:

- Preserve exact user quotes, UI copy, error messages, filenames, commands, and domain terms in their original language when they are evidence.
- Ask a subagent to produce Spanish only when its output is intended to be pasted directly to the user, a PR/comment/reply in Spanish, or Spanish-language product/documentation text.

Before delegating, declare a short task subject (reference).

#### Delegation Triggers

These boundaries do not authorize children to orchestrate. Each trigger holds only when its condition truly holds; none holds by default. Inline stays within the evidence budget. When one fires, stop and delegate through the layer's Role dispatch protocol before continuing; executing past a fired trigger inline is a routing defect even if the work succeeds.

1. **Ask:** an open product or design decision gets one focused user question; stop and wait.
2. **Mapping trigger (Evidence-budget rule):** read inline only when the evidence fits one parallel batch of at most 3 calls totaling ~10k tokens. Reassess cumulative discovery after each batch; never reset it. When understanding needs more or over ~5 sequential lookups, delegate one explorer returning a handoff of at most ~2k tokens with `path:line` evidence; the trigger overrides initial size, including for read-only work. Re-evaluate size after. Preparation for an already understood inline write stays inline, not further discovery.
3. **Verification rule** (Risk line): only a change whose Risk line names a high-risk item (Task Size) gets an independent `gentle-ai-verify` run after the change's own checks, as rarely as possible; otherwise whoever made the change runs its focused test and suite inline, small tasks included. Routing: `orchestrator-verification.md`.
4. **Track:** reuse project tracking; undefined aspects use the large-task feature document, optional available Engram mirror and todo-list defaults (the session's todo list tool, e.g. TodoWrite, when available) (`orchestrator-memory.md`). Never create automatic commits.
5. **Writer trigger (Writer rule):** a large task alone never delegates, and file count never fires this trigger. Delegate one bounded writer per unit only for a named reason: (a) parallelism — 2+ independent units of behavior with disjoint edit surfaces, each needing several minutes of work (several files or ~100+ changed lines; a subagent spends 1-2 minutes reading before it writes), launched together; (b) context — the Context backstop below. A unit is one independent piece of behavior with its code, tests, and docs together: never split one behavior into test, docs, and code writers; a delivery that depends on another is not independent; several small independent changes run inline, one after another. Units of about 100 changed lines or less always run inline: writing them costs less than starting workers. A real delegation reason is still required; a document-path admission gate (none exists here) is not a reason to manufacture a builtin feature contract. Never for a price ratio. Without a reason, the parent works inline, following the logbook (project-owned tracking, or its fallback feature document, mirror and todo list; no automatic commits).
6. **Incident rule:** after a wrong `cwd`, accidental repository/worktree mutation, failed merge recovery, or environment workaround, stop and diagnose it separately before resuming.
7. **Context backstop:** when the context backstop applies, pause and delegate the next bounded unit of work that needs several steps. No runtime signals it here (Claude Code and the other CLIs send no such signal): the orchestrator judges it by instruction from its own context use, for example a long accumulated thread or an imminent compaction.

**Invariants:** whoever writes, inline or delegated, reuses the existing function for shared state and keeps its invariants (ordering, uniqueness, validation, normalization); writer prompts name those helpers (`orchestrator-writer.md`).

**Differential check (PRESERVE):** forward the harness test-first policy's differential check to writers.

**Preparation trigger:** reading that prepares a delegated write goes with the writer; inline writes read inline. When delegating, read only what decides the route, never the files the worker will read; pass paths, the spec reference, and what to change, not file contents.

**Route declaration:** for large work, record the chosen route per task and its trigger evidence in the feature document, so skipped delegation is observable instead of silent.

These triggers only choose between direct inline and delegated direct inside ODD.

For a large task's bounded writes, prefer `gentle-ai-worker` dispatched through the layer's Role dispatch protocol (a herdr pane when available, else the internal Claude Code subagent of the same name), then a user-configured `worker`. If neither worker is available (no pane and no internal subagent), report it as unavailable: in Claude Code the Agent tool already is the internal-subagent path, so there is no separate native fallback. If no delegation mechanism is available, stop and explain the blocker. If the generic writer chain is unavailable, use the layer's internal-subagent path or stop.

## Launch

- Derive nonempty `## Allowed edit surfaces` before launching a writer (`orchestrator-writer.md`). Parallel writers only with disjoint Allowed edit surfaces (enforced by instruction and verification, not by the runtime) or isolated worktrees.
- Pass the skill paths the orchestrator resolved itself for the session under `## Skills to load before work`; children read them first (`orchestrator-skills.md`).
- A child must be able to do the task it is given. Check the role's declared `tools` before launching (its internal subagent definition, or the CLI running in the target pane): never give a read-only explorer shell, HTTP or MCP work, and never assume your own tools transfer to the child. With no qualified agent, report the capability gap; a fired trigger is never replaced by inline work.
- Background (policy on, a background-capable dispatch present): internal subagents use the Agent tool's `run_in_background`, which returns a task id at once; pane dispatch is asynchronous by nature, and the layer's Role dispatch protocol defines how to wait. End the turn and resume on the completion notification; never sleep or poll for status. Otherwise run in the foreground. Detail: reference.
- Do not pass `model` to generic subagents unless the user asks.

#### Key Learnings closing block

Generic Explore/general worker prompts (`gentle-ai-explore`, `gentle-ai-worker`, `gentle-ai-verify`, whether dispatched to a herdr pane or to the internal Claude Code subagent of the same name) end with: after the normal result, close the final response text with a `## Key Learnings` block of 1–5 numbered items, each a standalone factual sentence of at least 20 characters and at least 4 words; omit it when there is genuinely no reusable learning. It layers on after the Return contract without changing its fields and applies to final response text only. Engram extracts and persists the items automatically only where its passive-capture hook is installed for the CLI that ran the role (for internal Claude Code subagents, the Engram plugin's SubagentStop hook); neither Claude Code nor the other CLIs guarantee it otherwise. The worker does not parse the block or call passive-capture tools; this is separate from explicit `mcp__engram__mem_save`. Agents that must return strict JSON never receive it.

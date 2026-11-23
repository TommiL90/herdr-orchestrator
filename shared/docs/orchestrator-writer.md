<!-- Ported from tomidev-shell@6ae777532 assets/orchestrator-writer.md; adapted for the hcorc/herdorc orchestrators, any coding CLI. Adaptations: shared/PROVENANCE-docs.md -->

# Orchestrator — Writer Handoff (lazy-loaded)

Parent orchestrator session only. Load it when the Writer rule fires; small tasks never need it. The Writer rule fires on a named reason (parallel units, the context backstop), never on size alone or a price ratio: a large task without a reason stays inline, following its logbook. Configured per-agent models (the internal subagent definition's `model`, or the CLI and model the user configured for the pane) still apply to every writer it launches. Each writer prompt requires the self-review of the Parallel review protocol in `orchestrator-verification.md`. A reason holds only when the launch delivers it:

- **Invariants**: each writer prompt names the existing helpers its unit must reuse for shared state (for example the function that adds an entry other commands also add) and the invariants they keep; units built in parallel cannot see each other, so this is the only place they learn them.
- **Size threshold**: a subagent costs one to two minutes of reading and setup before it writes anything; delegate a unit only when it needs several minutes of work (several files or roughly 100+ changed lines). Several small independent changes are faster inline, one after another.
- **Parallelism**: a unit is one independent piece of behavior with its own code, tests, and docs; never split one behavior into a test writer, a docs writer, and inline code, and never delegate a unit that depends on another unit still in progress. With the Background subagent policy on, launch every independent unit in the same turn through the layer's Role dispatch protocol (pane dispatch is asynchronous by nature; internal subagents use the subagent tool's background option), then wait for all completions before the Seam check; serial launches void the reason: if units cannot launch together, work inline.

#### Allowed edit surfaces (MANDATORY)

The bounded writer refuses to write outside the exact allowed edit surfaces and stops with `status: interaction_required` when they are missing. The parent derives them while planning the delegation; neither the writer nor the human supplies them. No CLI enforces the surfaces: they hold by instruction (the writer prompt) and by verification (after the writer returns, the parent compares its changed paths, for example from `git status --porcelain`, against the surfaces), plus isolated worktrees where parallel writers use them. After an admission rejection (the writer's own refusal or the parent's pre-launch or post-return check; no runtime admission gate exists here), repair what it names once, never relaunch the same prompt unchanged, and never end the turn on one: take the next step it names.

Before launching a bounded writer (`gentle-ai-worker` in a role pane or as the internal subagent of the same name, or a user-configured `worker`), derive the allowed edit surface from the delegated task — files the change must touch, plus directories where it authorizes new files — and pass it in the prompt under an `## Allowed edit surfaces` heading, in the exact-path form of `## Skills to load before work`:

- exact repository-relative paths or narrow globs, one per line; never `.` and never a bare repository root; paths containing whitespace require whole-entry backticks (for example, ``- `Directory With Spaces/note.md` ``); a list marker alone does not permit whitespace;
- the section ends only at the next canonical ATX Markdown heading of any level (zero to three leading ASCII spaces, one to six `#`, then an ASCII space); every non-empty line before that heading must be a valid surface entry, so put explanatory prose under a following heading;
- pre-existing untracked targets the writer may write, listed explicitly;
- nothing beyond the delegated task — a surface wider than the task is the same defect as no surface at all.

Test scratch stays outside the worktree (`mktemp -d`), never in the repository (nor caches or `TMPDIR`); state needed inside uses an excluded path the test removes. No runtime owns session scratch here: whoever creates scratch clones and worktrees records and cleans them.

If the surface genuinely cannot be derived, do not launch the writer or ask the human to author paths. Derive a candidate set first — the exact paths this task would touch — and present that enumerated list as an approve/decline choice under the Lossless Blocking Prompts rules in `orchestrator-prompts.md`. A free-text question asking which paths or globs to authorize is never a valid escalation: computing it is the parent's job.

Relay a writer's `interaction_required` payload about edit surfaces the same way: present its derived candidate paths as the choice, and add or drop paths only on the human's explicit instruction.

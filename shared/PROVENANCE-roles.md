# Provenance: ported roles

Source: `tomidev-shell@6ae777532` (Tomidev Shell 1.3.0, Pi runtime, ODD workflow), files `assets/agents/<name>.md`. The source repository was read only, never modified.

Destination: `shared/roles/<name>.md` (body only, no YAML frontmatter) and `shared/roles/roles.json` (Claude Code metadata).

Each role runs either in a role pane under any coding-agent CLI (told to read the role file) or as a internal subagent with the same name. Bodies are therefore harness-agnostic; Claude Code tool names live only in `roles.json`.

## Rule legend

1. "Tomidev Shell" as the harness → "the orchestrator".
2. Pi tool names used as instructions → harness-neutral phrasing; CodeGraph and Engram phrased as "when available".
3. Pi runtime features (subagent tools, runtime-enforced Allowed edit surfaces, writer admission, child safety, injected skill paths, status/telemetry) → rule kept, stated as enforced by instruction; the orchestrator's handoff supplies scope, `## Allowed edit surfaces` and `## Skills to load before work`.
4. Return protocol → content requirements kept, channel made neutral.
5. Memory → Engram rules kept, mapped to `mcp__engram__*`, only when callable.
6. No equivalent → mechanism removed, rule kept, logged.
7. English stays English (no translation was needed: every source body is English).

"Output" marks changes required by the port's output specification, not by rules 1-7.

## Changes common to every role

| # | Section | Original | New | Rule |
|---|---|---|---|---|
| C1 | File head | YAML frontmatter (`name`, `description`, `tools`) | Removed from the body; carried in `roles.json` (`name`, `description`, `source_tools`, mapped `tools`, `readonly`) | Output |
| C2 | File head | (none) | Line 1: `<!-- Ported from tomidev-shell@6ae777532 assets/agents/<name>.md; adapted for the hcorc/herdorc orchestrators, any coding CLI. Adaptations: shared/PROVENANCE-roles.md -->` | Output |
| C3 | File head | (none) | Line 2: `# Role: <name>`, then one blank line, then the source body | Output |

The exact sentence used for every rule-4 change ("CHANNEL" below):

> Return your result to the orchestrator through the channel named in the handoff (your final message, a report file, or a multiplexer command the handoff gives). Writing that report file and running that command are allowed even where this role is read-only or runs no commands; they are the only exception.

## Per-role body adaptations

Columns quote the exact replaced span. Text outside the spans is byte-identical to the source body. A rule-4 row inserts CHANNEL as a new paragraph directly before the quoted anchor; the anchor itself is unchanged.

### gentle-ai-explore (7 body adaptations + C1-C3)

| # | Section | Original | New | Rule | Note |
|---|---|---|---|---|---|
| 1 | Opening paragraph, sentence 1 | You are the read-only explorer for Tomidev Shell tasks. | You are the read-only explorer for the orchestrator's tasks. | 1 | Harness name replaced. |
| 2 | Bullet 1 (structural questions), sentence 1 | use the cwd-scoped `codegraph` tool before broad filesystem searches. | use CodeGraph scoped to the current workspace (for example CodeGraph's `codegraph_explore`, when available) before broad filesystem searches. | 2 | Pi tool `codegraph` (cwd-scoped by the Pi extension) replaced by neutral CodeGraph wording with the Claude Code MCP name as an example, conditioned on availability. |
| 3 | Bullet 1 (structural questions), sentence 2 | Initialize the workspace index with `operation: "init"` when it is absent, then use `query` or `explore`; never ask it to target another path. | Initialize the workspace index when it is absent (only through an initialization operation your CodeGraph tool provides), then query or explore it; never ask it to target another path (when the tool takes a project path, pass the current workspace). | 2, 3 | Pi tool parameters (`operation: "init"`, `query`, `explore`) removed (rule 2). The Pi tool enforced the cwd scope at runtime (it accepted no path); the rule is kept and now enforced by instruction: pass the current workspace when the tool takes a project path (rule 3). |
| 4 | Bullet 2 (CodeGraph mutation exception), sentence 1 | - `codegraph` may create or update only the current workspace `.codegraph/` index. | - CodeGraph may create or update only the current workspace `.codegraph/` index. | 2 | Pi tool name `codegraph` replaced by the product name CodeGraph. Limit unchanged. |
| 5 | Bullet 3 (fallback), sentence 1 | - If CodeGraph reports that it is unavailable or fails, then use `read`, `grep`, and `find` as the fallback. | - If CodeGraph is not available in your CLI, reports that it is unavailable, or fails, then read files, search file contents, and find files by name or glob as the fallback. | 2 | Pi tool names `read`/`grep`/`find` replaced by neutral actions; added the not-available-in-your-CLI case so the fallback applies in CLIs without CodeGraph. Second sentence (fallback order) unchanged. |
| 6 | Bullet 4 (online questions), sentence 2 | Use `web_enable` if activation is needed. | Activate them first if your CLI requires activation. | 2, 6 | Pi tool `web_enable` (pi-web-access) has no Claude Code equivalent; mechanism removed, rule (activate web tools when needed) kept. |
| 7 | Return paragraph (new paragraph inserted before it) | (none; anchor: `` Return a compact handoff of at most ~2k tokens: ``) | CHANNEL paragraph inserted before the anchor | 4 | Channel made neutral. The content requirements of the return paragraph are unchanged. |

### gentle-ai-worker (12 body adaptations + C1-C3)

| # | Section | Original | New | Rule | Note |
|---|---|---|---|---|---|
| 1 | Opening paragraph | You are the implementation writer for Tomidev Shell. | You are the implementation writer for the orchestrator. | 1 | Harness name replaced. |
| 2 | Second paragraph, sentence 3 | Never delegate or invoke `subagent_*` tools. | Never delegate or invoke subagent or delegation tools (for example `subagent_*`, `Agent`, or `Task`); this is enforced by instruction, even if your CLI exposes them. | 3 | Pi `subagent_*` tools generalized to any CLI's subagent/delegation tools; rule kept and stated as enforced by instruction. |
| 3 | ## Context contract, item 1 | 1. Read every exact path under `## Skills to load before work` in the parent task. | 1. Read every exact path under `## Skills to load before work` in the parent task (the orchestrator's handoff supplies these paths). | 3 | Pi injected skill paths: the orchestrator's handoff now supplies the `## Skills to load before work` section. |
| 4 | ## Context contract, item 2 | The parent supplies edit surfaces under `## Allowed edit surfaces` in the task; treat that section as the authoritative list. | The parent supplies edit surfaces under `## Allowed edit surfaces` in the task (the orchestrator's handoff); treat that section as the authoritative list, enforced by instruction rather than by the runtime. | 3 | Pi runtime-enforced Allowed edit surfaces: rule kept, now supplied by the orchestrator's handoff and enforced by instruction. |
| 5 | ## Implementation rules, bullet 4 | - Use `find` for scoped file discovery. | - Use your CLI's file-search tool (find files by name or glob) for scoped file discovery. | 2 | Pi tool name `find` replaced by neutral wording. |
| 6 | ## Implementation rules, bullet 5, sentence 1 | - Prefer the dedicated `grep`/`find` tools over raw `bash` grep — they honour `.gitignore`. | - Prefer your CLI's dedicated content-search and file-search tools over raw shell `grep` — they honour `.gitignore`. | 2 | Pi tool names `grep`/`find`/`bash` replaced by neutral wording. The `.gitignore` claim is kept verbatim (see ambiguities). The scan-bound sentence (`grep -r … .`, `find .`, `--exclude-dir`) is shell syntax, unchanged. |
| 7 | ## Implementation rules, bullet 6 (Batch tool calls), sentence 2 | Make all edits to one file in one `edit` call, | Make all edits to one file in one edit call (when your CLI's edit tool accepts several changes per call), | 2 | Pi tool name `edit` de-codified; conditioned on edit-tool capability because single-replacement edit tools (for example Claude Code Edit) cannot batch (see ambiguities). |
| 8 | ## Tool safety, bullet 5, sentence 2 | or any `subagent_*` tool. | or any subagent or delegation tool. | 3 | Pi `subagent_*` tools generalized; rule kept. |
| 9 | ## Tool safety, bullet 7 | - Retain `bash` only for safe working-tree inspection | - Retain shell access only for safe working-tree inspection | 2 | Pi tool name `bash` replaced by neutral wording. Scope of allowed commands unchanged. |
| 10 | ## Memory safety, sentence 1 | Use `mem_save` only when the parent supplies a validated project name | Use Engram `mem_save` (Engram's `mem_save`) only when it is callable and the parent supplies a validated project name | 5 | Mapped to the Engram MCP name and conditioned on being callable. All other memory restrictions unchanged. |
| 11 | ## Return contract (new first paragraph) | (none; anchor: `` Return one compact handoff using the schema below; ``) | CHANNEL paragraph inserted before the anchor | 4 | Channel made neutral. Schema, field names, status vocabulary and content requirements unchanged. |
| 12 | ## Return contract, `skill_resolution` paragraph, sentence 1 | only when the parent injected exact skill paths and every path was successfully read | only when the parent injected exact skill paths (listed under `## Skills to load before work` in the orchestrator's handoff) and every path was successfully read | 3 | Pi skill-path injection tied to the handoff section. Values `paths-injected \| paths-invalid \| none` and all rules about them unchanged. |

### gentle-ai-verify (3 body adaptations + C1-C3)

| # | Section | Original | New | Rule | Note |
|---|---|---|---|---|---|
| 1 | **Search bounds:** paragraph, sentence 1 | prefer the dedicated `grep`/`find` tools over raw `bash` grep — they honour `.gitignore`. | prefer your CLI's dedicated content-search and file-search tools over raw shell `grep` — they honour `.gitignore`. | 2 | Pi tool names `grep`/`find`/`bash` replaced by neutral wording. `.gitignore` claim and the `(gentle-shell#2686)` reference kept verbatim (see ambiguities). |
| 2 | Isolated-setup paragraph ("Probe on your first launch"), sentence on `.git` | because recursive deletion is blocked for child agents, | because recursive deletion is prohibited for child agents (enforced by instruction; no runtime blocks it for you), | 3 | Pi child-safety runtime block replaced by a prohibition enforced by instruction. Rule (never copy `.git` and delete it) unchanged. |
| 3 | Return paragraph (new paragraph inserted before it) | (none; anchor: `` Return a compact evidence handoff of at most ~2k tokens: ``) | CHANNEL paragraph inserted before the anchor | 4 | Channel made neutral. Content requirements unchanged. |

### jd-judge-a (2 body adaptations + C1-C3)

| # | Section | Original | New | Rule | Note |
|---|---|---|---|---|---|
| 1 | Opening paragraph | You are blind adversarial judge A for Tomidev Shell. | You are blind adversarial judge A for the orchestrator. | 1 | Harness name replaced. |
| 2 | ## Findings format (new first paragraph) | (none; anchor: `` Report findings grouped by severity (CRITICAL, IMPORTANT, SUGGESTION): ``) | CHANNEL paragraph inserted before the anchor | 4 | Channel made neutral (the source left it implicit: the Pi subagent's final message). Severity vocabulary and fields unchanged. |

### jd-judge-b (2 body adaptations + C1-C3)

| # | Section | Original | New | Rule | Note |
|---|---|---|---|---|---|
| 1 | Opening paragraph | You are blind adversarial judge B for Tomidev Shell. | You are blind adversarial judge B for the orchestrator. | 1 | Harness name replaced. |
| 2 | ## Findings format (new first paragraph) | (none; anchor: `` Report findings grouped by severity (CRITICAL, IMPORTANT, SUGGESTION): ``) | CHANNEL paragraph inserted before the anchor | 4 | Channel made neutral (the source left it implicit: the Pi subagent's final message). Severity vocabulary and fields unchanged. |

### review-risk (2 body adaptations + C1-C3)

| # | Section | Original | New | Rule | Note |
|---|---|---|---|---|---|
| 1 | Opening paragraph, sentence 1 | a read-only specialized code reviewer for Tomidev Shell. | a read-only specialized code reviewer for the orchestrator. | 1 | Harness name replaced. |
| 2 | ## Output format (new first paragraph) | (none; anchor: `` Format findings for `requesting-code-review`: ``) | CHANNEL paragraph inserted before the anchor | 4 | Channel made neutral (the source left it implicit: the Pi subagent's final message). Format, Cause/Evidence vocabulary, Tags and Verdict unchanged. |

### review-readability (2 body adaptations + C1-C3)

| # | Section | Original | New | Rule | Note |
|---|---|---|---|---|---|
| 1 | Opening paragraph, sentence 1 | a read-only specialized code reviewer for Tomidev Shell. | a read-only specialized code reviewer for the orchestrator. | 1 | Harness name replaced. |
| 2 | ## Output format (new first paragraph) | (none; anchor: `` Format findings for `requesting-code-review`: ``) | CHANNEL paragraph inserted before the anchor | 4 | Channel made neutral (the source left it implicit: the Pi subagent's final message). Format, Cause/Evidence vocabulary, Tags and Verdict unchanged. |

### review-reliability (2 body adaptations + C1-C3)

| # | Section | Original | New | Rule | Note |
|---|---|---|---|---|---|
| 1 | Opening paragraph, sentence 1 | a read-only specialized code reviewer for Tomidev Shell. | a read-only specialized code reviewer for the orchestrator. | 1 | Harness name replaced. |
| 2 | ## Output format (new first paragraph) | (none; anchor: `` Format findings for `requesting-code-review`: ``) | CHANNEL paragraph inserted before the anchor | 4 | Channel made neutral (the source left it implicit: the Pi subagent's final message). Format, Cause/Evidence vocabulary, Tags and Verdict unchanged. |

### review-resilience (2 body adaptations + C1-C3)

| # | Section | Original | New | Rule | Note |
|---|---|---|---|---|---|
| 1 | Opening paragraph, sentence 1 | a read-only specialized code reviewer for Tomidev Shell. | a read-only specialized code reviewer for the orchestrator. | 1 | Harness name replaced. |
| 2 | ## Output format (new first paragraph) | (none; anchor: `` Format findings for `requesting-code-review`: ``) | CHANNEL paragraph inserted before the anchor | 4 | Channel made neutral (the source left it implicit: the Pi subagent's final message). Format, Cause/Evidence vocabulary, Tags and Verdict unchanged. |

### review-refuter (2 body adaptations + C1-C3)

| # | Section | Original | New | Rule | Note |
|---|---|---|---|---|---|
| 1 | Opening paragraph, sentence 1 | You are the **review refuter** for Tomidev Shell. | You are the **review refuter** for the orchestrator. | 1 | Harness name replaced. |
| 2 | ## Output format (new first paragraph) | (none; anchor: `` One entry per supplied finding, in the supplied order: ``) | CHANNEL paragraph inserted before the anchor | 4 | Channel made neutral (the source left it implicit: the Pi subagent's final message). Outcome vocabulary and Batch line unchanged. |

## roles.json

Tool mapping applied: read→Read, grep→Grep, find→Glob, ls→Glob, edit→Edit, write→Write, bash→Bash, mem_save→mcp__engram__mem_save, mem_search→mcp__engram__mem_search, mem_context→mcp__engram__mem_context, `mcp__*` unchanged. Tools outside that table (best mappings, all listed under Ambiguities): codegraph→mcp__codegraph__codegraph_explore, web_search→WebSearch, source_check→WebSearch + WebFetch, fetch_content→WebFetch, get_search_content→WebFetch, web_enable→(no equivalent, dropped). Duplicates are collapsed in source order. `readonly` is true when `source_tools` contains neither `edit` nor `write`. `readonly` roles that keep `Bash` (verify, judges, reviewers, refuter) are read-only by instruction only.

| Role | Description change | tools | readonly |
|---|---|---|---|
| gentle-ai-explore | verbatim | Read, Grep, Glob, mcp__codegraph__codegraph_explore, WebSearch, WebFetch | true |
| gentle-ai-worker | "Scoped implementation writer for Tomidev Shell." → "Scoped implementation writer for the orchestrator." (rule 1) | Read, Grep, Glob, Edit, Write, Bash, mcp__engram__mem_save, mcp__codegraph__codegraph_explore | false |
| gentle-ai-verify | verbatim | Read, Grep, Glob, Bash, mcp__codegraph__codegraph_explore | true |
| jd-judge-a | verbatim | Read, Grep, Glob, Bash, mcp__codegraph__codegraph_explore | true |
| jd-judge-b | verbatim | Read, Grep, Glob, Bash, mcp__codegraph__codegraph_explore | true |
| review-risk | verbatim | Read, Grep, Glob, Bash | true |
| review-readability | verbatim | Read, Grep, Glob, Bash | true |
| review-reliability | verbatim | Read, Grep, Glob, Bash | true |
| review-resilience | verbatim | Read, Grep, Glob, Bash | true |
| review-refuter | verbatim | Read, Grep, Glob, Bash, mcp__codegraph__codegraph_explore | true |

## Kept verbatim on purpose

These source phrases looked harness-specific but still hold, so they were not changed:

- "parent", "parent task", "parent orchestrator" (all roles): the orchestrator is the parent in both run modes.
- "When resumed in the same child session" (explore, worker, verify): still holds for a resumed internal subagent and for a role pane session that receives follow-ups.
- "delegate to child agents" / "Do not delegate to child agents" (explore, verify): behavioural rule, harness-neutral.
- "builtin lanes", "builtin feature contract", "builtin test-first policy", `.agents/designs/features/<feature>/`, `plan.md`, `checks.md`, `S#`/`C#` (explore, worker, verify, judges): ODD fallback conventions, kept because the rules depend on them (see Ambiguities).
- "no TUI toggle or per-task chat choice is needed" (worker), "never demand a TUI or chat toggle" (verify): prohibitions that still hold.
- "native authority" (worker, Test discipline), "transaction controller" (worker, Return contract schema), `requesting-code-review` (review-risk/readability/reliability/resilience), "trusted local orchestrator" (review-risk): kept because they sit inside rules or output formats that must stay verbatim (see Ambiguities).
- "use Bash" (verify, isolated-setup paragraph): kept because the prescribed command (`set -o pipefail && ... tar ...`) needs a Bash-compatible shell. Read it as the Bash shell in CLIs that have no Bash tool.
- Shell commands and syntax (`grep -r … .`, `find .`, `--exclude-dir=...`, `git status --short`, `mktemp -d`, `env -i`, `tar ...`): these are shell commands, not Pi tool names (rule 2 does not apply).
- Worker `## Tool safety` and verify's isolation rules: already stated as instructions, so no wording change was needed. Note that Pi's child-safety extension also blocked some of these at runtime (for example `rm -rf`); no runtime backstop exists now, so they are enforced only by instruction.
- No source body mentions writer admission or Pi status/telemetry, so those rule-3 categories produced no change.

## Ambiguities (decisions for the maintainer)

1. explore, tools `codegraph` → CodeGraph's `codegraph_explore`. Source: "use the cwd-scoped `codegraph` tool ... Initialize the workspace index with `operation: "init"` when it is absent". The Pi tool could initialize the index; the Claude Code MCP explore tool cannot, and the local CodeGraph MCP server says indexing is the user's decision. The port keeps initialization only "through an initialization operation your CodeGraph tool provides", so in Claude Code an absent index falls through to the read/search fallback.
2. explore, tools `web_enable` → dropped. Source: "Use `web_enable` if activation is needed." Claude Code web tools need no activation tool.
3. explore, tools `web_search` → WebSearch; `fetch_content` → WebFetch (pi-web-access: "Fetch web pages, PDFs, and GitHub repos"; Claude Code WebFetch does not clone GitHub repos).
4. explore, tools `source_check` → WebSearch + WebFetch. pi-web-access: "Gather cited web passages about a claim for manual review." No single Claude Code equivalent.
5. explore, tools `get_search_content` → WebFetch. pi-web-access: "Page through or search stored content from web_search, source_check, or fetch_content by responseId." Claude Code has no stored-result paging; WebFetch is only the closest.
6. explore, description kept verbatim: "Read-only local and web exploration on its configured economical model." `MODELS` gives it `"model": "haiku"` in `roles.json`, which `install.py` maps per CLI.
7. worker, verify, `.gitignore` claim kept: "Prefer the dedicated `grep`/`find` tools over raw `bash` grep — they honour `.gitignore`." True for the Pi tools; not verified for every CLI's search tools.
8. worker, single-call edits: "Make all edits to one file in one `edit` call". Claude Code Edit replaces one span per call, so the rule was conditioned on edit-tool capability.
9. worker, "native authority and all other applicable limits remain binding": Tomidev/Pi term (also in the golden prompt: "within native authority you own the next step") for the agent's granted permission envelope. Kept verbatim.
10. worker, Return contract: "<paths or behaviors the transaction controller should verify>": the transaction controller is the parent orchestrator. Kept verbatim because it is inside the output schema.
11. reviewers (risk, readability, reliability, resilience): "Format findings for `requesting-code-review`:". In Tomidev Shell this is the review skill that consumes lens output (README: "Use `requesting-code-review` at the final checkpoint"). The orchestrator repository has no such skill. Kept verbatim.
12. review-risk: "Do not report the mere ability of the trusted local orchestrator to execute tools as a security finding." Written for Tomidev Shell itself; it now reads as hcorc/herdorc. Kept verbatim.
13. verify: "(gentle-shell#2686)" is an issue reference in the upstream repo, which a reader in this repo cannot resolve. Kept verbatim.
14. ODD fallback conventions (`.agents/designs/features/<feature>/`, `plan.md`, `checks.md`, `S#`, `C#`, "builtin lanes"): the roles assume the orchestrator provides the ODD builtin feature contract. If hcorc/herdorc do not, these clauses only apply when a handoff names such artifacts.
15. Readonly roles with Bash (verify, judges, reviewers, refuter): `readonly: true` follows the given rule (source tools exclude edit/write), but Bash can mutate. Read-only status depends on instructions.

## Verification

`diff` of each source body (frontmatter removed) against the ported body (first three lines removed) shows only the spans listed above. In addition, applying every listed replacement in reverse to each ported body reproduces the source body byte for byte.


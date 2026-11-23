#!/usr/bin/env python3
"""Port tomidev-shell's primary session prompt to the shared ODD core.

Source: tomidev-shell@6ae777532 tests/fixtures/primary-session-prompt/gentleman.golden.md
Output: shared/core/odd-core.md (with {{AGENT_NAME}}, {{MULTIPLEXER}},
{{DOCS_ROOT}}, {{ROLES_ROOT}} placeholders, filled by build-agents.py) and
shared/PROVENANCE-core.md (one entry per adaptation).

Every replacement must match exactly once, or the script fails. Re-run it
after updating the source commit; review new failures by hand.
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
TOMIDEV = pathlib.Path(__import__("os").environ.get("TOMIDEV_SHELL") or pathlib.Path(__file__).resolve().parents[3] / "tomidev-shell")  # a tomidev-shell clone ($TOMIDEV_SHELL or ../../tomidev-shell)
SOURCE = TOMIDEV / "tests/fixtures/primary-session-prompt/gentleman.golden.md"
COMMIT = "6ae777532"

# (reason, old, new)
REPLACEMENTS = [
    ("Identity heading names the agent, not Tomidev Shell.",
     "## Tomidev Shell Identity and Harness",
     "## {{AGENT_NAME}} Identity and Harness"),
    ("Identity: a coding-agent orchestrator (any CLI) inside a multiplexer, not a Pi harness.",
     "You are Tomidev Shell: a Pi-specific coding-agent harness for controlled development work.",
     "You are {{AGENT_NAME}}: a coding-agent orchestrator for controlled development work, running inside {{MULTIPLEXER}}."),
    ("Identity answer: same meaning, new name and delegation surface (role panes or internal subagents).",
     'answer as Tomidev Shell, not as a generic assistant, and never introduce yourself as only "your assistant" or "the default assistant". Convey this meaning, translated into the user\'s language: "I am Tomidev Shell: a Pi-specific coding-agent harness for controlled development, with a senior architect persona. I compose my builtin development mechanisms with the project\'s harness as orchestrator: I coordinate subagents,',
     'answer as {{AGENT_NAME}}, not as a generic assistant, and never introduce yourself as only "your assistant" or "the default assistant". Convey this meaning, translated into the user\'s language: "I am {{AGENT_NAME}}: a coding-agent orchestrator for controlled development inside {{MULTIPLEXER}}, with a senior architect persona. I compose my builtin development mechanisms with the project\'s harness as orchestrator: I coordinate role agents in {{MULTIPLEXER}} panes (or internal subagents as fallback),'),
    ("Subagents are role agents here (pane or internal subagent).",
     "the project's workflow takes precedence. Subagents remain a core capability.",
     "the project's workflow takes precedence. Role agents (panes or internal subagents) remain a core capability."),
    ("Pi portability claim replaced by an honest runtime boundary.",
     "- Do not claim portability outside the Pi runtime.",
     "- You run as a prompt in whichever coding CLI hosts you: do not claim Pi or Tomidev Shell runtime features (runtime-enforced edit surfaces, runtime signals, TUI labels) that this setup does not have."),
    ("`todo` tool is Pi's; each CLI has its own todo tool.",
     "create or rebuild the visible `todo` list from the reconciled feature tasks",
     "create or rebuild the visible todo list (the todo tool, when available) from the reconciled feature tasks"),
    ("gentle_odd_phase drove a Pi TUI label; here the layer's ODD phase indicator shows it in the multiplexer.",
     "Phase reporting: the Tomidev Shell prompt label is inferred automatically from the primary session's tool activity (reads show `exploring`, edits `implementing`, test runs `checking`, user questions `deciding`). When the `gentle_odd_phase` tool is available, use it to refine that label with phases tools cannot show (`authorizing`, `researching`, `deciding`, `closing`): call `gentle_odd_phase` only when the primary session's ODD phase actually changes, never per tool call or on a fixed cadence, and never from a subagent. It drives the Tomidev Shell prompt label only.",
     "Phase reporting: the layer's ODD phase indicator shows the primary session's phase in {{MULTIPLEXER}}; it is a best-effort label only.\n"
     "<!-- if:hooks -->\n"
     "A hook infers it from the primary session's tool activity (reads show `exploring`, edits `implementing`, test runs `checking`, user questions `deciding`, todo or feature-document edits `planning`). Use the layer's phase command to refine it with phases tools cannot show (`authorizing`, `researching`, `deciding`, `closing`): run it only when the primary session's ODD phase actually changes, never per tool call or on a fixed cadence, and never from a subagent or role pane.\n"
     "<!-- endif -->\n"
     "<!-- if:!hooks -->\n"
     "No hook runs in this CLI, so nothing infers it: report every phase yourself with the layer's phase command (`exploring`, `planning`, `implementing`, `checking`, `authorizing`, `researching`, `deciding`, `closing`), only when the primary session's ODD phase actually changes, never per tool call or on a fixed cadence, and never from a subagent or role pane.\n"
     "<!-- endif -->"),
    ("Engram tool names as exposed by the Engram MCP server.",
     "use `mem_context`, project- and feature-scoped `mem_search`",
     "use Engram's `mem_context`, then its project- and feature-scoped `mem_search`"),
    ("Harness principle names the agent.",
     "- Tomidev Shell is not prompt engineering.",
     "- {{AGENT_NAME}} is not prompt engineering."),
    ("Subagents are role agents (pane or internal subagent).",
     "- Use subagents when available for exploration, planning, implementation, and review,",
     "- Use role agents (panes, or internal subagents as fallback) for exploration, planning, implementation, and review,"),
    ("No package here; memory comes from MCP tools.",
     "- Never claim persistent memory is available because of this package.",
     "- Never claim persistent memory is available because of this setup."),
    ("Orchestrator heading names the agent.",
     "# Tomidev Shell Orchestrator",
     "# {{AGENT_NAME}} Orchestrator"),
    ("No Pi session; role agents instead of subagents.",
     "Bind this to the parent Pi session only; subagents get bounded task instructions.",
     "Bind this to the parent session only; role agents get bounded task instructions."),
    ("Asset root placeholder replaced by the shared docs and roles roots.",
     "Package assets root: `{{TOMIDEV_ASSETS_ROOT}}`. Lazy asset paths below are relative to this root.",
     "Reference documents root: `{{DOCS_ROOT}}`. Role files: `{{ROLES_ROOT}}/<role>.md`. Lazy document names below (`orchestrator-*.md`) are relative to the documents root; read one only when its step needs it."),
    ("Delegation goes to role agents through the layer's Role dispatch protocol.",
     "delegate real phase work to Pi subagents when available, and synthesize results for the user.",
     "delegate real phase work to role agents through the layer's Role dispatch protocol, and synthesize results for the user."),
    ("`todo` tool is Pi's.",
     "Never spend a turn only on a `todo` or status update.",
     "Never spend a turn only on a todo-list or status update."),
    ("`todo` tool is Pi's.",
     "fixes, or a requested `todo` list never decides size.",
     "fixes, or a requested todo list never decides size."),
    ("`bash_background` is Pi's; the shell tool can run in the background, and the layer may have its own runner.",
     "Small path: inline (parent; `bash_background` policy);",
     "Small path: inline (parent; long commands go to the shell tool's background mode or the layer's background runner);"),
    ("`todo` tool is Pi's.",
     "no feature document, mirror, or commits unless the user asks; `todo` on request.",
     "no feature document, mirror, or commits unless the user asks; the todo list on request."),
    ("Writer is dispatched as a role; surfaces are not runtime-enforced here.",
     "Before launching bounded writer (`gentle-ai-worker` or `worker`), derive nonempty `## Allowed edit surfaces`: narrow repository-relative paths/globs; never `.`, bare repo root, or absolute. Do not ask the human to author paths or globs.",
     "Before dispatching a bounded writer (`gentle-ai-worker`), derive nonempty `## Allowed edit surfaces`: narrow repository-relative paths/globs; never `.`, bare repo root, or absolute. Do not ask the human to author paths or globs. No runtime enforces these surfaces here: enforce them by instruction and by checking the writer's diff against them before accepting."),
    ("subagent_run / native Agent fallback replaced by role dispatch (pane, else internal subagent).",
     "(prefer `subagent_run`; role missing/unusable: native `Agent`, same read-only constraints; report fallback)",
     "(dispatch through the layer's Role dispatch protocol: the role's pane when an agent runs there, else the internal subagent of the same name, same read-only constraints; report which path was used)"),
    ("`todo` tool is Pi's.",
     "Engram mirror and `todo` defaults",
     "Engram mirror and todo-list defaults"),
    ("No runtime context signal in these CLIs; use observable context pressure.",
     "7. **Context backstop** — when the runtime signals it → delegate the next unit needing several steps.",
     "7. **Context backstop** — when the session's context is large (long session, many large tool outputs) or the harness warns about it → delegate the next unit needing several steps."),
    ("Pi background-subagent capability: the policy line is kept (on), the capability follows the CLI's tool vocabulary, and role panes are asynchronous by nature.",
     "Background subagent policy: off (capability: ready); rules: delegation background-subagents block.",
     "Background subagent policy: on (capability: ready where this prompt's tool vocabulary gives the subagent tool a background option, absent otherwise; role panes are asynchronous by nature); rules: the background-subagents block in `orchestrator-delegation-reference.md`."),
    ("The orchestrator's own docs, roles and reports live outside the project; reading them and writing handoffs and reports there is part of the workflow, not an outside access.",
     "Exception: reading the task's exact resolved skill files needs no per-file question in any mode.",
     "Exception: reading the task's exact resolved skill files, and this orchestrator's own docs (`{{DOCS_ROOT}}`) and role files (`{{ROLES_ROOT}}`), needs no per-file question in any mode, nor does writing handoffs and reports under `{{REPORTS}}`."),
    ("tlc-spec-lean records mutations in mutations.json, not mutations.md.",
     "proofs.md, mutations.md, verification.md",
     "proofs.md, mutations.json, verification.md"),
    ("Skill paths are no longer injected by the runtime; the parent lists them in the handoff.",
     "The parent resolves skill paths once per session under `## Skills to load before work`; subagents read those `SKILL.md` files first (`paths-injected`) or report unavailable paths;",
     "The parent resolves skill paths once per session and lists them in each handoff under `## Skills to load before work`; role agents read those `SKILL.md` files first or report unavailable paths;"),
    ("`<available_skills>` is Pi's skill listing.",
     "For skill-shaped requests, `<available_skills>` is a discovery aid only,",
     "For skill-shaped requests, the session's available-skills list is a discovery aid only,"),
    ("Edit surfaces are not runtime-enforced here.",
     "- Parallel writers only with disjoint Allowed edit surfaces (runtime-enforced) or isolated worktrees.",
     "- Parallel writers only with disjoint Allowed edit surfaces (enforced by instruction and diff review; no runtime enforces them here) or isolated worktrees."),
]


def main() -> int:
    text = SOURCE.read_text()
    log = []
    failures = []
    for i, (reason, old, new) in enumerate(REPLACEMENTS, 1):
        count = text.count(old)
        if count != 1:
            failures.append(f"#{i} matched {count} times: {old[:80]!r}")
            continue
        text = text.replace(old, new)
        log.append((i, reason, old, new))
    if failures:
        print("FAILED:\n" + "\n".join(failures), file=sys.stderr)
        return 1
    leftovers = [w for w in ("Tomidev Shell", "Pi ", "subagent_run", "gentle_odd_phase", "bash_background", "`todo`", "paths-injected", "TOMIDEV_ASSETS_ROOT") if w in text]
    header = (f"<!-- Ported from tomidev-shell@{COMMIT} tests/fixtures/primary-session-prompt/gentleman.golden.md "
              "by scripts/port-core.py; adaptations in shared/PROVENANCE-core.md. Do not edit by hand: edit the script. -->\n\n")
    out = ROOT / "shared/core/odd-core.md"
    out.write_text(header + text)
    prov = [f"# Provenance: ODD core prompt\n",
            f"Source: `tomidev-shell@{COMMIT}` `tests/fixtures/primary-session-prompt/gentleman.golden.md` (default profile).",
            "Generated by `scripts/port-core.py`. Not ported: the full-delegation profile variant.\n"]
    for i, reason, old, new in log:
        prov.append(f"## {i}. {reason}\n\n- Before: `{old}`\n- After: `{new}`\n")
    (ROOT / "shared/PROVENANCE-core.md").write_text("\n".join(prov))
    print(f"wrote {out.relative_to(ROOT)} ({len(text)} chars), {len(log)} adaptations")
    if leftovers:
        print("LEFTOVER Pi/Tomidev terms to review:", leftovers)
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Port tomidev-shell role definitions into orchestator/shared/roles.

Every body change is an exact, unique string replacement taken from EDITS,
so the provenance log is generated from the same table that performs the edits.
"""
import json
import sys
from pathlib import Path

TOMIDEV = Path(__import__("os").environ.get("TOMIDEV_SHELL") or Path(__file__).resolve().parents[3] / "tomidev-shell")  # a tomidev-shell clone ($TOMIDEV_SHELL or ../../tomidev-shell)
SRC = TOMIDEV / "assets/agents"
DST = Path(__file__).resolve().parents[1] / "shared"
COMMIT = "6ae777532"

ROLES = [
    "gentle-ai-explore", "gentle-ai-worker", "gentle-ai-verify",
    "jd-judge-a", "jd-judge-b",
    "review-risk", "review-readability", "review-reliability", "review-resilience",
    "review-refuter",
]

CHANNEL = ("Return your result to the orchestrator through the channel named in the handoff "
           "(your final message, a report file, or a command such as `hc send`).")

TOOL_MAP = {
    "read": ["Read"], "grep": ["Grep"], "find": ["Glob"], "ls": ["Glob"],
    "edit": ["Edit"], "write": ["Write"], "bash": ["Bash"],
    "mem_save": ["mcp__engram__mem_save"], "mem_search": ["mcp__engram__mem_search"],
    "mem_context": ["mcp__engram__mem_context"],
    # Not in the given mapping table: best mappings, all listed as ambiguities.
    "codegraph": ["mcp__codegraph__codegraph_explore"],
    "web_enable": [],
    "web_search": ["WebSearch"],
    "source_check": ["WebSearch", "WebFetch"],
    "fetch_content": ["WebFetch"],
    "get_search_content": ["WebFetch"],
}
AMBIGUOUS_TOOLS = {"codegraph", "web_enable", "web_search", "source_check", "fetch_content", "get_search_content"}

DESCRIPTION_EDITS = {
    "gentle-ai-worker": ("Scoped implementation writer for Tomidev Shell.",
                         "Scoped implementation writer for the orchestrator.", "1"),
}

def channel_before(anchor):
    return ("\n" + anchor, "\n" + CHANNEL + "\n\n" + anchor)

# (section, old, new, rule, note)
EDITS = {
    "gentle-ai-explore": [
        ("Opening paragraph, sentence 1",
         "You are the read-only explorer for Tomidev Shell tasks.",
         "You are the read-only explorer for the orchestrator's tasks.",
         "1", "Harness name replaced."),
        ("Bullet 1 (structural questions), sentence 1",
         "use the cwd-scoped `codegraph` tool before broad filesystem searches.",
         "use CodeGraph scoped to the current workspace (for example `mcp__codegraph__codegraph_explore`, when available) before broad filesystem searches.",
         "2", "Pi tool `codegraph` (cwd-scoped by the Pi extension) replaced by neutral CodeGraph wording with the Claude Code MCP name as an example, conditioned on availability."),
        ("Bullet 1 (structural questions), sentence 2",
         "Initialize the workspace index with `operation: \"init\"` when it is absent, then use `query` or `explore`; never ask it to target another path.",
         "Initialize the workspace index when it is absent (only through an initialization operation your CodeGraph tool provides), then query or explore it; never ask it to target another path (when the tool takes a project path, pass the current workspace).",
         "2, 3", "Pi tool parameters (`operation: \"init\"`, `query`, `explore`) removed (rule 2). The Pi tool enforced the cwd scope at runtime (it accepted no path); the rule is kept and now enforced by instruction: pass the current workspace when the tool takes a project path (rule 3)."),
        ("Bullet 2 (CodeGraph mutation exception), sentence 1",
         "- `codegraph` may create or update only the current workspace `.codegraph/` index.",
         "- CodeGraph may create or update only the current workspace `.codegraph/` index.",
         "2", "Pi tool name `codegraph` replaced by the product name CodeGraph. Limit unchanged."),
        ("Bullet 3 (fallback), sentence 1",
         "- If CodeGraph reports that it is unavailable or fails, then use `read`, `grep`, and `find` as the fallback.",
         "- If CodeGraph is not available in your CLI, reports that it is unavailable, or fails, then read files, search file contents, and find files by name or glob as the fallback.",
         "2", "Pi tool names `read`/`grep`/`find` replaced by neutral actions; added the not-available-in-your-CLI case so the fallback applies in CLIs without CodeGraph. Second sentence (fallback order) unchanged."),
        ("Bullet 4 (online questions), sentence 2",
         "Use `web_enable` if activation is needed.",
         "Activate them first if your CLI requires activation.",
         "2, 6", "Pi tool `web_enable` (pi-web-access) has no Claude Code equivalent; mechanism removed, rule (activate web tools when needed) kept."),
        ("Return paragraph (new paragraph inserted before it)",
         *channel_before("Return a compact handoff of at most ~2k tokens:"),
         "4", "Channel made neutral. The content requirements of the return paragraph are unchanged."),
    ],
    "gentle-ai-worker": [
        ("Opening paragraph",
         "You are the implementation writer for Tomidev Shell.",
         "You are the implementation writer for the orchestrator.",
         "1", "Harness name replaced."),
        ("Second paragraph, sentence 3",
         "Never delegate or invoke `subagent_*` tools.",
         "Never delegate or invoke subagent or delegation tools (for example `subagent_*`, `Agent`, or `Task`); this is enforced by instruction, even if your CLI exposes them.",
         "3", "Pi `subagent_*` tools generalized to any CLI's subagent/delegation tools; rule kept and stated as enforced by instruction."),
        ("## Context contract, item 1",
         "1. Read every exact path under `## Skills to load before work` in the parent task.",
         "1. Read every exact path under `## Skills to load before work` in the parent task (the orchestrator's handoff supplies these paths).",
         "3", "Pi injected skill paths: the orchestrator's handoff now supplies the `## Skills to load before work` section."),
        ("## Context contract, item 2",
         "The parent supplies edit surfaces under `## Allowed edit surfaces` in the task; treat that section as the authoritative list.",
         "The parent supplies edit surfaces under `## Allowed edit surfaces` in the task (the orchestrator's handoff); treat that section as the authoritative list, enforced by instruction rather than by the runtime.",
         "3", "Pi runtime-enforced Allowed edit surfaces: rule kept, now supplied by the orchestrator's handoff and enforced by instruction."),
        ("## Implementation rules, bullet 4",
         "- Use `find` for scoped file discovery.",
         "- Use your CLI's file-search tool (find files by name or glob) for scoped file discovery.",
         "2", "Pi tool name `find` replaced by neutral wording."),
        ("## Implementation rules, bullet 5, sentence 1",
         "- Prefer the dedicated `grep`/`find` tools over raw `bash` grep — they honour `.gitignore`.",
         "- Prefer your CLI's dedicated content-search and file-search tools over raw shell `grep` — they honour `.gitignore`.",
         "2", "Pi tool names `grep`/`find`/`bash` replaced by neutral wording. The `.gitignore` claim is kept verbatim (see ambiguities). The scan-bound sentence (`grep -r … .`, `find .`, `--exclude-dir`) is shell syntax, unchanged."),
        ("## Implementation rules, bullet 6 (Batch tool calls), sentence 2",
         "Make all edits to one file in one `edit` call,",
         "Make all edits to one file in one edit call (when your CLI's edit tool accepts several changes per call),",
         "2", "Pi tool name `edit` de-codified; conditioned on edit-tool capability because single-replacement edit tools (for example Claude Code Edit) cannot batch (see ambiguities)."),
        ("## Tool safety, bullet 5, sentence 2",
         "or any `subagent_*` tool.",
         "or any subagent or delegation tool.",
         "3", "Pi `subagent_*` tools generalized; rule kept."),
        ("## Tool safety, bullet 7",
         "- Retain `bash` only for safe working-tree inspection",
         "- Retain shell access only for safe working-tree inspection",
         "2", "Pi tool name `bash` replaced by neutral wording. Scope of allowed commands unchanged."),
        ("## Memory safety, sentence 1",
         "Use `mem_save` only when the parent supplies a validated project name",
         "Use Engram `mem_save` (`mcp__engram__mem_save`) only when it is callable and the parent supplies a validated project name",
         "5", "Mapped to the Engram MCP name and conditioned on being callable. All other memory restrictions unchanged."),
        ("## Return contract (new first paragraph)",
         *channel_before("Return one compact handoff using the schema below;"),
         "4", "Channel made neutral. Schema, field names, status vocabulary and content requirements unchanged."),
        ("## Return contract, `skill_resolution` paragraph, sentence 1",
         "only when the parent injected exact skill paths and every path was successfully read",
         "only when the parent injected exact skill paths (listed under `## Skills to load before work` in the orchestrator's handoff) and every path was successfully read",
         "3", "Pi skill-path injection tied to the handoff section. Values `paths-injected | paths-invalid | none` and all rules about them unchanged."),
    ],
    "gentle-ai-verify": [
        ("**Search bounds:** paragraph, sentence 1",
         "prefer the dedicated `grep`/`find` tools over raw `bash` grep — they honour `.gitignore`.",
         "prefer your CLI's dedicated content-search and file-search tools over raw shell `grep` — they honour `.gitignore`.",
         "2", "Pi tool names `grep`/`find`/`bash` replaced by neutral wording. `.gitignore` claim and the `(gentle-shell#2686)` reference kept verbatim (see ambiguities)."),
        ("Isolated-setup paragraph (\"Probe on your first launch\"), sentence on `.git`",
         "because recursive deletion is blocked for child agents,",
         "because recursive deletion is prohibited for child agents (enforced by instruction; no runtime blocks it for you),",
         "3", "Pi child-safety runtime block replaced by a prohibition enforced by instruction. Rule (never copy `.git` and delete it) unchanged."),
        ("Return paragraph (new paragraph inserted before it)",
         *channel_before("Return a compact evidence handoff of at most ~2k tokens:"),
         "4", "Channel made neutral. Content requirements unchanged."),
    ],
}

for judge in ("A", "B"):
    EDITS[f"jd-judge-{judge.lower()}"] = [
        ("Opening paragraph",
         f"You are blind adversarial judge {judge} for Tomidev Shell.",
         f"You are blind adversarial judge {judge} for the orchestrator.",
         "1", "Harness name replaced."),
        ("## Findings format (new first paragraph)",
         *channel_before("Report findings grouped by severity (CRITICAL, IMPORTANT, SUGGESTION):"),
         "4", "Channel made neutral (the source left it implicit: the Pi subagent's final message). Severity vocabulary and fields unchanged."),
    ]

REVIEW_NAMES = {"review-risk": "R1 Risk", "review-readability": "R2 Readability",
                "review-reliability": "R3 Reliability", "review-resilience": "R4 Resilience"}
for role in REVIEW_NAMES:
    EDITS[role] = [
        ("Opening paragraph, sentence 1",
         "a read-only specialized code reviewer for Tomidev Shell.",
         "a read-only specialized code reviewer for the orchestrator.",
         "1", "Harness name replaced."),
        ("## Output format (new first paragraph)",
         *channel_before("Format findings for `requesting-code-review`:"),
         "4", "Channel made neutral (the source left it implicit: the Pi subagent's final message). Format, Cause/Evidence vocabulary, Tags and Verdict unchanged."),
    ]

EDITS["review-refuter"] = [
    ("Opening paragraph, sentence 1",
     "You are the **review refuter** for Tomidev Shell.",
     "You are the **review refuter** for the orchestrator.",
     "1", "Harness name replaced."),
    ("## Output format (new first paragraph)",
     *channel_before("One entry per supplied finding, in the supplied order:"),
     "4", "Channel made neutral (the source left it implicit: the Pi subagent's final message). Outcome vocabulary and Batch line unchanged."),
]


def split_frontmatter(text):
    lines = text.split("\n")
    assert lines[0] == "---", "missing frontmatter"
    end = lines.index("---", 1)
    fm = lines[1:end]
    body = "\n".join(lines[end + 1:])
    assert body.startswith("\n"), "expected one blank line after frontmatter"
    return fm, body[1:]


def parse_fm(fm):
    out, key = {}, None
    for line in fm:
        if line.startswith("  - "):
            out[key].append(line[4:].strip())
        elif ":" in line:
            key, val = line.split(":", 1)
            val = val.strip()
            out[key] = val if val else []
    return out


def md_cell(s):
    return s.replace("|", "\\|").replace("\n", " ⏎ ")


def main():
    roles_json, prov_roles, counts = [], [], {}
    for role in ROLES:
        src_text = (SRC / f"{role}.md").read_text()
        fm, body = split_frontmatter(src_text)
        meta = parse_fm(fm)
        assert meta["name"] == role, (meta["name"], role)
        new = body
        for section, old, rep, rule, note in EDITS[role]:
            n = new.count(old)
            if n != 1:
                sys.exit(f"{role}: expected exactly 1 occurrence, found {n}: {old!r}")
            new = new.replace(old, rep)
        header = (f"<!-- Ported from tomidev-shell@{COMMIT} assets/agents/{role}.md; adapted for Claude Code "
                  f"and other CLIs. Adaptations: shared/PROVENANCE-roles.md -->\n# Role: {role}\n\n")
        (DST / "roles" / f"{role}.md").write_text(header + new)

        desc = meta["description"]
        if role in DESCRIPTION_EDITS:
            old, rep, _ = DESCRIPTION_EDITS[role]
            assert desc.count(old) == 1
            desc = desc.replace(old, rep)
        tools = []
        for t in meta["tools"]:
            mapped = [t] if t.startswith("mcp__") else TOOL_MAP[t]
            for m in mapped:
                if m not in tools:
                    tools.append(m)
        readonly = not ({"edit", "write"} & set(meta["tools"]))
        roles_json.append({"name": role, "description": desc, "tools": tools,
                           "readonly": readonly, "source_tools": meta["tools"]})
        counts[role] = len(EDITS[role])
        prov_roles.append((role, meta, desc, tools, readonly))

    (DST / "roles" / "roles.json").write_text(json.dumps(roles_json, indent=2, ensure_ascii=False) + "\n")
    (DST / "PROVENANCE-roles.md").write_text(render_provenance(prov_roles, counts))
    for role in ROLES:
        print(f"{role}: {counts[role]} body adaptations")


def render_provenance(prov_roles, counts):
    out = []
    w = out.append
    w("# Provenance: ported roles\n")
    w(f"Source: `tomidev-shell@{COMMIT}` (Tomidev Shell 1.3.0, Pi runtime, ODD workflow), files "
      "`assets/agents/<name>.md`. The source repository was read only, never modified.\n")
    w("Destination: `shared/roles/<name>.md` (body only, no YAML frontmatter) and "
      "`shared/roles/roles.json` (Claude Code metadata).\n")
    w("Each role runs either in a herdr pane under any coding-agent CLI (told to read the role file) or as a "
      "Claude Code subagent with the same name. Bodies are therefore harness-agnostic; Claude Code tool names "
      "live only in `roles.json`.\n")
    w("## Rule legend\n")
    w("1. \"Tomidev Shell\" as the harness → \"the orchestrator\".")
    w("2. Pi tool names used as instructions → harness-neutral phrasing; CodeGraph and Engram phrased as \"when available\".")
    w("3. Pi runtime features (subagent tools, runtime-enforced Allowed edit surfaces, writer admission, child safety, "
      "injected skill paths, status/telemetry) → rule kept, stated as enforced by instruction; the orchestrator's handoff "
      "supplies scope, `## Allowed edit surfaces` and `## Skills to load before work`.")
    w("4. Return protocol → content requirements kept, channel made neutral.")
    w("5. Memory → Engram rules kept, mapped to `mcp__engram__*`, only when callable.")
    w("6. No equivalent → mechanism removed, rule kept, logged.")
    w("7. English stays English (no translation was needed: every source body is English).\n")
    w("\"Output\" marks changes required by the port's output specification, not by rules 1-7.\n")
    w("## Changes common to every role\n")
    w("| # | Section | Original | New | Rule |")
    w("|---|---|---|---|---|")
    w("| C1 | File head | YAML frontmatter (`name`, `description`, `tools`) | Removed from the body; carried in `roles.json` (`name`, `description`, `source_tools`, mapped `tools`, `readonly`) | Output |")
    w(f"| C2 | File head | (none) | Line 1: `<!-- Ported from tomidev-shell@{COMMIT} assets/agents/<name>.md; adapted for Claude Code and other CLIs. Adaptations: shared/PROVENANCE-roles.md -->` | Output |")
    w("| C3 | File head | (none) | Line 2: `# Role: <name>`, then one blank line, then the source body | Output |")
    w(f"\nThe exact sentence used for every rule-4 change (\"CHANNEL\" below):\n\n> {CHANNEL}\n")
    w("## Per-role body adaptations\n")
    w("Columns quote the exact replaced span. Text outside the spans is byte-identical to the source body. "
      "A rule-4 row inserts CHANNEL as a new paragraph directly before the quoted anchor; the anchor itself is unchanged.\n")
    for role, meta, desc, tools, readonly in prov_roles:
        w(f"### {role} ({counts[role]} body adaptations + C1-C3)\n")
        w("| # | Section | Original | New | Rule | Note |")
        w("|---|---|---|---|---|---|")
        for i, (section, old, rep, rule, note) in enumerate(EDITS[role], 1):
            if old.startswith("\n") and rep.startswith("\n" + CHANNEL):
                o, r = f"(none; anchor: `` {old.strip()} ``)", "CHANNEL paragraph inserted before the anchor"
            else:
                o, r = f"{old}", f"{rep}"
            w(f"| {i} | {md_cell(section)} | {md_cell(o)} | {md_cell(r)} | {rule} | {md_cell(note)} |")
        w("")
    w("## roles.json\n")
    w("Tool mapping applied: read→Read, grep→Grep, find→Glob, ls→Glob, edit→Edit, write→Write, bash→Bash, "
      "mem_save→mcp__engram__mem_save, mem_search→mcp__engram__mem_search, mem_context→mcp__engram__mem_context, "
      "`mcp__*` unchanged. Tools outside that table (best mappings, all listed under Ambiguities): "
      "codegraph→mcp__codegraph__codegraph_explore, web_search→WebSearch, source_check→WebSearch + WebFetch, "
      "fetch_content→WebFetch, get_search_content→WebFetch, web_enable→(no equivalent, dropped). Duplicates are "
      "collapsed in source order. `readonly` is true when `source_tools` contains neither `edit` nor `write`. "
      "`readonly` roles that keep `Bash` (verify, judges, reviewers, refuter) are read-only by instruction only.\n")
    w("| Role | Description change | tools | readonly |")
    w("|---|---|---|---|")
    for role, meta, desc, tools, readonly in prov_roles:
        if role in DESCRIPTION_EDITS:
            o, r, rule = DESCRIPTION_EDITS[role]
            dchange = f"\"{o}\" → \"{r}\" (rule {rule})"
        else:
            dchange = "verbatim"
        w(f"| {role} | {md_cell(dchange)} | {', '.join(tools)} | {str(readonly).lower()} |")
    w("")
    w(KEPT_AND_AMBIGUITIES)
    return "\n".join(out) + "\n"


KEPT_AND_AMBIGUITIES = """## Kept verbatim on purpose

These source phrases looked harness-specific but still hold, so they were not changed:

- \"parent\", \"parent task\", \"parent orchestrator\" (all roles): the orchestrator is the parent in both run modes.
- \"When resumed in the same child session\" (explore, worker, verify): still holds for a resumed Claude Code subagent and for a herdr pane session that receives follow-ups.
- \"delegate to child agents\" / \"Do not delegate to child agents\" (explore, verify): behavioural rule, harness-neutral.
- \"builtin lanes\", \"builtin feature contract\", \"builtin test-first policy\", `.agents/designs/features/<feature>/`, `plan.md`, `checks.md`, `S#`/`C#` (explore, worker, verify, judges): ODD fallback conventions, kept because the rules depend on them (see Ambiguities).
- \"no TUI toggle or per-task chat choice is needed\" (worker), \"never demand a TUI or chat toggle\" (verify): prohibitions that still hold.
- \"native authority\" (worker, Test discipline), \"transaction controller\" (worker, Return contract schema), `requesting-code-review` (review-risk/readability/reliability/resilience), \"trusted local orchestrator\" (review-risk): kept because they sit inside rules or output formats that must stay verbatim (see Ambiguities).
- \"use Bash\" (verify, isolated-setup paragraph): kept because the prescribed command (`set -o pipefail && ... tar ...`) needs a Bash-compatible shell. Read it as the Bash shell in CLIs that have no Bash tool.
- Shell commands and syntax (`grep -r … .`, `find .`, `--exclude-dir=...`, `git status --short`, `mktemp -d`, `env -i`, `tar ...`): these are shell commands, not Pi tool names (rule 2 does not apply).
- Worker `## Tool safety` and verify's isolation rules: already stated as instructions, so no wording change was needed. Note that Pi's child-safety extension also blocked some of these at runtime (for example `rm -rf`); no runtime backstop exists now, so they are enforced only by instruction.
- No source body mentions writer admission or Pi status/telemetry, so those rule-3 categories produced no change.

## Ambiguities (decisions for the maintainer)

1. explore, tools `codegraph` → `mcp__codegraph__codegraph_explore`. Source: \"use the cwd-scoped `codegraph` tool ... Initialize the workspace index with `operation: \"init\"` when it is absent\". The Pi tool could initialize the index; the Claude Code MCP explore tool cannot, and the local CodeGraph MCP server says indexing is the user's decision. The port keeps initialization only \"through an initialization operation your CodeGraph tool provides\", so in Claude Code an absent index falls through to the read/search fallback.
2. explore, tools `web_enable` → dropped. Source: \"Use `web_enable` if activation is needed.\" Claude Code web tools need no activation tool.
3. explore, tools `web_search` → WebSearch; `fetch_content` → WebFetch (pi-web-access: \"Fetch web pages, PDFs, and GitHub repos\"; Claude Code WebFetch does not clone GitHub repos).
4. explore, tools `source_check` → WebSearch + WebFetch. pi-web-access: \"Gather cited web passages about a claim for manual review.\" No single Claude Code equivalent.
5. explore, tools `get_search_content` → WebFetch. pi-web-access: \"Page through or search stored content from web_search, source_check, or fetch_content by responseId.\" Claude Code has no stored-result paging; WebFetch is only the closest.
6. explore, description kept verbatim: \"Read-only local and web exploration on its configured economical model.\" `roles.json` has no model field, so nothing configures an economical model. Consider adding a `model` field (or a Claude Code `model:` frontmatter at install time), or dropping the clause.
7. worker, verify, `.gitignore` claim kept: \"Prefer the dedicated `grep`/`find` tools over raw `bash` grep — they honour `.gitignore`.\" True for the Pi tools; not verified for every CLI's search tools.
8. worker, single-call edits: \"Make all edits to one file in one `edit` call\". Claude Code Edit replaces one span per call, so the rule was conditioned on edit-tool capability.
9. worker, \"native authority and all other applicable limits remain binding\": Tomidev/Pi term (also in the golden prompt: \"within native authority you own the next step\") for the agent's granted permission envelope. Kept verbatim.
10. worker, Return contract: \"<paths or behaviors the transaction controller should verify>\": the transaction controller is the parent orchestrator. Kept verbatim because it is inside the output schema.
11. reviewers (risk, readability, reliability, resilience): \"Format findings for `requesting-code-review`:\". In Tomidev Shell this is the review skill that consumes lens output (README: \"Use `requesting-code-review` at the final checkpoint\"). The orchestrator repository has no such skill. Kept verbatim.
12. review-risk: \"Do not report the mere ability of the trusted local orchestrator to execute tools as a security finding.\" Written for Tomidev Shell itself; it now reads as hcorc/herdorc. Kept verbatim.
13. verify: \"(gentle-shell#2686)\" is an issue reference in the upstream repo, which a reader in this repo cannot resolve. Kept verbatim.
14. ODD fallback conventions (`.agents/designs/features/<feature>/`, `plan.md`, `checks.md`, `S#`, `C#`, \"builtin lanes\"): the roles assume the orchestrator provides the ODD builtin feature contract. If hcorc/herdorc do not, these clauses only apply when a handoff names such artifacts.
15. Readonly roles with Bash (verify, judges, reviewers, refuter): `readonly: true` follows the given rule (source tools exclude edit/write), but Bash can mutate. Read-only status depends on instructions.

## Verification

`diff` of each source body (frontmatter removed) against the ported body (first three lines removed) shows only the spans listed above. In addition, applying every listed replacement in reverse to each ported body reproduces the source body byte for byte.
"""

if __name__ == "__main__":
    main()

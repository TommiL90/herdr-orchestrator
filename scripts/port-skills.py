#!/usr/bin/env python3
"""Port the selected tomidev-shell skills into shared/skills/ and log every change.

Source: tomidev-shell@COMMIT skills/<name>/ (the working tree must be clean at that commit).
Each adaptation must match its original text exactly once, or the script stops.
Writes shared/skills/<name>/ (whole tree) and shared/PROVENANCE-skills.md.
Run: python3 scripts/port-skills.py
"""
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = Path(__import__("os").environ.get("TOMIDEV_SHELL") or Path(__file__).resolve().parents[3] / "tomidev-shell")  # a tomidev-shell clone ($TOMIDEV_SHELL or ../../tomidev-shell)
SRC = REPO / "skills"
COMMIT = "6ae777532"
DEST = ROOT / "shared/skills"

SKILLS = ["requesting-code-review", "consensus", "tlc-spec-lean", "testing",
          "delivery", "clean-code", "comment-writer", "gentle-ui-design"]

NOT_PORTED = [
    ("design (gentle-design)", "Built around Tomidev's `gentle_design` canvas server and `gentle_design_comments` "
     "tool (open/list/stop/implement/handoff, stale-source detection, canvas URL) and `/td:design` commands. "
     "Without them only \"write HTML artboards to design/<slug>/\" would remain. Not needed for orchestration; "
     "the generic UX guidance it leans on is ported as `gentle-ui-design`."),
    ("tui-design", "Guidance for Tomidev's own terminal UI; not needed here."),
    ("ego-browser", "Already installed as a user-level skill on this machine; the docs keep pointing at it."),
    ("tomidev", "Describes the Tomidev Shell harness and lanes; replaced by the ported ODD core."),
]

# (file relative to the skill, id, reason, original, replacement)
ADAPT = {
    "delivery": [
        ("SKILL.md", "D1",
         "The Pi shell's commit/push confirmation dialog does not exist here; the private-harness guard is a "
         "project script, so it stays as an instruction when the project ships it.",
         "The shell also asks the human to confirm each commit or push in a dialog; before an approved commit it "
         "runs `.agents/scripts/private_harness_guard.py` when present, and a declined, unavailable or failing "
         "confirmation or guard stops the commit.",
         "Before an approved commit, run the project's private-harness guard (for example "
         "`.agents/scripts/private_harness_guard.py`) when it ships one; a failing guard stops the commit."),
        ("SKILL.md", "D2",
         "`diff_budget` is a Tomidev package script; same wording as the docs port (T7).",
         "<!-- Include ONLY if diff_budget reports >400 production lines and >=2 independent units -->",
         "<!-- Include ONLY if the diff budget reports >400 production lines and >=2 independent units -->"),
        ("SKILL.md", "D3",
         "`diff_budget` is a Tomidev package script; same wording as the docs port (T7).",
         "Recommend a split only when `diff_budget` reports",
         "Recommend a split only when the diff budget (the `diff_budget` script where the project ships it; "
         "otherwise a production-line count of the branch diff against its base) reports"),
    ],
    "tlc-spec-lean": [
        ("SKILL.md", "L1",
         "`rtk` is the host's output wrapper; hosts that use it add it themselves (Claude Code here does it "
         "with a hook), and other CLIs may not have it.",
         "Use Python 3.9+ and Git. Prefix shell invocations with rtk.",
         "Use Python 3.9+ and Git."),
        ("SKILL.md", "L2",
         "Tomidev runs in a multi-repo workspace whose root is not a repository; here the root usually is one.",
         "Never run Git at the workspace root.",
         "When the workspace root is not itself a repository (a multi-repo workspace), never run Git there."),
        ("references/delivery.md", "L3",
         "`diff_budget.py` ships with Tomidev, not with the projects this orchestrator works on.",
         "Use .agents/scripts/diff_budget.py --root <repo> --base <base-ref>. --head <ref> measures a\n"
         "branch diff from merge-base.",
         "Use the project's diff-budget script where it ships one (for example .agents/scripts/diff_budget.py\n"
         "--root <repo> --base <base-ref>; --head <ref> measures a branch diff from merge-base); otherwise\n"
         "count production lines from `git diff --numstat <base-ref>` plus untracked files."),
        ("references/delivery.md", "L4",
         "Same multi-repo workspace assumption as L2.",
         "Each repo has its own branch and toolchain; the workspace has no Git repository or root runner.",
         "In a multi-repo workspace each repo has its own branch and toolchain, and the workspace root has no\n"
         "Git repository or root runner."),
        ("references/checks.md", "L5",
         "The upstream cites rule 9 (handoff persistence) for captured screens; the rule on binding visual "
         "sources is rule 6.",
         "feature does not change, reached through the nav: the author's `**Walked:**` line names the visit.\n"
         "[SKILL.md](../SKILL.md) rule 9.",
         "feature does not change, reached through the nav: the author's `**Walked:**` line names the visit.\n"
         "[SKILL.md](../SKILL.md) rule 6."),
        ("references/checks.md", "L6",
         "The upstream cites rule 6 (visual sources) for the mutation count; the mutation rule is rule 5.",
         "not change: [SKILL.md](../SKILL.md) rule 6.",
         "not change: [SKILL.md](../SKILL.md) rule 5."),
    ],
    "gentle-ui-design": [
        ("SKILL.md", "G1",
         "The canvas route needs the `gentle-design` skill and its canvas server, which are not ported; the "
         "route question keeps the two routes that exist here.",
         "At a new design workflow entry, ask once for canvas, direct application work, or the repository-defined "
         "workflow unless the human already selected it for this task.",
         "At a new design workflow entry, ask once for direct application work or the repository-defined "
         "workflow unless the human already selected it for this task."),
        ("SKILL.md", "G2",
         "`gentle-design` is not ported (see Not ported).",
         " Only after the canvas route is selected, use `gentle-design` for missing HTML artboard delivery "
         "guidance; do not require it for direct or repository work.",
         ""),
        ("SKILL.md", "G3",
         "`gentle-ai-tui-design` is not ported.",
         "Use `gentle-ai-tui-design` for terminal interfaces.",
         "It does not cover terminal interfaces."),
    ],
}


def git(*args):
    return subprocess.run(["git", "-C", str(REPO), *args], capture_output=True, text=True, check=True).stdout


def header(name):
    return (f"<!-- Ported from tomidev-shell@{COMMIT} skills/{name}/; adapted for the hcorc/herdorc orchestrators, any coding CLI "
            f"(hcorc/herdorc). Adaptations: shared/PROVENANCE-skills.md -->\n")


def insert_header(text, name):
    if not text.startswith("---\n"):
        sys.exit(f"{name}/SKILL.md has no frontmatter")
    end = text.index("\n---\n", 4) + len("\n---\n")
    return text[:end] + header(name) + text[end:]


def main():
    head = git("rev-parse", "--short=9", "HEAD").strip()
    if not head.startswith(COMMIT):
        sys.exit(f"tomidev-shell HEAD is {head}, expected {COMMIT}")
    if git("status", "--porcelain", "--", "skills").strip():
        sys.exit("tomidev-shell skills/ has uncommitted changes")

    log = []
    for name in SKILLS:
        dst = DEST / name
        if dst.exists():
            shutil.rmtree(dst)
        shutil.copytree(SRC / name, dst, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store"))
        for rel, aid, reason, old, new in ADAPT.get(name, []):
            path = dst / rel
            text = path.read_text()
            count = text.count(old)
            if count != 1:
                sys.exit(f"{name}/{rel} {aid}: original found {count} times")
            path.write_text(text.replace(old, new))
            log.append((name, rel, aid, reason, old, new))
        skill_md = dst / "SKILL.md"
        skill_md.write_text(insert_header(skill_md.read_text(), name))
        print(f"{name}: {len(ADAPT.get(name, []))} adaptations + header")

    out = [f"# Provenance: skills\n",
           f"Source: `tomidev-shell@{COMMIT}` `skills/<name>/`. Generated by `scripts/port-skills.py`; "
           "rerun it to rebuild `shared/skills/` from the source.\n",
           "Every `SKILL.md` gets one comment line after its frontmatter naming the source. "
           "Everything else is verbatim except the adaptations below.\n",
           "## Ported\n", "| Skill | Adaptations |", "|---|---|"]
    for name in SKILLS:
        out.append(f"| `{name}` | {len(ADAPT.get(name, [])) or 'none (verbatim)'} |")
    out.append("\n`tlc-spec-lean` keeps its upstream `UPSTREAM.md` and `LICENSE.upstream` (Tech Leads Club, "
               "CC-BY-4.0) unchanged.\n")
    out.append("## Adaptations\n")
    for name, rel, aid, reason, old, new in log:
        out += [f"### {aid} · `{name}/{rel}`\n", f"Reason: {reason}\n", "Original:\n", "```text", old, "```\n",
                "New:\n", "```text", new or "(removed)", "```\n"]
    out.append("## Not ported\n")
    for name, why in NOT_PORTED:
        out.append(f"- **{name}**: {why}")
    (ROOT / "shared/PROVENANCE-skills.md").write_text("\n".join(out) + "\n")
    print("PROVENANCE written")


if __name__ == "__main__":
    main()

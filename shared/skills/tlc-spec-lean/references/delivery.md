# Delivery size and integration

Aim for about 400 production added + deleted lines per reviewable slice. Exclude tests from that
budget; report tests, docs/harness, generated/vendor and unknown paths separately. Count the final
combined staged/unstaged diff against the agreed base, and new nonignored untracked files.
Use the project's diff-budget script where it ships one (for example .agents/scripts/diff_budget.py
--root <repo> --base <base-ref>; --head <ref> measures a branch diff from merge-base); otherwise
count production lines from `git diff --numstat <base-ref>` plus untracked files. Unknown classifications require inspection; overrides are explicit.

A coherent change with separate local commits is the default when commits are requested. Use
child PRs toward a working branch only when units can be reviewed independently, contracts are
stable, and integration gates can be run together. Size alone is insufficient. Keep ordered
DB/API/consumer dependencies explicit. No automatic commits, child PRs, pushes or remote uploads.
In a multi-repo workspace each repo has its own branch and toolchain, and the workspace root has no
Git repository or root runner.

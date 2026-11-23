// Which skill conflicts a toast already reported. Pure, so tests import it.
// Conflicts with a project copy are kept per project. The user/orchestrator part
// of a conflict is the same in every folder (outside a git repo each folder is its
// own project), so it shares one key, "~", also where a project copy shadows both:
// coming back from such a project repeats no toast.
const outside = (c) => [c.use, ...(c.shadows ?? [])].filter((x) => x && x.scope !== "project");
const local = (c) => c.use?.scope === "project" || (c.shadows ?? []).some((s) => s.scope === "project");

/** [key, signature, conflicts]: the project's conflicts, then the global ones. */
export function signatures(project, conflicts) {
  const sign = (list, scope) => list.map((c) => `${c.skill}:${scope(c)}`).sort().join(",");
  const mine = conflicts.filter(local);
  const global = conflicts.filter((c) => outside(c).length > 1);
  return [
    [project, sign(mine, (c) => c.use?.scope), mine],
    ["~", sign(global, (c) => outside(c)[0].scope), global],
  ];
}

/** The conflicts in a set that changed since `seen`, which it updates. */
export function unseen(seen, project, conflicts) {
  const changed = [];
  for (const [key, sig, list] of signatures(project, conflicts)) {
    if ((seen[key] ?? "") === sig) continue;
    if (sig) seen[key] = sig; else delete seen[key];
    changed.push(...list);
  }
  return changed;
}

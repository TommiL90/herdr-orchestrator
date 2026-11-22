// Reads which skills the orchestrator will use in the focused project and
// shares the answer with every copy of this mod (the tab-bar button and the
// panel), so only one copy runs `orc.py skills`.
import { spaces, panes, focused, exec, shared, setShared } from "herdr";
import { ORC, PYTHON } from "./config.js";

export const PANEL = "orc-skills-panel";   // the collapsible column
export const TOGGLE = "orc-skills-toggle"; // the button beside the tab bar
const KEY = "orc-skills";

export function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// Where the focused terminal is, as the Changes panel finds it.
export function location() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : (space?.machine ?? null);
  return { cwd: pane?.cwd || f?.cwd || space?.folder || null, on };
}
export const contextKey = () => JSON.stringify(location());

// { context, data?, error? } for the last place read.
export const current = () => shared(KEY) ?? null;

export async function load() {
  const { cwd, on } = location(), context = JSON.stringify({ cwd, on });
  let result;
  if (!ORC) result = { context, error: "Not set up: run `python3 install.py --herdr-app` in your herdr-orchestrators clone." };
  else if (on) result = { context, error: "This terminal is on another machine; skills are read on this computer only." };
  else if (!cwd) result = { context, error: "Focus a terminal to see its project's skills." };
  else {
    try {
      const r = await exec(PYTHON, [ORC, "skills", "--json"], { cwd, timeout: 15000 });
      if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim().split("\n").pop() || `orc.py exited ${r.code}`);
      result = { context, data: JSON.parse(r.stdout) };
    } catch (e) {
      const last = current();
      result = { context, error: String(e?.message ?? e), data: last?.context === context ? last.data : undefined };
    }
  }
  // A slower read for a place already left must not replace a newer answer.
  const now = current();
  if (context !== contextKey() && now?.context === contextKey()) return result;
  if (JSON.stringify(now) !== JSON.stringify(result)) setShared(KEY, result);
  return result;
}

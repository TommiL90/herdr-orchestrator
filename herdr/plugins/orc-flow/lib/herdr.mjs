// What herdr knows, in the shape model.js works with. Replaces agent-flow's normalize(),
// which read herdr-app's `agents()` and `terminals()`: here one `herdr api snapshot` gives
// every pane and agent, and herdorc's state file says which panes the lead created.
//
// Pure except snapshot(), loadState() and the lead memory, which read herdr or files.
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { clean } from "./model.js";

// herdorc's ten roles (shared/roles/roles.json). A role pane is labelled `<role>` or `<role>-N`.
export const ROLES = [
  "gentle-ai-explore", "gentle-ai-worker", "gentle-ai-verify", "jd-judge-a", "jd-judge-b",
  "review-risk", "review-readability", "review-reliability", "review-resilience", "review-refuter",
];
const ROLE_RE = new RegExp(`^(${ROLES.join("|")})(?:-\\d+)?$`);
export const roleOf = (name) => ROLE_RE.exec(name ?? "")?.[1] ?? null;
// orc.py shows herdorc's phase as its pane label: `herdorc · exploring`.
const LEAD_RE = /^herdorc(?:\b|$)/i;

// herdr's agent names; scan.cjs and model.js call Claude Code `claude-code`.
export const appOf = (agent) => (agent === "claude" ? "claude-code" : agent ?? null);

// The herdr session this pane belongs to: herdr sets HERDR_SESSION in named sessions' panes;
// the socket path (`.../sessions/<name>/herdr.sock`) says it too. Else the default session.
export function herdrSession(env = process.env) {
  if (env.HERDR_SESSION) return env.HERDR_SESSION;
  const m = /[\\/]sessions[\\/]([^\\/]+)[\\/]herdr\.sock$/.exec(env.HERDR_SOCKET_PATH ?? "");
  return m ? m[1] : "default";
}

// shared/bin/orc_state.py: one file per herdorc lead pane,
// `~/.local/state/orc/herdorc-<session>-<workspace>.pane-<lead>.json`, with `safe()` applied
// to "<session>-<workspace>" and to the lead. Keep both in step.
export const safe = (text) => String(text || "none").replace(/[^A-Za-z0-9_.-]/g, "_");
const stateDir = (home) => path.join(home, ".local", "state", "orc");
export function statePath(session, workspace, lead, home = os.homedir()) {
  return path.join(stateDir(home), `herdorc-${safe(`${session}-${workspace || "none"}`)}.pane-${safe(lead)}.json`);
}

// Every herdorc's record in this workspace, each pane tagged with its lead as the file
// name has it (`safe(<lead pane>)`), so each lead gets only its own panes. The first
// format's single file names no lead: orc_state.py never adopts it, and neither does this.
export function loadStates(session, workspace, livePanes, home = os.homedir()) {
  const head = `herdorc-${safe(`${session}-${workspace || "none"}`)}.pane-`;
  let names = [];
  try { names = fs.readdirSync(stateDir(home)).filter((n) => n.startsWith(head) && n.endsWith(".json")); } catch { /* none yet */ }
  const panes = {};
  const live = new Map(livePanes.filter((p) => p.workspace_id === workspace).map((p) => [p.pane_id, p]));
  for (const n of names.sort()) {
    const lead = n.slice(head.length, -".json".length);
    for (const [id, rec] of Object.entries(loadState(path.join(stateDir(home), n)).panes)) {
      if (matchesPane(rec, live.get(id)) && (rec.terminal || !panes[id]?.terminal)) {
        panes[id] = { ...rec, lead };
      }
    }
  }
  return { panes };
}

// orc_state.load_herdorc_state: panes {id: {name, terminal}}; the first format had {id: name}.
export function parseState(raw) {
  const panes = {};
  for (const [id, v] of Object.entries(raw?.panes ?? {})) panes[id] = v && typeof v === "object" ? v : { name: v, terminal: null };
  return { panes };
}
export function loadState(file) {
  try { return parseState(JSON.parse(fs.readFileSync(file, "utf8"))); } catch { return { panes: {} }; }
}

// orc_state.herdr_owned, panes only: a recorded pane is the lead's while its id exists, its
// label is the name orc.py gave it and its terminal is the one recorded (herdr reuses ids).
const matchesPane = (rec, pane) =>
  pane && (pane.label ?? "") === rec.name && (!rec.terminal || pane.terminal_id === rec.terminal);

export function ownedPanes(state, panes) {
  const live = new Map(panes.map((p) => [p.pane_id, p]));
  const out = new Set();
  for (const [id, rec] of Object.entries(state?.panes ?? {})) {
    if (matchesPane(rec, live.get(id))) out.add(id);
  }
  return out;
}

// `herdr api snapshot`: workspaces, tabs, panes and agents in one call. `HERDR_BIN_PATH` is
// what herdr gives plugin processes; the pane's HERDR_SOCKET_PATH picks the session.
export function snapshot(bin = process.env.HERDR_BIN_PATH || "herdr") {
  return new Promise((resolve, reject) => {
    execFile(bin, ["api", "snapshot"], { timeout: 10000, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).trim().split("\n").pop()));
      try {
        const r = JSON.parse(stdout);
        if (r.error) return reject(new Error(r.error.message ?? JSON.stringify(r.error)));
        resolve(r.result?.snapshot ?? r.result ?? r);
      } catch (e) { reject(e); }
    });
  });
}

const statusWord = (s) => (s === "error" ? "blocked" : s ?? "unknown");

// One row per pane of the workspace, in the shape model.js's graph(), pair() and kids()
// read, plus `role` (the role a pane is labelled for) and `isAgent`.
export function rows(snap, workspace, self = null) {
  const agents = new Map((snap.agents ?? []).map((a) => [a.pane_id, a]));
  return (snap.panes ?? []).filter((p) => p.workspace_id === workspace && p.pane_id !== self).map((p) => {
    const a = agents.get(p.pane_id) ?? {};
    const agent = p.agent ?? a.agent ?? null;
    const label = p.label ?? null;
    const named = a.name ?? null;
    const session = p.agent_session ?? a.agent_session ?? null;
    return {
      address: p.pane_id, terminal: p.terminal_id, tab: p.tab_id, parent: null,
      cwd: p.foreground_cwd ?? p.cwd ?? a.cwd ?? null, app: appOf(agent), agent,
      program: agent ? { key: agent, name: agent } : null, status: agent ? statusWord(p.agent_status ?? a.agent_status) : "shell",
      label: label ?? named, agentName: named, name: named ?? label ?? agent ?? p.pane_id,
      title: clean(a.title ?? p.title ?? null) || null, seq: a.state_change_seq ?? 0, space: workspace,
      session, names: [p.pane_id, label, named, p.terminal_id].filter(Boolean),
      role: roleOf(label) ?? roleOf(named), isAgent: !!agent, focused: !!p.focused,
    };
  });
}

// What scan.cjs needs per agent pane: herdr's exact session when it reported one.
export function targets(list) {
  return list.filter((r) => r.isAgent).map((r) => ({
    pane: r.address, agent: r.agent, cwd: r.cwd,
    ...(r.session ? { kind: r.session.kind, value: r.session.value } : {}),
  }));
}

// Which pane runs herdorc. herdr has no `--parent`, so in order: the pane the plugin was
// opened from when a state file names it as a lead; the pane labelled `herdorc…` (orc.py's phase label) or with an agent
// named so; the pane found last time, while it holds the same terminal; the agent whose
// session sent to the lead's role panes; the pane the plugin was opened from; the only
// agent that is not a role pane. Null when none applies.
export function findLead(list, { owned = new Set(), remembered = null, sessions = null, origin = null, leads = new Set() } = {}) {
  const agents = list.filter((r) => r.isAgent && !owned.has(r.address) && !r.role);
  const own = leads.has(origin) && list.find((r) => r.address === origin);
  if (own) return { lead: own, how: "state file" };
  const labelled = (r) => LEAD_RE.test(r.label ?? "") || LEAD_RE.test(r.agentName ?? "");
  const byLabel = list.find((r) => leads.has(r.address) && labelled(r)) ?? list.find(labelled);
  if (byLabel) return { lead: byLabel, how: "label" };
  const kept = remembered && list.find((r) => r.address === remembered.pane && r.terminal === remembered.terminal);
  if (kept) return { lead: kept, how: "remembered" };
  if (sessions && owned.size) {
    const names = new Set(list.filter((r) => owned.has(r.address)).flatMap((r) => r.names));
    let best = null;
    for (const r of agents) {
      const n = (sessions.get(r.address)?.sends ?? []).filter((m) => names.has(m.to)).length;
      if (n && (!best || n > best.n)) best = { r, n };
    }
    if (best) return { lead: best.r, how: "messages" };
  }
  const from = agents.find((r) => r.address === origin);
  if (from) return { lead: from, how: "opened from" };
  if (agents.length === 1) return { lead: agents[0], how: "only agent" };
  return { lead: null, how: null };
}

// The world the view draws: the lead, its role panes as its children, other role panes
// and agents beside them, and plain shells only counted.
export function world(snap, state, opts = {}) {
  const workspace = opts.workspace ?? snap.focused_workspace_id ?? null;
  const ws = (snap.workspaces ?? []).find((w) => w.workspace_id === workspace) ?? null;
  const all = rows(snap, workspace, opts.self);
  const owned = ownedPanes(state, (snap.panes ?? []).filter((p) => p.workspace_id === workspace));
  // With one file per lead, a pane is the child of the lead that recorded it; the others'
  // panes show beside. A pane without a lead (ORC_FLOW_STATE_FILE) goes to the lead found.
  const recs = state?.panes ?? {};
  const named = new Set(Object.values(recs).map((r) => r.lead).filter(Boolean));
  const leads = new Set(all.filter((r) => named.has(safe(r.address))).map((r) => r.address));
  const { lead, how } = findLead(all, { ...opts, owned, leads });
  const mine = (id) => !recs[id]?.lead || recs[id].lead === safe(lead.address);
  if (lead) for (const r of all) if (owned.has(r.address) && r !== lead && mine(r.address)) r.parent = lead.address;
  // Agents and role panes take part; other shells only run things.
  const list = all.filter((r) => r.isAgent || r.role || owned.has(r.address));
  const plain = all.filter((r) => !list.includes(r));
  return { workspace, label: ws?.label ?? workspace, list, plain, lead, how, owned };
}

// The lead found by label or messages is kept, so it stays the lead once herdorc clears its
// phase label. Keyed by session and workspace, in the temp folder; losing it costs nothing.
const leadFile = (session, workspace) => path.join(process.env.ORC_FLOW_STATE || path.join(os.tmpdir(), `herdr-orc-flow-${os.userInfo().uid}`), `lead-${safe(`${session}-${workspace}`)}.json`);
export function recallLead(session, workspace) {
  try { return JSON.parse(fs.readFileSync(leadFile(session, workspace), "utf8")); } catch { return null; }
}
export function rememberLead(session, workspace, lead) {
  try {
    const file = leadFile(session, workspace);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ pane: lead.address, terminal: lead.terminal }));
  } catch { /* not remembered */ }
}

#!/usr/bin/env node
// orc-flow: herdorc and its role panes as a live graph, in a herdr pane.
//
//   node bin/orc-flow.mjs                 the live view (what the plugin pane runs)
//   node bin/orc-flow.mjs --once [--cols N --rows N] [--no-color]
//                                         print one frame and exit (checks, debugging)
//   node bin/orc-flow.mjs --json          print the model as JSON and exit
//
// Every few seconds: `herdr api snapshot` for panes and agents, herdorc's state file for
// which panes the lead opened, scan.cjs for each agent's model, tools and messages.
// Read-only: it never sends anything to a pane; Enter only focuses one.
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { graph, links, kids, pair } from "../lib/model.js";
import { snapshot, world, targets, loadState, loadStates, herdrSession, recallLead, rememberLead } from "../lib/herdr.mjs";
import { render, build, T, TONES } from "../lib/view.mjs";

const require = createRequire(import.meta.url);
const { scan } = require("../lib/scan.cjs");

const SCAN_MS = Number(process.env.ORC_FLOW_INTERVAL_MS) || 2500;
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const env = process.env;
const bin = env.HERDR_BIN_PATH || "herdr";
const self = env.HERDR_PANE_ID ?? null;
const session = herdrSession(env);

// One scan: herdr, the state file, the transcripts. Never throws: an error shows in the frame.
async function load() {
  let snap;
  try { snap = await snapshot(bin); } catch (e) {
    return { error: `herdr: ${e.message}`, label: null, lead: null, kids: [], others: [], events: [], links: [], names: new Map(), plain: 0 };
  }
  const workspace = env.ORC_FLOW_WORKSPACE || env.HERDR_WORKSPACE_ID || snap.focused_workspace_id;
  const state = env.ORC_FLOW_STATE_FILE ? loadState(env.ORC_FLOW_STATE_FILE) : loadStates(session, workspace, snap.panes ?? []);
  const remembered = recallLead(session, workspace);
  const base = { workspace, self, origin: env.ORC_FLOW_ORIGIN ?? null, remembered };
  let w = world(snap, state, base);
  let found = new Map();
  let guessed = new Set();
  let warnings = [];
  let error = null;
  try {
    const r = scan(targets(w.list));
    warnings = r.warnings;
    ({ found, guessed } = pair(w.list.filter((a) => a.isAgent), r.sessions));
  } catch (e) { error = `scan: ${e.message}`; }
  if (!w.lead || w.how === "opened from" || w.how === "only agent") {
    const again = world(snap, state, { ...base, sessions: found });
    if (again.lead) w = again;
  }
  if (w.lead && (w.how === "label" || w.how === "messages" || w.how === "state file")) rememberLead(session, workspace, w.lead);
  const wall = Date.now();
  const g = graph(w.list, found, TONES, wall, guessed);
  const l = links(g, wall);
  const k = w.lead ? kids(w.lead, w.list, found, TONES, wall, guessed) : [];
  return build({ w, sessions: found, guessed, graph: g, links: l, kids: k, error, warnings });
}

if (flag("--once") || flag("--json")) {
  const m = await load();
  if (flag("--json")) {
    process.stdout.write(JSON.stringify({ ...m, names: Object.fromEntries(m.names) }, null, 1) + "\n");
  } else {
    const cols = Number(opt("--cols")) || process.stdout.columns || 100;
    const rows = Number(opt("--rows")) || process.stdout.rows || 40;
    const { lines } = render(m, { cols, rows, sel: m.lead?.address ?? null, frame: 0, wall: Date.now(), detail: true, color: !flag("--no-color") });
    process.stdout.write(lines.join("\n") + "\n");
  }
  process.exit(0);
}

// The live view.
const out = process.stdout;
let model = null;
let sel = null;
let picks = [];
let frame = 0;
let detail = true;
let busy = false;

function draw() {
  if (!model) return;
  const r = render(model, { cols: out.columns || 80, rows: out.rows || 24, sel, frame, wall: Date.now(), detail, color: true });
  picks = r.picks;
  out.write(`\x1b[H${r.lines.map((l) => `${l}\x1b[K`).join("\r\n")}\x1b[J`);
}

const choices = () => [...new Set(picks.filter(Boolean))];

async function refresh() {
  if (busy) return;
  busy = true;
  try {
    model = await load();
    draw();
    if (!sel || !choices().includes(sel)) { sel = model.lead?.address ?? choices()[0] ?? null; draw(); }
  } finally { busy = false; }
}

function quit() {
  out.write("\x1b[?25h\x1b[?1049l");
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.exit(0);
}

function move(d) {
  const list = choices();
  if (!list.length) return;
  const i = Math.max(0, list.indexOf(sel));
  sel = list[(i + d + list.length) % list.length];
  draw();
}

// Focus the chosen pane. In an overlay, also leave: herdr then restores the layout.
function focus() {
  if (!sel || sel === self) return;
  // A shell pane has no agent to focus: zooming it in and out focuses it. Leave only
  // after `--off` has run, or the pane would stay zoomed.
  const run = (args, next) => execFile(bin, args, { timeout: 5000 }, next);
  const leave = () => { if (env.ORC_FLOW_PLACEMENT === "overlay") quit(); };
  run(["agent", "focus", sel], (err) => {
    if (!err) return leave();
    run(["pane", "zoom", sel, "--on"], () => run(["pane", "zoom", sel, "--off"], leave));
  });
}

out.write("\x1b[?1049h\x1b[?25l\x1b[H\x1b[2J");
out.write(`${T.dim} orc-flow: reading herdr…${T.reset}`);
process.on("SIGINT", quit);
// A crash still gives the terminal back (cursor, main screen, cooked mode) before it prints.
process.on("uncaughtException", (e) => {
  out.write("\x1b[?25h\x1b[?1049l");
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stderr.write(`orc-flow: ${e?.stack ?? e}\n`);
  process.exit(1);
});
process.on("SIGTERM", quit);
process.on("SIGHUP", quit);
out.on("resize", draw);
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.setEncoding("utf8");
process.stdin.on("data", (k) => {
  if (k === "q" || k === "\x1b" || k === "\x03") return quit();
  if (k === "j" || k === "\x1b[B") return move(1);
  if (k === "k" || k === "\x1b[A") return move(-1);
  if (k === "\r" || k === "\n" || k === "f") return focus();
  if (k === "d") { detail = !detail; return draw(); }
  if (k === "r") return refresh();
});
setInterval(refresh, SCAN_MS);
const spinning = (m) => [m?.lead, ...(m?.kids ?? []), ...(m?.others ?? [])].some((k) => k?.status === "working");
setInterval(() => { frame++; if (spinning(model)) draw(); }, 500);
refresh();

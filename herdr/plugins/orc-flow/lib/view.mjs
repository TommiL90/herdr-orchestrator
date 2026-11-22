// The terminal view: from the model to lines of text. Takes the place of agent-flow's
// gpui-kit view (main.js) in a herdr pane. Pure: the frame depends only on its arguments,
// so tests render it without a terminal.
//
// Colors are the terminal's own 16 ANSI colors, so the graph follows the user's theme.
import { RANK, modelName, middle, tone } from "./model.js";

const ESC = "\x1b[";
export const T = {
  reset: `${ESC}0m`, bold: `${ESC}1m`, dim: `${ESC}2m`, inverse: `${ESC}7m`,
  ansi1: `${ESC}31m`, ansi2: `${ESC}32m`, ansi3: `${ESC}33m`, ansi4: `${ESC}34m`,
  ansi5: `${ESC}35m`, ansi6: `${ESC}36m`, ansi7: `${ESC}37m`, accent: `${ESC}36m`,
};
const PLAIN = Object.fromEntries(Object.keys(T).map((k) => [k, ""]));
// What model.js's tone() is given: color names, resolved when a frame is painted, so the
// same model paints with or without color.
export const TONES = Object.fromEntries(["ansi2", "ansi3", "ansi4", "ansi5", "ansi6", "ansi7", "accent"].map((k) => [k, k]));

const LIVE_MS = 90000; // a message this recent draws its edge bright
const SPIN = ["◐", "◓", "◑", "◒"];

const STATE = {
  working: { word: "working", mark: "●", color: "ansi3" },
  blocked: { word: "needs you", mark: "▲", color: "ansi1" },
  done: { word: "done", mark: "✓", color: "ansi2" },
  idle: { word: "idle", mark: "○", color: "dim" },
  stale: { word: "no activity", mark: "◌", color: "dim" },
  unknown: { word: "unknown", mark: "?", color: "dim" },
  shell: { word: "no agent", mark: "·", color: "dim" },
};
const stateOf = (s) => STATE[s] ?? { word: s ?? "", mark: "·", color: "dim" };

const tokens = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n ?? 0}`);
const clock = (ms) => new Date(ms).toTimeString().slice(0, 8);
const toolLine = (x) => (x ? `${x.name}${x.hint ? ` ${x.hint}` : ""}` : "");
export function elapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

// Columns a string takes: wide CJK and emoji count two, combining marks none.
function cw(cp) {
  if (cp === 0x200b || (cp >= 0x300 && cp <= 0x36f) || (cp >= 0xfe00 && cp <= 0xfe0f)) return 0;
  if ((cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff)) return 2;
  return 1;
}
export const width = (s) => [...String(s)].reduce((n, c) => n + cw(c.codePointAt(0)), 0);
function cut(s, n) {
  let out = "";
  let used = 0;
  for (const c of String(s)) {
    const w = cw(c.codePointAt(0));
    if (used + w > n) break;
    out += c;
    used += w;
  }
  return out;
}

// A line is a list of [text, style] segments; paint() fits it to the width.
function paint(segs, cols, t) {
  let out = "";
  let left = cols;
  for (const [text, style] of segs) {
    if (left <= 0) break;
    let s = String(text ?? "").replace(/[\x00-\x1f\x7f]/g, " ");
    if (width(s) > left) s = left > 1 ? `${cut(s, left - 1)}…` : cut(s, left);
    left -= width(s);
    out += style ? `${style}${s}${t.reset}` : s;
  }
  return out + " ".repeat(Math.max(0, left));
}

// Per kid: messages from the lead (down) and replies to it (up), and the latest of either.
function talk(links, lead, id) {
  const down = links.find((l) => l.from === lead && l.to === id);
  const up = links.find((l) => l.to === lead && l.from === id);
  return { down: down?.n ?? 0, up: up?.n ?? 0, last: Math.max(down?.last ?? 0, up?.last ?? 0) };
}

function nodeSegs(k, t, { name, wall, frame, nameW }) {
  const st = stateOf(k.status);
  const mark = k.status === "working" ? SPIN[frame % SPIN.length] : st.mark;
  const model = modelName(k.model);
  return [
    [`${mark} `, t[st.color]],
    [middle(name, nameW).padEnd(nameW), k.status === "shell" ? t.dim : t.bold],
    ["  "],
    [(k.agent ?? "—").padEnd(9), t.dim],
    [middle(model ?? (k.status === "shell" ? "" : "model ?"), 16).padEnd(17), model ? t[k.color] ?? "" : t.dim],
    [k.guessed ? "~ " : "  ", t.ansi3],
    [st.word.padEnd(10), t[st.color]],
    [k.now ? toolLine(k.now) : k.lastAt && k.status !== "shell" ? `last ${elapsed(wall - k.lastAt)} ago` : "", k.now ? "" : t.dim],
  ];
}

// The frame. `m` is what app.mjs builds each scan: { label, lead, how, kids, others,
// strays, events, links, warnings, error, plain }. `ui` is { cols, rows, sel, frame, wall,
// detail, color }. Returns the lines and the selectable pane ids in drawing order.
export function render(m, ui) {
  const t = ui.color === false ? PLAIN : T;
  const cols = Math.max(20, ui.cols);
  const rows = Math.max(6, ui.rows);
  const wall = ui.wall;
  const lines = [];
  const picks = []; // pane ids, by line index
  const put = (segs, pick = null) => { lines.push(paint(segs, cols, t)); picks.push(pick); };
  const sel = ui.sel;
  const mark = (id) => (id && id === sel ? t.inverse : "");

  put([[" orc-flow ", `${t.bold}${t.accent}`], [`${m.label ?? "?"}`, t.bold], m.lead ? [`  ·  lead ${m.lead.name} (${m.lead.address}, ${m.how})`, t.dim] : [""], [`  ${clock(wall)}`, t.dim]]);
  if (m.error) put([[` ${m.error}`, t.ansi1]]);
  for (const w of m.warnings ?? []) put([[` ! ${w}`, t.ansi3]]);
  put([[""]]);

  const nameW = Math.min(24, Math.max(10, ...[m.lead, ...(m.kids ?? []), ...(m.others ?? [])].filter(Boolean).map((k) => width(k.title ?? k.name ?? ""))));
  if (!m.lead) {
    put([[" No herdorc lead found in this workspace.", t.bold]]);
    put([[" Start it in a pane with `claude --agent herdorc` (or your CLI's launch), or open this", t.dim]]);
    put([[" plugin from the lead's pane. Role panes and agents still show below.", t.dim]]);
  } else {
    const L = m.lead;
    const ctx = L.ctx ? `ctx ${tokens(L.ctx)}` : "";
    const tools = L.tools != null ? `${L.more ? "≥" : ""}${L.tools} tool${L.tools === 1 ? "" : "s"}` : "";
    put([[" ", mark(L.address)], ...nodeSegs({ ...L, agent: L.agent }, t, { name: L.name, wall, frame: ui.frame, nameW }).map(([s, st]) => [s, `${st ?? ""}${mark(L.address)}`]),
      [ctx || tools ? `  ${[ctx, tools].filter(Boolean).join(" · ")}` : "", t.dim]], L.address);
  }

  const kids = m.kids ?? [];
  kids.forEach((k, i) => {
    const last = i === kids.length - 1;
    const tk = m.lead ? talk(m.links ?? [], m.lead.address, k.id) : { down: 0, up: 0, last: 0 };
    const hot = tk.last && wall - tk.last < LIVE_MS;
    const branch = last ? " └" : " ├";
    const edge = tk.down || tk.up ? "─▶ " : "── ";
    const counts = [tk.down ? `↓${tk.down}` : "", tk.up ? `↑${tk.up}` : ""].filter(Boolean).join(" ");
    put([[branch, t.dim], [edge, hot ? `${t.bold}${t.ansi2}` : t.dim],
      ...nodeSegs(k, t, { name: k.title ?? k.name, wall, frame: ui.frame, nameW }).map(([s, st]) => [s, `${st ?? ""}${mark(k.address)}`]),
      [counts ? `  ${counts}` : "", hot ? t.ansi2 : t.dim]], k.address ?? null);
    const nested = k.nested ?? [];
    nested.forEach((g, j) => {
      const st = stateOf(g.status);
      put([[last ? "    " : " │  ", t.dim], [j === nested.length - 1 ? "└ " : "├ ", t.dim], [`${st.mark} `, t[st.color]],
        [g.name ?? "", ""], [`  ${modelName(g.model) ?? ""}`, t[g.color] ?? ""], [`  ${st.word}`, t[st.color]]], g.address ?? null);
    });
  });
  if (m.lead && !kids.length) put([["   no role panes or subagents yet", t.dim]]);

  const others = m.others ?? [];
  if (others.length) {
    put([[""]]);
    put([[" Other agents and role panes here", t.bold]]);
    for (const k of others) {
      put([["   "], ...nodeSegs(k, t, { name: k.title ?? k.name, wall, frame: ui.frame, nameW }).map(([s, st]) => [s, `${st ?? ""}${mark(k.address)}`]),
        [k.role && !k.mine ? "  (role pane not opened by herdorc)" : "", t.dim]], k.address);
    }
  }
  if (m.plain) put([[` + ${m.plain} plain shell pane${m.plain === 1 ? "" : "s"}`, t.dim]]);

  // The selected node's recent tools, then the message log in what space is left.
  const footer = " j/k select · enter focus pane · d details · r refresh · q quit";
  const chosen = [m.lead, ...kids, ...others].find((k) => k && (k.address ?? k.id) === sel);
  const body = [];
  if (ui.detail && chosen) {
    body.push([[""]]);
    body.push([[` ${chosen.title ?? chosen.name}`, t.bold], [`  ${chosen.address ?? ""}  ${chosen.sub ?? chosen.cwd ?? ""}`, t.dim]]);
    const recent = (chosen.recent ?? []).slice(-8).reverse();
    if (!recent.length) body.push([["   no tool calls seen", t.dim]]);
    for (const x of recent) body.push([[`   ${x.t ? clock(x.t) : "        "}  `, t.dim], [toolLine(x), x.name === "Send" ? t.ansi2 : ""]]);
  }
  const events = (m.events ?? []).slice().reverse();
  const room = rows - lines.length - body.length - 3;
  if (room > 1) {
    body.push([[""]]);
    body.push([[" Messages", t.bold], ["  (prompts and handoffs ↓, answers read back ↑, delegations)", t.dim]]);
    if (!events.length) body.push([["   none yet", t.dim]]);
    const name = (key) => m.names?.get(key) ?? key;
    for (const e of events.slice(0, Math.max(1, room - 2))) {
      const arrow = e.kind === "reply" ? " ⇠ " : " → ";
      const word = e.kind === "reply" ? "answer read" : e.kind === "message" ? "message" : e.kind;
      const [a, b] = e.kind === "reply" ? [e.to, e.from] : [e.from, e.to];
      body.push([[`   ${clock(e.t)}  `, t.dim], [name(a), t.bold], [arrow, e.kind === "reply" ? t.ansi6 : t.ansi2], [name(b), t.bold], [`  ${word}${e.label ? ` ${e.label}` : ""}`, t.dim]]);
    }
  }
  for (const b of body) put(b);
  while (lines.length < rows - 1) put([[""]]);
  // Too tall: keep the top (header, tree) and the footer.
  const out = lines.slice(0, rows - 1);
  const outPicks = picks.slice(0, rows - 1);
  out.push(paint([[footer, t.dim]], cols, t));
  outPicks.push(null);
  return { lines: out, picks: outPicks };
}

// The model the view draws, from the world (herdr.mjs) and the graph (model.js).
export function build({ w, sessions, guessed, graph: g, links, kids, error, warnings }, t = TONES) {
  const lead = w.lead
    ? (() => {
      const s = sessions.get(w.lead.address);
      return { ...w.lead, model: s?.model ?? null, ctx: s?.ctx ?? 0, tools: s?.tools ?? null, more: s?.more, now: s?.now, recent: s?.recent ?? [], lastAt: s?.lastAt, color: tone(s?.model, t, w.lead.app), guessed: guessed.has(w.lead.address) };
    })()
    : null;
  // kids() orders by status; panes still without an agent go after every agent.
  const kidList = (kids ?? []).map((k) => ({ ...k, agent: k.address ? w.list.find((r) => r.address === k.address)?.agent ?? null : "subagent", status: k.status ?? "idle" }))
    .sort((a, b) => (a.status === "shell") - (b.status === "shell"));
  const inTree = new Set([lead?.address, ...kidList.map((k) => k.address)].filter(Boolean));
  const others = w.list.filter((r) => !inTree.has(r.address)).map((r) => {
    const s = sessions.get(r.address);
    return { ...r, id: r.address, title: r.label ?? r.name, model: s?.model ?? null, now: s?.now, recent: s?.recent ?? [], lastAt: s?.lastAt, color: tone(s?.model, t, r.app), guessed: guessed.has(r.address), mine: w.owned.has(r.address) };
  }).sort((a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9));
  const names = new Map((g?.nodes ?? []).map((n) => [n.key, n.name ?? n.role]));
  return { label: w.label, lead, how: w.how, kids: kidList, others, events: g?.events ?? [], links: links ?? [], names, plain: w.plain.length, error, warnings };
}

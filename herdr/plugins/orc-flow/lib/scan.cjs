// Ported from agent-flow's scan.cjs (https://github.com/MarcozVD/herdr-agent-flow, MIT,
// Copyright 2026 MarcozVD); see ../LICENSE. What changed for herdr is listed in ../README.md.
//
// Reads what each coding agent in a herdr workspace is doing: Claude Code sessions from
// their transcripts, Codex threads from the state DB and their rollout files, opencode's
// from its SQLite file (opened read-only), Oh My Pi / pi from their session files.
// herdr names each pane's session exactly (`agent_session` on `pane list` and
// `agent list`), so a pane pairs with its session by id: no process tree, no folder guess.
// Only panes without that field fall back to a guess by agent and folder.
//
// Read-only. Prompts and tool output are never returned: only tool names, a short hint
// (file name, Bash description, pattern), subagent descriptions, and who a message went to.
// Transcripts only grow, so each scan reads only what was appended since the last one: the
// folded state and the byte offset of every transcript are kept in a cache file between runs.
//
// Use: `require("./scan.cjs").scan(targets)`, or `node scan.cjs '<targets json>'` to print
// the same result. A target is `{ pane, agent, kind, value, cwd }`: herdr's pane id, its
// agent (`claude`, `codex`, `opencode`, `omp`, `pi`, ...), and `agent_session`'s kind
// (`id` or `path`) and value when herdr reported one.
const fs = require("fs");
const os = require("os");
const path = require("path");

const MAIN_TAIL = 6 * 1024 * 1024; // screenshots put ~1 MB in one row
const SUB_TAIL = 2 * 1024 * 1024; // whole, for almost all: counts stay exact
const MAX_SUBS = 12;
const MAX_OPEN = 64; // tool calls still waiting for a result; interrupted ones never get one
const QUIET_MS = 3 * 60 * 1000; // an unfinished subagent silent this long is reported stale
const CACHE_VERSION = 1;

let cache, used, warnings, now; // set by scan(): one scan's state

const claudeRoot = () => process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
const cacheFile = () => process.env.ORC_FLOW_CACHE || path.join(os.tmpdir(), "herdr-orc-flow", "scan-cache.json");

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
}

function json(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

// What earlier scans folded, per transcript, and where each session's transcript lives.
// A cache from another version, or one that won't parse, is dropped: it only costs a full read.
function loadCache() {
  const c = json(cacheFile());
  return c?.version === CACHE_VERSION && c.files && c.paths ? c : { version: CACHE_VERSION, files: {}, paths: {} };
}

// Written whole to a temporary file and renamed, so a scan running beside another one never
// reads half a cache. Losing the race only means the next scan reads a little more.
function saveCache() {
  for (const f of Object.keys(cache.files)) if (!used.has(f)) delete cache.files[f];
  for (const [id, f] of Object.entries(cache.paths)) if (!used.has(f)) delete cache.paths[id];
  const file = cacheFile();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cache));
    fs.renameSync(tmp, file);
  } catch { /* a read-only temp folder: every scan reads the tails again */ }
}

// The whole lines in a file's last `max` bytes, parsed; for formats read whole each scan.
function lastRows(file, max) {
  const size = fs.statSync(file).size;
  const start = Math.max(0, size - max);
  const lines = readRange(file, start, size).toString("utf8").split("\n");
  if (start > 0) lines.shift(); // starts mid-line
  const rows = [];
  for (const l of lines) {
    if (!l) continue;
    try { rows.push(JSON.parse(l)); } catch { /* a line still being written */ }
  }
  return rows;
}

function readRange(file, start, end) {
  const fd = fs.openSync(file, "r");
  const buf = Buffer.alloc(end - start);
  try { fs.readSync(fd, buf, 0, buf.length, start); } finally { fs.closeSync(fd); }
  return buf;
}

// Folds what was appended to a transcript since the last scan into its saved state. Only
// whole lines are read: the offset stops after the last newline, so a line still being
// written is read next time. A file that shrank or was replaced, or that grew by more than
// `max` since, starts over from its tail like a first read. `fold` is the format's digest.
function follow(file, max, fold = digest) {
  const stat = fs.statSync(file);
  const born = Math.round(stat.birthtimeMs);
  used.add(file);
  let c = cache.files[file];
  if (!c || c.born !== born || stat.size < c.offset || stat.size - c.offset > max) {
    const start = Math.max(0, stat.size - max);
    c = cache.files[file] = { born, offset: start, skip: start > 0, partial: start > 0, state: blank() };
  }
  if (stat.size > c.offset) {
    const buf = readRange(file, c.offset, stat.size);
    let from = 0;
    if (c.skip) { // a tail starts mid-line: drop up to the first newline
      const nl = buf.indexOf(0x0a);
      if (nl >= 0) { from = nl + 1; c.skip = false; }
    }
    const end = c.skip ? 0 : buf.lastIndexOf(0x0a) + 1;
    if (end > from) {
      const rows = [];
      for (const l of buf.toString("utf8", from, end).split("\n")) {
        if (!l) continue;
        try { rows.push(JSON.parse(l)); } catch { c.state.seen.bad++; }
      }
      fold(c.state, rows);
    }
    c.offset += end;
  }
  if (fold === digest) drift(c.state.seen);
  return { d: view(c.state), stat, partial: c.partial };
}

function hint(name, input = {}) {
  const short = (s, n = 46) => { s = String(s ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
  if (input.file_path) return short(path.basename(String(input.file_path)));
  if (name === "Agent" || name === "Task") return short(input.description);
  if (input.description) return short(input.description);
  if (input.pattern) return short(input.pattern);
  if (input.url) { try { return new URL(input.url).host; } catch { return ""; } }
  if (input.command) return short(input.command);
  return "";
}

// A command word, after a separator or a path, optionally quoted: `herdr`, `/usr/bin/herdr`.
const WORD = (w) => `(?:^|[\\s;&|/\\\\"'(\`])${w}(?:\\.exe)?["']?`;
// herdr's global options that may come before the subcommand.
const HERDR_GLOBAL = `(?:\\s+--(?:session|machine|remote)[\\s=]["']?[\\w.@:-]+["']?)*`;
// Options before a target, with or without a value we can't tell apart: skipped as words.
const FLAGS = `(?:--?[a-z][\\w-]*(?:=\\S+)?\\s+)*`;
const NAME = `["']?([\\w:./-]+)`;

// herdorc's messages: `herdr agent prompt <target> <text>` (the layer's dispatch) and
// `herdr pane send-text <pane> <text>`. hcorc's: `hc send <target>`.
const HERDR_SEND = new RegExp(`${WORD("herdr")}${HERDR_GLOBAL}\\s+(?:agent\\s+prompt|pane\\s+send-text)\\s+${FLAGS}${NAME}`, "gi");
const HC_SEND = new RegExp(`${WORD("hc")}\\s+send\\s+${FLAGS}${NAME}`, "gi");
// The lead reading a role's answer back: `herdr agent read <target>` / `herdr pane read <pane>`.
const HERDR_READ = new RegExp(`${WORD("herdr")}${HERDR_GLOBAL}\\s+(?:agent|pane)\\s+read\\s+${FLAGS}${NAME}`, "gi");

// orc.py (herdr-orchestrators) opens a role pane and hands it its task in one call:
// `orc.py [--as <agent>] ensure <role> [--name <pane>] ... --handoff <file>`. The pane is
// named after `--name`, else the role. Without `--handoff` it only opens the pane.
const ORC_ENSURE = /(?:^|[\s;&|/\\"'])orc(?:\.py)?["']?\s+(?:--as[\s=]\S+\s+)?ensure\s+["']?([\w.-]+)([^;&|\n]*)/gi;

// Everyone a tool call is talking to: `herdr agent prompt` / `herdr pane send-text`,
// `hc send` from a shell, an orc.py handoff, or Claude Code's SendMessage. A shell command
// may send several (a loop, `&&`), so this is a list. Only targets leave, never the message.
function targets(name, input = {}) {
  if (name === "SendMessage" && input.to) return [String(input.to)];
  const cmd = typeof input.command === "string" ? input.command : null;
  if (!cmd) return [];
  const out = [];
  for (const re of [HERDR_SEND, HC_SEND]) for (const hit of cmd.matchAll(re)) out.push(hit[1]);
  for (const orc of cmd.matchAll(ORC_ENSURE)) {
    if (!/\s--handoff[\s=]/.test(orc[2])) continue;
    out.push(/\s--name[\s=]["']?([\w.-]+)/.exec(orc[2])?.[1] ?? orc[1]);
  }
  return out;
}
const target = (name, input) => targets(name, input)[0] ?? null;

// Whose answer a tool call reads: `herdr agent read <x>`, or a role's report file, which
// herdorc's handoff names `<reports>/<pane-name>-<task>.md` (not the handoff itself).
function reads(name, input = {}) {
  const out = [];
  if (typeof input.command === "string") for (const hit of input.command.matchAll(HERDR_READ)) out.push({ from: hit[1] });
  const file = String(input.file_path ?? input.filePath ?? input.path ?? "").replace(/\\/g, "/");
  if (/^read$/i.test(name) && /\/reports\/[^/]+\.md$/.test(file) && !/\/handoffs\//.test(file)) out.push({ file: path.basename(file, ".md") });
  return out;
}

// Messages arrive tagged <hc from="t7 review"> (hcorc). Only the address leaves here.
function heard(out, text, at) {
  for (const hit of String(text).matchAll(/<hc from=\\?"([^"\\\s]+)/g)) out.recvs.push({ t: at, from: hit[1] });
}

function note(out, item, name, input, at) {
  for (const r of reads(name, input)) (out.reads ??= []).push({ t: at, ...r });
  const to = targets(name, input);
  if (!to.length) return;
  item.name = "Send";
  item.hint = to.join(", ");
  item.to = to[0];
  for (const t of to) out.sends.push({ t: at, to: t });
}

// A transcript folded so far. `open` holds tool calls waiting for their result and `agents`
// the delegations among them, both by tool-use id; keys keep the order they were added in.
function blank() {
  return {
    model: null, ctx: 0, tools: 0, turnAt: 0, lastAt: 0, recent: [], sends: [], recvs: [], reads: [], open: {}, agents: {},
    seen: { rows: 0, bad: 0, typed: 0, stamped: 0, assistant: 0, model: 0 },
  };
}

// What a transcript's rows should carry, checked once enough of them were read: when an
// update renames a field, this says which one, rather than leaving `model unknown` to guess at.
function drift(n) {
  if (n.bad > 20 && n.bad > n.rows) warnings.add("Claude Code transcript lines no longer parse as JSON");
  if (n.rows < 10) return;
  if (!n.typed) warnings.add("Claude Code transcript rows have no `type` of \"assistant\" or \"user\"");
  if (!n.stamped) warnings.add("Claude Code transcript rows have no `timestamp`");
  if (n.assistant >= 5 && !n.model) warnings.add("Claude Code assistant rows have no `message.model`");
}

// What a session looks like from its state: the call still running, if any.
function view(s) {
  const pending = Object.values(s.open).pop();
  return {
    model: s.model, ctx: s.ctx, tools: s.tools, turnAt: s.turnAt, lastAt: s.lastAt,
    now: pending ? { name: pending.name, hint: pending.hint } : null,
    recent: s.recent, sends: s.sends, recvs: s.recvs, reads: s.reads ?? [],
  };
}

// Kept short, since the state is saved between scans.
function trim(out) {
  const ids = Object.keys(out.open);
  for (const id of ids.slice(0, Math.max(0, ids.length - MAX_OPEN))) { delete out.open[id]; delete out.agents[id]; }
  out.recent = out.recent.slice(-24);
  out.sends = out.sends.slice(-20);
  out.recvs = out.recvs.slice(-20);
  out.reads = (out.reads ?? []).slice(-20);
  return out;
}

// Folds Claude Code transcript rows, oldest first, into `out`. Called again with only the
// rows appended since, it ends where reading everything at once would have.
function digest(out, rows) {
  const open = out.open;
  const agents = out.agents;
  for (const r of rows) {
    const c = r.message?.content;
    const at = Date.parse(r.timestamp ?? "") || 0;
    if (at) out.lastAt = Math.max(out.lastAt, at);
    out.seen.rows++;
    if (at) out.seen.stamped++;
    if (r.type === "assistant" || r.type === "user") out.seen.typed++;
    if (r.type === "assistant") {
      const m = r.message;
      out.seen.assistant++;
      if (m?.model) out.seen.model++;
      if (m?.model && m.model !== "<synthetic>") out.model = m.model;
      const u = m?.usage;
      if (u) out.ctx = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      for (const b of Array.isArray(c) ? c : []) {
        if (b.type !== "tool_use") continue;
        const item = { t: at, name: b.name, hint: hint(b.name, b.input) };
        note(out, item, b.name, b.input, at);
        out.tools++;
        out.recent.push(item);
        open[b.id] = item;
        if (b.name === "Agent" || b.name === "Task") {
          agents[b.id] = b.input?.subagent_type ?? "agent";
          item.delegate = b.input?.subagent_type ?? "agent";
        }
      }
    } else if (r.type === "user") {
      const results = Array.isArray(c) ? c.filter((b) => b.type === "tool_result") : [];
      if (typeof c === "string") heard(out, c, at);
      else for (const b of Array.isArray(c) ? c : []) if (b.type === "text") heard(out, b.text, at);
      for (const b of results) {
        delete open[b.tool_use_id];
        if (b.tool_use_id in agents) {
          out.recent.push({ t: at, name: "back", hint: agents[b.tool_use_id], back: true });
          delete agents[b.tool_use_id];
        }
      }
      if (!results.length && !r.isMeta && !r.isSidechain) { out.tools = 0; out.turnAt = at; }
    }
  }
  return trim(out);
}

// Folds a Codex rollout (`~/.codex/sessions/.../rollout-*.jsonl`) into the same state.
// Shell calls come as `function_call` (arguments JSON with `cmd` or `command`) or as a
// `custom_tool_call` whose input is a script that runs commands: its text is searched whole.
function digestCodex(out, rows) {
  const open = out.open;
  for (const r of rows) {
    const p = r.payload ?? {};
    const at = Date.parse(r.timestamp ?? "") || 0;
    if (at) out.lastAt = Math.max(out.lastAt, at);
    out.seen.rows++;
    if (r.type === "turn_context" && p.model) out.model = p.model;
    if (r.type === "event_msg" && p.type === "task_started") { out.tools = 0; out.turnAt = at; }
    if (r.type === "event_msg" && p.type === "token_count") {
      const u = p.info?.last_token_usage;
      if (u) out.ctx = u.input_tokens ?? 0;
    }
    if (r.type !== "response_item") continue;
    if (p.type === "message" && p.role === "user") {
      for (const b of Array.isArray(p.content) ? p.content : []) if (b.text) heard(out, b.text, at);
    } else if (p.type === "function_call" || p.type === "custom_tool_call") {
      let input = {};
      if (p.type === "function_call") {
        try { input = JSON.parse(p.arguments ?? "{}"); } catch { /* cut */ }
        const cmd = input.cmd ?? input.command;
        input = { ...input, command: Array.isArray(cmd) ? cmd.join(" ") : cmd };
      } else input = { command: typeof p.input === "string" ? p.input : "" };
      const name = String(p.name ?? "tool");
      const item = { t: at, name, hint: hint(name, { ...input, command: input.command?.split("\n")[0] }) };
      note(out, item, name, input, at);
      out.tools++;
      out.recent.push(item);
      if (p.call_id) open[p.call_id] = item;
    } else if (/_output$/.test(p.type ?? "")) delete open[p.call_id];
  }
  return trim(out);
}

// Where a session's transcript is: under its folder's slug, or else wherever an earlier scan
// found it, or else anywhere under projects (a folder renamed since, a slug rule that changed).
function transcript(cwd, id) {
  const projects = path.join(claudeRoot(), "projects");
  if (cwd) {
    const direct = path.join(projects, cwd.replace(/[^a-zA-Z0-9]/g, "-"), `${id}.jsonl`);
    if (fs.existsSync(direct)) return direct;
  }
  const known = cache.paths[id];
  if (known && fs.existsSync(known)) return known;
  let dirs = [];
  try { dirs = fs.readdirSync(projects); } catch { return null; }
  for (const dir of dirs) {
    const file = path.join(projects, dir, `${id}.jsonl`);
    if (fs.existsSync(file)) return (cache.paths[id] = file);
  }
  return null;
}

function subagents(file) {
  const dir = path.join(file.slice(0, -".jsonl".length), "subagents");
  let names;
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith(".jsonl")); } catch { return { subs: [], total: 0 }; }
  const list = names.map((name) => {
    const f = path.join(dir, name);
    const stat = fs.statSync(f);
    return { f, name, born: stat.birthtimeMs, seen: stat.mtimeMs };
  }).sort((a, b) => b.born - a.born);
  const subs = list.slice(0, MAX_SUBS).map(({ f, name, born, seen }) => {
    const meta = json(f.replace(/\.jsonl$/, ".meta.json")) ?? {};
    const { d, partial } = follow(f, SUB_TAIL);
    const status = meta.finished === true ? "done" : now - seen > QUIET_MS ? "stale" : "working";
    return {
      id: name.replace(/^agent-|\.jsonl$/g, ""), type: meta.agentType ?? "agent",
      description: meta.description ?? "", status, model: d.model ?? meta.pickedEffortModel ?? null,
      tools: d.tools, more: partial, ctx: d.ctx, now: d.now, recent: d.recent.slice(-8), sends: d.sends,
      startedAt: Math.round(born), lastAt: Math.round(seen),
    };
  });
  return { subs, total: list.length };
}

function claudeSession(file, extra) {
  const { d, stat, partial } = follow(file, MAIN_TAIL);
  return { ...extra, agent: "claude-code", ...d, more: partial && !d.turnAt, lastAt: Math.round(stat.mtimeMs), ...subagents(file) };
}

// Claude Code: by herdr's session id (or transcript path). Panes without one take a live
// session from ~/.claude/sessions by folder; model.js's pair() then marks the guess.
function claude(list) {
  const out = [];
  const taken = new Set();
  for (const x of list) {
    if (!x.value) continue;
    try {
      const file = x.kind === "path" ? x.value : transcript(x.cwd, x.value);
      if (!file || !fs.existsSync(file)) continue;
      const id = x.kind === "path" ? path.basename(file, ".jsonl") : x.value;
      taken.add(id);
      out.push(claudeSession(file, { id, cwd: x.cwd, terminal: x.pane }));
    } catch { /* a transcript vanished mid-read; the next scan sees the truth */ }
  }
  const loose = list.filter((x) => !x.value);
  if (!loose.length) return out;
  const root = path.join(claudeRoot(), "sessions");
  let names = [];
  try { names = fs.readdirSync(root); } catch { return out; }
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const s = json(path.join(root, name));
    if (!s?.sessionId || !s.cwd || !alive(s.pid) || taken.has(s.sessionId)) continue;
    if (!loose.some((x) => sameDir(x.cwd, s.cwd))) continue;
    try {
      const file = transcript(s.cwd, s.sessionId);
      if (file) out.push(claudeSession(file, { id: s.sessionId, pid: s.pid, cwd: s.cwd, startedAt: s.startedAt }));
    } catch { /* gone */ }
  }
  return out;
}

const sameDir = (a, b) => norm(a) === norm(b);
const norm = (p) => String(p ?? "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

// node:sqlite needs Node 22; without it these agents still show, only without a model.
function database(file) {
  try {
    const { DatabaseSync } = require("node:sqlite");
    return new DatabaseSync(file, { readOnly: true });
  } catch { return null; }
}

// The latest rows for each asked folder: two terminals in one folder take two sessions.
function perFolder(rows, folders, dirOf) {
  const left = [...folders];
  return rows.filter((r) => {
    const i = left.findIndex((f) => sameDir(f, dirOf(r)));
    if (i < 0) return false;
    left.splice(i, 1);
    return true;
  });
}

function digestOpencode(rows) {
  const out = { model: null, ctx: 0, tools: 0, turnAt: 0, lastAt: 0, now: null, recent: [], sends: [], recvs: [], reads: [] };
  for (const r of rows) {
    out.lastAt = Math.max(out.lastAt, r.time_created);
    if (r.type === "user") { out.tools = 0; out.turnAt = r.time_created; out.now = null; heard(out, r.data, r.time_created); }
    if (r.type !== "assistant") continue;
    let d;
    try { d = JSON.parse(r.data); } catch { continue; }
    if (d.model?.id) out.model = d.model.id;
    for (const b of d.content ?? []) {
      if (b.type !== "tool") continue;
      const given = typeof b.state?.input === "object" ? b.state.input ?? {} : {};
      const name = String(b.name)[0].toUpperCase() + String(b.name).slice(1);
      const item = { t: b.time?.created ?? r.time_created, name, hint: hint(name, { ...given, file_path: given.filePath ?? given.file_path ?? (/^(read|edit|write)/i.test(name) ? given.path : undefined) }) };
      note(out, item, name, given, item.t);
      out.tools++;
      out.recent.push(item);
      out.now = /run|stream|pend/.test(b.state?.status ?? "") ? item : null;
    }
  }
  out.now = out.now ? { name: out.now.name, hint: out.now.hint } : null;
  out.recent = out.recent.slice(-24);
  out.sends = out.sends.slice(-20);
  out.recvs = out.recvs.slice(-20);
  out.reads = out.reads.slice(-20);
  return out;
}

// opencode: a root session by herdr's id, else the newest root session in the pane's folder.
function opencode(list) {
  if (!list.length) return [];
  const data = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  const file = path.join(data, "opencode", "opencode.db");
  const db = fs.existsSync(file) ? database(file) : null;
  if (!db) return [];
  try {
    const messages = db.prepare("select type, data, time_created from session_message where session_id = ? order by seq desc limit 200");
    const load = (id) => digestOpencode(messages.all(id).reverse());
    const byId = db.prepare("select id, directory, time_updated from session_v2 where id = ?");
    const roots = db.prepare("select id, directory, time_updated from session_v2 where parent_id is null and time_archived is null order by time_updated desc limit 60").all();
    const children = db.prepare("select id, agent, title, time_created, time_updated, time_idle from session_v2 where parent_id = ? order by time_created desc limit ?");
    const found = [];
    for (const x of list.filter((x) => x.value)) {
      const r = byId.get(x.value);
      if (r) found.push({ r, pane: x.pane });
    }
    const ids = new Set(found.map((f) => f.r.id));
    const loose = list.filter((x) => !x.value);
    for (const r of perFolder(roots.filter((r) => !ids.has(r.id)), loose.map((x) => x.cwd), (r) => r.directory)) found.push({ r, pane: null });
    return found.map(({ r, pane }) => {
      const subs = children.all(r.id, MAX_SUBS).map((k) => {
        const d = load(k.id);
        const status = k.time_idle != null ? "done" : now - k.time_updated > QUIET_MS ? "stale" : "working";
        return { id: k.id, type: k.agent ?? "subagent", description: k.title ?? "", status, model: d.model, tools: d.tools, more: false, ctx: 0, now: d.now, recent: d.recent.slice(-8), sends: d.sends, startedAt: k.time_created, lastAt: k.time_updated };
      });
      return { id: r.id, agent: "opencode", cwd: r.directory, ...(pane ? { terminal: pane } : {}), ...load(r.id), lastAt: r.time_updated, more: false, subs, total: subs.length };
    });
  } catch (e) { warnings.add(`opencode.db: ${e.message}`); return []; } finally { db.close(); }
}

// Codex: a thread by herdr's id, else the newest thread in the pane's folder; its rollout
// file gives the tools and messages. Without a thread yet: the model it will run with.
function codex(list) {
  if (!list.length) return [];
  const home = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const empty = { tools: null, ctx: 0, turnAt: 0, now: null, recent: [], sends: [], recvs: [], reads: [], more: false, subs: [], total: 0 };
  let files = [];
  try { files = fs.readdirSync(home).filter((n) => /^state_\d+\.sqlite$/.test(n)).sort(); } catch { return []; }
  const found = [];
  const db = files.length ? database(path.join(home, files[files.length - 1])) : null;
  if (db) {
    try {
      const cols = "id, cwd, model, rollout_path, updated_at_ms";
      const byId = db.prepare(`select ${cols} from threads where id = ?`);
      for (const x of list.filter((x) => x.value)) {
        const r = byId.get(x.value);
        if (r) found.push({ r, pane: x.pane });
      }
      const ids = new Set(found.map((f) => f.r.id));
      const loose = list.filter((x) => !x.value);
      if (loose.length) {
        const rows = db.prepare(`select ${cols} from threads where archived = 0 order by updated_at_ms desc limit 60`).all().filter((r) => !ids.has(r.id));
        for (const r of perFolder(rows, loose.map((x) => x.cwd), (r) => r.cwd)) found.push({ r, pane: null });
      }
    } catch (e) { warnings.add(`Codex state: ${e.message}`); } finally { db.close(); }
  }
  const out = found.map(({ r, pane }) => {
    let d = {};
    let more = false;
    try {
      if (r.rollout_path && fs.existsSync(r.rollout_path)) ({ d, partial: more } = follow(r.rollout_path, MAIN_TAIL, digestCodex));
    } catch { /* gone */ }
    return { ...empty, ...d, id: r.id, agent: "codex", cwd: r.cwd, ...(pane ? { terminal: pane } : {}), model: d.model ?? r.model, more, lastAt: Math.max(r.updated_at_ms ?? 0, d.lastAt ?? 0) };
  });
  const missing = list.filter((x) => !out.some((s) => s.terminal === x.pane || (!s.terminal && sameDir(s.cwd, x.cwd))));
  if (!missing.length) return out;
  let toml = "";
  try { toml = fs.readFileSync(path.join(home, "config.toml"), "utf8"); } catch { return out; }
  const model = /^model\s*=\s*"([^"]+)"/m.exec(toml)?.[1] ?? null;
  if (model) for (const x of missing) out.push({ ...empty, id: `codex-${x.pane}`, agent: "codex", cwd: x.cwd, terminal: x.pane, model, lastAt: 0 });
  return out;
}

// Where an Oh My Pi session ran, from its own first rows: `{ "type": "session", "cwd" }`.
// Null for a file without one (an older version), which then goes by its folder's name.
function ompCwd(file) {
  const size = fs.statSync(file).size;
  const head = readRange(file, 0, Math.min(size, 64 * 1024)).toString("utf8").split("\n").slice(0, 8);
  for (const l of head) {
    try { const r = JSON.parse(l); if (r?.type === "session") return typeof r.cwd === "string" ? r.cwd : null; } catch { /* cut */ }
  }
  return null;
}

// The folder Oh My Pi names after a cwd: "-Code-x" under home, "--private-tmp--" outside it.
function ompFolder(cwd, home) {
  const fwd = (p) => p.replace(/\\/g, "/");
  const c = fwd(cwd);
  const h = fwd(home);
  if (sameDir(c, h)) return "-";
  if (norm(c).startsWith(`${norm(h)}/`)) return `-${c.slice(h.length + 1).replace(/\//g, "-")}`;
  return `--${c.replace(/^\//, "").replace(/[/:]/g, "-")}--`;
}

function ompModel(file) {
  let model = null;
  try {
    for (const r of lastRows(file, SUB_TAIL)) {
      if (r.type === "message" && r.message?.role === "assistant" && r.message.model) model = r.message.model;
      else if (r.type === "model_change" && r.model) model = r.model.split("/").pop();
    }
  } catch { /* the file vanished mid-read */ }
  return model;
}

// Oh My Pi and pi: herdr names the session file (`kind: "path"`); without it, the newest
// session in ~/.omp/agent/sessions/<folder>/ that recorded the pane's folder.
function omp(list) {
  if (!list.length) return [];
  const empty = { tools: null, ctx: 0, turnAt: 0, now: null, recent: [], sends: [], recvs: [], reads: [], more: false, subs: [], total: 0 };
  const out = [];
  for (const x of list.filter((x) => x.kind === "path" && x.value)) {
    try {
      const m = fs.statSync(x.value).mtimeMs;
      out.push({ ...empty, id: path.basename(x.value, ".jsonl"), agent: x.app, cwd: x.cwd, terminal: x.pane, model: ompModel(x.value), lastAt: Math.round(m) });
    } catch { /* gone */ }
  }
  const loose = list.filter((x) => !(x.kind === "path" && x.value) && x.app === "omp");
  if (!loose.length) return out;
  const home = os.homedir();
  const base = path.join(process.env.PI_CODING_AGENT_DIR || path.join(home, ".omp", "agent"), "sessions");
  const files = [];
  let dirs = [];
  try { dirs = fs.readdirSync(base); } catch { return out; }
  for (const dir of dirs) {
    let names = [];
    try { names = fs.readdirSync(path.join(base, dir)).filter((n) => n.endsWith(".jsonl")); } catch { continue; }
    for (const n of names) {
      const f = path.join(base, dir, n);
      try { files.push({ f, dir, m: fs.statSync(f).mtimeMs }); } catch { /* gone */ }
    }
  }
  files.sort((a, b) => b.m - a.m);
  const known = cache.omp ?? {};
  cache.omp = {};
  const cwdOf = (f) => {
    if (!(f.f in known)) { try { known[f.f] = ompCwd(f.f); } catch { known[f.f] = null; } }
    return (cache.omp[f.f] = known[f.f]);
  };
  for (const f of files) if (f.f in known) cache.omp[f.f] = known[f.f]; // still there: keep
  const picked = new Set();
  for (const x of loose) {
    const pick = files.find((f) => !picked.has(f.f) && (cwdOf(f) != null ? sameDir(cwdOf(f), x.cwd) : f.dir === ompFolder(x.cwd, home)));
    if (!pick) continue;
    picked.add(pick.f);
    out.push({ ...empty, id: path.basename(pick.f, ".jsonl"), agent: "omp", cwd: x.cwd, model: ompModel(pick.f), lastAt: Math.round(pick.m) });
  }
  return out;
}

// herdr's agent names to the reader that knows their files.
const APPS = { claude: "claude-code", "claude-code": "claude-code", codex: "codex", opencode: "opencode", omp: "omp", pi: "pi" };

// One scan: every target's session, newest first. `opts.now` fixes the clock (tests).
function scan(list = [], opts = {}) {
  cache = loadCache();
  used = new Set();
  warnings = new Set();
  now = opts.now ?? Date.now();
  const by = (app) => list.filter((x) => APPS[x.agent] === app).map((x) => ({ ...x, app }));
  const sessions = [
    ...claude(by("claude-code")),
    ...codex(by("codex")),
    ...opencode(by("opencode")),
    ...omp([...by("omp"), ...by("pi")]),
  ];
  saveCache();
  sessions.sort((a, b) => b.lastAt - a.lastAt);
  return { sessions, warnings: [...warnings] };
}

module.exports = { scan, targets, target, reads, hint, digest, digestCodex, digestOpencode, blank, ompFolder, APPS };

if (require.main === module) {
  let list = [];
  try { list = JSON.parse(process.argv[2] ?? "[]"); } catch { process.stderr.write("usage: node scan.cjs '<targets json>'\n"); process.exit(2); }
  process.stdout.write(JSON.stringify(scan(list)));
}

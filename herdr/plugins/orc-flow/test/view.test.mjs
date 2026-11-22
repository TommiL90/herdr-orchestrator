// view.mjs and keys.mjs: the frame, and the config block setup-keys writes.
import test from "node:test";
import assert from "node:assert/strict";
import { render, build, width, TONES } from "../lib/view.mjs";
import { graph, links, kids } from "../lib/model.js";
import { world, parseState } from "../lib/herdr.mjs";
import { apply, strip, bound, START, END, KEY } from "../bin/keys.mjs";

const NOW = Date.parse("2026-11-21T10:00:00Z");
const t = TONES;
const pane = (id, extra) => ({ pane_id: id, workspace_id: "w1", tab_id: "w1:t1", terminal_id: `term-${id}`, agent_status: "idle", focused: false, cwd: "/w", ...extra });
const snap = {
  focused_workspace_id: "w1",
  workspaces: [{ workspace_id: "w1", label: "app" }],
  panes: [
    pane("w1:p1", { label: "herdorc · deciding", agent: "claude", agent_status: "working" }),
    pane("w1:p2", { label: "gentle-ai-worker", agent: "codex", agent_status: "working" }),
    pane("w1:p3", { label: "review-risk", agent_status: "unknown" }),
  ],
  agents: [{ pane_id: "w1:p1", name: "herdorc", agent: "claude", agent_status: "working" }, { pane_id: "w1:p2", name: "gentle-ai-worker", agent: "codex", agent_status: "working" }],
};
const state = parseState({ panes: { "w1:p2": { name: "gentle-ai-worker", terminal: "term-w1:p2" }, "w1:p3": { name: "review-risk", terminal: "term-w1:p3" } } });

function model() {
  const w = world(snap, state, {});
  const sessions = new Map([
    ["w1:p1", { model: "claude-opus-4-7", ctx: 82000, tools: 12, sends: [{ t: NOW - 30000, to: "gentle-ai-worker" }], reads: [{ t: NOW - 10000, from: "review-risk" }], recvs: [],
      recent: [{ t: NOW - 30000, name: "Send", hint: "gentle-ai-worker" }], subs: [], now: { name: "Bash", hint: "herdr agent wait" }, lastAt: NOW }],
    ["w1:p2", { model: "gpt-5.1-codex", sends: [], recvs: [], recent: [], subs: [], now: { name: "exec_command", hint: "npm test" }, lastAt: NOW }],
  ]);
  const g = graph(w.list, sessions, t, NOW);
  return build({ w, sessions, guessed: new Set(), graph: g, links: links(g, NOW), kids: kids(w.lead, w.list, sessions, t, NOW) });
}

test("the frame: lead, role panes with CLI, model, status, and the message log", () => {
  const { lines, picks } = render(model(), { cols: 120, rows: 30, sel: "w1:p1", frame: 0, wall: NOW, detail: false, color: false });
  const text = lines.join("\n");
  assert.equal(lines.length, 30);
  assert.ok(lines.every((l) => width(l) === 120), "every line fills the width exactly");
  assert.match(text, /lead herdorc \(w1:p1, label\)/);
  assert.match(text, /herdorc\s+claude\s+Opus 4\.7\s+working\s+Bash herdr agent wait\s+ctx 82k · 12 tools/);
  assert.match(text, /├─▶ ◐ gentle-ai-worker\s+codex\s+gpt-5\.1-codex\s+working\s+exec_command npm test\s+↓1/);
  assert.match(text, /└─▶ · review-risk\s+—\s+no agent\s+↑1/);
  assert.match(text, /\d\d:\d\d:\d\d {2}herdorc ⇠ review-risk {2}answer read/);
  assert.match(text, /herdorc → gentle-ai-worker {2}message/);
  assert.match(lines.at(-1), /q quit/);
  assert.deepEqual([...new Set(picks.filter(Boolean))], ["w1:p1", "w1:p2", "w1:p3"]);
});

test("a small pane keeps the header, the tree and the footer", () => {
  const { lines } = render(model(), { cols: 40, rows: 8, sel: null, frame: 0, wall: NOW, detail: true, color: false });
  assert.equal(lines.length, 8);
  assert.ok(lines.every((l) => width(l) === 40));
  assert.match(lines[0], /orc-flow app/);
  assert.match(lines.at(-1), /j\/k select/);
});

test("no lead: says how to get one, still lists the panes", () => {
  const w = world({ ...snap, panes: snap.panes.slice(2), agents: [] }, { panes: {} }, {});
  const m = build({ w, sessions: new Map(), guessed: new Set(), graph: null, links: [], kids: [] });
  const text = render(m, { cols: 100, rows: 20, sel: null, frame: 0, wall: NOW, detail: false, color: false }).lines.join("\n");
  assert.match(text, /No herdorc lead found/);
  assert.match(text, /review-risk.*role pane not opened by herdorc/);
});

test("setup-keys: one block, idempotent, removable, never steals a key", () => {
  const base = '[keys]\nzoom = "prefix+z"\n';
  const once = apply(base, "setup");
  assert.equal(apply(once, "setup"), once);
  assert.match(once, new RegExp(`${START}\\n\\[\\[keys.command\\]\\]\\nkey = "${KEY.replace(/\+/g, "\\+")}"\\ntype = "plugin_action"\\ncommand = "orc-flow.open"`));
  assert.ok(once.trimEnd().endsWith(END));
  assert.equal(apply(once, "remove"), base);
  assert.equal(strip(base), base);
  const taken = `[keys]\nzoom = "${KEY}"\n`;
  assert.ok(bound(taken));
  assert.match(apply(taken, "setup"), /already bound elsewhere[\s\S]*# key = ""/);
  assert.ok(!bound(`# zoom = "${KEY}"\n`));
});

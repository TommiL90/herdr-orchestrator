// herdr.mjs: herdr's snapshot and herdorc's state file to the rows model.js reads.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { rows, world, findLead, ownedPanes, parseState, statePath, loadStates, herdrSession, targets, roleOf } from "../lib/herdr.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const pane = (id, extra = {}) => ({ pane_id: id, workspace_id: "w1", tab_id: "w1:t1", terminal_id: `term-${id}`, agent_status: "unknown", focused: false, cwd: "/w", ...extra });
const agent = (id, name, kind, extra = {}) => ({ pane_id: id, name, agent: kind, agent_status: "idle", workspace_id: "w1", tab_id: "w1:t1", terminal_id: `term-${id}`, ...extra });
const snap = {
  focused_workspace_id: "w1",
  workspaces: [{ workspace_id: "w1", label: "app" }],
  panes: [
    pane("w1:p1", { label: "herdorc · exploring", agent: "claude", agent_status: "working", agent_session: { agent: "claude", kind: "id", source: "herdr:claude", value: "s1" } }),
    pane("w1:p2", { label: "gentle-ai-worker", agent: "codex", agent_status: "idle", agent_session: { agent: "codex", kind: "id", source: "herdr:codex", value: "th" } }),
    pane("w1:p3", { label: "review-risk" }),
    pane("w1:p4", { label: "jd-judge-a" }), // a role name, not recorded: not herdorc's
    pane("w1:p5"), // a plain shell
    pane("w1:p6", { label: "orc-flow" }), // the plugin's own pane
    pane("w2:p1", { workspace_id: "w2", label: "review-risk" }),
  ],
  agents: [agent("w1:p1", "herdorc", "claude", { agent_status: "working", title: "✳ Plan the fix" }), agent("w1:p2", "gentle-ai-worker", "codex")],
};
const state = parseState({ panes: { "w1:p2": { name: "gentle-ai-worker", terminal: "term-w1:p2" }, "w1:p3": "review-risk" } });

test("rows: one per pane of the workspace, without the plugin's own", () => {
  const r = rows(snap, "w1", "w1:p6");
  assert.deepEqual(r.map((x) => x.address), ["w1:p1", "w1:p2", "w1:p3", "w1:p4", "w1:p5"]);
  const lead = r[0];
  assert.equal(lead.app, "claude-code");
  assert.equal(lead.status, "working");
  assert.equal(lead.title, "Plan the fix");
  assert.deepEqual(lead.names, ["w1:p1", "herdorc · exploring", "herdorc", "term-w1:p1"]);
  assert.equal(r[2].status, "shell");
  assert.equal(r[2].role, "review-risk");
});

test("ownedPanes: recorded, same label, same terminal; the first format is adopted", () => {
  assert.deepEqual([...ownedPanes(state, snap.panes)].sort(), ["w1:p2", "w1:p3"]);
  const moved = { panes: snap.panes.map((p) => (p.pane_id === "w1:p2" ? { ...p, terminal_id: "reused" } : p)) };
  assert.deepEqual([...ownedPanes(state, moved.panes)], ["w1:p3"]);
});

test("world: the lead's recorded panes are its children; other role panes are not", () => {
  const w = world(snap, state, { self: "w1:p6" });
  assert.equal(w.lead.address, "w1:p1");
  assert.equal(w.how, "label");
  assert.deepEqual(w.list.map((r) => [r.address, r.parent]), [["w1:p1", null], ["w1:p2", "w1:p1"], ["w1:p3", "w1:p1"], ["w1:p4", null]]);
  assert.deepEqual(w.plain.map((r) => r.address), ["w1:p5"]);
  assert.equal(w.label, "app");
});

test("findLead: label, then remembered, then messages, then origin, then the only agent", () => {
  const plain = (address, extra = {}) => ({ address, terminal: `t-${address}`, isAgent: true, label: null, agentName: null, role: null, names: [address], ...extra });
  const a = plain("w1:p1");
  const b = plain("w1:p2");
  const role = plain("w1:p3", { role: "review-risk", names: ["w1:p3", "review-risk"] });
  const owned = new Set(["w1:p3"]);
  assert.equal(findLead([a, b, role], { owned, remembered: { pane: "w1:p2", terminal: "t-w1:p2" } }).lead, b);
  assert.equal(findLead([a, b, role], { owned, remembered: { pane: "w1:p2", terminal: "other" } }).lead, null);
  const sessions = new Map([["w1:p1", { sends: [{ to: "review-risk" }] }]]);
  assert.deepEqual(findLead([a, b, role], { owned, sessions }), { lead: a, how: "messages" });
  assert.deepEqual(findLead([a, b, role], { owned, origin: "w1:p2" }), { lead: b, how: "opened from" });
  assert.deepEqual(findLead([a, role], { owned }), { lead: a, how: "only agent" });
  assert.equal(findLead([a, b, plain("w1:p9", { agentName: "herdorc" })]).lead.address, "w1:p9");
});

test("targets: herdr's session for scan.cjs, when it reported one", () => {
  const w = world(snap, state, { self: "w1:p6" });
  assert.deepEqual(targets(w.list), [
    { pane: "w1:p1", agent: "claude", cwd: "/w", kind: "id", value: "s1" },
    { pane: "w1:p2", agent: "codex", cwd: "/w", kind: "id", value: "th" },
  ]);
});

test("roles and sessions", () => {
  assert.equal(roleOf("gentle-ai-worker-2"), "gentle-ai-worker");
  assert.equal(roleOf("gentle-ai-workers"), null);
  assert.equal(herdrSession({ HERDR_SESSION: "x" }), "x");
  assert.equal(herdrSession({ HERDR_SOCKET_PATH: "/h/.config/herdr/sessions/orc-test/herdr.sock" }), "orc-test");
  assert.equal(herdrSession({ HERDR_SOCKET_PATH: "/h/.config/herdr/herdr.sock" }), "default");
});

test("statePath matches shared/bin/orc_state.py", () => {
  for (const [session, ws, lead] of [["default", "w1", "w1:p1"], ["my sess/1", "w:2", "w2:p9"], ["orc-test-9", "", ""]]) {
    const py = execFileSync("python3", ["-c", `import sys; sys.path.insert(0, ${JSON.stringify(path.join(repo, "shared/bin"))}); import orc_state, pathlib; print(orc_state.herdorc_state_path(sys.argv[1], sys.argv[2] or None, sys.argv[3] or None).relative_to(pathlib.Path.home()))`, session, ws, lead], { encoding: "utf8", env: { ...process.env, HERDR_WORKSPACE_ID: "", HERDR_PANE_ID: "" } }).trim();
    assert.equal(path.relative(process.env.HOME, statePath(session, ws, lead)), py);
  }
});

test("loadStates tags each lead's panes with that lead; the first format's file names none and is skipped", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "orc-flow-states-"));
  const dir = path.join(home, ".local", "state", "orc");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(statePath("default", "w1", "w1:p1", home), JSON.stringify({ panes: { "w1:p2": { name: "gentle-ai-worker", terminal: "a" } } }));
  fs.writeFileSync(statePath("default", "w1", "w1:p5", home), JSON.stringify({ panes: { "w1:p6": { name: "review-risk", terminal: "b" } } }));
  fs.writeFileSync(statePath("default", "w1", "w1:p9", home), JSON.stringify({ panes: { "w1:p2": { name: "gentle-ai-worker", terminal: "old" } } }));
  fs.writeFileSync(path.join(dir, "herdorc-default-w1.json"), JSON.stringify({ panes: { "w1:p3": "jd-judge-a" } }));
  fs.writeFileSync(statePath("default", "w12", "w12:p1", home), JSON.stringify({ panes: { "w12:p2": { name: "x", terminal: "c" } } }));
  const live = [
    pane("w1:p2", { label: "gentle-ai-worker", terminal_id: "a" }),
    pane("w1:p6", { label: "review-risk", terminal_id: "b" }),
  ];
  const { panes } = loadStates("default", "w1", live, home);
  assert.deepEqual(Object.keys(panes).sort(), ["w1:p2", "w1:p6"]);
  assert.equal(panes["w1:p2"].lead, "w1_p1");
  assert.equal(panes["w1:p6"].lead, "w1_p5");
  fs.rmSync(home, { recursive: true, force: true });
});

test("world: two herdorc in one workspace each get only the panes they recorded", () => {
  const two = {
    ...snap,
    panes: [...snap.panes, pane("w1:p7", { label: "herdorc · planning", agent: "claude" }), pane("w1:p8", { label: "jd-judge-b" })],
    agents: [...snap.agents, agent("w1:p7", "herdorc", "claude")],
  };
  const st = { panes: {
    "w1:p2": { name: "gentle-ai-worker", terminal: "term-w1:p2", lead: "w1_p1" },
    "w1:p3": { name: "review-risk", terminal: "term-w1:p3", lead: "w1_p1" },
    "w1:p8": { name: "jd-judge-b", terminal: "term-w1:p8", lead: "w1_p7" },
  } };
  const fromSecond = world(two, st, { self: "w1:p6", origin: "w1:p7" });
  assert.equal(fromSecond.lead.address, "w1:p7");
  assert.equal(fromSecond.how, "state file");
  assert.deepEqual(fromSecond.list.filter((r) => r.parent).map((r) => [r.address, r.parent]), [["w1:p8", "w1:p7"]]);
  const fromFirst = world(two, st, { self: "w1:p6" });
  assert.equal(fromFirst.lead.address, "w1:p1");
  assert.deepEqual(fromFirst.list.filter((r) => r.parent).map((r) => [r.address, r.parent]), [["w1:p2", "w1:p1"], ["w1:p3", "w1:p1"]]);
});

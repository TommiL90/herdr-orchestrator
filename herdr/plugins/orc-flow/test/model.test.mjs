// model.js: the graph, links and kids from herdr rows and scanned sessions.
import test from "node:test";
import assert from "node:assert/strict";
import { graph, links, kids, pair, modelName, middle, visibleSubs } from "../lib/model.js";

const t = { ansi2: "g", ansi3: "y", ansi4: "b", ansi5: "m", ansi6: "c", ansi7: "w", accent: "a" };
const NOW = 1_000_000_000;
const row = (address, label, extra = {}) => ({ address, label, name: label, app: "claude-code", cwd: "/w", status: "idle", parent: null, names: [address, label], ...extra });

const lead = row("w1:p1", "herdorc · exploring", { names: ["w1:p1", "herdorc · exploring", "herdorc"] });
const worker = row("w1:p2", "gentle-ai-worker", { parent: "w1:p1", app: "codex", status: "working" });
const risk = row("w1:p3", "review-risk", { parent: "w1:p1" });
const list = [lead, worker, risk];
const sessions = new Map([
  ["w1:p1", { model: "claude-opus-4-7", turnAt: NOW - 60000, sends: [{ t: NOW - 5000, to: "gentle-ai-worker" }, { t: NOW - 4000, to: "w1:p3" }, { t: NOW - 3000, to: "nobody" }],
    reads: [{ t: NOW - 2000, from: "review-risk" }, { t: NOW - 1000, file: "gentle-ai-worker-fix-login" }], recvs: [], recent: [], subs: [] }],
  ["w1:p2", { model: "gpt-5.1-codex", sends: [], recvs: [], recent: [], subs: [] }],
]);

test("graph: a node answers to every name in `names`", () => {
  const g = graph(list, sessions, t, NOW);
  const msgs = g.events.filter((e) => e.kind === "message");
  assert.deepEqual(msgs.map((e) => [e.from, e.to]), [["w1:p1", "w1:p2"], ["w1:p1", "w1:p3"]]);
});

test("graph: answers read back are replies from the role, by name or report file", () => {
  const g = graph(list, sessions, t, NOW);
  const replies = g.events.filter((e) => e.kind === "reply");
  assert.deepEqual(replies.map((e) => [e.from, e.to]), [["w1:p3", "w1:p1"], ["w1:p2", "w1:p1"]]);
});

test("a report file goes to the longest name it starts with", () => {
  const w2 = row("w1:p4", "gentle-ai-worker-2", { parent: "w1:p1" });
  const s = new Map([["w1:p1", { sends: [], recvs: [], recent: [], subs: [], reads: [{ t: NOW, file: "gentle-ai-worker-2-fix" }] }]]);
  const g = graph([lead, worker, w2], s, t, NOW);
  assert.deepEqual(g.events.map((e) => e.from), ["w1:p4"]);
});

test("links: one per direction, messages and replies, newest first", () => {
  const l = links(graph(list, sessions, t, NOW), NOW);
  assert.deepEqual(l.map((x) => `${x.fromName}>${x.toName}:${x.n}`), [
    "gentle-ai-worker>herdorc · exploring:1", "review-risk>herdorc · exploring:1",
    "herdorc · exploring>review-risk:1", "herdorc · exploring>gentle-ai-worker:1",
  ]);
  assert.deepEqual(links(graph(list, sessions, t, NOW + 11 * 60000), NOW + 11 * 60000), []); // older than 10 min
});

test("kids: the lead's role panes, busiest first, with their models", () => {
  const k = kids(lead, list, sessions, t, NOW);
  assert.deepEqual(k.map((x) => [x.title, x.model, x.status]), [["gentle-ai-worker", "gpt-5.1-codex", "working"], ["review-risk", null, "idle"]]);
});

test("pair: herdr's exact pairing first, then folder guesses", () => {
  const exact = { terminal: "w1:p2", agent: "codex", cwd: "/w", model: "x" };
  const loose1 = { agent: "claude-code", cwd: "/w", model: "a" };
  const loose2 = { agent: "claude-code", cwd: "/w", model: "b" };
  const { found, guessed } = pair(list, [exact, loose1, loose2]);
  assert.equal(found.get("w1:p2"), exact);
  assert.ok(found.has("w1:p1") && found.has("w1:p3"));
  assert.ok(guessed.has("w1:p1") && guessed.has("w1:p3"));
  assert.ok(!guessed.has("w1:p2"));
});

test("names and helpers", () => {
  assert.equal(modelName("claude-opus-4-7"), "Opus 4.7");
  assert.equal(modelName("gpt-5.1-codex"), "gpt-5.1-codex");
  assert.equal(middle("deepseek-v4-flash:free", 12), "deepse…:free");
  assert.deepEqual(visibleSubs({ turnAt: 5, subs: [{ status: "done", lastAt: 1 }, { status: "working", lastAt: 2 }] }, NOW).length, 1);
});

test("graph: a role pane and a subagent with one name: messages to the pane, delegations to the subagent", () => {
  const explore = row("w1:p4", "gentle-ai-explore", { parent: "w1:p1" });
  const sub = { id: "a1", type: "gentle-ai-explore", status: "working", lastAt: NOW - 1000, model: "claude-haiku-5-5" };
  const s = new Map([
    ["w1:p1", { model: "claude-opus-4-7", turnAt: NOW - 60000, sends: [{ t: NOW - 3000, to: "gentle-ai-explore" }], reads: [], recvs: [],
      recent: [{ t: NOW - 2000, delegate: "gentle-ai-explore", hint: "look around" }], subs: [sub] }],
  ]);
  const g = graph([lead, explore], s, t, NOW);
  const by = (kind) => g.events.filter((e) => e.kind === kind).map((e) => [e.from, e.to]);
  assert.deepEqual(by("message"), [["w1:p1", "w1:p4"]]);
  assert.deepEqual(by("delegates"), [["w1:p1", "a1"]]);
});

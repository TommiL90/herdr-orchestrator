// scan.cjs: who a tool call talks to, and sessions read by herdr's exact session ids.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orc-flow-scan-"));
process.env.ORC_FLOW_CACHE = path.join(tmp, "cache.json");
process.env.CLAUDE_CONFIG_DIR = path.join(tmp, "claude");
process.env.CODEX_HOME = path.join(tmp, "codex");
process.env.XDG_DATA_HOME = path.join(tmp, "data");
const { scan, targets, reads, digest, digestCodex, blank } = require("../lib/scan.cjs");
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const sh = (command) => targets("Bash", { command });

test("herdorc's messages: herdr agent prompt and pane send-text", () => {
  assert.deepEqual(sh('herdr agent prompt gentle-ai-worker "If you have not read..." --wait --timeout 270000'), ["gentle-ai-worker"]);
  assert.deepEqual(sh("herdr --session work agent prompt w1:p3 'go'"), ["w1:p3"]);
  assert.deepEqual(sh('/opt/bin/herdr pane send-text review-risk "hello"'), ["review-risk"]);
  assert.deepEqual(sh('herdr agent prompt "jd-judge-a" "x" & herdr agent prompt jd-judge-b "y"'), ["jd-judge-a", "jd-judge-b"]);
});

test("what is not a message", () => {
  assert.deepEqual(sh("herdr agent list"), []);
  assert.deepEqual(sh("herdr agent read review-risk --lines 40"), []);
  assert.deepEqual(sh("herdr pane run w1:p2 'npm test'"), []);
  assert.deepEqual(sh('herdr agent prompt "$NAME" "x"'), []); // unresolvable: a variable
  assert.deepEqual(sh("echo herdr-agent prompt x"), []);
  assert.deepEqual(targets("Read", { file_path: "/x/herdr agent prompt y" }), []);
});

test("orc.py ensure counts only with --handoff, to --name or the role", () => {
  assert.deepEqual(sh("/r/shared/bin/orc.py --as herdorc ensure gentle-ai-worker --name gentle-ai-worker-2 --launch codex --handoff /s/h.md"), ["gentle-ai-worker-2"]);
  assert.deepEqual(sh("'/r/shared/bin/orc.py' ensure review-risk --launch claude --model haiku --handoff /s/h.md"), ["review-risk"]);
  assert.deepEqual(sh("/r/shared/bin/orc.py ensure review-risk"), []);
});

test("hcorc's forms still count: hc send and SendMessage", () => {
  assert.deepEqual(sh("hc send t7 'x'"), ["t7"]);
  assert.deepEqual(targets("SendMessage", { to: "explore" }), ["explore"]);
});

test("answers read back: herdr agent read and a role's report file", () => {
  assert.deepEqual(reads("Bash", { command: "herdr agent read review-risk --source recent --lines 80" }), [{ from: "review-risk" }]);
  assert.deepEqual(reads("Read", { file_path: "/s/orc/reports/gentle-ai-worker-2-fix-login.md" }), [{ file: "gentle-ai-worker-2-fix-login" }]);
  assert.deepEqual(reads("Read", { file_path: "/s/orc/reports/handoffs/gentle-ai-worker-fix.md" }), []);
  assert.deepEqual(reads("Read", { file_path: "/repo/README.md" }), []);
});

const T0 = Date.parse("2026-11-21T10:00:00Z");
const at = (s) => new Date(T0 + s * 1000).toISOString();
const claudeRows = [
  { type: "user", timestamp: at(0), message: { content: "plan the fix" } },
  { type: "assistant", timestamp: at(1), message: { model: "claude-opus-4-7", usage: { input_tokens: 10, cache_read_input_tokens: 1000 }, content: [
    { type: "tool_use", id: "a", name: "Bash", input: { command: "/r/orc.py ensure gentle-ai-worker --launch codex --handoff /s/h.md", description: "open worker" } },
  ] } },
  { type: "user", timestamp: at(2), message: { content: [{ type: "tool_result", tool_use_id: "a" }] } },
  { type: "assistant", timestamp: at(3), message: { model: "claude-opus-4-7", content: [
    { type: "tool_use", id: "b", name: "Read", input: { file_path: "/s/orc/reports/gentle-ai-worker-fix.md" } },
    { type: "tool_use", id: "c", name: "Agent", input: { subagent_type: "Explore", description: "find callers" } },
  ] } },
];

test("digest: model, context, sends, reads, the call still running", () => {
  const d = digest(blank(), claudeRows);
  assert.equal(d.model, "claude-opus-4-7");
  assert.equal(d.ctx, 1010);
  assert.deepEqual(d.sends, [{ t: T0 + 1000, to: "gentle-ai-worker" }]);
  assert.deepEqual(d.reads, [{ t: T0 + 3000, file: "gentle-ai-worker-fix" }]);
  assert.equal(d.recent[0].name, "Send");
  assert.equal(d.tools, 3);
  assert.deepEqual(Object.keys(d.open), ["b", "c"]);
});

const codexRows = [
  { timestamp: at(0), type: "turn_context", payload: { model: "gpt-5.1-codex" } },
  { timestamp: at(0), type: "event_msg", payload: { type: "task_started" } },
  { timestamp: at(1), type: "response_item", payload: { type: "function_call", name: "exec_command", call_id: "x", arguments: JSON.stringify({ cmd: "herdr agent prompt review-risk 'go' --wait" }) } },
  { timestamp: at(2), type: "response_item", payload: { type: "function_call_output", call_id: "x" } },
  { timestamp: at(3), type: "response_item", payload: { type: "custom_tool_call", name: "exec", call_id: "y", input: 'await tools.exec_command({cmd:"herdr agent read review-risk"})' } },
  { timestamp: at(4), type: "event_msg", payload: { type: "token_count", info: { last_token_usage: { input_tokens: 4321 } } } },
];

test("digestCodex: a Codex lead's prompts and reads", () => {
  const d = digestCodex(blank(), codexRows);
  assert.equal(d.model, "gpt-5.1-codex");
  assert.equal(d.ctx, 4321);
  assert.deepEqual(d.sends.map((s) => s.to), ["review-risk"]);
  assert.deepEqual(d.reads.map((s) => s.from), ["review-risk"]);
  assert.deepEqual(Object.keys(d.open), ["y"]);
});

test("scan pairs panes with sessions by herdr's agent_session", () => {
  const cwd = "/work/app";
  const dir = path.join(tmp, "claude", "projects", cwd.replace(/[^a-zA-Z0-9]/g, "-"));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "sess-1.jsonl"), claudeRows.map((r) => JSON.stringify(r)).join("\n") + "\n");

  const { DatabaseSync } = require("node:sqlite");
  fs.mkdirSync(path.join(tmp, "codex"), { recursive: true });
  const rollout = path.join(tmp, "codex", "rollout-1.jsonl");
  fs.writeFileSync(rollout, codexRows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  const db = new DatabaseSync(path.join(tmp, "codex", "state_5.sqlite"));
  db.exec("create table threads (id text primary key, cwd text, model text, rollout_path text, updated_at_ms integer, archived integer default 0)");
  db.prepare("insert into threads (id, cwd, model, rollout_path, updated_at_ms) values (?, ?, ?, ?, ?)").run("th-1", cwd, null, rollout, T0);
  db.close();

  const r = scan([
    { pane: "w1:p1", agent: "claude", kind: "id", value: "sess-1", cwd },
    { pane: "w1:p2", agent: "codex", kind: "id", value: "th-1", cwd },
    { pane: "w1:p3", agent: "gemini", cwd },
  ], { now: T0 + 5000 });
  const by = Object.fromEntries(r.sessions.map((s) => [s.terminal, s]));
  assert.equal(by["w1:p1"].agent, "claude-code");
  assert.equal(by["w1:p1"].model, "claude-opus-4-7");
  assert.deepEqual(by["w1:p1"].sends.map((s) => s.to), ["gentle-ai-worker"]);
  assert.equal(by["w1:p2"].agent, "codex");
  assert.equal(by["w1:p2"].model, "gpt-5.1-codex");
  assert.deepEqual(by["w1:p2"].sends.map((s) => s.to), ["review-risk"]);
  assert.equal(r.sessions.length, 2); // gemini: no reader, so no session
  // A second scan reads only what was appended, and ends in the same state.
  fs.appendFileSync(path.join(dir, "sess-1.jsonl"), JSON.stringify({ type: "assistant", timestamp: at(9), message: { model: "claude-opus-4-7", content: [
    { type: "tool_use", id: "d", name: "Bash", input: { command: "herdr agent prompt jd-judge-a 'x'" } },
  ] } }) + "\n");
  const again = scan([{ pane: "w1:p1", agent: "claude", kind: "id", value: "sess-1", cwd }]);
  assert.deepEqual(again.sessions[0].sends.map((s) => s.to), ["gentle-ai-worker", "jd-judge-a"]);
});

test("a Claude pane without agent_session takes a live session in its folder, unpaired", () => {
  const cwd = "/work/other";
  const dir = path.join(tmp, "claude", "projects", cwd.replace(/[^a-zA-Z0-9]/g, "-"));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "sess-2.jsonl"), claudeRows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  fs.mkdirSync(path.join(tmp, "claude", "sessions"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "claude", "sessions", `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: "sess-2", cwd }));
  const r = scan([{ pane: "w1:p9", agent: "claude", cwd }]);
  assert.equal(r.sessions.length, 1);
  assert.equal(r.sessions[0].id, "sess-2");
  assert.equal(r.sessions[0].terminal, undefined); // model.js's pair() pairs it by folder
});

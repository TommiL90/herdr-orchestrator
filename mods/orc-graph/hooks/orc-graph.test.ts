import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { bashFlows, confirmedHandoffs, hcSenders, junction, layoutCards, layoutTree, paneOfFile } from './graph'
import type { Run } from './graph'
import { herdorcStatePath, herdrSessionOf, normStatus, parseHc, parseHerdr, roleOf } from './roster'
import { buildView } from './view'

const known = (names: string[]) => (w: string) => (names.includes(w) ? w : roleOf(w) ? w : undefined)
const text = (rows: Run[][]) => rows.map(r => r.map(x => x.text).join(''))

test('role names follow orc.py, copies included', async () => {
  expect(roleOf('gentle-ai-worker')).toBe('gentle-ai-worker')
  expect(roleOf('gentle-ai-worker-2')).toBe('gentle-ai-worker')
  expect(roleOf('jd-judge-a')).toBe('jd-judge-a')
  expect(roleOf('gentle-ai-worker-x')).toBeUndefined()
  expect(roleOf('fish')).toBeUndefined()
  expect(normStatus({ app: 'claude-code', state: 'working' })).toBe('working')
  expect(normStatus('done')).toBe('done')
  expect(normStatus(undefined)).toBe('unknown')
})

test('hc: only the live role terminals this orchestrator started', async () => {
  const out = JSON.stringify({
    terminals: [
      { address: 't7', name: 'gentle-ai-worker', parent: 't1', state: 'live', status: 'working', agent: 'claude-code' },
      { address: 't8', name: 'gentle-ai-explore', parent: 't1', state: 'live', status: 'idle', agent: 'fish' },
      { address: 't9', name: 'gentle-ai-verify', parent: 't5', state: 'live', status: 'idle', agent: 'codex' },
      { address: 't10', name: 'notes', parent: 't1', state: 'live' },
    ],
  })
  const members = parseHc(out, 't1')
  expect(members.map(m => m.name)).toEqual(['gentle-ai-explore', 'gentle-ai-worker'])
  expect(members[1]?.status).toBe('working')
  expect(members[0]?.status).toBe('unknown') // a bare shell: no agent
  expect(members[1]?.ctxKey).toBe('hc-t7')
  expect(parseHc('not json', 't1')).toEqual([])
})

test('herdr: recorded panes joined with the agent list, gone or reused ids dropped', async () => {
  const state = JSON.stringify({ panes: { 'w1:p2': { name: 'gentle-ai-worker', terminal: 'term_a' }, 'w1:p3': { name: 'jd-judge-a', terminal: 'term_b' }, 'w1:p4': 'gentle-ai-verify' } })
  const agents = JSON.stringify({ result: { agents: [
    { pane_id: 'w1:p2', agent: 'claude', agent_status: 'working', terminal_id: 'term_a' },
    { pane_id: 'w1:p3', agent: 'codex', agent_status: 'idle', terminal_id: 'term_other' },
  ] } })
  const live = new Map([['w1:p2', { label: 'gentle-ai-worker', terminal: 'term_a' }], ['w1:p3', { label: 'jd-judge-a', terminal: 'term_b' }]])
  const members = parseHerdr(agents, state, 'orc', live)
  expect(members.map(m => m.name)).toEqual(['gentle-ai-worker'])
  expect(members[0]?.ctxKey).toBe('herdr-orc-w1_p2')
  // A pane the user relabelled, or whose terminal changed, is no longer the orchestrator's.
  const relabelled = new Map([['w1:p2', { label: 'notes', terminal: 'term_a' }]])
  expect(parseHerdr(agents, state, 'orc', relabelled)).toEqual([])
  const reused = new Map([['w1:p2', { label: 'gentle-ai-worker', terminal: 'term_z' }]])
  expect(parseHerdr(agents, state, 'orc', reused)).toEqual([])
})

test('the orchestrator commands that pass work out, and those that wait for the answer', async () => {
  const r = known(['gentle-ai-worker'])
  expect(bashFlows('hc send --if idle gentle-ai-worker "If you have not read x; then read /r/h.md"', r).out).toEqual(['gentle-ai-worker'])
  const p = bashFlows('herdr agent prompt gentle-ai-explore "go" --wait --timeout 270000', r)
  expect(p.out).toEqual(['gentle-ai-explore'])
  expect(p.awaits).toEqual([{ target: 'gentle-ai-explore', timeoutMs: 270_000 }])
  expect(bashFlows('/repo/shared/bin/orc.py --as hcorc ensure gentle-ai-verify --name gentle-ai-verify-2 --launch claude --handoff /r/h.md', r).handoffs)
    .toEqual([{ role: 'gentle-ai-verify', name: 'gentle-ai-verify-2' }])
  // Options before the role, --prompt-file, a continued line; no --launch starts nothing.
  expect(bashFlows('orc.py ensure --name gentle-ai-verify-2 gentle-ai-verify \\\n  --launch codex --prompt-file=/r/h.md', r).handoffs)
    .toEqual([{ role: 'gentle-ai-verify', name: 'gentle-ai-verify-2' }])
  expect(bashFlows('orc.py ensure gentle-ai-verify --handoff /r/h.md', r).handoffs).toEqual([])
  expect(bashFlows('hc wait gentle-ai-worker --timeout 270', r).awaits).toEqual([{ target: 'gentle-ai-worker', timeoutMs: 270_000 }])
  expect(bashFlows('herdr --session orc agent wait gentle-ai-worker --timeout 270000', r).awaits).toEqual([{ target: 'gentle-ai-worker', timeoutMs: 270_000 }])
  expect(bashFlows('herdr agent read --lines 80 gentle-ai-worker', r).reads).toEqual(['gentle-ai-worker'])
  // A newline ends a command as `;` does.
  expect(bashFlows('cd /r\nhc send gentle-ai-worker "x"', r).out).toEqual(['gentle-ai-worker'])
  expect(bashFlows('rtk hc ls --json && hc send t1 "note"', r).out).toEqual([])
  expect(bashFlows('echo "hc send gentle-ai-worker hi"', r).out).toEqual([])
})

test('report and handoff files name their pane', async () => {
  expect(paneOfFile('gentle-ai-worker-fix-auth.md', [])).toBe('gentle-ai-worker')
  expect(paneOfFile('gentle-ai-worker-2-fix.md', ['gentle-ai-worker'])).toBe('gentle-ai-worker')
  expect(paneOfFile('gentle-ai-worker-2-fix.md', [])).toBe('gentle-ai-worker-2')
  expect(paneOfFile('jd-judge-a-plan.md', [])).toBe('jd-judge-a')
  expect(paneOfFile('notes.md', [])).toBeUndefined()
  expect(hcSenders('<hc from="t7 gentle-ai-worker">PASS /r/x.md</hc>')).toEqual(['gentle-ai-worker'])
})

const view = (now: number) => buildView({
  agent: 'hcorc',
  phase: 'implementing',
  now,
  frame: 3,
  members: [
    { name: 'gentle-ai-explore', role: 'gentle-ai-explore', address: 't8', cli: 'claude-code', status: 'working', ctxKey: 'hc-t8', since: now - 72_000 },
    { name: 'gentle-ai-worker', role: 'gentle-ai-worker', address: 't7', cli: 'codex', status: 'idle', ctxKey: 'hc-t7', since: now },
  ],
  subs: [{ id: 'tu1', type: 'Explore', label: 'find the auth flow', status: 'working', since: now - 5_000 }],
  flows: [{ target: 'gentle-ai-explore', dir: 'out', at: now - 1_000 }, { target: 'gentle-ai-worker', dir: 'in', at: now - 30_000 }],
})

test('the tree draws every node within the width, a live wire with its packet', async () => {
  const rows = text(layoutTree(view(100_000), 56, 3))
  expect(rows[0]).toContain('hcorc · implementing')
  expect(rows.some(r => r.includes('explore') && r.includes('━━') && r.includes('▶') && r.includes('working 1:12'))).toBe(true)
  expect(rows.some(r => r.includes('worker') && r.includes('idle'))).toBe(true) // the reply is past FLOW_RECENT_MS
  expect(rows.some(r => r.includes('Explore') && r.includes('┄'))).toBe(true)
  for (const r of rows) expect([...r].length <= 56).toBe(true)
})

test('cards: one per node, wired to the orchestrator card', async () => {
  const rows = text(layoutCards(view(100_000), 90, 3))
  expect(rows.length).toBe(1 + 3 * 3)
  expect(rows.some(r => r.includes('● hcorc'))).toBe(true)
  expect(rows.filter(r => r.includes('╭')).length >= 3).toBe(true)
  for (const r of rows) expect([...r].length <= 90).toBe(true)
  expect(junction(true, true, false, true)).toBe('├')
  expect(junction(false, true, false, true)).toBe('╭')
})

type Written = { plugin?: string; key?: string; value?: unknown }

/** The engine beneath the mod; `state` collects the mod's latest value per key. */
const engine = (on: Parameters<TestBody>[1], agent: string, opened: string[], state: Record<string, unknown> = {}) => {
  on('state.set', (_, e, next) => {
    const w = e as Written
    if (w.plugin === 'orc-graph' && w.key) state[w.key] = w.value
    return next(e)
  })
  mock.env(on, { CLAUDE_CODE_AGENT: agent, HOME: '/h', HC_TERMINAL_ID: 't1' })
  mock.clock(on, { now: 1_000_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ({ value: { exitCode: 0, stderr: '', stdout: JSON.stringify({ terminals: [
    { address: 't7', name: 'gentle-ai-worker', parent: 't1', state: 'live', status: 'idle', agent: 'claude-code' },
  ] }) } }) as never)
  on('fs.read', () => ({ value: '{"phase": "implementing"}' }) as never)
  on('fs.list', () => ({ value: [] }) as never)
  on('agent.list', () => ({ value: [] }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('ui.open', (_, e) => {
    opened.push((e as { id: string }).id)
    return { value: { isPlaced: true } } as never
  })
  on('tool.call', () => ({ result: {} }) as never)
}

test('an hcorc session lists its panes and draws a dispatch, and leaves the pane closed', async ($, on) => {
  const opened: string[] = []
  const state: Record<string, unknown> = {}
  engine(on, 'hcorc', opened, state)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(opened).toEqual([])
  expect(JSON.stringify(state.members)).toContain('"name":"gentle-ai-worker"')
  expect(state.phase).toBe('implementing')
  await $.tool.call({ tool: 'Bash', command: 'hc send --if idle gentle-ai-worker "read /h/.local/state/orc/reports/handoffs/gentle-ai-worker-x.md"' })
  expect(JSON.stringify(state.flows)).toContain('"target":"gentle-ai-worker","dir":"out"')
})

test('openPane opens the pane when an orchestrator session starts', { options: { openPane: true } }, async ($, on) => {
  const opened: string[] = []
  engine(on, 'hcorc', opened, {})
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(opened).toContain('orc-graph')
})

test('a wait sent to the background or refused draws no answer', async ($, on) => {
  const state: Record<string, unknown> = {}
  engine(on, 'hcorc', [], state)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'hc wait gentle-ai-worker --timeout 270', run_in_background: true })
  expect(JSON.stringify(state.flows ?? [])).not.toContain('"dir":"in"')
})

test('any other session stays without the pane', async ($, on) => {
  const opened: string[] = []
  engine(on, 'general-purpose', opened)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(opened).toEqual([])
})

test('the herdorc state file and session match orc_state.py', async () => {
  expect(herdorcStatePath('/h', 'orc test', 'w1', 'w1:p1')).toBe('/h/.local/state/orc/herdorc-orc_test-w1.pane-w1_p1.json')
  expect(herdrSessionOf(undefined, '/x/herdr/sessions/review/herdr.sock')).toBe('review')
  expect(herdrSessionOf('named', '/x/herdr/sessions/review/herdr.sock')).toBe('named')
  expect(herdrSessionOf(undefined, '/x/herdr/herdr.sock')).toBe('default')
})

test('ensure only logs confirmed handoffs; comments are not commands', async () => {
  const r = (w: string) => (roleOf(w) ? w : undefined)
  const f = bashFlows('orc.py ensure review-risk --launch claude --handoff /r/h.md', r)
  expect(f.out).toEqual([])
  expect(f.handoffs).toEqual([{ role: 'review-risk' }])
  expect(confirmedHandoffs('{\n "name": "review-risk-2",\n "prompt_sent": true\n}', f.handoffs)).toEqual(['review-risk-2'])
  expect(confirmedHandoffs('{"name": "review-risk-adv", "prompt_sent": true}', f.handoffs)).toEqual([])
  expect(confirmedHandoffs('handoff file not found', f.handoffs)).toEqual([])
  const named = bashFlows('orc.py ensure review-risk --name review-risk-2 --launch claude --handoff /r/h.md', r)
  expect(named.out).toEqual([])
  expect(confirmedHandoffs('{"name":"review-risk-2","prompt_sent":false}', named.handoffs)).toEqual([])
  expect(confirmedHandoffs('{"name":"review-risk-2","prompt_delivered_at_launch":true}', named.handoffs)).toEqual(['review-risk-2'])
  expect(bashFlows('echo hi # hc send gentle-ai-worker x\nhc send gentle-ai-verify go', r).out).toEqual(['gentle-ai-verify'])
})

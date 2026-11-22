import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { bashFlows, hcSenders, junction, layoutCards, layoutTree, paneOfFile } from './graph'
import type { Run } from './graph'
import { normStatus, parseHc, parseHerdr, roleOf } from './roster'
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
  const members = parseHerdr(agents, state, 'orc', new Set(['w1:p2', 'w1:p3']))
  expect(members.map(m => m.name)).toEqual(['gentle-ai-worker'])
  expect(members[0]?.ctxKey).toBe('herdr-orc-w1_p2')
})

test('the orchestrator commands that pass work out, and those that wait for the answer', async () => {
  const r = known(['gentle-ai-worker'])
  expect(bashFlows('hc send --if idle gentle-ai-worker "If you have not read x; then read /r/h.md"', r).out).toEqual(['gentle-ai-worker'])
  const p = bashFlows('herdr agent prompt gentle-ai-explore "go" --wait --timeout 270000', r)
  expect(p.out).toEqual(['gentle-ai-explore'])
  expect(p.awaits).toEqual([{ target: 'gentle-ai-explore', timeoutMs: 270_000 }])
  expect(bashFlows('/repo/shared/bin/orc.py --as hcorc ensure gentle-ai-verify --name gentle-ai-verify-2 --launch claude --handoff /r/h.md', r).out)
    .toEqual(['gentle-ai-verify-2'])
  expect(bashFlows('hc wait gentle-ai-worker --timeout 270', r).awaits).toEqual([{ target: 'gentle-ai-worker', timeoutMs: 270_000 }])
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

test('an hcorc session opens the pane, lists its panes and draws a dispatch', async ($, on) => {
  const opened: string[] = []
  const state: Record<string, unknown> = {}
  engine(on, 'hcorc', opened, state)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(opened).toContain('orc-graph')
  expect(JSON.stringify(state.members)).toContain('"name":"gentle-ai-worker"')
  expect(state.phase).toBe('implementing')
  await $.tool.call({ tool: 'Bash', command: 'hc send --if idle gentle-ai-worker "read /h/.local/state/orc/reports/handoffs/gentle-ai-worker-x.md"' })
  expect(JSON.stringify(state.flows)).toContain('"target":"gentle-ai-worker","dir":"out"')
})

test('any other session stays without the pane', async ($, on) => {
  const opened: string[] = []
  engine(on, 'general-purpose', opened)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(opened).toEqual([])
})

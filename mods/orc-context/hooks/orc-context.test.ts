import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { bar, buildRows, compactHeadroom, levelColor, parseReport, renderRows, stepTokens, windowFor } from './context'
import type { Run } from './context'

const width = (runs: Run[]) => runs.reduce((n, r) => n + [...r.text].length, 0)
const text = (runs: Run[]) => runs.map(r => r.text).join('')

test('a report file is read only when it holds the figures', async () => {
  expect(parseReport('hc-t7', '{"tokens": 31000, "window": 200000, "at": 5, "model": "claude-sonnet-5-5"}'))
    .toEqual({ key: 'hc-t7', tokens: 31_000, window: 200_000, at: 5, model: 'claude-sonnet-5-5' })
  expect(parseReport('hc-t7', '{"tokens": 31000}')).toBeUndefined()
  expect(parseReport('hc-t7', 'nope')).toBeUndefined()
})

test('a subagent context is what it sent plus what it answered, in its model window', async () => {
  expect(stepTokens({ input_tokens: 10, cache_read_input_tokens: 1_000, cache_creation_input_tokens: 200, output_tokens: 50 })).toBe(1_260)
  const main = { tokens: 1, window: 1_000_000, model: 'claude-opus-5-5' }
  expect(windowFor('claude-opus-5-5', main)).toBe(1_000_000)
  expect(windowFor('claude-haiku-5-5', main)).toBe(200_000)
  expect(windowFor('claude-sonnet-5-5[1m]', null)).toBe(1_000_000)
})

test('bars fill in eighths and take the level colour', async () => {
  expect(bar(0.5, 10)).toEqual({ fill: '█████', rest: '░░░░░' })
  expect(bar(0.55, 10).fill).toBe('█████▌')
  expect(bar(2, 4)).toEqual({ fill: '████', rest: '' })
  expect([levelColor(10), levelColor(60), levelColor(90)]).toEqual(['success', 'warning', 'error'])
})

const view = () => buildRows({
  agent: 'hcorc',
  now: 1_000_000,
  main: { tokens: 118_000, window: 200_000, model: 'claude-opus-5-5', compactAt: 167_000 },
  members: [
    { name: 'gentle-ai-explore', role: 'gentle-ai-explore', address: 't8', cli: 'claude-code', status: 'working', ctxKey: 'hc-t8' },
    { name: 'gentle-ai-worker', role: 'gentle-ai-worker', address: 't7', cli: 'codex', status: 'idle', ctxKey: 'hc-t7' },
    { name: 'gentle-ai-verify', role: 'gentle-ai-verify', address: 't9', cli: 'claude-code', status: 'idle', ctxKey: 'hc-t9' },
  ],
  panes: [{ key: 'hc-t8', tokens: 31_000, window: 200_000, model: 'claude-sonnet-5-5', at: 999_000, compactAt: 167_000 }],
  subs: [{ agentId: 'a1', type: 'Explore', label: 'find auth', model: 'claude-haiku-5-5', tokens: 18_000, status: 'done', since: 990_000 }],
})

test('a row per agent: the orchestrator, its panes (reported or not) and its subagents', async () => {
  const v = view()
  expect(v.rows.map(r => r.label)).toEqual(['hcorc', 'explore', 'worker', 'verify', 'Explore'])
  expect(v.total).toBe(118_000 + 31_000 + 18_000)
  const lines = renderRows(v, 80).map(text)
  expect(lines[0]).toContain('total 167k')
  expect(lines[1]).toContain('118k/200k')
  expect(lines[1]).toContain('59%')
  expect(lines[1]).toContain('49k to compact')
  expect(lines[2]).toContain('sonnet-5-5 · 136k to compact')
  expect(lines[3]).toContain('codex · does not report')
  expect(lines[4]).toContain('claude-code · no report yet')
  expect(lines[5]).toContain('done · haiku-5-5')
  for (const runs of renderRows(v, 80)) expect(width(runs) <= 80).toBe(true)
  for (const runs of renderRows(v, 30)) expect(width(runs) <= 30).toBe(true) // the bar gives way when narrow
})

test('the headroom runs to the session own threshold, past its last answer, and only where it compacts', async () => {
  expect(compactHeadroom({ tokens: 100_000, output: 25_000, compactAt: 167_000 })).toBe(42_000)
  expect(compactHeadroom({ tokens: 170_000, compactAt: 167_000 })).toBe(0)
  expect(compactHeadroom({ tokens: 100_000 })).toBeUndefined() // auto-compaction off, or an older pane
  expect(parseReport('hc-t7', '{"tokens": 1, "window": 2, "at": 3, "output": 4, "compactAt": 5}')).toEqual({ key: 'hc-t7', tokens: 1, window: 2, at: 3, model: undefined, output: 4, compactAt: 5 })
  const off = buildRows({ agent: 'hcorc', now: 0, main: { tokens: 118_000, window: 200_000 }, members: [], panes: [], subs: [] })
  expect(renderRows(off, 80).map(text)[1]).not.toContain('to compact')
})

test('a stale report keeps its age in sight on an 80-column pane', async () => {
  const v = buildRows({
    agent: 'hcorc', now: 10_000_000, main: null, subs: [],
    members: [{ name: 'gentle-ai-explore', role: 'gentle-ai-explore', address: 't8', cli: 'claude-code', status: 'idle', ctxKey: 'hc-t8' }],
    panes: [{ key: 'hc-t8', tokens: 31_000, window: 200_000, model: 'claude-sonnet-5-5', at: 10_000_000 - 12 * 60_000, compactAt: 167_000 }],
  })
  expect(renderRows(v, 80).map(text)[2]).toContain('sonnet-5-5 · 12m ago')
})

type Written = { plugin?: string; key?: string; value?: unknown }

const engine = (on: Parameters<TestBody>[1], env: Record<string, string>, state: Record<string, unknown>, opened: string[], written: string[]) => {
  on('state.set', (_, e, next) => {
    const w = e as Written
    if (w.plugin === 'orc-context' && w.key) state[w.key] = w.value
    return next(e)
  })
  mock.env(on, { HOME: '/h', ...env })
  mock.clock(on, { now: 1_000_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.end', (_, e) => ({ sessionId: (e as { sessionId?: string }).sessionId ?? 's' }) as never)
  on('session.usage', (_, e) => ({ value: { startedAt: 0, rateLimits: [], context: {
    tokens: 50_000, window: 200_000, percent: 25,
    ...((e as { breakdown?: string }).breakdown ? { breakdown: { isAutoCompactEnabled: true, autoCompactThreshold: 167_000 } } : {}),
  } } }) as never)
  on('process.run', () => ({ value: { exitCode: 0, stderr: '', stdout: JSON.stringify({ terminals: [
    { address: 't7', name: 'gentle-ai-worker', parent: 't1', state: 'live', status: 'working', agent: 'claude-code' },
  ] }) } }) as never)
  on('fs.read', () => ({ value: '{"tokens": 42000, "window": 200000, "at": 999000, "model": "claude-sonnet-5-5"}' }) as never)
  on('fs.write', (_, e) => {
    const w = e as { path: string; text: string }
    written.push(w.path, w.text)
    return { value: undefined } as never
  })
  on('agent.list', () => ({ value: [] }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('ui.open', (_, e) => {
    opened.push((e as { id: string }).id)
    return { value: { isPlaced: true } } as never
  })
}

test('an hcorc session reads its own window and its panes reports, and leaves the pane closed', async ($, on) => {
  const state: Record<string, unknown> = {}
  const opened: string[] = []
  engine(on, { CLAUDE_CODE_AGENT: 'hcorc', HC_TERMINAL_ID: 't1' }, state, opened, [])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(opened).toEqual([])
  expect((state.main as { value?: unknown }).value).toEqual({ tokens: 50_000, window: 200_000 })
  expect(JSON.stringify(state.members)).toContain('"ctxKey":"hc-t7"')
  expect(JSON.stringify(state.panes)).toContain('"key":"hc-t7","tokens":42000')
})

test('openPane opens the pane when an orchestrator session starts', { options: { openPane: true } }, async ($, on) => {
  const opened: string[] = []
  engine(on, { CLAUDE_CODE_AGENT: 'hcorc', HC_TERMINAL_ID: 't1' }, {}, opened, [])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(opened).toEqual(['orc-context'])
})

test('a role pane that ends its session withdraws its report', async ($, on) => {
  const written: string[] = []
  engine(on, { HC_TERMINAL_ID: 't7' }, {}, [], written)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 's', resume: {} } as never)
  expect(written).toContain('/h/.local/state/orc/ctx/hc-t7.json')
})

test('a role pane opens nothing', async ($, on) => {
  const opened: string[] = []
  engine(on, { HC_TERMINAL_ID: 't7' }, {}, opened, [])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(opened).toEqual([])
})

test('a role pane reports its threshold and its last answer after each request', async ($, on) => {
  const written: string[] = []
  engine(on, { HC_TERMINAL_ID: 't7' }, {}, [], written)
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: { model: 'claude-sonnet-5-5', input_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 3_000 } } as never
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude-sonnet-5-5' } as never)
  for await (const _ of stream) { /* drain */ }
  const body = written[written.indexOf('/h/.local/state/orc/ctx/hc-t7.json') + 1] ?? ''
  expect(JSON.parse(body)).toEqual({ tokens: 50_000, window: 200_000, model: 'claude-sonnet-5-5', output: 3_000, compactAt: 167_000, at: 1_000_000 })
})

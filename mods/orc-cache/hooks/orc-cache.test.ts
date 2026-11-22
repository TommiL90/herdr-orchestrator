import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import {
  decideTtl, missReason, observeTtl, parseWait, phaseFile, remainingMs, suggestedTimeout,
} from './cache'

const sample = (startedAt: number, read: number, write: number, fresh = 100) =>
  ({ startedAt, model: 'claude-opus-5-5', read, write, fresh })

test('the TTL follows explicit configuration, then timing, then the account', async () => {
  expect(decideTtl({ option: '1h', force5m: '1', windows: [] }).ttl).toBe('1h')
  expect(decideTtl({ option: 'auto', force5m: 'true', enable1h: '1', windows: [] }).source).toBe('FORCE_PROMPT_CACHING_5M')
  expect(decideTtl({ option: 'auto', ttlVar: '1h', windows: [] }).source).toBe('CLAUDE_CODE_PROMPT_CACHE_TTL')
  expect(decideTtl({ option: 'auto', setting: '5m', enable1h: '1', windows: [] }).ttl).toBe('5m')
  expect(decideTtl({ option: 'auto', observed: '5m', windows: [{ kind: 'five_hour', percentUsed: 10 }] }).source).toBe('request timing')
  expect(decideTtl({ option: 'auto', windows: [{ kind: 'five_hour', percentUsed: 10 }] }).ttl).toBe('1h')
  expect(decideTtl({ option: 'auto', windows: [{ kind: 'seven_day', percentUsed: 100 }] }).ttl).toBe('5m')
  expect(decideTtl({ option: 'auto', windows: [] }).source).toBe('default')
})

test('waits are read in each tool own unit, unbounded ones as Infinity', async () => {
  expect(parseWait('hc wait --children any --timeout 540', false)?.ms).toBe(540_000)
  expect(parseWait('hc wait fix-auth --timeout=270', false)?.ms).toBe(270_000)
  expect(parseWait('herdr agent prompt w "go" --wait --timeout 270000', false)?.ms).toBe(270_000)
  expect(parseWait('herdr agent wait w --timeout 540000', false)?.tool).toBe('herdr')
  expect(parseWait('hc wait --children any', true)?.ms).toBe(Infinity)
  expect(parseWait('hc wait --children any', false, 300_000)?.ms).toBe(300_000)
  expect(parseWait('rtk hc ls && hc wait x --timeout 100; hc wait y --timeout 900', false)?.ms).toBe(900_000)
  expect(parseWait('hc ls --json', false)).toBeUndefined()
  expect(parseWait('echo x # hc wait y --timeout 900', false)).toBeUndefined()
  expect(parseWait('echo x # note\nhc wait y --timeout 900', false)?.ms).toBe(900_000)
  expect(parseWait('herdr pane list', false)).toBeUndefined()
  // A quoted "wait" is a message, not a wait; a --timeout belongs to its own command.
  expect(parseWait('herdr agent prompt worker "please wait for tests"', true)).toBeUndefined()
  expect(parseWait('git commit -m "fix hc wait timeout"', true)).toBeUndefined()
  expect(parseWait('hc wait x && echo --timeout 10', true)?.ms).toBe(Infinity)
  expect(parseWait('hc send --wait t7 "go" --timeout 600', false)?.ms).toBe(600_000)
  expect(parseWait('cd /r\nherdr --session orc agent wait w --timeout 900000', false)?.ms).toBe(900_000)
  expect(suggestedTimeout('hc', '5m')).toBe('--timeout 270')
  expect(suggestedTimeout('herdr', '5m')).toBe('--timeout 270000')
})

test('timing proves 1h, and a lapse after 5 minutes reads as 5m', async () => {
  const a = sample(0, 50_000, 1_000)
  expect(observeTtl(a, sample(600_000, 50_000, 500), null)).toBe('1h')
  expect(observeTtl(a, sample(600_000, 0, 51_000), null)).toBe('5m')
  expect(observeTtl(a, sample(600_000, 0, 51_000), '1h')).toBe('1h')
  expect(observeTtl(a, sample(200_000, 0, 51_000), null)).toBeNull()
})

test('a miss names its cause; a compaction is not one', async () => {
  const a = sample(0, 50_000, 1_000)
  expect(missReason(a, sample(400_000, 0, 51_000), '5m')).toBe('the 5m cache had lapsed')
  expect(missReason(a, sample(60_000, 0, 51_000), '5m')).toBe('the prompt prefix changed')
  expect(missReason(a, sample(60_000, 0, 10_000), '5m')).toBeUndefined()
  expect(missReason(a, sample(60_000, 50_000, 900), '5m')).toBeUndefined()
  expect(remainingMs(sample(0, 10, 0), '5m', 60_000)).toBe(240_000)
  expect(remainingMs(sample(0, 0, 0), '5m', 60_000)).toBe(0)
})

test('the phase file matches orc.py', async () => {
  expect(phaseFile('/h', 'hcorc', { hcTerminal: 't7' })).toBe('/h/.local/state/orc/phase-hcorc-t7.json')
  expect(phaseFile('/h', 'herdorc', { herdrSession: 'orc test', herdrPane: 'w1:p1' }))
    .toBe('/h/.local/state/orc/phase-herdorc-orc_test-w1_p1.json')
  expect(phaseFile('/h', 'herdorc', {})).toBe('/h/.local/state/orc/phase-herdorc-default-none.json')
  expect(phaseFile('/h', 'herdorc', { herdrSocket: '/x/herdr/sessions/review/herdr.sock', herdrPane: 'w1:p1' }))
    .toBe('/h/.local/state/orc/phase-herdorc-review-w1_p1.json')
})

const engine = (on: Parameters<TestBody>[1], agent: string) => {
  mock.env(on, { CLAUDE_CODE_AGENT: agent, HOME: '/h', HC_TERMINAL_ID: 't7' })
  mock.clock(on, { now: 1_000_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, rateLimits: [] } }) as never)
  on('settings.read', () => ({ value: {} }) as never)
  on('fs.read', () => ({ value: '{"phase": "implementing", "source": "inferred"}' }) as never)
  on('tool.call', () => ({ result: {} }) as never)
}

test('in an hcorc session a wait longer than the 5m cache is sent back with a shorter timeout', async ($, on) => {
  engine(on, 'hcorc')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const denied = JSON.stringify(await $.tool.call({ tool: 'Bash', command: 'hc wait --children any --timeout 540' }))
  expect(denied).toContain('--timeout 270')
  const allowed = JSON.stringify(await $.tool.call({ tool: 'Bash', command: 'hc wait --children any --timeout 270' }))
  expect(allowed).not.toContain('orc-cache')
})

test('outside the orchestrators the guard stays out of the way', async ($, on) => {
  engine(on, 'general-purpose')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ran = JSON.stringify(await $.tool.call({ tool: 'Bash', command: 'hc wait --children any --timeout 540' }))
  expect(ran).not.toContain('orc-cache')
})

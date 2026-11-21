// Pure logic of orc-cache: no `$`, so the test file exercises it directly.
// The TTL rules follow Claude Code's own order (as the prompt-cache-control mod
// of davila7/claude-code-templates documents them), rewritten for this mod.
import type { Policy, Sample, Ttl } from '../types'

export const ORCHESTRATORS = ['hcorc', 'herdorc'] as const
const SLACK_MS = 10_000
/** A wait must end this long before the entry lapses, for the next request to start in time. */
export const WAIT_MARGIN_MS = 30_000

export function ttlMs(ttl: Ttl): number {
  return ttl === '1h' ? 3_600_000 : 300_000
}

function asTtl(v: unknown): Ttl | undefined {
  return v === '5m' || v === '1h' ? v : undefined
}

function isOn(v: string | undefined): boolean {
  return v !== undefined && /^(1|true)$/i.test(v.trim())
}

export type TtlInputs = {
  option: unknown
  force5m?: string
  ttlVar?: string
  setting?: unknown
  enable1h?: string
  observed?: Ttl | null
  /** Rate-limit windows from $.session.usage(); present only on a subscription. */
  windows: readonly { kind: string; percentUsed: number }[]
}

/** The lifetime in force: explicit configuration, then observation, then the account default. */
export function decideTtl(i: TtlInputs): Policy {
  const pinned = asTtl(i.option)
  if (pinned) return { ttl: pinned, source: 'mod option' }
  if (isOn(i.force5m)) return { ttl: '5m', source: 'FORCE_PROMPT_CACHING_5M' }
  const fromVar = asTtl(i.ttlVar?.trim())
  if (fromVar) return { ttl: fromVar, source: 'CLAUDE_CODE_PROMPT_CACHE_TTL' }
  const fromSetting = asTtl(i.setting)
  if (fromSetting) return { ttl: fromSetting, source: 'promptCacheTtl setting' }
  if (isOn(i.enable1h)) return { ttl: '1h', source: 'ENABLE_PROMPT_CACHING_1H' }
  if (i.observed) return { ttl: i.observed, source: 'request timing' }
  const windows = i.windows.filter(w => w.kind === 'five_hour' || w.kind === 'seven_day')
  if (windows.some(w => w.percentUsed >= 100)) return { ttl: '5m', source: 'usage credits' }
  if (windows.length > 0) return { ttl: '1h', source: 'subscription' }
  return { ttl: '5m', source: 'default' }
}

export function promptTokens(s: Sample): number {
  return s.fresh + s.read + s.write
}

export function hitRatio(s: Sample): number {
  const total = promptTokens(s)
  return total > 0 ? s.read / total : 0
}

/** Time left on the entry the last request read or wrote; 0 when it used none. */
export function remainingMs(s: Sample, ttl: Ttl, now: number): number {
  if (s.read + s.write === 0) return 0
  return Math.max(0, s.startedAt + ttlMs(ttl) - now)
}

/**
 * Refines the lifetime from two requests in a row. A large read after a gap
 * longer than 5 minutes proves 1h; a full rewrite after such a gap suggests 5m,
 * unless 1h was already proven (a later miss is then a changed prefix).
 */
export function observeTtl(prev: Sample | null, cur: Sample, known: Ttl | null): Ttl | null {
  if (!prev || prev.model !== cur.model || prev.read + prev.write === 0) return known
  const gap = cur.startedAt - prev.startedAt
  if (gap <= ttlMs('5m') + SLACK_MS) return known
  const before = promptTokens(prev)
  if (cur.read >= before * 0.5) return '1h'
  if (known === '1h') return known
  if (cur.write > 0 && promptTokens(cur) >= before * 0.7 && gap < ttlMs('1h') + SLACK_MS) return '5m'
  return known
}

/** Why the current request rewrote the prefix, or undefined when it was no miss. */
export function missReason(prev: Sample | null, cur: Sample, ttl: Ttl): string | undefined {
  if (!prev) return undefined
  const before = promptTokens(prev)
  if (before === 0 || promptTokens(cur) < before * 0.7) return undefined // compact or clear
  if (cur.read >= before * 0.5 || cur.write === 0) return undefined
  if (prev.model !== cur.model) return 'the model changed'
  if (cur.startedAt - prev.startedAt > ttlMs(ttl)) return `the ${ttl} cache had lapsed`
  return 'the prompt prefix changed'
}

export type Wait = {
  /** How long the wait can block, in ms; Infinity when nothing bounds it. */
  ms: number
  tool: 'hc' | 'herdr'
  hasTimeout: boolean
}

function timeoutValue(tokens: readonly string[], from: number): number | undefined {
  for (let i = from; i < tokens.length; i++) {
    const t = tokens[i] ?? ''
    const raw = t === '--timeout' ? tokens[i + 1] : t.startsWith('--timeout=') ? t.slice(10) : undefined
    if (raw === undefined) continue
    const n = Number(raw.replace(/^["']|["']$/g, ''))
    if (Number.isFinite(n) && n > 0) return n
  }
  return undefined
}

/**
 * The longest hc/herdr wait in a Bash command: `hc wait` takes --timeout in
 * seconds, herdr's waits (`agent wait`, `agent prompt --wait`, `pane
 * wait-output`) in milliseconds. Without --timeout, a foreground wait is
 * bounded by the Bash tool's own timeout and a background one by nothing.
 */
export function parseWait(command: string, runInBackground: boolean, bashTimeoutMs?: number): Wait | undefined {
  const tokens = command.split(/[\s;&|()]+/).filter(Boolean)
  let found: Wait | undefined
  for (let i = 0; i < tokens.length; i++) {
    const prog = (tokens[i] ?? '').split('/').pop()
    let tool: Wait['tool'] | undefined
    let end = tokens.length
    for (let j = i + 1; j < tokens.length; j++) {
      const p = (tokens[j] ?? '').split('/').pop()
      if (p === 'hc' || p === 'herdr' || p === 'herdr-app') { end = j; break }
    }
    const args = tokens.slice(i + 1, end)
    if (prog === 'hc' && args[0] === 'wait') tool = 'hc'
    if (prog === 'herdr' && args.some(a => a === 'wait' || a === '--wait' || a === 'wait-output')) tool = 'herdr'
    if (!tool) continue
    const value = timeoutValue(args, 0)
    const ms = value !== undefined
      ? (tool === 'hc' ? value * 1000 : value)
      : runInBackground ? Infinity : (bashTimeoutMs ?? 120_000)
    const wait = { ms, tool, hasTimeout: value !== undefined }
    if (!found || wait.ms > found.ms) found = wait
  }
  return found
}

/** The --timeout to suggest for a wait that must end inside `ttl`, in the tool's own unit. */
export function suggestedTimeout(tool: Wait['tool'], ttl: Ttl): string {
  const ms = ttlMs(ttl) - WAIT_MARGIN_MS
  return tool === 'hc' ? `--timeout ${Math.floor(ms / 1000)}` : `--timeout ${ms}`
}

/** orc.py's phase file name for this orchestrator (shared/bin/orc.py _phase_file). */
export function phaseFile(home: string, agent: string, ids: { hcTerminal?: string; herdrSession?: string; herdrPane?: string }): string {
  const me = agent === 'hcorc'
    ? ids.hcTerminal
    : `${ids.herdrSession || 'default'}-${ids.herdrPane || 'none'}`
  const safe = (me || 'none').replace(/[^A-Za-z0-9_.-]/g, '_')
  return `${home}/.local/state/orc/phase-${agent}-${safe}.json`
}

export function agentOf(raw: string | undefined): string | null {
  const name = (raw ?? '').split(':').pop() ?? ''
  return (ORCHESTRATORS as readonly string[]).includes(name) ? name : null
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

export function fmtClock(ms: number): string {
  if (!Number.isFinite(ms)) return 'no limit'
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

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

// shellCommands and program are copies of orc-graph's (hooks/graph.ts): change both.
/**
 * Shell words per simple command: quotes and escapes honoured, `; & | ( )` and
 * newlines split commands, backslash-newline continues one.
 */
export function shellCommands(command: string): string[][] {
  command = command.replace(/\\\r?\n/g, ' ')
  const cmds: string[][] = []
  let words: string[] = []
  let word = ''
  let inWord = false
  let quote: '"' | "'" | null = null
  const endWord = () => {
    if (inWord) words.push(word)
    word = ''
    inWord = false
  }
  const endCmd = () => {
    endWord()
    if (words.length) cmds.push(words)
    words = []
  }
  for (let i = 0; i < command.length; i++) {
    const c = command[i] ?? ''
    if (quote) {
      if (c === quote) quote = null
      else if (c === '\\' && quote === '"' && i + 1 < command.length) word += command[++i] ?? ''
      else word += c
      continue
    }
    if (c === '#' && !inWord) { // a comment runs to the end of the line; the newline still ends the command
      while (i + 1 < command.length && command[i + 1] !== '\n') i++
      continue
    }
    if (c === '"' || c === "'") { quote = c; inWord = true; continue }
    if (c === '\\' && i + 1 < command.length) { word += command[++i] ?? ''; inWord = true; continue }
    if (';&|()\n'.includes(c)) { endCmd(); continue } // before the whitespace test: \n ends a command
    if (/\s/.test(c)) { endWord(); continue }
    word += c
    inWord = true
  }
  endCmd()
  return cmds
}

const WRAPPERS = new Set(['rtk', 'command', 'exec', 'env', 'nohup', 'time'])

/** The words of a simple command from its program on: env assignments and wrappers dropped. */
function program(words: readonly string[]): string[] {
  let i = 0
  while (i < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i] ?? '') || WRAPPERS.has(words[i] ?? ''))) i++
  return words.slice(i)
}

function timeoutValue(words: readonly string[]): number | undefined {
  for (let i = 0; i < words.length; i++) {
    const w = words[i] ?? ''
    const raw = w === '--timeout' ? words[i + 1] : w.startsWith('--timeout=') ? w.slice(10) : undefined
    if (raw === undefined) continue
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) return n
  }
  return undefined
}

/** herdr's global options, before its subcommand. */
function dropHerdrGlobals(words: readonly string[]): string[] {
  let i = 1
  while (i < words.length && /^--(session|machine|remote)(=|$)/.test(words[i] ?? '')) i += (words[i] ?? '').includes('=') ? 1 : 2
  return [words[0] ?? '', ...words.slice(i)]
}

/**
 * The longest hc/herdr wait in a Bash command, read per simple command as shell
 * words (a quoted "wait" in a message is no wait, and a --timeout belongs to its
 * own command): `hc wait` and `hc send --wait` take --timeout in seconds,
 * herdr's waits (`agent wait`, `agent prompt --wait`, `pane wait-output`) in
 * milliseconds. Without --timeout, a foreground wait is bounded by the Bash
 * tool's own timeout and a background one by nothing.
 */
export function parseWait(command: string, runInBackground: boolean, bashTimeoutMs?: number): Wait | undefined {
  let found: Wait | undefined
  for (const raw of shellCommands(command)) {
    let w = program(raw)
    const prog = (w[0] ?? '').split('/').pop()
    if (prog === 'herdr') w = dropHerdrGlobals(w)
    let tool: Wait['tool'] | undefined
    if (prog === 'hc' && (w[1] === 'wait' || (w[1] === 'send' && w.includes('--wait')))) tool = 'hc'
    if (prog === 'herdr' && ((w[1] === 'agent' && w[2] === 'wait') || (w[1] === 'pane' && w[2] === 'wait-output')
      || (w[1] === 'agent' && w[2] === 'prompt' && w.includes('--wait')))) tool = 'herdr'
    if (!tool) continue
    const value = timeoutValue(w)
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
export function phaseFile(home: string, agent: string, ids: { hcTerminal?: string; herdrSession?: string; herdrSocket?: string; herdrPane?: string }): string {
  // herdr's session as orc_state.herdr_session(): HERDR_SESSION, else the socket path, else default.
  const session = ids.herdrSession || /[\\/]sessions[\\/]([^\\/]+)[\\/]herdr\.sock$/.exec(ids.herdrSocket ?? '')?.[1] || 'default'
  const me = agent === 'hcorc'
    ? ids.hcTerminal
    : `${session}-${ids.herdrPane || 'none'}`
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

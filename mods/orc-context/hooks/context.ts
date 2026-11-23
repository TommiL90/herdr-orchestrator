// Pure logic of orc-context: the report file, the rows the pane draws and
// their bars. No `$` here, so the test file exercises it directly.
import type { ThemeKey } from 'claude-code'

import type { CtxReport, MainCtx, Member, SubCtx, SubCtxStatus } from '../types'
import { shortName, stateDir } from './roster'

/** A report older than this is shown with its age. */
export const STALE_MS = 10 * 60_000
/** A finished subagent stays listed this long, then joins the footer's count. */
export const SUB_KEEP_MS = 10 * 60_000
const DEFAULT_WINDOW = 200_000
/**
 * Tokens left before the session compacts by itself: its own threshold (the
 * engine's `autoCompactThreshold`, absent when auto-compaction is off) less the
 * last request and the answer it got, which the next request carries too.
 */
export function compactHeadroom(r: { tokens?: number; output?: number; compactAt?: number }): number | undefined {
  if (r.tokens === undefined || r.compactAt === undefined) return undefined
  return Math.max(0, r.compactAt - r.tokens - (r.output ?? 0))
}

/** The headroom for a row's meta, or '' when the session does not compact by itself. */
function compactNote(r: { tokens?: number; output?: number; compactAt?: number }): string {
  const left = compactHeadroom(r)
  return left === undefined ? '' : `${fmtTokens(left)} to compact`
}

const num = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) ? x : undefined)

export function reportPath(home: string, key: string): string {
  return `${stateDir(home)}/ctx/${key}.json`
}

export function parseReport(key: string, text: string): CtxReport | undefined {
  try {
    const r = JSON.parse(text) as Partial<CtxReport>
    if (typeof r.tokens !== 'number' || typeof r.window !== 'number' || typeof r.at !== 'number' || r.window <= 0) return undefined
    return {
      key, tokens: r.tokens, window: r.window, at: r.at, model: typeof r.model === 'string' ? r.model : undefined,
      output: num(r.output), compactAt: num(r.compactAt),
    }
  } catch {
    return undefined
  }
}

/** A subagent's context after one request: what it sent plus what it answered. */
export function stepTokens(u: { input_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number; output_tokens: number }): number {
  return u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens + u.output_tokens
}

/** A subagent's window: the main one for the same model, 1M for a `[1m]` id, else 200k. */
export function windowFor(model: string | undefined, main: MainCtx | null): number {
  if (model && main?.model && model === main.model) return main.window
  if (model && /\[1m\]|-1m\b/i.test(model)) return 1_000_000
  return DEFAULT_WINDOW
}

export function subStatus(status: string): SubCtxStatus {
  if (status === 'pending' || status === 'running') return 'working'
  if (status === 'waiting') return 'blocked'
  if (status === 'idle') return 'idle'
  if (status === 'completed') return 'done'
  return 'failed'
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

function fmtAge(ms: number): string {
  const m = Math.round(ms / 60_000)
  return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`
}

/** A model id for display: `claude-opus-5-5` → `opus-5-5`. */
export function shortModel(model: string | undefined): string | undefined {
  return model?.replace(/^claude-/, '').replace(/-\d{8}$/, '')
}

export type Row = {
  id: string
  label: string
  tokens?: number
  window?: number
  /** What follows the numbers, dim. */
  meta: string
  /** Shown in place of the bar when there is no reading. */
  note?: string
  isSub: boolean
  isMain: boolean
}

export function buildRows(input: {
  agent: string
  main: MainCtx | null
  members: readonly Member[]
  panes: readonly CtxReport[]
  subs: readonly SubCtx[]
  now: number
}): { rows: Row[]; footer?: string; total: number } {
  const { main, now } = input
  const rows: Row[] = []
  rows.push({
    id: 'main', label: input.agent, isMain: true, isSub: false,
    tokens: main?.tokens, window: main?.window,
    meta: [shortModel(main?.model), main ? compactNote(main) : ''].filter(Boolean).join(' · '),
    note: main?.tokens === undefined ? 'no response yet' : undefined,
  })
  for (const m of input.members) {
    const r = input.panes.find(p => p.key === m.ctxKey)
    const cli = m.cli ?? 'no agent'
    if (r) {
      const age = now - r.at
      rows.push({
        id: m.name, label: shortName(m.name), isMain: false, isSub: false,
        tokens: r.tokens, window: r.window,
        // The age first: on a narrow pane it is what says the figures are old.
        meta: [shortModel(r.model) ?? cli, age > STALE_MS ? fmtAge(age) : '', compactNote(r)].filter(Boolean).join(' · '),
      })
    } else {
      const isClaude = /^claude(-code)?$/.test(m.cli ?? '')
      rows.push({
        id: m.name, label: shortName(m.name), isMain: false, isSub: false, meta: '',
        note: isClaude ? `${cli} · no report yet` : m.cli ? `${cli} · does not report` : 'no agent',
      })
    }
  }
  const shown = input.subs.filter(s => s.status === 'working' || s.status === 'blocked' || now - s.since < SUB_KEEP_MS)
  for (const s of shown) {
    rows.push({
      id: s.agentId, label: s.type, isMain: false, isSub: true,
      tokens: s.tokens, window: windowFor(s.model, main),
      meta: [s.status === 'working' ? 'working' : s.status, shortModel(s.model)].filter(Boolean).join(' · '),
    })
  }
  const folded = input.subs.length - shown.length
  const total = rows.reduce((sum, r) => sum + (r.tokens ?? 0), 0)
  return { rows, total, footer: folded > 0 ? `${folded} finished subagent${folded === 1 ? '' : 's'} hidden` : undefined }
}

export type Run = { text: string; color?: ThemeKey; bold?: boolean; dim?: boolean }

const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'] as const

/** A bar `width` cells wide filled to `fraction`, in eighths of a cell. */
export function bar(fraction: number, width: number): { fill: string; rest: string } {
  const f = Math.min(1, Math.max(0, fraction))
  const eighths = Math.round(f * width * 8)
  const full = Math.floor(eighths / 8)
  const part = EIGHTHS[eighths % 8] ?? ''
  const fill = '█'.repeat(full) + part
  return { fill, rest: '░'.repeat(Math.max(0, width - full - (part ? 1 : 0))) }
}

export function levelColor(pct: number): ThemeKey {
  return pct >= 80 ? 'error' : pct >= 50 ? 'warning' : 'success'
}

function pad(text: string, width: number, right = false): string {
  const chars = [...text]
  if (chars.length > width) return `${chars.slice(0, Math.max(0, width - 1)).join('')}…`
  const space = ' '.repeat(width - chars.length)
  return right ? space + text : text + space
}

/** The pane's lines: a header, a row per agent, then the footer. */
export function renderRows(view: { rows: Row[]; footer?: string; total: number }, width: number): Run[][] {
  const lines: Run[][] = []
  const total = `total ${fmtTokens(view.total)}`
  lines.push([
    { text: 'Context', bold: true },
    { text: pad(total, Math.max(0, width - 7), true), dim: true },
  ])
  const labelW = Math.min(Math.max(6, ...view.rows.map(r => [...r.label].length)), Math.max(6, Math.floor(width * 0.3)))
  const numsW = 9 // "118k/200k"
  const pctW = 4 // " 59%"
  const showBar = width >= labelW + numsW + pctW + 14
  const barW = showBar ? Math.min(24, width - labelW - numsW - pctW - 8 - 10) : 0
  const used = (line: Run[]) => line.reduce((n, x) => n + [...x.text].length, 0)
  /** What is left of the line, cut to the width. */
  const tail = (line: Run[], text: string) => {
    const room = width - used(line)
    return room > 0 ? ([...text].length > room ? pad(text, room) : text) : ''
  }
  for (const r of view.rows) {
    const line: Run[] = [{ text: `${pad(r.label, labelW)}  `, bold: r.isMain }]
    if (r.tokens === undefined || !r.window) {
      line.push({ text: tail(line, r.note ?? '—'), dim: true })
      lines.push(line)
      continue
    }
    const pct = Math.round((r.tokens / r.window) * 100)
    const color = levelColor(pct)
    if (showBar && barW > 0) {
      const b = bar(r.tokens / r.window, barW)
      line.push({ text: b.fill, color }, { text: b.rest, color: 'inactive', dim: true }, { text: '  ' })
    }
    line.push(
      { text: pad(`${fmtTokens(r.tokens)}/${fmtTokens(r.window)}`, numsW, true) },
      { text: pad(`${pct}%`, pctW, true), color, bold: pct >= 80 },
    )
    if (r.meta) line.push({ text: tail(line, `  ${r.meta}`), dim: true })
    lines.push(line)
  }
  if (view.footer) lines.push([{ text: pad(view.footer, Math.min(width, [...view.footer].length)), dim: true }])
  return lines
}

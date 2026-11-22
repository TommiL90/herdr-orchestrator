// Pure logic of orc-graph: which pane a tool call or message passes
// information to or from, and the cell grid the pane draws. No `$` here, so
// the test file exercises it directly.
import type { ThemeKey } from 'claude-code'

import type { Flow, FlowDir } from '../types'

import { roleOf, shortName } from './roster'

/** A flow is drawn moving for this long, then tinted until FLOW_RECENT_MS. */
export const FLOW_LIVE_MS = 4_000
export const FLOW_RECENT_MS = 20_000

export type { Flow, FlowDir }

// ---------- reading commands ----------

/** Shell words per simple command: quotes and escapes honoured, `; & | ( )` split commands. */
export function shellCommands(command: string): string[][] {
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
    if (c === '"' || c === "'") { quote = c; inWord = true; continue }
    if (c === '\\' && i + 1 < command.length) { word += command[++i] ?? ''; inWord = true; continue }
    if (/\s/.test(c)) { endWord(); continue }
    if (';&|()\n'.includes(c)) { endCmd(); continue }
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

function base(word: string | undefined): string {
  return (word ?? '').split('/').pop() ?? ''
}

/** The first argument after `from` that is no flag; `valued` flags take the next word. */
function firstArg(words: readonly string[], from: number, valued: ReadonlySet<string>): string | undefined {
  for (let i = from; i < words.length; i++) {
    const w = words[i] ?? ''
    if (w.startsWith('-')) {
      if (valued.has(w)) i++
      continue
    }
    return w
  }
  return undefined
}

function flagValue(words: readonly string[], flag: string): string | undefined {
  for (let i = 0; i < words.length; i++) {
    const w = words[i] ?? ''
    if (w === flag) return words[i + 1]
    if (w.startsWith(`${flag}=`)) return w.slice(flag.length + 1)
  }
  return undefined
}

export type BashFlows = {
  /** Panes this command hands work or a message to. */
  out: string[]
  /** Panes whose reply this command waits for: a flow back once it returns before its timeout. */
  awaits: { target: string; timeoutMs: number }[]
}

/**
 * Reads one Bash command of the orchestrator. `resolve` turns what the command
 * names (a pane name or address) into a known pane name, or undefined.
 */
export function bashFlows(command: string, resolve: (word: string) => string | undefined): BashFlows {
  const out: string[] = []
  const awaits: BashFlows['awaits'] = []
  for (const raw of shellCommands(command)) {
    const w = program(raw)
    const prog = base(w[0])
    if (prog === 'hc' && w[1] === 'send') {
      const t = resolve(firstArg(w, 2, new Set(['--if'])) ?? '')
      if (t) out.push(t)
    } else if (prog === 'hc' && w[1] === 'wait') {
      const t = resolve(firstArg(w, 2, new Set(['--timeout', '--children', '--for'])) ?? '')
      const s = Number(flagValue(w, '--timeout'))
      if (t) awaits.push({ target: t, timeoutMs: Number.isFinite(s) && s > 0 ? s * 1000 : Infinity })
    } else if (prog === 'herdr' && w[1] === 'agent' && w[2] === 'prompt') {
      const t = resolve(firstArg(w, 3, new Set(['--timeout'])) ?? '')
      if (t) {
        out.push(t)
        if (w.includes('--wait')) {
          const ms = Number(flagValue(w, '--timeout'))
          awaits.push({ target: t, timeoutMs: Number.isFinite(ms) && ms > 0 ? ms : Infinity })
        }
      }
    } else if (prog === 'herdr' && w[1] === 'pane' && /^(send-text|send-keys|run)$/.test(w[2] ?? '')) {
      const t = resolve(firstArg(w, 3, new Set()) ?? '')
      if (t) out.push(t)
    } else if (/^orc(\.py)?$/.test(prog) || (prog.startsWith('python') && base(w[1]) === 'orc.py')) {
      const at = w.indexOf('ensure')
      const role = at >= 0 ? w[at + 1] : undefined
      if (role && w.includes('--handoff')) {
        const t = resolve(flagValue(w, '--name') ?? role)
        if (t) out.push(t)
      }
    }
  }
  return { out, awaits }
}

/** The pane a report or handoff file names: `<pane-name>-<task-slug>.md`. */
export function paneOfFile(basename: string, names: readonly string[]): string | undefined {
  const known = [...names].sort((a, b) => b.length - a.length).find(n => basename.startsWith(`${n}-`) || basename === `${n}.md`)
  if (known) return known
  // No live pane by that name: read the role (and an `-<n>` copy number) off the name.
  for (let end = basename.indexOf('-'); end > 0; end = basename.indexOf('-', end + 1)) {
    const head = basename.slice(0, end)
    if (!roleOf(head)) continue
    const copy = /^-(\d+)-/.exec(basename.slice(end))
    return copy ? `${head}-${copy[1]}` : head
  }
  return undefined
}

/** The pane names in `<hc from="t7 gentle-ai-worker">` tags of a message hc delivered. */
export function hcSenders(text: string): string[] {
  return [...text.matchAll(/<hc from="[^"\s]*\s+([^"]+?)"/g)].map(m => (m[1] ?? '').trim()).filter(Boolean)
}

/** Keeps the newest flow per target and direction, and drops those past FLOW_RECENT_MS. */
export function addFlow(flows: readonly Flow[], f: Flow): Flow[] {
  return [...flows.filter(x => (x.target !== f.target || x.dir !== f.dir) && f.at - x.at < FLOW_RECENT_MS), f]
}

export function lastFlow(flows: readonly Flow[], target: string, now: number): (Flow & { isLive: boolean }) | undefined {
  let best: Flow | undefined
  for (const f of flows) if (f.target === target && now - f.at < FLOW_RECENT_MS && (!best || f.at > best.at)) best = f
  return best && { ...best, isLive: now - best.at < FLOW_LIVE_MS }
}

// ---------- the grid ----------

export type Style = { color?: ThemeKey; bold?: boolean; dim?: boolean }
export type Run = Style & { text: string }

type Cell = Style & { ch: string }

export class Grid {
  readonly cells: Cell[][]
  constructor(readonly width: number, height: number) {
    this.cells = Array.from({ length: height }, () => Array.from({ length: width }, () => ({ ch: ' ' })))
  }
  put(row: number, col: number, text: string, style: Style = {}): void {
    const line = this.cells[row]
    if (!line) return
    const chars = [...text]
    for (let i = 0; i < chars.length; i++) {
      const c = col + i
      if (c < 0 || c >= this.width) continue
      line[c] = { ch: chars[i] ?? ' ', ...style }
    }
  }
  /** Each row as runs of one style, trailing blanks dropped. */
  runs(): Run[][] {
    return this.cells.map(line => {
      let end = line.length
      while (end > 0 && line[end - 1]?.ch === ' ' && !line[end - 1]?.color) end--
      const out: Run[] = []
      for (const cell of line.slice(0, end)) {
        const prev = out[out.length - 1]
        if (prev && prev.color === cell.color && prev.bold === cell.bold && prev.dim === cell.dim) prev.text += cell.ch
        else out.push({ text: cell.ch, color: cell.color, bold: cell.bold, dim: cell.dim })
      }
      return out
    })
  }
}

/** The box-drawing junction for the lines that meet in a cell. */
export function junction(up: boolean, down: boolean, left: boolean, right: boolean): string {
  const key = `${+up}${+down}${+left}${+right}`
  const table: Record<string, string> = {
    '1111': '┼', '1101': '├', '1110': '┤', '1100': '│', '0111': '┬', '0101': '╭', '0110': '╮',
    '1011': '┴', '1001': '╰', '1010': '╯', '0011': '─', '0001': '─', '0010': '─', '1000': '│', '0100': '│',
  }
  return table[key] ?? ' '
}

export type EdgeKind = 'idle' | 'out' | 'in' | 'blocked'

export type NodeView = {
  id: string
  label: string
  meta: string
  glyph: string
  glyphStyle: Style
  state: string
  stateStyle: Style
  edge: EdgeKind
  isLive: boolean
  /** Internal subagents are wired with a dotted line. */
  isDotted: boolean
}

export type GraphView = {
  agent: string
  phase: string | null
  summary: string
  nodes: NodeView[]
  /** A row under the nodes, e.g. finished subagents collapsed. */
  footer?: string
  empty?: string
}

const EDGE_STYLE: Record<EdgeKind, Style> = {
  idle: { color: 'inactive' },
  out: { color: 'claude' },
  in: { color: 'success' },
  blocked: { color: 'warning' },
}

const PRIORITY: Record<EdgeKind, number> = { idle: 0, blocked: 1, in: 2, out: 3 }

function strongest(nodes: readonly NodeView[]): NodeView | undefined {
  return nodes.reduce<NodeView | undefined>((a, n) => (!a || PRIORITY[n.edge] > PRIORITY[a.edge] ? n : a), undefined)
}

function pad(text: string, width: number): string {
  const chars = [...text]
  if (width <= 0) return ''
  if (chars.length > width) return `${chars.slice(0, Math.max(0, width - 1)).join('')}…`
  return text + ' '.repeat(width - chars.length)
}

/** One edge from column `from` to `to` (inclusive) on `row`, with a moving packet when live. */
function drawEdge(g: Grid, row: number, from: number, to: number, n: NodeView, frame: number): void {
  const style = EDGE_STYLE[n.edge]
  const line = n.isDotted ? '┄' : '─'
  for (let c = from; c <= to; c++) g.put(row, c, line, { ...style, dim: n.edge === 'idle' ? true : undefined })
  if (n.edge === 'out' || n.edge === 'in') {
    const len = to - from + 1
    if (n.isLive && len > 3) {
      const span = len - 2
      const step = frame % span
      const at = n.edge === 'out' ? from + step : to - 1 - step
      g.put(row, at, '━━', { ...style, bold: true })
    }
    if (n.edge === 'out') g.put(row, to, '▶', { ...style, bold: true })
    else g.put(row, from, '◀', { ...style, bold: true })
  }
}

function nodeColumns(nodes: readonly NodeView[], width: number): { label: number; meta: number } {
  const label = Math.min(Math.max(6, ...nodes.map(n => [...n.label].length)), Math.max(6, Math.floor(width * 0.4)))
  const meta = Math.min(Math.max(0, ...nodes.map(n => [...n.meta].length)), Math.max(0, Math.floor(width * 0.3)))
  return { label, meta }
}

function drawNodeLine(g: Grid, row: number, col: number, width: number, n: NodeView, cols: { label: number; meta: number }): void {
  let c = col
  g.put(row, c, n.glyph, n.glyphStyle)
  c += 2
  g.put(row, c, pad(n.label, cols.label), { bold: n.edge !== 'idle' || n.glyphStyle.color === 'suggestion' })
  c += cols.label + 2
  if (cols.meta > 0 && c + cols.meta < col + width) {
    g.put(row, c, pad(n.meta, cols.meta), { dim: true })
    c += cols.meta + 2
  }
  const room = col + width - c
  if (room > 0) g.put(row, c, pad(n.state, room).trimEnd(), n.stateStyle)
}

/** A vertical tree: the orchestrator on top, one row per node. Fits any width. */
export function layoutTree(v: GraphView, width: number, frame: number): Run[][] {
  const rows = 1 + Math.max(1, v.nodes.length) + (v.footer ? 1 : 0)
  const g = new Grid(width, rows)
  const head = `${v.agent}${v.phase ? ` · ${v.phase}` : ''}`
  g.put(0, 1, '●', { color: 'claude', bold: true })
  g.put(0, 3, head, { bold: true })
  if (v.summary && 3 + [...head].length + 2 + [...v.summary].length <= width) {
    g.put(0, width - [...v.summary].length, v.summary, { dim: true })
  }
  if (v.nodes.length === 0) {
    g.put(1, 3, pad(v.empty ?? '', width - 3), { dim: true })
    return g.runs()
  }
  const edgeEnd = Math.min(9, Math.max(4, Math.floor(width / 8)))
  const cols = nodeColumns(v.nodes, width - edgeEnd - 2)
  v.nodes.forEach((n, i) => {
    const row = 1 + i
    const isLast = i === v.nodes.length - 1
    const below = strongest(v.nodes.slice(i))
    g.put(row, 1, junction(true, !isLast, false, true), below && below.edge !== 'idle' ? EDGE_STYLE[below.edge] : { color: 'inactive', dim: true })
    drawEdge(g, row, 2, edgeEnd, n, frame)
    drawNodeLine(g, row, edgeEnd + 2, width - edgeEnd - 2, n, cols)
  })
  if (v.footer) g.put(rows - 1, 3, pad(v.footer, width - 3), { dim: true })
  return g.runs()
}

/**
 * Cards, left to right: the orchestrator's card, the wires, a card per node.
 * Needs width >= CARD_MIN_WIDTH and 3 rows per node.
 */
export const CARD_MIN_WIDTH = 60

export function layoutCards(v: GraphView, width: number, frame: number): Run[][] {
  const n = v.nodes.length
  const rows = 1 + 3 * Math.max(1, n) + (v.footer ? 1 : 0)
  const g = new Grid(width, rows)
  const orchW = Math.max(9, [...v.agent].length + 6)
  const trunk = orchW + 2
  const cardL = trunk + 6
  // A card fits its content (the state keeps room, so it does not jitter as times grow).
  const cols = nodeColumns(v.nodes, width - cardL - 4)
  const stateW = Math.max(16, ...v.nodes.map(x => [...x.state].length))
  const cardW = Math.min(width - cardL, 2 + cols.label + 2 + (cols.meta > 0 ? cols.meta + 2 : 0) + stateW + 4)

  const head = v.phase ?? ''
  if (head) g.put(0, 0, head, { bold: true })
  const right = Math.min(width, Math.max(cardL + cardW, [...head].length + 2 + [...v.summary].length))
  if (v.summary) g.put(0, Math.max([...head].length + 2, right - [...v.summary].length), v.summary, { dim: true })
  const connect = (i: number) => 2 + 3 * i
  const first = connect(0)
  const last = connect(Math.max(0, n - 1))
  const orchRow = n === 0 ? first : connect(Math.floor((n - 1) / 2)) + (n % 2 === 0 ? 1 : 0)
  const all = strongest(v.nodes)
  const lit = all && all.edge !== 'idle' ? EDGE_STYLE[all.edge] : { color: 'inactive' as ThemeKey, dim: true }

  // the orchestrator's card
  const top = orchRow - 1
  g.put(top, 0, `╭${'─'.repeat(orchW - 2)}╮`, { color: 'claude' })
  g.put(top + 1, 0, '│', { color: 'claude' })
  g.put(top + 1, 2, '●', { color: 'claude', bold: true })
  g.put(top + 1, 4, pad(v.agent, orchW - 6), { bold: true })
  g.put(top + 1, orchW - 1, '├', { color: 'claude' })
  g.put(top + 2, 0, `╰${'─'.repeat(orchW - 2)}╯`, { color: 'claude' })

  if (n === 0) {
    g.put(orchRow, cardL - 4, pad(v.empty ?? '', width - cardL + 4), { dim: true })
    return g.runs()
  }

  // wire from the orchestrator to the trunk, then the trunk
  for (let c = orchW; c < trunk; c++) g.put(orchRow, c, '─', lit)
  const rowsOf = v.nodes.map((_, i) => connect(i))
  for (let r = Math.min(first, orchRow); r <= Math.max(last, orchRow); r++) {
    const nodeAt = rowsOf.indexOf(r)
    const up = r > Math.min(first, orchRow)
    const down = r < Math.max(last, orchRow)
    const through = v.nodes.filter((_, i) => {
      const lo = Math.min(orchRow, rowsOf[i] ?? 0)
      const hi = Math.max(orchRow, rowsOf[i] ?? 0)
      return r >= lo && r <= hi
    })
    const s = strongest(through)
    g.put(r, trunk, junction(up, down, r === orchRow, nodeAt >= 0), s && s.edge !== 'idle' ? EDGE_STYLE[s.edge] : { color: 'inactive', dim: true })
  }

  // a card per node
  v.nodes.forEach((node, i) => {
    const r = connect(i)
    drawEdge(g, r, trunk + 1, cardL - 1, node, frame)
    const border: Style = node.edge === 'idle' ? { color: 'inactive' } : EDGE_STYLE[node.edge]
    const borderLine = node.isDotted ? '┄' : '─'
    g.put(r - 1, cardL, `╭${borderLine.repeat(Math.max(0, cardW - 2))}╮`, border)
    g.put(r, cardL, '┤', border)
    drawNodeLine(g, r, cardL + 2, cardW - 4, node, cols)
    g.put(r, cardL + cardW - 1, '│', border)
    g.put(r + 1, cardL, `╰${borderLine.repeat(Math.max(0, cardW - 2))}╯`, border)
  })
  if (v.footer) g.put(rows - 1, cardL, pad(v.footer, cardW), { dim: true })
  return g.runs()
}

/** Cards when they fit, the tree otherwise. */
export function layout(v: GraphView, width: number, rows: number, frame: number): Run[][] {
  const cardRows = 1 + 3 * Math.max(1, v.nodes.length) + (v.footer ? 1 : 0)
  return width >= CARD_MIN_WIDTH && cardRows <= rows ? layoutCards(v, width, frame) : layoutTree(v, width, frame)
}

export const SPINNER = ['◐', '◓', '◑', '◒'] as const

export function fmtAge(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}:${String(s % 60).padStart(2, '0')}`
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

export { shortName }

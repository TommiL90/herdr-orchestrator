// From what the mod tracks (role panes, subagents, flows) to what the pane
// draws (GraphView). Pure.
import type { Flow, Member, Status, Sub, SubStatus, Tracked } from '../types'
import type { GraphView, NodeView, Style } from './graph'
import { fmtAge, lastFlow, SPINNER } from './graph'
import { shortName } from './roster'

export type { Sub, Tracked }

/** A finished subagent stays drawn this long, then joins the footer's count. */
export const SUB_KEEP_MS = 60_000

/** Carries `since` over for panes whose state did not change. */
export function track(prev: readonly Tracked[], roster: readonly Member[], now: number): Tracked[] {
  return roster.map(m => {
    const old = prev.find(p => p.address === m.address && p.name === m.name)
    return { ...m, since: old && old.status === m.status ? old.since : now }
  })
}

/** $.agent.list()'s status, in the pane's words. */
export function subStatus(status: string): SubStatus {
  if (status === 'pending' || status === 'running') return 'working'
  if (status === 'waiting') return 'blocked'
  if (status === 'idle') return 'idle'
  if (status === 'completed') return 'done'
  return 'failed'
}

function glyphFor(status: Status | SubStatus, frame: number): { glyph: string; style: Style } {
  switch (status) {
    case 'working': return { glyph: SPINNER[frame % SPINNER.length] ?? '◐', style: { color: 'suggestion', bold: true } }
    case 'blocked': return { glyph: '◆', style: { color: 'warning', bold: true } }
    case 'done': return { glyph: '✓', style: { color: 'success' } }
    case 'failed': return { glyph: '✗', style: { color: 'error' } }
    case 'idle': return { glyph: '○', style: { color: 'inactive' } }
    default: return { glyph: '·', style: { color: 'inactive', dim: true } }
  }
}

function stateFor(status: Status | SubStatus, since: number, flow: ReturnType<typeof lastFlow>, now: number): { state: string; style: Style } {
  if (status === 'blocked') return { state: 'blocked', style: { color: 'warning' } }
  if (status === 'working') return { state: `working ${fmtAge(now - since)}`, style: { color: 'suggestion' } }
  if (status === 'failed') return { state: 'failed', style: { color: 'error' } }
  if (flow) {
    return flow.dir === 'out'
      ? { state: `sent ${fmtAge(now - flow.at)} ago`, style: { color: 'claude' } }
      : { state: `replied ${fmtAge(now - flow.at)} ago`, style: { color: 'success' } }
  }
  if (status === 'done') return { state: 'done', style: { dim: true } }
  if (status === 'idle') return { state: 'idle', style: { dim: true } }
  return { state: 'no agent', style: { dim: true } }
}

function node(id: string, label: string, meta: string, status: Status | SubStatus, since: number, flows: readonly Flow[], now: number, frame: number, isDotted: boolean): NodeView {
  const flow = lastFlow(flows, id, now)
  const g = glyphFor(status, frame)
  const s = stateFor(status, since, flow, now)
  return {
    id, label, meta, isDotted,
    glyph: g.glyph, glyphStyle: g.style,
    state: s.state, stateStyle: s.style,
    edge: flow ? flow.dir : status === 'blocked' ? 'blocked' : 'idle',
    isLive: flow?.isLive ?? false,
  }
}

export function buildView(input: {
  agent: string
  phase: string | null
  members: readonly Tracked[]
  subs: readonly Sub[]
  flows: readonly Flow[]
  now: number
  frame: number
}): GraphView {
  const { members, subs, flows, now, frame } = input
  const shown = subs.filter(s => s.status === 'working' || s.status === 'blocked' || now - s.since < SUB_KEEP_MS)
  const folded = subs.length - shown.length
  const nodes = [
    ...members.map(m => node(m.name, shortName(m.name), m.cli ?? '—', m.status, m.since, flows, now, frame, false)),
    ...shown.map(s => node(s.id, s.type, s.label, s.status, s.since, flows, now, frame, true)),
  ]
  const working = [...members, ...subs].filter(x => x.status === 'working').length
  const blocked = [...members, ...subs].filter(x => x.status === 'blocked').length
  const parts = [`${working} working`]
  if (blocked) parts.push(`${blocked} blocked`)
  parts.push(`${members.length} pane${members.length === 1 ? '' : 's'}`)
  if (subs.length) parts.push(`${subs.length} sub${subs.length === 1 ? '' : 's'}`)
  return {
    agent: input.agent,
    phase: input.phase,
    summary: parts.join(' · '),
    nodes,
    footer: folded > 0 ? `✓ ${folded} subagent${folded === 1 ? '' : 's'} finished` : undefined,
    empty: 'No role panes yet: orc panes creates them. Subagents show up when spawned.',
  }
}

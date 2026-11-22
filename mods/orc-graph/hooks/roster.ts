// The orchestrator's roster: its role panes as the multiplexer lists them.
// orc-graph and orc-context each keep an identical copy of this file (a
// plugin loads only its own folder); shared/bin/orc.py is the source of truth
// (ROLES, role_pattern, the herdorc state file, orc_state.safe).
import type { EngineInterface } from 'claude-code'

import type { Member, Status } from '../types'

export type { Member, Status }

export const ORCHESTRATORS = ['hcorc', 'herdorc'] as const
export type Orchestrator = (typeof ORCHESTRATORS)[number]

export const ROLES = [
  'gentle-ai-explore', 'gentle-ai-worker', 'gentle-ai-verify',
  'jd-judge-a', 'jd-judge-b',
  'review-risk', 'review-readability', 'review-reliability', 'review-resilience', 'review-refuter',
] as const



/** Where this session runs, for an orchestrator session. */
export type Where = {
  agent: Orchestrator
  home: string
  /** HC_TERMINAL_ID for hcorc, HERDR_PANE_ID for herdorc. */
  me: string
  herdrSession: string
  herdrWorkspace?: string
}

const SHELLS = new Set(['fish', 'bash', 'zsh', 'sh', 'dash', 'ksh', 'tcsh', 'nu', 'pwsh', 'login'])

export function agentOf(raw: string | undefined): Orchestrator | null {
  const name = (raw ?? '').split(':').pop() ?? ''
  return (ORCHESTRATORS as readonly string[]).includes(name) ? (name as Orchestrator) : null
}

/** The role a pane name belongs to (orc.py role_pattern: `^<role>(-\d+)?$`). */
export function roleOf(name: string): string | undefined {
  return ROLES.find(r => name === r || (name.startsWith(`${r}-`) && /^\d+$/.test(name.slice(r.length + 1))))
}

/** orc_state.safe: a string usable inside a file name. */
export function safe(text: string | undefined): string {
  return (text || 'none').replace(/[^A-Za-z0-9_.-]/g, '_')
}

export const ctxKey = {
  hc: (terminal: string) => `hc-${safe(terminal)}`,
  herdr: (session: string | undefined, pane: string) => `herdr-${safe(session || 'default')}-${safe(pane)}`,
}

/** One word for the many ways hc and herdr report an agent's state. */
export function normStatus(raw: unknown): Status {
  const state = typeof raw === 'string'
    ? raw
    : raw && typeof raw === 'object' && typeof (raw as { state?: unknown }).state === 'string'
      ? (raw as { state: string }).state
      : ''
  const v = state.toLowerCase()
  if (/^(working|busy|running|thinking|active|streaming)$/.test(v)) return 'working'
  if (/^(blocked|waiting|needs[-_ ]?input|permission|asking)$/.test(v)) return 'blocked'
  if (v === 'idle' || v === 'ready') return 'idle'
  if (v === 'done' || v === 'finished' || v === 'completed') return 'done'
  return 'unknown'
}

function cliOf(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw !== '' && !SHELLS.has(raw) ? raw : undefined
}

function byRole(a: Member, b: Member): number {
  const ra = ROLES.indexOf(a.role as (typeof ROLES)[number])
  const rb = ROLES.indexOf(b.role as (typeof ROLES)[number])
  return ra - rb || a.name.localeCompare(b.name)
}

/** `hc ls --json`: the live terminals this orchestrator started, by role name. */
export function parseHc(stdout: string, me: string): Member[] {
  let rows: unknown[]
  try {
    rows = (JSON.parse(stdout) as { terminals?: unknown[] }).terminals ?? []
  } catch {
    return []
  }
  const out: Member[] = []
  for (const raw of rows) {
    const t = (raw ?? {}) as { name?: string; address?: string; parent?: string; state?: string; status?: unknown; agent?: unknown }
    const role = roleOf(t.name ?? '')
    if (!role || !t.name || !t.address || t.state !== 'live' || t.parent !== me) continue
    const cli = cliOf(t.agent)
    out.push({
      name: t.name, role, address: t.address, cli,
      status: cli ? normStatus(t.status) : 'unknown',
      ctxKey: ctxKey.hc(t.address),
    })
  }
  return out.sort(byRole)
}

type HerdrPaneRecord = string | { name?: string; terminal?: string }
type HerdrAgentRow = { pane_id?: string; agent?: string; agent_status?: string; terminal_id?: string }

/**
 * herdorc's recorded panes (orc_state's state file), joined with `herdr agent
 * list` for the CLI and its state. `paneIds`, from `herdr pane list`, drops a
 * recorded pane that is gone; undefined when herdr did not answer.
 */
export function parseHerdr(agentsStdout: string, stateText: string | undefined, session: string, paneIds?: ReadonlySet<string>): Member[] {
  let panes: Record<string, HerdrPaneRecord> = {}
  try {
    panes = (JSON.parse(stateText || '{}') as { panes?: Record<string, HerdrPaneRecord> }).panes ?? {}
  } catch {
    panes = {}
  }
  const agents = new Map<string, HerdrAgentRow>()
  try {
    const list = (JSON.parse(agentsStdout) as { result?: { agents?: HerdrAgentRow[] } }).result?.agents ?? []
    for (const a of list) if (a.pane_id) agents.set(a.pane_id, a)
  } catch {
    // herdr did not answer: panes keep an unknown state
  }
  const out: Member[] = []
  for (const [id, rec] of Object.entries(panes)) {
    const name = typeof rec === 'string' ? rec : rec?.name
    const role = roleOf(name ?? '')
    if (!role || !name) continue
    if (paneIds && !paneIds.has(id)) continue
    const a = agents.get(id)
    const terminal = typeof rec === 'object' ? rec?.terminal : undefined
    if (a && terminal && a.terminal_id && a.terminal_id !== terminal) continue // herdr reused the id
    const cli = cliOf(a?.agent)
    out.push({
      name, role, address: id, cli,
      status: a && cli ? normStatus(a.agent_status) : 'unknown',
      ctxKey: ctxKey.herdr(session, id),
    })
  }
  return out.sort(byRole)
}

export function paneIdsOf(stdout: string): Set<string> | undefined {
  try {
    const list = (JSON.parse(stdout) as { result?: { panes?: { pane_id?: string; id?: string }[] } }).result?.panes
    if (!Array.isArray(list)) return undefined
    return new Set(list.map(p => p.pane_id ?? p.id ?? '').filter(Boolean))
  } catch {
    return undefined
  }
}

export function stateDir(home: string): string {
  return `${home}/.local/state/orc`
}

/** Where this orchestrator session runs, from the environment. */
export async function whereAmI($: EngineInterface, agent: Orchestrator): Promise<Where> {
  return {
    agent,
    home: (await $.env.get('HOME')) ?? '',
    me: ((agent === 'hcorc' ? await $.env.get('HC_TERMINAL_ID') : await $.env.get('HERDR_PANE_ID')) ?? ''),
    herdrSession: (await $.env.get('HERDR_SESSION')) || 'default',
    herdrWorkspace: (await $.env.get('HERDR_WORKSPACE_ID')) || undefined,
  }
}

async function runJson($: EngineInterface, argv: string[]): Promise<string | undefined> {
  try {
    const r = await $.process.run(argv, { timeoutMs: 5_000 })
    return r.exitCode === 0 ? r.stdout : undefined
  } catch {
    return undefined // the multiplexer is not installed or did not answer in time
  }
}

/** The role panes as of now, or undefined when the multiplexer did not answer (keep the last roster). */
export async function pollRoster($: EngineInterface, w: Where): Promise<Member[] | undefined> {
  if (!w.me) return []
  if (w.agent === 'hcorc') {
    const out = await runJson($, ['hc', 'ls', '--json'])
    return out === undefined ? undefined : parseHc(out, w.me)
  }
  if (!w.herdrWorkspace) return []
  const agents = await runJson($, ['herdr', 'agent', 'list'])
  if (agents === undefined) return undefined
  const panes = await runJson($, ['herdr', 'pane', 'list', '--workspace', w.herdrWorkspace])
  let state: string | undefined
  try {
    state = await $.fs.read(`${stateDir(w.home)}/herdorc-${safe(`${w.herdrSession}-${w.herdrWorkspace}`)}.json`)
  } catch {
    state = undefined // no pane recorded yet
  }
  return parseHerdr(agents, state, w.herdrSession, panes === undefined ? undefined : paneIdsOf(panes))
}

/** A pane name for display: orc.py's tab titles drop the same prefixes. */
export function shortName(name: string): string {
  return name.replace(/^gentle-ai-/, '').replace(/^review-/, 'r-')
}

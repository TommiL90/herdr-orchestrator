import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { addFlow, bashFlows, confirmedHandoffs, FLOW_LIVE_MS, FLOW_RECENT_MS, hcSenders, layout, layoutTree, paneOfFile } from './graph'
import type { Flow, FlowDir, Sub, Tracked } from '../types'
import type { Orchestrator, Where } from './roster'
import { agentOf, pollRoster, roleOf, safe, stateDir, whereAmI } from './roster'
import { buildView, SUB_KEEP_MS, subStatus, track } from './view'

// Change a `shape` tag when that value's fields change: it declines what an
// earlier version stored, which outlives a reload. Exported for the tests.
export const agentAtom = atom({ plugin: 'orc-graph', key: 'agent' } as const, null as string | null)
export const membersAtom = atom({ plugin: 'orc-graph', key: 'members' } as const, [] as Tracked[], { shape: 'members-1' })
export const subsAtom = atom({ plugin: 'orc-graph', key: 'subs' } as const, [] as Sub[], { shape: 'subs-1' })
export const flowsAtom = atom({ plugin: 'orc-graph', key: 'flows' } as const, [] as Flow[], { shape: 'flows-1' })
export const phaseAtom = atom({ plugin: 'orc-graph', key: 'phase' } as const, null as string | null)
export const frameAtom = atom({ plugin: 'orc-graph', key: 'frame' } as const, 0)
export const nowAtom = atom({ plugin: 'orc-graph', key: 'now' } as const, 0)

const PANE = 'orc-graph'
const TITLE = 'Agents'
const TICK_MS = 250
/** Ticks between polls of the multiplexer, the subagents and the reports folder. */
const POLL_EVERY = 8
/** A subagent missing from the engine's list this long after its last change has ended. */
const GONE_MS = 5_000

type Options = { openPane?: boolean }

/** What the session's activation settles, shared with the helpers below. */
const cfg: {
  opt: Options
  where?: Where
  timer?: { cancel: () => void }
  ticks: number
  isPolling: boolean
  reportsSince: number
  seen: Map<string, number>
} = { opt: {}, ticks: 0, isPolling: false, reportsSince: 0, seen: new Map() }

async function flow($: EngineInterface, target: string, dir: FlowDir): Promise<void> {
  const f: Flow = { target, dir, at: await $.clock.now() }
  await update($, flowsAtom, list => addFlow(list, f))
}

/** A pane name or address the orchestrator used, as a known pane name. */
async function resolver($: EngineInterface): Promise<(word: string) => string | undefined> {
  const members = await read($, membersAtom)
  return word => members.find(m => m.name === word || m.address === word)?.name ?? (roleOf(word) ? word : undefined)
}

async function readPhase($: EngineInterface): Promise<void> {
  const w = cfg.where
  if (!w) return
  const me = w.agent === 'hcorc' ? w.me : `${w.herdrSession}-${w.me || 'none'}`
  let value: string | null = null
  try {
    const parsed = JSON.parse(await $.fs.read(`${stateDir(w.home)}/phase-${w.agent}-${safe(me)}.json`)) as { phase?: unknown }
    value = typeof parsed.phase === 'string' ? parsed.phase : null
  } catch {
    value = null // no phase reported yet
  }
  if (value !== (await read($, phaseAtom))) await update($, phaseAtom, () => value)
}

/** New or rewritten report files: the role's answer reaching the orchestrator. */
async function pollReports($: EngineInterface): Promise<void> {
  const w = cfg.where
  if (!w) return
  let entries: { name: string; kind: string; mtimeMs: number }[]
  try {
    entries = await $.fs.list(`${stateDir(w.home)}/reports`)
  } catch {
    return // no report written yet
  }
  const names = (await read($, membersAtom)).map(m => m.name)
  for (const e of entries) {
    if (e.kind !== 'file' || !e.name.endsWith('.md')) continue
    const last = cfg.seen.get(e.name) ?? cfg.reportsSince
    cfg.seen.set(e.name, Math.max(last, e.mtimeMs))
    if (e.mtimeMs <= last) continue
    const pane = paneOfFile(e.name, names)
    if (pane) await flow($, pane, 'in')
  }
}

async function pollSubs($: EngineInterface, now: number): Promise<void> {
  const subs = await read($, subsAtom)
  if (subs.length === 0) return
  const infos = new Map((await $.agent.list()).map(a => [a.id, a]))
  const finished: string[] = []
  const next = subs.flatMap(s => {
    const info = s.agentId ? infos.get(s.agentId) : undefined
    // One the engine no longer lists has ended, though no poll saw it finish.
    const gone = !info && s.agentId !== undefined && (s.status === 'working' || s.status === 'blocked') && now - s.since > GONE_MS
    const status = info ? subStatus(info.status) : gone ? 'done' : s.status
    if (status === s.status) return now - s.since < SUB_KEEP_MS * 10 || status === 'working' || status === 'blocked' ? [s] : []
    if ((status === 'done' || status === 'failed') && (s.status === 'working' || s.status === 'blocked')) finished.push(s.id)
    return [{ ...s, status, since: now }]
  })
  await update($, subsAtom, () => next)
  for (const id of finished) await flow($, id, 'in')
}

async function poll($: EngineInterface): Promise<void> {
  const w = cfg.where
  if (!w || cfg.isPolling) return
  cfg.isPolling = true
  try {
    const now = await $.clock.now()
    const roster = await pollRoster($, w)
    if (roster) await update($, membersAtom, prev => track(prev, roster, now))
    await pollSubs($, now)
    await pollReports($)
    await readPhase($)
  } finally {
    cfg.isPolling = false
  }
}

async function tick($: EngineInterface): Promise<void> {
  cfg.ticks += 1
  if (cfg.ticks % POLL_EVERY === 0) void poll($)
  const now = await $.clock.now()
  const flows = await read($, flowsAtom)
  const isWorking = (await read($, membersAtom)).some(m => m.status === 'working')
    || (await read($, subsAtom)).some(s => s.status === 'working')
  const isLive = isWorking || flows.some(f => now - f.at < FLOW_LIVE_MS)
  if (isLive) {
    await update($, frameAtom, f => f + 1)
    await update($, nowAtom, () => now)
  } else if (cfg.ticks % 4 === 0 && flows.some(f => now - f.at < FLOW_RECENT_MS + 1_000)) {
    await update($, nowAtom, () => now) // "sent 12s ago" keeps counting, then settles
  }
}

/** Once per session (and per reload): the pane, its command and the timer. */
async function activate($: EngineInterface, agent: Orchestrator): Promise<void> {
  if (cfg.where) return
  cfg.where = await whereAmI($, agent)
  if ((await read($, agentAtom)) !== agent) await update($, agentAtom, () => agent)
  cfg.reportsSince = await $.clock.now()
  await $.command.register({ name: 'orc-graph', description: 'Show the orchestrator agents and the work passing between them' })
  // Opt-in: the pane opens on /orc-graph, or by itself only with the openPane option.
  if (cfg.opt.openPane === true) void $.ui.open({ id: PANE, title: TITLE })
  cfg.timer?.cancel()
  cfg.timer = $.clock.every(TICK_MS, () => void tick($))
  await poll($)
}

/** The agent a classic hook event names on the main thread of a `--agent` session. */
async function fromClassic($: EngineInterface, e: { agent_type?: string; agent_id?: string }): Promise<void> {
  if (cfg.where || e.agent_id !== undefined) return
  const agent = agentOf(e.agent_type)
  if (agent) await activate($, agent)
}

export const register: Register = (on, options) => {
  cfg.opt = (options ?? {}) as Options

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const agent = agentOf(await $.env.get('CLAUDE_CODE_AGENT')) ?? agentOf((await read($, agentAtom)) ?? undefined)
    if (agent) await activate($, agent)
    return started
  })

  // `claude --agent hcorc` names the agent on classic hook events too; a hot reload sees no session start.
  on('classic.SessionStart', async ($, e, next) => {
    await fromClassic($, e)
    return next(e)
  }).catch(($, e, next) => next(e))
  on('classic.UserPromptSubmit', async ($, e, next) => {
    await fromClassic($, e)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') {
      await update($, flowsAtom, () => [])
      await update($, subsAtom, () => [])
    }
    return next(e)
  })

  on('command.run', { command: 'orc-graph' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    return { text: opened.isPlaced ? 'Agents pane opened.' : `Agents pane waits: ${opened.reason ?? 'no room'}.` }
  })

  // A role's answer, typed into this terminal by `hc send`: <hc from="t7 gentle-ai-worker">.
  on('prompt.submit', async ($, e, next) => {
    if (cfg.where) {
      const resolve = await resolver($)
      for (const name of hcSenders(e.text)) {
        const pane = resolve(name)
        if (pane) await flow($, pane, 'in')
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const w = cfg.where
    if (!w || e.agentId !== undefined) return next(e)
    const reports = `${stateDir(w.home)}/reports/`
    if (e.tool === 'Bash') {
      const found = bashFlows(e.command, await resolver($))
      for (const t of found.out) await flow($, t, 'out')
      const startedAt = await $.clock.now()
      const result = await next(e)
      // A refused call or one sent to the background returns at once: nothing came back yet.
      if (result.deny !== undefined || result.isError === true || e.run_in_background === true) return result
      const took = (await $.clock.now()) - startedAt
      for (const a of found.awaits) if (took < a.timeoutMs - 1_000) await flow($, a.target, 'in')
      for (const t of found.reads) await flow($, t, 'in')
      for (const name of confirmedHandoffs(result.text ?? '', found.handoffs)) await flow($, name, 'out')
      return result
    }
    if ((e.tool === 'Write' || e.tool === 'Edit') && e.file_path.startsWith(`${reports}handoffs/`)) {
      const pane = paneOfFile(e.file_path.slice(`${reports}handoffs/`.length), (await read($, membersAtom)).map(m => m.name))
      if (pane) await flow($, pane, 'out')
    } else if (e.tool === 'Read' && e.file_path.startsWith(reports) && !e.file_path.slice(reports.length).includes('/')) {
      const pane = paneOfFile(e.file_path.slice(reports.length), (await read($, membersAtom)).map(m => m.name))
      if (pane) await flow($, pane, 'in')
    }
    return next(e)
  }).catch(($, e, next) =>
    // A view, not a guard: if it fails, the call runs as asked.
    next(e),
  )

  // An internal subagent: the work goes out as it starts.
  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    if (cfg.where && !spawned.deny) {
      const now = await $.clock.now()
      await update($, subsAtom, list => [
        // A resumed subagent keeps its agentId under a new tool call: one row for it.
        ...list.filter(s => s.id !== e.tool_use_id && (spawned.agentId === undefined || s.agentId !== spawned.agentId)),
        { id: e.tool_use_id, agentId: spawned.agentId, type: e.subagentType, label: e.description, status: 'working' as const, since: now },
      ])
      await flow($, e.tool_use_id, 'out')
    }
    return spawned
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const frame = await read($, frameAtom)
    const view = buildView({
      agent: (await read($, agentAtom)) ?? 'orchestrator',
      phase: await read($, phaseAtom),
      members: await read($, membersAtom),
      subs: await read($, subsAtom),
      flows: await read($, flowsAtom),
      now: (await read($, nowAtom)) || (await $.clock.now()),
      frame,
    })
    const width = Math.max(24, e.props.bodyColumns)
    const lines = e.props.placement === 'widget'
      ? layoutTree(view, width, frame)
      : layout(view, width, e.props.scroll.bodyRows, frame)
    return (
      <Box flexDirection="column">
        {lines.map((runs, i) => (
          <Box key={`r${i}`} flexDirection="row">
            {runs.length === 0
              ? <Text> </Text>
              : runs.map((r, j) => (
                  <Text key={`c${j}`} color={r.color} bold={r.bold} dimColor={r.dim} wrap="truncate">{r.text}</Text>
                ))}
          </Box>
        ))}
      </Box>
    )
  })
}

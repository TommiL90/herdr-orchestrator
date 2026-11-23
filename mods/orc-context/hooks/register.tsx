import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CtxReport, MainCtx, Member, SubCtx } from '../types'
import { buildRows, parseReport, renderRows, reportPath, stepTokens, subStatus } from './context'
import type { Orchestrator, Where } from './roster'
import { agentOf, ctxKey, pollRoster, whereAmI } from './roster'

// Change a `shape` tag when that value's fields change: it declines what an
// earlier version stored, which outlives a reload. Exported for the tests.
export const agentAtom = atom({ plugin: 'orc-context', key: 'agent' } as const, null as string | null)
export const membersAtom = atom({ plugin: 'orc-context', key: 'members' } as const, [] as Member[], { shape: 'members-1' })
export const panesAtom = atom({ plugin: 'orc-context', key: 'panes' } as const, [] as CtxReport[], { shape: 'panes-2' })
export const mainAtom = atom({ plugin: 'orc-context', key: 'main' } as const, null as MainCtx | null, { shape: 'main-2' })
export const subsAtom = atom({ plugin: 'orc-context', key: 'subs' } as const, [] as SubCtx[], { shape: 'subs-1' })

const PANE = 'orc-context'
const TITLE = 'Context'
const POLL_MS = 2_000

type Options = { report?: boolean; openPane?: boolean }
/** A subagent missing from the engine's list this long after its last change has ended. */
const GONE_MS = 5_000
/** The CLI names the multiplexers give Claude Code: only its panes write reports. */
const isClaude = (cli: string | undefined): boolean => /^claude/.test(cli ?? '')

/** What the session settles, shared with the helpers below. */
const cfg: {
  opt: Options
  where?: Where
  timer?: { cancel: () => void }
  ticks: number
  isPolling: boolean
  /** This session's own report file, when it runs inside an hc/herdr pane (null: none). */
  reportTo?: string | null
  /** The figures last written, so an unchanged step writes nothing. */
  lastReported?: string
} = { opt: {}, ticks: 0, isPolling: false }

/** What one main-loop request settles: its model, its answer's size and the compaction threshold. */
type Step = { model?: string; output?: number; compactAt?: number }

/**
 * The session's own auto-compaction threshold, read after each main-loop request
 * (not on every poll): undefined when auto-compaction is off or the engine
 * cannot say.
 */
async function compactAt($: EngineInterface): Promise<number | undefined> {
  try {
    const b = (await $.session.usage({ breakdown: 'summary' })).context.breakdown
    return b?.isAutoCompactEnabled ? b.autoCompactThreshold : undefined
  } catch {
    return undefined
  }
}

async function readMain($: EngineInterface, step?: Step): Promise<void> {
  const ctx = (await $.session.usage()).context
  const before = await read($, mainAtom)
  const next: MainCtx = step
    ? { tokens: ctx.tokens, window: ctx.window, model: step.model ?? before?.model, output: step.output, compactAt: step.compactAt }
    : { tokens: ctx.tokens, window: ctx.window, model: before?.model, output: before?.output, compactAt: before?.compactAt }
  if (JSON.stringify(before) !== JSON.stringify(next)) await update($, mainAtom, () => next)
}

async function readPanes($: EngineInterface, members: readonly Member[]): Promise<void> {
  const w = cfg.where
  if (!w) return
  const found: CtxReport[] = []
  for (const m of members) {
    if (!isClaude(m.cli)) continue // a shell or another CLI now: an old report is not its
    try {
      const r = parseReport(m.ctxKey, await $.fs.read(reportPath(w.home, m.ctxKey)))
      if (r) found.push(r)
    } catch {
      // that pane has not reported (not Claude Code, or orc-context is not installed there)
    }
  }
  const before = await read($, panesAtom)
  if (JSON.stringify(before) !== JSON.stringify(found)) await update($, panesAtom, () => found)
}

async function readSubs($: EngineInterface): Promise<void> {
  const subs = await read($, subsAtom)
  if (!subs.some(s => s.status === 'working' || s.status === 'blocked' || s.status === 'idle')) return
  const infos = new Map((await $.agent.list()).map(a => [a.id, a]))
  const now = await $.clock.now()
  let changed = false
  const next = subs.flatMap(s => {
    const info = infos.get(s.agentId)
    const running = s.status === 'working' || s.status === 'blocked'
    if (!info && running && now - s.since > GONE_MS) {
      changed = true
      // Never spawned through the subagent tool (an engine fork: compaction, memory): not a
      // subagent of the orchestrator. Otherwise it ended without a poll seeing it finish.
      return s.type === 'subagent' && s.label === '' ? [] : [{ ...s, status: 'done' as const, since: now }]
    }
    const status = info ? subStatus(info.status) : s.status
    if (status === s.status) return [s]
    changed = true
    return [{ ...s, status, since: now }]
  })
  if (changed) await update($, subsAtom, () => next)
}

async function poll($: EngineInterface): Promise<void> {
  const w = cfg.where
  if (!w || cfg.isPolling) return
  cfg.isPolling = true
  try {
    await readMain($)
    let members = await read($, membersAtom)
    if (cfg.ticks % 2 === 0) {
      const roster = await pollRoster($, w)
      if (roster && JSON.stringify(roster) !== JSON.stringify(members)) {
        members = roster
        await update($, membersAtom, () => roster)
      }
    }
    await readPanes($, members)
    await readSubs($)
  } finally {
    cfg.isPolling = false
  }
}

async function activate($: EngineInterface, agent: Orchestrator): Promise<void> {
  if (cfg.where) return
  cfg.where = await whereAmI($, agent)
  if ((await read($, agentAtom)) !== agent) await update($, agentAtom, () => agent)
  await $.command.register({ name: 'orc-context', description: 'Show the context each orchestrator agent has used' })
  // Opt-in: the pane opens on /orc-context, or by itself only with the openPane option.
  if (cfg.opt.openPane === true) void $.ui.open({ id: PANE, title: TITLE })
  cfg.timer?.cancel()
  cfg.timer = $.clock.every(POLL_MS, () => {
    cfg.ticks += 1
    void poll($)
  })
  await poll($)
}

async function fromClassic($: EngineInterface, e: { agent_type?: string; agent_id?: string }): Promise<void> {
  if (cfg.where || e.agent_id !== undefined) return
  const agent = agentOf(e.agent_type)
  if (agent) await activate($, agent)
}

/** Inside an hc or herdr pane, this session's own report file. */
async function reportFile($: EngineInterface): Promise<string | undefined> {
  if (cfg.opt.report === false) return undefined
  const home = (await $.env.get('HOME')) ?? ''
  const terminal = await $.env.get('HC_TERMINAL_ID')
  if (terminal) return reportPath(home, ctxKey.hc(terminal))
  const pane = await $.env.get('HERDR_PANE_ID')
  if (pane) return reportPath(home, ctxKey.herdr(await $.env.get('HERDR_SESSION'), pane))
  return undefined
}

async function report($: EngineInterface, step: Step): Promise<void> {
  // Settled on first use, so a reload (or a changed option) that sees no session start
  // still reports.
  if (cfg.reportTo === undefined) cfg.reportTo = (await reportFile($)) ?? null
  if (!cfg.reportTo) return
  const ctx = (await $.session.usage()).context
  if (ctx.tokens === undefined) return
  const figures = JSON.stringify({ tokens: ctx.tokens, window: ctx.window, model: step.model, output: step.output, compactAt: step.compactAt })
  if (figures === cfg.lastReported) return
  cfg.lastReported = figures
  await $.fs.write(cfg.reportTo, JSON.stringify({ ...JSON.parse(figures), at: await $.clock.now() }))
}

export const register: Register = (on, options) => {
  cfg.opt = (options ?? {}) as Options

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    cfg.reportTo = (await reportFile($)) ?? null
    const agent = agentOf(await $.env.get('CLAUDE_CODE_AGENT')) ?? agentOf((await read($, agentAtom)) ?? undefined)
    if (agent) await activate($, agent)
    return started
  })

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
      await update($, subsAtom, () => [])
      cfg.lastReported = undefined
    } else if (cfg.reportTo) {
      // The session leaves the pane: its numbers must not stay on a shell or the next CLI.
      try { await $.fs.write(cfg.reportTo, JSON.stringify({ ended: true, at: await $.clock.now() })) } catch { /* best effort */ }
    }
    return next(e)
  })

  on('command.run', { command: 'orc-context' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    return { text: opened.isPlaced ? 'Context pane opened.' : `Context pane waits: ${opened.reason ?? 'no room'}.` }
  })

  // Each model request: the main loop's refreshes this session's window (and its
  // report file inside a pane); a subagent's is that subagent's context.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const u = result.usage
    if (e.agentId === undefined) {
      if (cfg.reportTo === undefined) cfg.reportTo = (await reportFile($)) ?? null
      if (cfg.reportTo || cfg.where) {
        const step: Step = { model: u?.model, output: u?.output_tokens, compactAt: await compactAt($) }
        await report($, step)
        if (cfg.where) await readMain($, step)
      }
    } else if (cfg.where && u) {
      const id = e.agentId
      const tokens = stepTokens(u)
      const now = await $.clock.now()
      await update($, subsAtom, list => {
        const known = list.find(s => s.agentId === id)
        return known
          ? list.map(s => (s.agentId === id ? { ...s, tokens, model: u.model } : s))
          : [...list, { agentId: id, type: 'subagent', label: '', model: u.model, tokens, status: 'working' as const, since: now }]
      })
    }
    return result
  })

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    const id = spawned.agentId
    if (cfg.where && id) {
      const now = await $.clock.now()
      await update($, subsAtom, list => [
        ...list.filter(s => s.agentId !== id),
        { agentId: id, type: e.subagentType, label: e.description, model: spawned.model, tokens: list.find(s => s.agentId === id)?.tokens ?? 0, status: 'working' as const, since: now },
      ])
    }
    return spawned
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const view = buildRows({
      agent: (await read($, agentAtom)) ?? 'orchestrator',
      main: await read($, mainAtom),
      members: await read($, membersAtom),
      panes: await read($, panesAtom),
      subs: await read($, subsAtom),
      now: await $.clock.now(),
    })
    const lines = renderRows(view, Math.max(24, e.props.bodyColumns))
    return (
      <Box flexDirection="column">
        {lines.map((runs, i) => (
          <Box key={`r${i}`} flexDirection="row">
            {runs.map((r, j) => (
              <Text key={`c${j}`} color={r.color} bold={r.bold} dimColor={r.dim} wrap="truncate">{r.text}</Text>
            ))}
          </Box>
        ))}
      </Box>
    )
  })
}

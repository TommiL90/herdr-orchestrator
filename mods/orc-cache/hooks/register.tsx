import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ToolCallResult } from 'claude-code'

import type { Policy, Sample, Ttl } from '../types'
import {
  agentOf, decideTtl, fmtClock, fmtTokens, hitRatio, missReason, observeTtl, parseWait,
  phaseFile, promptTokens, remainingMs, renewed, shouldWarm, suggestedTimeout, ttlMs,
  WAIT_MARGIN_MS, warmBudget, warmSpanMs,
} from './cache'

const last = atom({ plugin: 'orc-cache', key: 'last' } as const, null as Sample | null)
const prev = atom({ plugin: 'orc-cache', key: 'prev' } as const, null as Sample | null)
const observed = atom({ plugin: 'orc-cache', key: 'observed' } as const, null as Ttl | null)
const policy = atom({ plugin: 'orc-cache', key: 'policy' } as const, null as Policy | null)
const miss = atom({ plugin: 'orc-cache', key: 'miss' } as const, null as string | null)
const phase = atom({ plugin: 'orc-cache', key: 'phase' } as const, null as string | null)
const agentAtom = atom({ plugin: 'orc-cache', key: 'agent' } as const, null as string | null)
const now = atom({ plugin: 'orc-cache', key: 'now' } as const, 0)

type Options = { ttl?: string; waitGuard?: string; warm?: string; checkpointAtTokens?: number; everywhere?: boolean }
/** Toasts and hints only for prompts at least this large: below it a rewrite costs little. */
const TOAST_MIN_TOKENS = 20_000
const WARN_LEFT_MS = 60_000
/** The keep-alive fork's one message: nothing ahead of it changes, so the cache is read on every model. */
const KEEPALIVE_PROMPT = 'Cache keep-alive from the orc-cache mod, not a task. You have no tools here. '
  + 'Answer straight away, without thinking it over, with the one word: ok'

/** What register's options settle to, shared with the helpers below. */
const cfg: {
  opt: Options
  checkpointAt: number
  phasePath?: string
  timer?: { cancel: () => void }
  ticks: number
  /** Keep-alive: when the pending foreground wait ends ($.clock ms; 0: none). */
  fgUntil: number
  /** Background waits by task id: each ends by its --timeout, or once Stop no longer lists its task. */
  bg: Map<string, number>
  /** Pings since the last real request, a ping out, main-loop requests out. */
  pings: number
  warming: boolean
  inFlight: number
} = { opt: {}, checkpointAt: 150_000, ticks: 0, fgUntil: 0, bg: new Map(), pings: 0, warming: false, inFlight: 0 }

function warmOn(): boolean {
  return cfg.opt.warm === 'on'
}

/** When the last pending wait ends ($.clock ms; 0 or past: none), dropping background waits past theirs. */
function pendingUntil(t: number): number {
  let until = cfg.fgUntil
  for (const [id, end] of cfg.bg) {
    if (end <= t) cfg.bg.delete(id)
    else until = Math.max(until, end)
  }
  return until
}

/** No more pings for the waits pending now. */
function stopWarming(): void {
  cfg.fgUntil = 0
  cfg.bg.clear()
}

/**
 * A wait that runs on in the background (asked for, or moved there with ctrl+b) keeps
 * the pings going under its task id; a denied or failed call started nothing.
 */
function trackBackground(res: ToolCallResult<'Bash'>, until: number): void {
  if (res.deny !== undefined || res.isError === true) return
  const id = (res.result as { backgroundTaskId?: unknown } | undefined)?.backgroundTaskId
  if (typeof id === 'string' && id) cfg.bg.set(id, until)
}

/**
 * Keep-alive: during a pending hc/herdr wait, shortly before the entry lapses, a fork
 * of the main thread's last request reads the cached prefix and so renews it. Off
 * unless the `warm` option is on; capped at warmBudget pings per wait.
 */
async function maybeWarm($: EngineInterface): Promise<void> {
  if (!warmOn() || (await read($, agentAtom)) === null) return
  const s = await read($, last)
  const p = await read($, policy)
  if (!s || !p) return
  const t = await $.clock.now()
  const w = { until: pendingUntil(t), pings: cfg.pings, busy: cfg.warming || cfg.inFlight > 0 }
  if (!shouldWarm(s, p.ttl, t, w, TOAST_MIN_TOKENS)) return
  cfg.warming = true
  try {
    let r: Awaited<ReturnType<typeof $.model.fork>>
    try {
      r = await $.model.fork({ prompt: KEEPALIVE_PROMPT })
    } catch (err) {
      stopWarming() // left alone, the next tick would try again, every second
      $.ui.toast(`Cache keep-alive failed (${err instanceof Error ? err.message : String(err)}); stopped for this wait`)
      return
    }
    if (r.isAnswered && renewed(s, r.usage.cache_read_input_tokens)) {
      cfg.pings += 1
      // Renewed from the ping's start; a real request recorded meanwhile wins.
      await update($, last, cur => (cur && cur.startedAt === s.startedAt ? { ...cur, startedAt: t } : cur))
      return
    }
    stopWarming() // the entry is gone or unreachable: no more pings for this wait
    if (!r.isAnswered && r.reason === 'nothing-to-fork') return
    $.ui.toast(r.isAnswered
      ? `Cache keep-alive read ${fmtTokens(r.usage.cache_read_input_tokens)} of ${fmtTokens(promptTokens(s))} tokens: the entry had lapsed; stopped for this wait`
      : `Cache keep-alive failed (${r.reason}); stopped for this wait`)
  } finally {
    cfg.warming = false
  }
}

async function isShown($: EngineInterface): Promise<boolean> {
return (await read($, agentAtom)) !== null || cfg.opt.everywhere === true
}

async function refreshPolicy($: EngineInterface): Promise<Policy> {
  const usage = await $.session.usage()
  const decided = decideTtl({
    option: cfg.opt.ttl,
    force5m: await $.env.get('FORCE_PROMPT_CACHING_5M'),
    ttlVar: await $.env.get('CLAUDE_CODE_PROMPT_CACHE_TTL'),
    setting: await $.settings.read({ key: 'promptCacheTtl' } as never),
    enable1h: await $.env.get('ENABLE_PROMPT_CACHING_1H'),
    observed: await read($, observed),
    windows: usage.rateLimits ?? [],
  })
  await update($, policy, () => decided)
  return decided
}

async function readPhase($: EngineInterface): Promise<void> {
  if (!cfg.phasePath) return
  let value: string | null = null
  try {
    const parsed = JSON.parse(await $.fs.read(cfg.phasePath)) as { phase?: unknown }
    value = typeof parsed.phase === 'string' ? parsed.phase : null
  } catch {
    value = null // no phase reported yet, or the file is being rewritten
  }
  if (value !== (await read($, phase))) await update($, phase, () => value)
}

async function record($: EngineInterface, cur: Sample): Promise<void> {
  cfg.pings = 0 // a real request: the next wait gets the whole keep-alive budget
  const before = await read($, last)
  const known = await read($, observed)
  const seen = observeTtl(before, cur, known)
  if (seen !== known) await update($, observed, () => seen)
  const p = await refreshPolicy($)
  const reason = missReason(before, cur, p.ttl) ?? null
  await update($, prev, () => before)
  await update($, last, () => cur)
  await update($, miss, () => reason)
  const size = promptTokens(cur)
  if (reason && size >= TOAST_MIN_TOKENS) {
    $.ui.toast(`Cache miss: wrote ${fmtTokens(cur.write)} tokens again (${reason})`)
  }
  const agent = await read($, agentAtom)
  if (agent && size >= cfg.checkpointAt && (!before || promptTokens(before) < cfg.checkpointAt)) {
    $.ui.toast(`Context at ${fmtTokens(size)} tokens: a checkpoint and a clear at the next clean point will make each wake-up cheaper`)
  }
}

/** Starts the meter for an orchestrator session (or every session with `everywhere`). */
async function activate($: EngineInterface, agent: string | null): Promise<void> {
  if (agent && (await read($, agentAtom)) !== agent) await update($, agentAtom, () => agent)
  cfg.phasePath = agent
    ? phaseFile((await $.env.get('HOME')) ?? '', agent, {
        hcTerminal: await $.env.get('HC_TERMINAL_ID'),
        herdrSession: await $.env.get('HERDR_SESSION'),
        herdrSocket: await $.env.get('HERDR_SOCKET_PATH'),
        herdrPane: await $.env.get('HERDR_PANE_ID'),
      })
    : undefined
  cfg.timer?.cancel()
  cfg.timer = undefined
  if (agent || cfg.opt.everywhere === true) {
    await refreshPolicy($)
    await readPhase($)
    cfg.timer = $.clock.every(1000, () => {
      cfg.ticks += 1
      void $.clock.now().then(t => update($, now, () => t))
      if (cfg.ticks % 3 === 0) void readPhase($)
      if (warmOn()) void maybeWarm($).catch(() => { cfg.warming = false })
    })
  }
}

/**
 * `claude --agent hcorc` names the agent on classic hook events too. The agent
 * atom outlives a hot reload while the timer (a module value) does not, so a
 * known agent without a running timer is started again.
 */
async function fromClassic($: EngineInterface, e: { agent_type?: string; agent_id?: string }): Promise<void> {
  if (e.agent_id !== undefined) return
  const known = await read($, agentAtom)
  if (known !== null) {
    if (!cfg.timer) await activate($, known)
    return
  }
  const agent = agentOf(e.agent_type)
  if (agent) await activate($, agent)
}

/** After a hot reload with no event yet: start the timer again for a known agent. */
async function resume($: EngineInterface): Promise<void> {
  if (cfg.timer) return
  const known = await read($, agentAtom)
  if (known !== null || cfg.opt.everywhere === true) await activate($, known)
}

export const register: Register = (on, options) => {
  const opt = (options ?? {}) as Options
  cfg.opt = opt
  cfg.checkpointAt = typeof opt.checkpointAtTokens === 'number' && opt.checkpointAtTokens > 0
    ? opt.checkpointAtTokens : 150_000
  const checkpointAt = cfg.checkpointAt

  on('session.start', async ($, e, next) => {
    const agent = agentOf(await $.env.get('CLAUDE_CODE_AGENT')) ?? (await read($, agentAtom))
    await activate($, agent)
    return next(e)
  })

  on('classic.SessionStart', async ($, e, next) => {
    await fromClassic($, e)
    return next(e)
  }).catch(($, e, next) => next(e))
  on('classic.UserPromptSubmit', async ($, e, next) => {
    await fromClassic($, e)
    return next(e)
  }).catch(($, e, next) => next(e))
  // The main loop stops: a background wait whose task is no longer in flight has ended.
  on('classic.Stop', async ($, e, next) => {
    if (e.agent_id === undefined && Array.isArray(e.background_tasks)) {
      const live = new Set(e.background_tasks.map(task => task.id))
      for (const id of cfg.bg.keys()) if (!live.has(id)) cfg.bg.delete(id)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') {
      await update($, last, () => null)
      await update($, prev, () => null)
      await update($, miss, () => null)
    }
    return next(e)
  })

  // One model request of the main loop: its usage is the cache's report.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined || !(await isShown($))) return yield* next(e)
    await resume($)
    const startedAt = await $.clock.now()
    cfg.inFlight += 1
    let result
    try {
      result = yield* next(e)
    } finally {
      cfg.inFlight -= 1
    }
    const u = result.usage
    if (u) {
      await record($, {
        startedAt,
        model: u.model,
        read: u.cache_read_input_tokens,
        write: u.cache_creation_input_tokens,
        fresh: u.input_tokens,
      })
    }
    return result
  })

  // The orchestrator's waits: one that outlasts the cache makes the next wake-up rewrite
  // it, unless keep-alive pings renew the entry while it runs.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (e.agentId !== undefined || (await read($, agentAtom)) === null) return next(e)
    const wait = parseWait(e.command, e.run_in_background === true, e.timeout)
    if (!wait) return next(e)
    const p = (await read($, policy)) ?? (await refreshPolicy($))
    const s = await read($, last)
    const warm = warmOn()
    const left = s ? remainingMs(s, p.ttl, await $.clock.now()) : 0
    // Pings renew only a live entry worth pinging (shouldWarm's rules), from the budget left.
    const covered = warm && s !== null && left > 0 && promptTokens(s) >= TOAST_MIN_TOKENS
    const span = covered ? warmSpanMs(p.ttl, left, warmBudget(p.ttl) - cfg.pings) : ttlMs(p.ttl)
    if (opt.waitGuard !== 'off' && wait.ms > span - WAIT_MARGIN_MS) {
      const size = s ? `${fmtTokens(promptTokens(s))} tokens` : 'the whole conversation'
      const what = covered
        ? `longer than keep-alive covers (${warmBudget(p.ttl)} pings on the ${p.ttl} prompt cache, ${p.source})`
        : `longer than the ${p.ttl} prompt cache (${p.source})`
      const why = `this ${wait.tool} wait can block for ${fmtClock(wait.ms)}, ${what}, so the next request would write ${size} to the cache again.`
      if (opt.waitGuard !== 'warn') {
        return { deny: `${$.plugin.name}: ${why} Run it again with ${suggestedTimeout(wait.tool, p.ttl, span)} or less; a timeout is a check-in, so wait again after it.` }
      }
      $.ui.toast(`Wait of ${fmtClock(wait.ms)} outlasts the ${p.ttl} cache`)
    } else if (s && !covered && opt.waitGuard !== 'off') {
      if (left > 0 && wait.ms > left - 5_000 && promptTokens(s) >= TOAST_MIN_TOKENS) {
        $.ui.toast(`This wait may outlast the cache (${fmtClock(left)} left)`)
      }
    }
    if (!covered || !Number.isFinite(wait.ms)) return next(e)
    const until = (await $.clock.now()) + wait.ms
    if (e.run_in_background !== true) cfg.fgUntil = until
    let res: ToolCallResult<'Bash'>
    try {
      res = await next(e)
    } finally {
      if (e.run_in_background !== true) cfg.fgUntil = 0
    }
    trackBackground(res, until) // only once the task runs: a denied call never pings
    return res
  }).catch(($, e, next) =>
    // A meter, not a safety guard: if it fails, the command runs as asked.
    next(e),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await isShown($))) return next(e)
    await resume($)
    const s = await read($, last)
    const currentPhase = await read($, phase)
    if (!s && !currentPhase) return next(e)
    const agent = await read($, agentAtom)
    const p = await read($, policy)
    const t = (await read($, now)) || (await $.clock.now())
    const why = await read($, miss)
    const { Box, Text } = $.ui.resolve(e)
    const parts: { text: string; color?: 'warning' | 'error' }[] = []

    if (s && p) {
      const left = remainingMs(s, p.ttl, t)
      const size = promptTokens(s)
      if (s.read + s.write === 0) {
        parts.push({ text: 'cache: not used' })
      } else if (left === 0) {
        parts.push({ text: `cache expired (${p.ttl}) · next request writes ${fmtTokens(size)}`, color: 'error' })
      } else {
        parts.push({
          text: `cache ${Math.round(hitRatio(s) * 100)}% read · ${fmtClock(left)} left (${p.ttl}, ${p.source})`,
          color: left <= WARN_LEFT_MS ? 'warning' : undefined,
        })
      }
      if (why) parts.push({ text: `miss: ${why}`, color: 'warning' })
      if (warmOn() && t < pendingUntil(t)) {
        parts.push({ text: `keep-alive ${cfg.pings}/${warmBudget(p.ttl)}` })
      }
      const isLarge = agent !== null && size >= checkpointAt
      parts.push({
        text: isLarge ? `ctx ${fmtTokens(size)}: checkpoint + clear at the next clean point` : `ctx ${fmtTokens(size)}`,
        color: isLarge ? 'warning' : undefined,
      })
    }
    if (agent && currentPhase) parts.push({ text: `${agent} · ${currentPhase}` })

    return (
      <Box>
        {parts.map((part, i) => (
          <Text key={`p${i}`} color={part.color} dimColor={part.color === undefined}>
            {i > 0 ? ' · ' : ''}{part.text}
          </Text>
        ))}
      </Box>
    )
  })
}

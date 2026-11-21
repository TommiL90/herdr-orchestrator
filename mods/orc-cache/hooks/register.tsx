import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Policy, Sample, Ttl } from '../types'
import {
  agentOf, decideTtl, fmtClock, fmtTokens, hitRatio, missReason, observeTtl, parseWait,
  phaseFile, promptTokens, remainingMs, suggestedTimeout, ttlMs, WAIT_MARGIN_MS,
} from './cache'

const last = atom({ plugin: 'orc-cache', key: 'last' } as const, null as Sample | null)
const prev = atom({ plugin: 'orc-cache', key: 'prev' } as const, null as Sample | null)
const observed = atom({ plugin: 'orc-cache', key: 'observed' } as const, null as Ttl | null)
const policy = atom({ plugin: 'orc-cache', key: 'policy' } as const, null as Policy | null)
const miss = atom({ plugin: 'orc-cache', key: 'miss' } as const, null as string | null)
const phase = atom({ plugin: 'orc-cache', key: 'phase' } as const, null as string | null)
const agentAtom = atom({ plugin: 'orc-cache', key: 'agent' } as const, null as string | null)
const now = atom({ plugin: 'orc-cache', key: 'now' } as const, 0)

type Options = { ttl?: string; waitGuard?: string; checkpointAtTokens?: number; everywhere?: boolean }
/** Toasts and hints only for prompts at least this large: below it a rewrite costs little. */
const TOAST_MIN_TOKENS = 20_000
const WARN_LEFT_MS = 60_000

/** What register's options settle to, shared with the helpers below. */
const cfg: { opt: Options; checkpointAt: number; phasePath?: string } = { opt: {}, checkpointAt: 150_000 }

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

export const register: Register = (on, options) => {
  const opt = (options ?? {}) as Options
  cfg.opt = opt
  cfg.checkpointAt = typeof opt.checkpointAtTokens === 'number' && opt.checkpointAtTokens > 0
    ? opt.checkpointAtTokens : 150_000
  const checkpointAt = cfg.checkpointAt
  let timer: { cancel: () => void } | undefined
  let ticks = 0

  on('session.start', async ($, e, next) => {
    const agent = agentOf(await $.env.get('CLAUDE_CODE_AGENT'))
    await update($, agentAtom, () => agent)
    cfg.phasePath = agent
      ? phaseFile((await $.env.get('HOME')) ?? '', agent, {
          hcTerminal: await $.env.get('HC_TERMINAL_ID'),
          herdrSession: await $.env.get('HERDR_SESSION'),
          herdrPane: await $.env.get('HERDR_PANE_ID'),
        })
      : undefined
    timer?.cancel()
    timer = undefined
    if (agent || opt.everywhere === true) {
      await refreshPolicy($)
      await readPhase($)
      timer = $.clock.every(1000, () => {
        ticks += 1
        void $.clock.now().then(t => update($, now, () => t))
        if (ticks % 3 === 0) void readPhase($)
      })
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, last, () => null)
      await update($, prev, () => null)
      await update($, miss, () => null)
    }
    return next(e)
  })

  // One model request of the main loop: its usage is the cache's report.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined || !(await isShown($))) return yield* next(e)
    const startedAt = await $.clock.now()
    const result = yield* next(e)
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

  // The orchestrator's waits: one that outlasts the cache makes the next wake-up rewrite it.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (opt.waitGuard === 'off' || e.agentId !== undefined || (await read($, agentAtom)) === null) return next(e)
    const wait = parseWait(e.command, e.run_in_background === true, e.timeout)
    if (!wait) return next(e)
    const p = (await read($, policy)) ?? (await refreshPolicy($))
    const s = await read($, last)
    const size = s ? `${fmtTokens(promptTokens(s))} tokens` : 'the whole conversation'
    if (wait.ms > ttlMs(p.ttl) - WAIT_MARGIN_MS) {
      const why = `this ${wait.tool} wait can block for ${fmtClock(wait.ms)}, longer than the ${p.ttl} prompt cache (${p.source}), so the next request would write ${size} to the cache again.`
      if (opt.waitGuard !== 'warn') {
        return { deny: `${$.plugin.name}: ${why} Run it again with ${suggestedTimeout(wait.tool, p.ttl)} or less; a timeout is a check-in, so wait again after it.` }
      }
      $.ui.toast(`Wait of ${fmtClock(wait.ms)} outlasts the ${p.ttl} cache`)
      return next(e)
    }
    if (s) {
      const left = remainingMs(s, p.ttl, await $.clock.now())
      if (left > 0 && wait.ms > left - 5_000 && promptTokens(s) >= TOAST_MIN_TOKENS) {
        $.ui.toast(`This wait may outlast the cache (${fmtClock(left)} left)`)
      }
    }
    return next(e)
  }).catch(($, e, next) =>
    // A meter, not a safety guard: if it fails, the command runs as asked.
    next(e),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await isShown($))) return next(e)
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

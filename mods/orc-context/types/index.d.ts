export type Status = 'working' | 'blocked' | 'idle' | 'done' | 'unknown'

/** A role pane of the orchestrator (hooks/roster.ts, identical to orc-graph's). */
export type Member = {
  /** The pane name the orchestrator addresses it by: a role, or `<role>-<n>`. */
  name: string
  role: string
  /** hc terminal address (`t7`) or herdr pane id (`w1:p2`). */
  address: string
  /** The CLI running in the pane as the multiplexer detects it; undefined for a bare shell. */
  cli?: string
  status: Status
  /** The file name (without `.json`) a Claude Code session in that pane reports its context to. */
  ctxKey: string
}

/** What a Claude Code session in an hc/herdr pane writes to ~/.local/state/orc/ctx/<key>.json. */
export type CtxReport = {
  key: string
  /** Input tokens the last response was answered over (cached and uncached). */
  tokens: number
  /** The model's context window. */
  window: number
  model?: string
  /** Output tokens of that response: the next request carries them too. */
  output?: number
  /** The token count at which that session compacts by itself; absent when it does not. */
  compactAt?: number
  /** When it was written, in ms since the epoch. */
  at: number
}

/** The orchestrator's own window. */
export type MainCtx = { tokens?: number; window: number; model?: string; output?: number; compactAt?: number }

export type SubCtxStatus = 'working' | 'blocked' | 'idle' | 'done' | 'failed'

/** An internal subagent's context, from its own requests. */
export type SubCtx = {
  agentId: string
  type: string
  label: string
  model?: string
  tokens: number
  status: SubCtxStatus
  since: number
}

declare module 'claude-code' {
  interface PluginState {
    'orc-context': {
      /** hcorc or herdorc once the session is seen to run one, else null. */
      agent: string | null
      /** The orchestrator's role panes, as of the last poll. */
      members: Shaped<Member[]>
      /** The reports those panes wrote, by ctxKey. */
      panes: Shaped<CtxReport[]>
      main: Shaped<MainCtx | null>
      subs: Shaped<SubCtx[]>
    }
  }
}

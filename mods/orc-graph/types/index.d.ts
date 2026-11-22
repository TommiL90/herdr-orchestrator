export type Status = 'working' | 'blocked' | 'idle' | 'done' | 'unknown'

/** A role pane of the orchestrator (hooks/roster.ts). */
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

/** A role pane and when its state last changed. */
export type Tracked = Member & { since: number }

export type SubStatus = 'working' | 'blocked' | 'idle' | 'done' | 'failed'

/** An internal subagent the orchestrator spawned. */
export type Sub = {
  /** The Agent tool call that spawned it. */
  id: string
  agentId?: string
  type: string
  label: string
  status: SubStatus
  since: number
}

export type FlowDir = 'out' | 'in'

/** Information passed to (out) or from (in) a pane or subagent. */
export type Flow = { target: string; dir: FlowDir; at: number }

declare module 'claude-code' {
  interface PluginState {
    'orc-graph': {
      /** hcorc or herdorc once the session is seen to run one, else null. */
      agent: string | null
      /** The orchestrator's role panes, as of the last poll. */
      members: Shaped<Tracked[]>
      /** Internal subagents the orchestrator spawned this session. */
      subs: Shaped<Sub[]>
      /** Newest flow per target and direction. */
      flows: Shaped<Flow[]>
      /** The ODD phase, from orc.py's phase file. */
      phase: string | null
      /** Animation frame: moves the packets on live wires and the working spinners. */
      frame: number
      /** Clock tick for elapsed times. */
      now: number
    }
  }
}

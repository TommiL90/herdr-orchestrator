export type Ttl = '5m' | '1h'

/** One main-loop model request, as its usage reported it. */
export type Sample = {
  /** When the request started, in $.clock.now() milliseconds. */
  startedAt: number
  model: string
  /** Input tokens the cache served. */
  read: number
  /** Input tokens written to the cache. */
  write: number
  /** Input tokens neither read from nor written to the cache. */
  fresh: number
}

/** The lifetime in force and where it came from. */
export type Policy = { ttl: Ttl; source: string }

declare module 'claude-code' {
  interface PluginState {
    'orc-cache': {
      last: Sample | null
      prev: Sample | null
      /** Lifetime shown by request timing, when it has shown one. */
      observed: Ttl | null
      policy: Policy | null
      /** The latest cache miss explanation, cleared by the next hit. */
      miss: string | null
      /** The orchestrator's ODD phase, from orc.py's phase file. */
      phase: string | null
      /** hcorc or herdorc when the session runs one, else null. */
      agent: string | null
      /** Clock tick that redraws the countdown. */
      now: number
    }
  }
}

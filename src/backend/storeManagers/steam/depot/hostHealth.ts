// Debug/steam-install-slow-start (cycle 3): host-scoring / health-aware
// content-server selection.
//
// ROOT CAUSE this replaces (see .planning/debug/steam-install-slow-start.md,
// cycle-3 definitive diagnosis from an instrumented hardware reproduction):
// fetchChunk's plain round-robin (`hosts[(seed + i) % hosts.length]`) gives
// every content-server host an EQUAL share of attempts regardless of its
// actual reliability. A real run showed content-server hosts with wildly
// different health co-existing in the same 6-host pool for the whole ~15min
// stream:
//   - two Auckland caches: ~94%/~93% success, ~285-298ms avg -- GOOD
//   - alibaba.cdn.steampipe...: 0/258 (0% success), fast-fail ~57ms -- DEAD
//   - cache1-akl-edgx: ~12% success -- MOSTLY DEAD
//   - steampipe.akamaized.net: ~69% success -- MEDIOCRE
//   - fastly...: ~70% success but degrading toward ~4000ms avg -- SLOW
// Plain round-robin spent as much retry budget (and, critically, as much
// EXPONENTIAL-BACKOFF SLEEP TIME between attempts) on the dead/mediocre hosts
// as on the two genuinely good ones. Across many concurrent chunk-fetch
// workers this collapsed the aggregate attempt rate during the failing
// window (observed ~0.8 attempts/sec versus a healthy multi-hundred/sec rate)
// even though NO single attempt ever timed out -- workers were sleeping in
// backoff between doomed attempts, not hung on any one request.
//
// This module tracks per-host attempt outcomes and lets fetchChunk (in
// decompress.ts) pick hosts in an order that favors recent success rate +
// latency, and pushes persistently-failing hosts to the back of the queue
// (never fully excludes them -- a transient CDN-wide outage must still have
// SOME candidate to retry against, per the D-UAT-05/06 "never manufacture a
// permanent failure out of a temporary one" discipline already established
// in this module).
//
// Debug/steam-install-slow-start (cycle 5): a cycle-4 diagnostic hardware
// capture (~30s directory dump, Auckland/cell 22) confirmed the content-server
// DIRECTORY itself already ranks these same 6 hosts by `weightedload` (lower
// = better) before we ever touch them: the 3 local SteamCache edges scored
// 20/37/48, the 3 global CDN fallbacks (steampipe.akamaized.net, alibaba,
// fastly) all scored 130 -- and the real Steam client is known to weight
// almost all traffic to the low-weightedload locals, treating the 130s as
// last resort. We were discarding that ranking entirely (`servers.map((s) =>
// s.Host)`), which is WHY plain round-robin (and, before this cycle, health
// scoring with a neutral cold start) gave alibaba/edgx the same initial
// attempt share as the two good Auckland caches. This cycle seeds
// HostHealthTracker's cold-start score from `weightedload` (via the optional
// `weightedLoads` constructor arg -- see `priorScoreFromWeightedLoad`/`score`
// below) so the directory's OWN ranking drives the very first picks, while
// still letting empirical outcomes (the pre-existing unhealthy circuit
// breaker + success/latency scoring, unchanged) override a good prior that
// turns out to be unreliable in practice -- exactly what cache1-akl-edgx
// needs (best prior, weightedload=20, yet only ~12% empirical success).

/** Outcome of a single fetchChunk attempt against one host. */
export type HostAttemptOutcome = 'success' | 'timeout' | 'error'

interface MutableHostStats {
  attempts: number
  successes: number
  /** Resets to 0 on ANY success -- a host that starts responding again is
   *  immediately eligible to rejoin the healthy bucket (half-open circuit
   *  breaker), rather than staying penalized for a stale failure streak. */
  consecutiveFailures: number
  totalMs: number
}

export interface HostStatsSnapshot {
  host: string
  attempts: number
  successes: number
  consecutiveFailures: number
  avgMs: number
  /** 1 (optimistic default) when there is no attempt history yet. */
  successRate: number
  unhealthy: boolean
}

/** A host with this many CONSECUTIVE failures is deprioritized immediately,
 *  regardless of total sample size -- catches a host like the observed
 *  alibaba edge (0/258) fast, without waiting for a large sample. */
export const MAX_CONSECUTIVE_FAILURES = 5

/** Below this many total attempts, a host's success RATE is not yet a
 *  reliable signal (a single unlucky failure on attempt 1 must never
 *  permanently sink a host) -- only the consecutive-failure streak above can
 *  deprioritize a host before this many samples exist. */
export const MIN_SAMPLES_FOR_UNHEALTHY = 5

/** At/above MIN_SAMPLES_FOR_UNHEALTHY attempts, a success rate below this
 *  threshold marks a host unhealthy (deprioritized, not excluded). Chosen
 *  well below the ~69-70% "mediocre" hosts observed in the real diagnosis so
 *  only genuinely bad hosts (0-31% observed) are pushed to the back -- a
 *  merely-mediocre host still competes normally on the composite score. */
export const MIN_SUCCESS_RATE_FOR_HEALTHY = 0.35

/** Latency's contribution to the composite score is intentionally small
 *  relative to success-rate deltas (max range 1.0) -- it only breaks
 *  near-ties among hosts with comparable reliability. A 0%-success host can
 *  never outrank a 90%-success host purely by failing fast. */
export const LATENCY_SCORE_DIVISOR_MS = 50_000

/** Debug/steam-install-slow-start (cycle 5): divisor converting a
 *  content-server directory `weightedload` value (cycle-4 lead (a) --
 *  captured but previously discarded) into a 0..1 PRIOR score for
 *  HostHealthTracker's cold start, where LOWER weightedload -> HIGHER prior.
 *  Calibrated against the cycle-4 captured Auckland directory response
 *  (local SteamCache edges: weightedload 20-48; global CDN fallbacks:
 *  weightedload 130) so the three local edges score meaningfully higher
 *  (~0.51-0.71) than the three CDN fallbacks (~0.28) at this divisor, mirroring
 *  the real Steam client's own near-exclusive preference for the local caches,
 *  while leaving room for empirical evidence to reorder within/across that gap
 *  once real attempt history accumulates (see `score` below). */
export const WEIGHTEDLOAD_PRIOR_DIVISOR = 50

/** Debug/steam-install-slow-start (cycle 5): number of attempts at which a
 *  host's directory-weightedload PRIOR and its empirical success/latency
 *  score contribute EQUALLY to the composite score used for ordering. Below
 *  this, the prior (Steam's own ranking) dominates -- we have little/no
 *  track record yet, so the directory's signal is the best one available.
 *  At/above this, empirical evidence increasingly dominates -- we now know
 *  more about THIS host, on THIS network, THIS run, than the directory's
 *  generic ranking can tell us. Set equal to MIN_SAMPLES_FOR_UNHEALTHY so the
 *  prior's influence has materially faded by the same point the unhealthy
 *  circuit-breaker's success-rate check first becomes active -- a host with
 *  the BEST prior (e.g. the diagnosis's cache1-akl-edgx, weightedload=20) can
 *  still be demoted fast by real failures; the prior only ever seeds the
 *  INITIAL preference, never overrides sustained observed unreliability. */
export const PRIOR_HALFLIFE_SAMPLES = MIN_SAMPLES_FOR_UNHEALTHY

/** Debug/steam-install-slow-start (Thread C, Phase 25): caps how many of the
 *  top-scored healthy hosts attempt-0 fans concurrent chunk workers across.
 *  Root cause this fixes: the composite-score sort (above) discards seed
 *  rotation once scores differentiate -- every attempt-0 call converges on
 *  `ordered[0]`, so all concurrent workers hammer the single top-scored host
 *  even when several hosts are genuinely healthy (cycle-5's diagnosis showed
 *  6 hosts in the pool, only 1 ever attempted at attempt-0). Kept small (3)
 *  so fan-out stays confined to the genuinely-good hosts -- mirrors cycle-5's
 *  local-vs-CDN-fallback weightedload gap, where only the low-weightedload
 *  local edges should absorb the bulk of first-attempt load; a merely-
 *  healthy-but-mediocre host still only receives fan-out share, never a
 *  disproportionate one. */
export const TOP_N_FANOUT = 3

/** Quick 260817-ihr (IHR-01): number of consecutive attempt-0 `pickHost`
 *  calls between probe picks that give a demoted (unhealthy) host one more
 *  first-attempt shot. Root cause this fixes: attempt-0 fan-out (above)
 *  draws from `healthy` ONLY, so a host demoted by MAX_CONSECUTIVE_FAILURES
 *  never receives another attempt-0 pick, therefore never records another
 *  success, therefore never clears its streak -- the "half-open circuit
 *  breaker" documented on `MutableHostStats.consecutiveFailures` ("Resets to
 *  0 on ANY success") was UNREACHABLE in production before this. Evidence:
 *  the 2026-08-17 HUMANKIND hardware log's 12:52:57 `chunk-stream stats`
 *  line showed cache1-akl-edgx (99.5% lifetime success) and cache1-akl-tpwr
 *  (99.8%) both flagged UNHEALTHY, with attempt counters byte-identical
 *  (`a=2848`, `a=3079`) between that line and the one 13 minutes earlier --
 *  proof they received zero further attempts of any kind while demoted.
 *  Cost bound: at most 1 in DEMOTED_PROBE_INTERVAL first attempts is spent
 *  on a demoted host (under 3.2% of attempt-0 traffic at 32), while a
 *  recovering host rejoins after a single recorded success. 32 is chosen as
 *  roughly one probe per full sweep of the 32-slot worker pool
 *  (TARGET_INFLIGHT_CHUNKS in depot.ts). */
export const DEMOTED_PROBE_INTERVAL = 32

/** Converts a directory `weightedload` value into a 0..1 PRIOR score, higher
 *  is better (mirrors the empirical `score` scale below so the two blend
 *  meaningfully). Exported for direct unit testing of the calibration. */
export function priorScoreFromWeightedLoad(weightedload: number): number {
  return 1 / (1 + weightedload / WEIGHTEDLOAD_PRIOR_DIVISOR)
}

function defaultStats(): MutableHostStats {
  return { attempts: 0, successes: 0, consecutiveFailures: 0, totalMs: 0 }
}

function isUnhealthy(stats: MutableHostStats): boolean {
  if (stats.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) return true
  if (stats.attempts < MIN_SAMPLES_FOR_UNHEALTHY) return false
  return stats.successes / stats.attempts < MIN_SUCCESS_RATE_FOR_HEALTHY
}

/**
 * Composite score, higher is better.
 *
 * `prior` is the host's directory-weightedload PRIOR score (see
 * priorScoreFromWeightedLoad), or `undefined` when no weightedload is known
 * for this host (e.g. a directory response that omits the field, or --
 * every pre-cycle-5 caller/test -- no HostHealthTracker weightedLoads map
 * supplied at all). `undefined` means "no prior signal", NOT "prior=1" --
 * treating an unknown prior as a synthetic best-possible score would let a
 * low-sample host with no real ranking data outrank a well-established good
 * host purely on prior-blend uncertainty, which is exactly the pathological
 * dominance the fix directive warns against. So an undefined prior falls
 * straight through to the pre-cycle-5 pure-empirical formula, byte-for-byte
 * unchanged.
 *
 * A host with zero attempts AND no prior scores exactly 1 (the best possible
 * successRate-only score) so a never-tried, never-ranked host still gets a
 * fair first try. A host with zero attempts and a KNOWN prior scores exactly
 * that prior -- this is what makes cold start favor the directory's own
 * low-weightedload (local) edges immediately, instead of a blind round-robin.
 */
function score(stats: MutableHostStats, prior: number | undefined): number {
  if (stats.attempts === 0) return prior ?? 1
  const successRate = stats.successes / stats.attempts
  const avgMs = stats.totalMs / stats.attempts
  const empirical = successRate - avgMs / LATENCY_SCORE_DIVISOR_MS
  if (prior === undefined) return empirical
  // Fades the prior's contribution as real attempt history accumulates --
  // neither the prior nor the observed evidence alone dominates
  // pathologically (fix directive constraint): early on, a good prior can
  // win a close call against thin empirical data; by PRIOR_HALFLIFE_SAMPLES
  // attempts, observed behavior is weighted equally; well beyond that,
  // observed behavior dominates. The unhealthy circuit-breaker (above) is
  // ENTIRELY independent of prior and can demote a good-prior host
  // (cache1-akl-edgx, weightedload=20) the moment it racks up
  // MAX_CONSECUTIVE_FAILURES real failures, regardless of this blend.
  const priorWeight = PRIOR_HALFLIFE_SAMPLES / (PRIOR_HALFLIFE_SAMPLES + stats.attempts)
  return priorWeight * prior + (1 - priorWeight) * empirical
}

/**
 * Per-download-run host-health tracker. ONE instance per downloadSteamDepots
 * invocation (created fresh in downloadDepotFiles) -- deliberately NEVER a
 * module-level singleton, so:
 *   (a) a bad run today never permanently poisons a host for a later,
 *       unrelated install (CDN routing/health can differ run to run), and
 *   (b) tests never leak state into each other.
 *
 * fetchChunk (decompress.ts) calls `record` after every attempt and
 * `pickHost` before every attempt. Passing NO tracker at all (existing
 * callers/tests) leaves fetchChunk's original plain round-robin behavior
 * completely unchanged -- this is purely additive.
 *
 * Debug/steam-install-slow-start (cycle 5): optionally seeded with the
 * content-server directory's own `weightedload` ranking per host (cycle-4
 * lead (a) -- captured in getContentServerHosts's RAW dump but previously
 * discarded). When supplied, this becomes the PRIOR that drives cold-start
 * ordering (see `score`/`priorScoreFromWeightedLoad` above) -- a fresh
 * download run favors the directory's own low-weightedload (local,
 * less-loaded) edges immediately, mirroring the real Steam client, instead
 * of treating every host as an equal blind round-robin candidate on attempt
 * 1. Omitting it (every pre-cycle-5 caller/test) is byte-for-byte identical
 * to cycle 3/4's plain neutral cold start.
 */
export class HostHealthTracker {
  private readonly stats = new Map<string, MutableHostStats>()
  private readonly weightedLoads: ReadonlyMap<string, number>

  /** Quick 260817-ihr (IHR-01): monotonic counter incremented once per
   *  `pickHost` call with `attemptIndex === 0` (never on retries -- retries
   *  already rotate through the full ordered list, demoted hosts included).
   *  Drives the DEMOTED_PROBE_INTERVAL cadence below. */
  private attemptZeroCounter = 0

  constructor(weightedLoads?: ReadonlyMap<string, number>) {
    this.weightedLoads = weightedLoads ?? new Map()
  }

  private ensure(host: string): MutableHostStats {
    let s = this.stats.get(host)
    if (!s) {
      s = defaultStats()
      this.stats.set(host, s)
    }
    return s
  }

  /** The host's directory-weightedload PRIOR score, or `undefined` when no
   *  weightedload is known for it (see `score`'s doc comment for why
   *  `undefined` is distinct from "prior=1"). */
  private priorFor(host: string): number | undefined {
    const weightedload = this.weightedLoads.get(host)
    return weightedload === undefined ? undefined : priorScoreFromWeightedLoad(weightedload)
  }

  private compositeScore(host: string): number {
    return score(this.ensure(host), this.priorFor(host))
  }

  /** Records the outcome of one fetchChunk attempt against `host`. */
  record(host: string, outcome: HostAttemptOutcome, ms: number): void {
    const s = this.ensure(host)
    s.attempts++
    s.totalMs += ms
    if (outcome === 'success') {
      s.successes++
      s.consecutiveFailures = 0
    } else {
      s.consecutiveFailures++
    }
  }

  /**
   * Returns the host to try for `attemptIndex` (0-based) out of `hosts`,
   * given a per-file/per-chunk `seed` (same seed fetchChunk's callers already
   * derive, e.g. `fileSeed % hosts.length` in depot.ts).
   *
   * With NO attempt history for any host in `hosts` AND no weightedLoads
   * supplied to the constructor (score() returns the neutral 1 for
   * everyone), Array.prototype.sort's spec-guaranteed stability (ES2019+)
   * leaves the seed-rotated order below UNCHANGED -- i.e. this is
   * byte-for-byte the same selection the original plain
   * `hosts[(seed + i) % hosts.length]` round-robin produced. When
   * weightedLoads IS supplied, a cold host's score is its PRIOR instead of
   * the neutral 1, so the very first pick already favors the
   * directory-preferred (local, low-weightedload) hosts. Either way,
   * deprioritization into the unhealthy bucket only emerges as real attempt
   * history accumulates against specific hosts, independent of any prior.
   *
   * Debug/steam-install-slow-start (Thread C, Phase 25): `workerSlot` is an
   * optional per-worker index (0-based, e.g. a chunk-pool worker's own slot
   * within its `Array.from({ length: workerCount }, ...)` pool) used ONLY on
   * `attemptIndex === 0`, to fan concurrent workers' FIRST attempt across the
   * top `TOP_N_FANOUT` healthy hosts instead of every worker converging on
   * `ordered[0]`. Every attempt beyond 0 (failure-driven retry/rotation) and
   * the circuit breaker above are completely untouched by this parameter --
   * omitting it (every pre-Phase-25 caller/test) defaults it to 0, which,
   * combined with `healthy[0 % N] === healthy[0] === ordered[0]`, reproduces
   * the exact pre-Phase-25 selection byte-for-byte.
   *
   * Quick 260817-ihr (IHR-01): the "half-open circuit breaker" documented on
   * `MutableHostStats.consecutiveFailures` was UNREACHABLE in production
   * before this fix -- a demoted host got no attempt-0 traffic (fan-out
   * above draws from `healthy` only), so it could never record the success
   * that would clear its streak, and a brief blip became a permanent
   * demotion for the rest of the run. Every DEMOTED_PROBE_INTERVAL-th
   * attempt-0 call (counted per tracker instance, POST-increment, so the
   * very first attempt-0 call after a fresh demotion is never diverted --
   * this preserves every pre-260817-ihr caller/test's immediate-first-pick
   * expectation), when a demoted host AND a healthy alternative both exist,
   * sends that one call to the best-scoring demoted host instead of the
   * normal fan-out -- the probe is what makes the circuit breaker real.
   */
  pickHost(hosts: string[], seed: number, attemptIndex: number, workerSlot = 0): string {
    if (!hosts.length) {
      throw new Error('HostHealthTracker.pickHost: empty hosts list')
    }
    const rotated = hosts.map((_, i) => hosts[(seed + i) % hosts.length])

    const healthy: string[] = []
    const unhealthy: string[] = []
    for (const host of rotated) {
      ;(isUnhealthy(this.ensure(host)) ? unhealthy : healthy).push(host)
    }
    // Stable sort: ties (equal composite score -- always true on a cold
    // start with no weightedLoads) preserve the seed-rotated relative order
    // above; with weightedLoads supplied, a cold start instead sorts by
    // PRIOR (directory weightedload), never a tie unless two hosts share the
    // exact same weightedload.
    healthy.sort((a, b) => this.compositeScore(b) - this.compositeScore(a))
    unhealthy.sort((a, b) => this.compositeScore(b) - this.compositeScore(a))

    // Unhealthy hosts are NEVER dropped entirely -- only deprioritized to the
    // back of the queue -- so a transient CDN-wide outage (every host
    // temporarily unhealthy) still has a candidate list to retry against.
    const ordered = [...healthy, ...unhealthy]

    // Quick 260817-ihr (IHR-01): bounded probe for a demoted host's
    // recovery, checked BEFORE the Phase 25 fan-out below so a probe call
    // never also falls through to fan-out logic. Only on attempt-0 (retries
    // already see the demoted host via `ordered` below); only when a
    // healthy alternative genuinely exists (`healthy.length > 0`), so this
    // never double-serves the last-resort `ordered` fallback that already
    // covers the all-unhealthy case; and only once every
    // DEMOTED_PROBE_INTERVAL attempt-0 calls. Incremented BEFORE the modulo
    // check (post-increment) so the very first attempt-0 call on a fresh
    // tracker is never itself a probe -- every pre-260817-ihr caller/test
    // exercises exactly this "first pick after a demotion avoids the
    // demoted host" shape, and this ordering keeps that byte-for-byte
    // unchanged while still guaranteeing a probe within any
    // DEMOTED_PROBE_INTERVAL-length run of attempt-0 calls.
    if (attemptIndex === 0) {
      this.attemptZeroCounter++
      if (
        unhealthy.length > 0 &&
        healthy.length > 0 &&
        this.attemptZeroCounter % DEMOTED_PROBE_INTERVAL === 0
      ) {
        return unhealthy[0]
      }
    }

    // Phase 25 fan-out: ONLY on the first attempt, and only when there are
    // genuinely more than one healthy host to spread across, distribute
    // workers by their slot index over the top-N healthy hosts. Every other
    // case (attemptIndex > 0, or N <= 1, e.g. 0-1 healthy hosts) falls
    // through to the pre-Phase-25 ordered[attemptIndex % ordered.length]
    // selection, unchanged.
    const N = Math.min(TOP_N_FANOUT, healthy.length)
    if (attemptIndex === 0 && N > 1) {
      return healthy[workerSlot % N]
    }
    return ordered[attemptIndex % ordered.length]
  }

  /** Read-only snapshot for logging/observability (Fix Applied, cycle 3) --
   *  lets a live hardware reproduction show which hosts are currently
   *  deprioritized. Never mutates recorded history (uses a throwaway default
   *  for a host with no recorded attempts, rather than `ensure`). */
  snapshot(host: string): HostStatsSnapshot {
    const s = this.stats.get(host) ?? defaultStats()
    return {
      host,
      attempts: s.attempts,
      successes: s.successes,
      consecutiveFailures: s.consecutiveFailures,
      avgMs: s.attempts ? Math.round(s.totalMs / s.attempts) : 0,
      successRate: s.attempts ? s.successes / s.attempts : 1,
      unhealthy: isUnhealthy(s)
    }
  }
}

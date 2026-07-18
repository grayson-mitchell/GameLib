// Debug/steam-install-slow-start (cycle 3): unit tests for the host-scoring /
// health-aware content-server selection logic (depot/hostHealth.ts).
//
// See the module's own doc comment for the root-cause writeup this fix
// addresses: plain round-robin gave a 0%-success host the SAME share of
// attempts (and exponential-backoff sleep time) as a genuinely-healthy host,
// which collapsed the aggregate chunk-fetch attempt rate during a real
// hardware reproduction even though no request ever timed out.

import {
  HostHealthTracker,
  MAX_CONSECUTIVE_FAILURES,
  MIN_SAMPLES_FOR_UNHEALTHY,
  MIN_SUCCESS_RATE_FOR_HEALTHY,
  PRIOR_HALFLIFE_SAMPLES,
  priorScoreFromWeightedLoad
} from '../depot/hostHealth'

describe('HostHealthTracker', () => {
  const hosts = ['host-a', 'host-b', 'host-c', 'host-d']

  it('cold start (no attempt history) preserves the plain seed-rotation order — identical to the pre-cycle-3 round-robin', () => {
    const tracker = new HostHealthTracker()

    // seed=0: original algorithm would pick hosts[0], hosts[1], hosts[2], hosts[3]
    expect(tracker.pickHost(hosts, 0, 0)).toBe('host-a')
    expect(tracker.pickHost(hosts, 0, 1)).toBe('host-b')
    expect(tracker.pickHost(hosts, 0, 2)).toBe('host-c')
    expect(tracker.pickHost(hosts, 0, 3)).toBe('host-d')

    // seed=2: original algorithm would pick hosts[2], hosts[3], hosts[0], hosts[1]
    expect(tracker.pickHost(hosts, 2, 0)).toBe('host-c')
    expect(tracker.pickHost(hosts, 2, 1)).toBe('host-d')
    expect(tracker.pickHost(hosts, 2, 2)).toBe('host-a')
    expect(tracker.pickHost(hosts, 2, 3)).toBe('host-b')
  })

  it('a host that reaches MAX_CONSECUTIVE_FAILURES is deprioritized to the back of the order, even before enough samples exist to judge its overall success rate', () => {
    const tracker = new HostHealthTracker()

    // host-a fails MAX_CONSECUTIVE_FAILURES times in a row (below
    // MIN_SAMPLES_FOR_UNHEALTHY, so the success-rate path alone would not
    // yet condemn it — only the consecutive-failure streak does).
    expect(MAX_CONSECUTIVE_FAILURES).toBeLessThanOrEqual(MIN_SAMPLES_FOR_UNHEALTHY)
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i++) {
      tracker.record('host-a', 'error', 100)
    }

    // seed=0 would normally start at host-a; it must now be pushed behind
    // every still-healthy host (host-b, host-c, host-d all have zero history
    // and are still healthy).
    const first = tracker.pickHost(hosts, 0, 0)
    expect(first).not.toBe('host-a')
    expect(['host-b', 'host-c', 'host-d']).toContain(first)

    // host-a must still be present SOMEWHERE in the rotation (never fully
    // excluded) — with 4 hosts and 3 healthy + 1 unhealthy, it's the 4th pick.
    expect(tracker.pickHost(hosts, 0, 3)).toBe('host-a')
  })

  it('a single success resets consecutiveFailures — a host that was mostly reliable before a short failure streak is immediately eligible to rejoin the healthy rotation once it recovers (half-open circuit breaker)', () => {
    const tracker = new HostHealthTracker()

    // Establishes a strong overall track record first (mirrors a previously-
    // good host, e.g. the diagnosis's Auckland caches) — this keeps the
    // long-run success-RATE check comfortably above MIN_SUCCESS_RATE_FOR_HEALTHY
    // even after the failure streak below, isolating the effect of the
    // consecutive-failure fast path from the sample-size-based rate check.
    for (let i = 0; i < 20; i++) tracker.record('host-a', 'success', 100)

    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i++) {
      tracker.record('host-a', 'error', 100)
    }
    // Unhealthy via the fast consecutive-failure path — overall success rate
    // (20/25 = 80%) is still well above threshold, so ONLY the streak trips it.
    expect(tracker.snapshot('host-a').unhealthy).toBe(true)

    tracker.record('host-a', 'success', 50)
    expect(tracker.snapshot('host-a').unhealthy).toBe(false)
    expect(tracker.snapshot('host-a').consecutiveFailures).toBe(0)
  })

  it('a low success rate at/above MIN_SAMPLES_FOR_UNHEALTHY marks a host unhealthy even without a raw consecutive-failure streak (alternating success/failure)', () => {
    const tracker = new HostHealthTracker()

    // Alternating outcomes never builds a long consecutive-failure streak,
    // but the overall success rate is well below MIN_SUCCESS_RATE_FOR_HEALTHY.
    const outcomes: Array<'success' | 'error'> = [
      'success',
      'error',
      'error',
      'error',
      'success',
      'error',
      'error',
      'error'
    ]
    for (const outcome of outcomes) {
      tracker.record('host-a', outcome, 100)
    }

    const snap = tracker.snapshot('host-a')
    expect(snap.attempts).toBeGreaterThanOrEqual(MIN_SAMPLES_FOR_UNHEALTHY)
    expect(snap.successRate).toBeLessThan(MIN_SUCCESS_RATE_FOR_HEALTHY)
    expect(snap.unhealthy).toBe(true)
  })

  it('a single early failure does not condemn a host below MIN_SAMPLES_FOR_UNHEALTHY — one bad first attempt must never permanently sink a host', () => {
    const tracker = new HostHealthTracker()
    tracker.record('host-a', 'error', 100)
    expect(tracker.snapshot('host-a').attempts).toBeLessThan(MIN_SAMPLES_FOR_UNHEALTHY)
    expect(tracker.snapshot('host-a').unhealthy).toBe(false)
  })

  it('among healthy hosts with comparable success rates, the faster (lower avg latency) host is ranked earlier', () => {
    const tracker = new HostHealthTracker()

    // Both healthy (100% success), but host-b is much slower on average.
    for (let i = 0; i < 6; i++) {
      tracker.record('host-a', 'success', 100)
      tracker.record('host-b', 'success', 4000)
    }
    tracker.record('host-c', 'success', 250)
    tracker.record('host-d', 'success', 250)

    // seed chosen so the ORIGINAL round-robin would start at host-b — the
    // scoring must override that and prefer host-a (fastest) first.
    const first = tracker.pickHost(hosts, 1, 0)
    expect(first).toBe('host-a')
  })

  it('a 0%-success host never outranks a mediocre/healthy host purely by failing fast (latency never dominates reliability)', () => {
    const tracker = new HostHealthTracker()

    // host-a: fails every time, but instantly (very low avg latency).
    for (let i = 0; i < 8; i++) {
      tracker.record('host-a', 'error', 5)
    }
    // host-b: succeeds most of the time, but is comparatively slow.
    for (let i = 0; i < 8; i++) {
      tracker.record('host-b', i === 0 ? 'error' : 'success', 3000)
    }

    expect(tracker.snapshot('host-a').unhealthy).toBe(true)
    expect(tracker.snapshot('host-b').unhealthy).toBe(false)

    const order = [0, 1, 2, 3].map((i) => tracker.pickHost(['host-a', 'host-b'], 0, i))
    // host-b (healthy) must be tried before host-a (unhealthy, deprioritized
    // to the back), regardless of host-a's much lower latency.
    expect(order[0]).toBe('host-b')
    expect(order[1]).toBe('host-a')
  })

  it('never excludes a host entirely — if every host in the pool is unhealthy, pickHost still returns a candidate from the pool (last-resort fallback)', () => {
    const tracker = new HostHealthTracker()
    for (const host of hosts) {
      for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i++) {
        tracker.record(host, 'error', 100)
      }
    }

    for (let i = 0; i < hosts.length; i++) {
      expect(hosts).toContain(tracker.pickHost(hosts, 0, i))
    }
  })

  it('attemptIndex beyond hosts.length wraps back to the front of the ordered list (re-tries the best host again rather than degrading)', () => {
    const tracker = new HostHealthTracker()
    const firstPick = tracker.pickHost(hosts, 0, 0)
    const wrappedPick = tracker.pickHost(hosts, 0, hosts.length)
    expect(wrappedPick).toBe(firstPick)
  })

  it('pickHost throws on an empty hosts list rather than returning undefined', () => {
    const tracker = new HostHealthTracker()
    expect(() => tracker.pickHost([], 0, 0)).toThrow(/empty hosts list/)
  })

  it('snapshot of a never-recorded host reports the optimistic default (successRate=1, not unhealthy) without mutating tracker state', () => {
    const tracker = new HostHealthTracker()
    const snap = tracker.snapshot('never-seen-host')
    expect(snap.attempts).toBe(0)
    expect(snap.successRate).toBe(1)
    expect(snap.unhealthy).toBe(false)

    // Confirms snapshot() truly never mutates: pickHost's cold-start ordering
    // for this exact host set is unaffected by having snapshotted it first.
    expect(tracker.pickHost(['never-seen-host', 'host-x'], 0, 0)).toBe('never-seen-host')
  })

  // Debug/steam-install-slow-start (cycle 5): weightedload-aware host
  // selection. These values mirror the cycle-4 hardware-captured Auckland
  // directory response (cell 22): local SteamCache edges weightedload
  // 20/37/48, global CDN fallbacks (alibaba/fastly/akamaized) weightedload
  // 130 each.
  describe('weightedload-aware selection (cycle 5)', () => {
    const auckland = ['cache1-akl-edgx', 'cache1-akl-tpwr', 'cache2-akl-tpwr', 'alibaba-cdn']
    const weightedLoads = new Map<string, number>([
      ['cache1-akl-edgx', 20],
      ['cache1-akl-tpwr', 37],
      ['cache2-akl-tpwr', 48],
      ['alibaba-cdn', 130]
    ])

    it('cold-start-prefers-local-cache: with NO attempt history, pickHost orders by the directory weightedload PRIOR (lower = better), never by the seed-rotation order alone — the 130 CDN fallback is picked LAST regardless of seed', () => {
      const tracker = new HostHealthTracker(weightedLoads)

      // seed chosen so the ORIGINAL plain round-robin would start at
      // alibaba-cdn (the worst prior) — the weightedload prior must override
      // that and prefer the best-prior host (cache1-akl-edgx, weightedload=20)
      // first, with the 130 CDN fallback picked dead last.
      const seed = auckland.indexOf('alibaba-cdn')
      const order = [0, 1, 2, 3].map((i) => tracker.pickHost(auckland, seed, i))
      expect(order[0]).toBe('cache1-akl-edgx')
      expect(order[3]).toBe('alibaba-cdn')
      // Confirms the ordering is weightedload-ascending, not just
      // "best vs worst": the two mid-tier local caches sort between them.
      expect(order).toEqual([
        'cache1-akl-edgx',
        'cache1-akl-tpwr',
        'cache2-akl-tpwr',
        'alibaba-cdn'
      ])
    })

    it('cold-start-prefers-local-cache: a host with NO weightedload entry falls back to the pre-cycle-5 neutral prior (1) — never manufactured as worse than a known-CDN-fallback host', () => {
      const tracker = new HostHealthTracker(weightedLoads)
      const hostsWithUnknown = [...auckland, 'unknown-new-host']
      // The unknown host has no directory ranking at all (prior=1, the
      // pre-cycle-5 optimistic default) — it is NOT penalized relative to
      // alibaba-cdn (a known-bad prior, weightedload=130), so it sorts ahead
      // of every known-prior host including the best one.
      const first = tracker.pickHost(hostsWithUnknown, 0, 0)
      expect(first).toBe('unknown-new-host')
    })

    it('edgx-flakes-despite-good-prior: cache1-akl-edgx has the BEST weightedload prior (20) and is picked first cold, but once it racks up real consecutive failures it is demoted below the worse-prior-but-reliable tpwr caches', () => {
      const tracker = new HostHealthTracker(weightedLoads)
      const pool = ['cache1-akl-edgx', 'cache1-akl-tpwr', 'cache2-akl-tpwr']

      // Cold start: best prior (edgx, weightedload=20) wins.
      expect(tracker.pickHost(pool, 0, 0)).toBe('cache1-akl-edgx')

      // Real hardware diagnosis: edgx failed ~88% of the time in practice.
      // MAX_CONSECUTIVE_FAILURES real failures trip the (purely empirical,
      // prior-independent) circuit breaker regardless of its excellent prior.
      for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i++) {
        tracker.record('cache1-akl-edgx', 'error', 60)
      }
      expect(tracker.snapshot('cache1-akl-edgx').unhealthy).toBe(true)

      // tpwr caches meanwhile prove themselves reliable, exactly like the
      // real diagnosis (~94%/~93% success).
      for (let i = 0; i < 10; i++) {
        tracker.record('cache1-akl-tpwr', 'success', 285)
        tracker.record('cache2-akl-tpwr', 'success', 298)
      }

      // Despite edgx's still-superior directory PRIOR (weightedload=20 vs
      // 37/48), the empirically-proven-reliable tpwr caches must now be
      // picked ahead of it — the good prior does NOT override sustained
      // observed unreliability.
      const order = [0, 1, 2].map((i) => tracker.pickHost(pool, 0, i))
      expect(order[0]).not.toBe('cache1-akl-edgx')
      expect(['cache1-akl-tpwr', 'cache2-akl-tpwr']).toContain(order[0])
      expect(order[2]).toBe('cache1-akl-edgx')
    })

    it('the prior fades toward pure empirical scoring as PRIOR_HALFLIFE_SAMPLES attempts accumulate, never letting the prior alone dominate indefinitely', () => {
      const tracker = new HostHealthTracker(weightedLoads)

      // cache1-akl-tpwr (worse prior than edgx, 37 vs 20) but with a strong,
      // growing empirical track record; edgx has zero attempts (pure prior).
      for (let i = 0; i < PRIOR_HALFLIFE_SAMPLES * 4; i++) {
        tracker.record('cache1-akl-tpwr', 'success', 100)
      }

      // At well beyond PRIOR_HALFLIFE_SAMPLES attempts, tpwr's near-perfect
      // empirical score (successRate=1, low latency) should exceed edgx's
      // pure-prior score, even though edgx was never marked unhealthy (too
      // few real attempts to trip the circuit breaker) — this is only
      // possible because the prior's influence on tpwr's OWN blended score
      // has faded, letting its excellent empirical evidence win outright.
      expect(tracker.snapshot('cache1-akl-edgx').unhealthy).toBe(false)
      const first = tracker.pickHost(['cache1-akl-edgx', 'cache1-akl-tpwr'], 0, 0)
      expect(first).toBe('cache1-akl-tpwr')
    })

    it('priorScoreFromWeightedLoad is monotonically decreasing — a lower weightedload always scores at least as high as a higher one', () => {
      expect(priorScoreFromWeightedLoad(20)).toBeGreaterThan(priorScoreFromWeightedLoad(37))
      expect(priorScoreFromWeightedLoad(37)).toBeGreaterThan(priorScoreFromWeightedLoad(48))
      expect(priorScoreFromWeightedLoad(48)).toBeGreaterThan(priorScoreFromWeightedLoad(130))
    })

    it('omitting weightedLoads entirely (every pre-cycle-5 caller) reproduces the exact cycle-3/4 neutral cold-start order — no regression', () => {
      const tracker = new HostHealthTracker()
      const pool = ['cache1-akl-edgx', 'cache1-akl-tpwr', 'cache2-akl-tpwr', 'alibaba-cdn']
      // Same assertions as the original "cold start preserves round-robin"
      // test above, just with these hostnames instead of host-a..d.
      expect(tracker.pickHost(pool, 0, 0)).toBe('cache1-akl-edgx')
      expect(tracker.pickHost(pool, 0, 1)).toBe('cache1-akl-tpwr')
      expect(tracker.pickHost(pool, 0, 2)).toBe('cache2-akl-tpwr')
      expect(tracker.pickHost(pool, 0, 3)).toBe('alibaba-cdn')
    })
  })
})

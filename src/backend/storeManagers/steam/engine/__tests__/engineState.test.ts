import {
  TRIAL_NOTICE_DAYS,
  __resetEngineStateForTests,
  dismissSteamEngineNotice,
  getSteamEngineState,
  recordLaunchDecision,
  setEngineStatePublisher
} from '../engineState'
import type { EngineStateDeps } from '../engineState'
import type { CrossoverPreflight, LaunchDecision } from '../engineDecision'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

const TESTED = '26.3.0.39832'
const UNTESTED = '99.0.0.1'

function memStore() {
  const m = new Map<string, unknown>()
  return {
    get: (k: string, fb: unknown) => (m.has(k) ? m.get(k) : fb),
    set: (k: string, v: unknown) => void m.set(k, v),
    size: () => m.size
  }
}

const healthy = (
  days: number | null,
  build: string | null = TESTED
): CrossoverPreflight => ({
  kind: 'healthy',
  binDir: '/cx/bin',
  build,
  trialDaysRemaining: days
})

function mk(
  preflight: CrossoverPreflight | (() => Promise<CrossoverPreflight>),
  over: Partial<EngineStateDeps> = {}
) {
  const store = memStore()
  const probe = jest.fn(async () =>
    typeof preflight === 'function' ? preflight() : preflight
  )
  const deps: Partial<EngineStateDeps> = {
    isMac: true,
    store,
    bridgeBottleNameFor: (id) => `GameLibSteamBridge-${id}`,
    isBridgeBottleReady: () => true,
    resolveCrossoverBinDir: async () => '/cx/bin',
    readOverride: () => undefined,
    preflight: probe,
    ...over
  }
  return { deps, store, probe }
}

beforeEach(() => __resetEngineStateForTests())

describe('getSteamEngineState', () => {
  it('returns null for a non-numeric appId', async () => {
    expect(await getSteamEngineState('abc', mk(healthy(null)).deps)).toBeNull()
  })
  it('returns null on a non-mac host', async () => {
    const { deps } = mk(healthy(null), { isMac: false })
    expect(await getSteamEngineState('1', deps)).toBeNull()
  })
  it('healthy trial with 5 days shows the trial notice', async () => {
    const { deps } = mk(healthy(5))
    expect(await getSteamEngineState('1', deps)).toMatchObject({
      engine: 'crossover',
      reason: 'cx-healthy',
      trialDaysRemaining: 5,
      showTrialNotice: true
    })
  })
  it.each([
    [8, false],
    [TRIAL_NOTICE_DAYS, true],
    [null, false]
  ])('trial days %s -> showTrialNotice %s', async (days, show) => {
    const { deps } = mk(healthy(days))
    const s = await getSteamEngineState('1', deps)
    expect(s?.showTrialNotice).toBe(show)
  })
  it('expired -> builtin cx-expired', async () => {
    const { deps } = mk({
      kind: 'expired',
      binDir: '/cx/bin',
      build: TESTED,
      daysAgo: 2
    })
    expect(await getSteamEngineState('1', deps)).toMatchObject({
      engine: 'builtin',
      reason: 'cx-expired',
      showTrialNotice: false
    })
  })
  it('installed CrossOver with no ready bottle is not probed', async () => {
    let ready = false
    const { deps, probe } = mk(healthy(3), {
      isBridgeBottleReady: () => ready
    })
    expect(await getSteamEngineState('1', deps)).toEqual({
      appId: '1',
      engine: null,
      reason: null,
      engineLabel: null,
      trialDaysRemaining: null,
      showTrialNotice: false,
      crossoverInstalled: true,
      showNoCrossoverNote: false,
      untestedCrossoverBuild: null
    })
    expect(probe).not.toHaveBeenCalled()
    ready = true
    expect(await getSteamEngineState('1', deps)).toMatchObject({
      engine: 'crossover'
    })
    expect(probe).toHaveBeenCalledTimes(1)
  })
  it('CrossOver not installed -> builtin note until dismissed', async () => {
    const { deps, store } = mk(healthy(null), {
      resolveCrossoverBinDir: async () => undefined
    })
    expect(await getSteamEngineState('1', deps)).toMatchObject({
      engine: 'builtin',
      reason: 'cx-missing',
      crossoverInstalled: false,
      showNoCrossoverNote: true
    })
    expect(
      await dismissSteamEngineNotice({ kind: 'no-crossover' }, store)
    ).toEqual({ ok: true })
    expect((await getSteamEngineState('1', deps))?.showNoCrossoverNote).toBe(
      false
    )
  })
  it('a non-automatic override is unsupported', async () => {
    const { deps } = mk(healthy(null), {
      readOverride: () => 'pinned:wine-staging-11.20'
    })
    expect(await getSteamEngineState('1', deps)).toMatchObject({
      engine: 'unsupported',
      reason: 'override'
    })
  })
  it('untested build notice clears after dismissal', async () => {
    const { deps, store } = mk(healthy(null, UNTESTED))
    expect((await getSteamEngineState('1', deps))?.untestedCrossoverBuild).toBe(
      UNTESTED
    )
    await dismissSteamEngineNotice(
      { kind: 'untested-crossover', build: UNTESTED },
      store
    )
    expect(
      (await getSteamEngineState('1', deps))?.untestedCrossoverBuild
    ).toBeNull()
  })
  it('shares one in-flight preflight and caches per session', async () => {
    let release: (p: CrossoverPreflight) => void = () => {}
    const gate = new Promise<CrossoverPreflight>((r) => (release = r))
    const { deps, probe } = mk(() => gate)
    const a = getSteamEngineState('1', deps)
    const b = getSteamEngineState('1', deps)
    await new Promise((r) => setImmediate(r))
    release(healthy(null))
    await Promise.all([a, b])
    await getSteamEngineState('1', deps)
    expect(probe).toHaveBeenCalledTimes(1)
  })
})

describe('dismissSteamEngineNotice validation', () => {
  it.each([
    [null],
    [{ kind: 'bogus' }],
    [{ kind: 'untested-crossover' }],
    [{ kind: 'untested-crossover', build: 'not-a-build' }],
    [{ kind: 'untested-crossover', build: 7 }]
  ])('rejects %j and persists nothing', async (args) => {
    const store = memStore()
    expect(await dismissSteamEngineNotice(args, store)).toEqual({ ok: false })
    expect(store.size()).toBe(0)
  })
})

describe('recordLaunchDecision and publisher', () => {
  const decision = (pf: CrossoverPreflight): LaunchDecision => ({
    kind: 'use',
    selection: {
      kind: 'crossover',
      reason: 'cx-healthy',
      crossoverBuild: TESTED,
      binDir: '/cx/bin'
    },
    preflight: pf,
    pin: null,
    needsDownload: false,
    override: 'automatic',
    logLines: []
  })

  it('replaces the cached preflight and publishes once', async () => {
    const { deps, probe } = mk(healthy(20))
    await getSteamEngineState('1', deps)
    const pub = jest.fn()
    setEngineStatePublisher(pub)
    recordLaunchDecision(
      '1',
      decision(healthy(3)),
      'GameLibSteamBridge-1',
      deps
    )
    expect(pub).toHaveBeenCalledTimes(1)
    expect(pub.mock.calls[0][0]).toMatchObject({
      trialDaysRemaining: 3,
      showTrialNotice: true,
      engineLabel: 'CrossOver'
    })
    expect(await getSteamEngineState('1', deps)).toMatchObject({
      trialDaysRemaining: 3
    })
    expect(probe).toHaveBeenCalledTimes(1)
  })
  it('a throwing publisher is caught', () => {
    const { deps } = mk(healthy(null))
    setEngineStatePublisher(() => {
      throw new Error('boom')
    })
    expect(() =>
      recordLaunchDecision(
        '1',
        decision(healthy(null)),
        'GameLibSteamBridge-1',
        deps
      )
    ).not.toThrow()
  })
})

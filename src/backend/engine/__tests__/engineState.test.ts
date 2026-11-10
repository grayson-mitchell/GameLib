import {
  ENGINE_PREFLIGHT_UNHEALTHY_TTL_MS,
  TRIAL_NOTICE_DAYS,
  __resetEngineStateForTests,
  dismissEngineNotice,
  getEngineState,
  publishLaunchDeadlineNotice as publishDeadline,
  publishOverlayExitNotice as publishExit,
  publishOverlayNotice as publishNotice,
  recordLaunchDecision as recordDecision,
  setEngineStatePublisher
} from '../engineState'
import type { EngineStateDeps } from '../engineState'
import type { CrossoverPreflight, LaunchDecision } from '../engineDecision'
import type { EngineState } from 'common/types/engine'

type OverlayNoticeStep = NonNullable<EngineState['overlayNotice']>['step']

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

/**
 * Steam-shaped overrides, adapted to the generic deps by the wrappers below. The Steam wiring
 * itself is covered in steamEngineDeps.test.ts; this file never imports a store manager.
 */
type SteamStyle = Partial<EngineStateDeps> & {
  bridgeInstallBottleFor?: (appId: string) => string | null
  ownBottleNameFor?: (appId: string) => string
  isDrmModeTitle?: (appId: string) => boolean
  isBridgeBottleReady?: (bottle: string) => boolean
}

function toDeps(appId: string, o: SteamStyle): EngineStateDeps {
  const own = (o.ownBottleNameFor ?? ((id) => `GameLibSteamBridge-${id}`))(
    appId
  )
  return {
    killCrossoverWineserver: () => Promise.resolve(),
    wineManagerReleases: () => [],
    ...o,
    bottleFor: () =>
      (o.bridgeInstallBottleFor ?? ((id) => `GameLibSteamBridge-${id}`))(appId),
    overrideEligible: (_i, bottle) =>
      bottle === own && !(o.isDrmModeTitle ?? (() => false))(appId),
    overlayEligible: true,
    effective: () => {
      const raw = o.readOverride?.('x')
      return {
        kind: 'override',
        id:
          raw === 'crossover' ||
          (typeof raw === 'string' &&
            (raw.startsWith('pinned:') || raw.startsWith('wine-manager:')))
            ? (raw as 'crossover')
            : 'automatic',
        source: 'stored'
      }
    },
    isBottleReady: o.isBridgeBottleReady
  }
}

const idOf = (appName: string) => ({ runner: 'steam', appName })
const getSteamEngineState = (appId: unknown, o: SteamStyle) =>
  getEngineState(
    typeof appId === 'string' ? idOf(appId) : appId,
    toDeps(String(appId), o)
  )
const recordLaunchDecision = (
  appId: string,
  d: LaunchDecision,
  bottle: string,
  o: SteamStyle
) => recordDecision(idOf(appId), d, bottle, toDeps(appId, o))
const publishOverlayNotice = (appId: string, step: OverlayNoticeStep) =>
  publishNotice(idOf(appId), step)
const publishOverlayExitNotice = (appId: string) => publishExit(idOf(appId))
const publishLaunchDeadlineNotice = (
  appId: string,
  notice: { title: string; seconds: number }
) => publishDeadline(idOf(appId), notice)
const dismissSteamEngineNotice = dismissEngineNotice

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
  over: SteamStyle = {}
) {
  const store = memStore()
  const probe = jest.fn(async () =>
    typeof preflight === 'function' ? preflight() : preflight
  )
  const deps: SteamStyle = {
    isMac: true,
    store,
    bridgeInstallBottleFor: (id) => `GameLibSteamBridge-${id}`,
    ownBottleNameFor: (id) => `GameLibSteamBridge-${id}`,
    isDrmModeTitle: () => false,
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
      runner: 'steam',
      appName: '1',
      engine: null,
      reason: null,
      engineLabel: null,
      trialDaysRemaining: null,
      showTrialNotice: false,
      crossoverInstalled: true,
      showNoCrossoverNote: false,
      untestedCrossoverBuild: null,
      overrideEligible: true,
      overlayEligible: true,
      overrideWarning: null,
      launchNotice: null,
      overlayNotice: null,
      exitNotice: null,
      deadlineNotice: null,
      effectiveEngineId: 'automatic',
      engineSource: 'stored',
      prefixKind: null,
      perGameBottleName: null,
      legacyLabel: null
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
  it('a pinned override is unsupported', async () => {
    const { deps } = mk(healthy(null), {
      readOverride: () => 'pinned:wine-staging-11.20'
    })
    expect(await getSteamEngineState('1', deps)).toMatchObject({
      engine: 'unsupported',
      reason: 'override'
    })
  })
  it('a pinned override never awaits the preflight (G12a)', async () => {
    const { deps, probe } = mk(
      () => new Promise<CrossoverPreflight>(() => {}),
      {
        readOverride: () => 'pinned:wine-staging-11.20'
      }
    )
    expect(await getSteamEngineState('1', deps)).toMatchObject({
      engine: 'unsupported',
      crossoverInstalled: true
    })
    expect(probe).not.toHaveBeenCalled()
  })
  it.each([
    ['healthy', healthy(null)],
    [
      'expired',
      { kind: 'expired', binDir: '/cx/bin', build: TESTED, daysAgo: 2 } as const
    ]
  ])('a CrossOver override is supported (%s)', async (_n, pf) => {
    const { deps } = mk(pf, { readOverride: () => 'crossover' })
    expect(await getSteamEngineState('1', deps)).toMatchObject({
      engine: 'crossover',
      reason: 'override'
    })
  })
  it('null for a title with no bridge install, without probing', async () => {
    const resolveCrossoverBinDir = jest.fn(async () => '/cx/bin')
    const { deps, probe } = mk(healthy(null), {
      bridgeInstallBottleFor: () => null,
      resolveCrossoverBinDir
    })
    expect(await getSteamEngineState('1', deps)).toBeNull()
    expect(probe).not.toHaveBeenCalled()
    expect(resolveCrossoverBinDir).not.toHaveBeenCalled()
  })
  it('overrideEligible: own bottle true, legacy shared bottle false, probed in the install bottle', async () => {
    const own = mk(healthy(null))
    expect((await getSteamEngineState('1', own.deps))?.overrideEligible).toBe(
      true
    )
    const legacy = mk(healthy(null), {
      bridgeInstallBottleFor: () => 'GameLibSteamBridge'
    })
    expect(
      (await getSteamEngineState('1', legacy.deps))?.overrideEligible
    ).toBe(false)
    expect(legacy.probe).toHaveBeenCalledWith('GameLibSteamBridge')
  })
  it('a DRM-mode title (injected) is not override-eligible', async () => {
    const { deps } = mk(healthy(null), { isDrmModeTitle: () => true })
    expect((await getSteamEngineState('1', deps))?.overrideEligible).toBe(false)
  })
  it('overlayEligible is true for a bridge title, DRM-mode included', async () => {
    const plain = mk(healthy(null))
    expect((await getSteamEngineState('1', plain.deps))?.overlayEligible).toBe(
      true
    )
    const drm = mk(healthy(null), { isDrmModeTitle: () => true })
    expect((await getSteamEngineState('1', drm.deps))?.overlayEligible).toBe(
      true
    )
    expect((await getSteamEngineState('1', drm.deps))?.overrideEligible).toBe(
      false
    )
  })
  it('the default page preflight never kills a wineserver; an inconclusive result is not cached', async () => {
    const kill = jest.fn(async () => undefined)
    const probe = jest.fn(async () => ({
      kind: 'failed' as const,
      reason: 'timeout' as const,
      detail: 'x',
      elapsedMs: 1
    }))
    const { deps } = mk(healthy(null))
    const real: SteamStyle = {
      ...deps,
      preflight: undefined,
      probe,
      killCrossoverWineserver: kill,
      isExecutable: () => true,
      fileExists: () => true,
      readBuild: async () => TESTED,
      monitorPhase: () => null
    }
    delete real.preflight
    const first = await getSteamEngineState('1', real)
    expect(first).toMatchObject({ engine: null, reason: null })
    await getSteamEngineState('1', real)
    expect(kill).not.toHaveBeenCalled()
    expect(probe).toHaveBeenCalledTimes(2)
  })
  it('a non-healthy cached preflight expires after 60 s; healthy stays', async () => {
    let t = 0
    const expired: CrossoverPreflight = {
      kind: 'expired',
      binDir: '/cx/bin',
      build: TESTED,
      daysAgo: 1
    }
    const a = mk(expired, { now: () => t })
    await getSteamEngineState('1', a.deps)
    t = ENGINE_PREFLIGHT_UNHEALTHY_TTL_MS
    await getSteamEngineState('1', a.deps)
    expect(a.probe).toHaveBeenCalledTimes(1)
    t = ENGINE_PREFLIGHT_UNHEALTHY_TTL_MS + 1
    await getSteamEngineState('1', a.deps)
    expect(a.probe).toHaveBeenCalledTimes(2)
    __resetEngineStateForTests()
    t = 0
    const b = mk(healthy(null), { now: () => t })
    await getSteamEngineState('1', b.deps)
    t = 10 * ENGINE_PREFLIGHT_UNHEALTHY_TTL_MS
    await getSteamEngineState('1', b.deps)
    expect(b.probe).toHaveBeenCalledTimes(1)
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

const inconclusive: CrossoverPreflight = {
  kind: 'broken',
  binDir: '/cx/bin',
  build: TESTED,
  detail: 'slow',
  inconclusive: true
} as CrossoverPreflight
const expiredPf: CrossoverPreflight = {
  kind: 'expired',
  binDir: '/cx/bin',
  build: TESTED,
  daysAgo: 1
}
const brokenPf: CrossoverPreflight = {
  kind: 'broken',
  binDir: '/cx/bin',
  build: TESTED,
  detail: 'x'
} as CrossoverPreflight

describe('truthful engine state (WR-02, WR-06, WR-07)', () => {
  it('inconclusive page preflight shows no badge', async () => {
    const { deps } = mk(inconclusive)
    expect(await getSteamEngineState('1', deps)).toMatchObject({
      engine: null,
      reason: null,
      crossoverInstalled: true
    })
  })
  it('inconclusive launch preflight is not cached', async () => {
    const { deps, probe } = mk(healthy(null))
    recordLaunchDecision(
      '1',
      {
        kind: 'use',
        selection: {
          kind: 'crossover',
          reason: 'cx-healthy',
          crossoverBuild: TESTED,
          binDir: '/cx/bin'
        },
        preflight: inconclusive,
        pin: null,
        needsDownload: false,
        override: 'automatic',
        logLines: []
      },
      'GameLibSteamBridge-1',
      deps
    )
    await getSteamEngineState('1', deps)
    expect(probe).toHaveBeenCalledTimes(1)
  })
  it('forced CrossOver on an expired bottle carries overrideWarning cx-expired', async () => {
    const { deps } = mk(expiredPf, { readOverride: () => 'crossover' })
    expect(await getSteamEngineState('1', deps)).toMatchObject({
      engine: 'crossover',
      reason: 'override',
      overrideWarning: 'cx-expired'
    })
  })
  it('forced CrossOver: broken warns, healthy and inconclusive do not', async () => {
    const ov = { readOverride: () => 'crossover' } as const
    expect(
      (await getSteamEngineState('1', mk(brokenPf, ov).deps))?.overrideWarning
    ).toBe('cx-broken')
    __resetEngineStateForTests()
    expect(
      (await getSteamEngineState('1', mk(healthy(null), ov).deps))
        ?.overrideWarning
    ).toBeNull()
    __resetEngineStateForTests()
    expect(
      (await getSteamEngineState('1', mk(inconclusive, ov).deps))
        ?.overrideWarning
    ).toBeNull()
  })
  it('automatic override never carries a warning', async () => {
    const { deps } = mk(expiredPf)
    expect((await getSteamEngineState('1', deps))?.overrideWarning).toBeNull()
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
      engineLabel: 'CrossOver',
      overlayEligible: true
    })
    expect(await getSteamEngineState('1', deps)).toMatchObject({
      trialDaysRemaining: 3
    })
    expect(probe).toHaveBeenCalledTimes(1)
  })
  const fallback = (
    reason: 'cx-missing' | 'cx-expired' | 'cx-broken' | 'cx-inconclusive',
    override: LaunchDecision extends infer L
      ? L extends { override: infer O }
        ? O
        : never
      : never = 'automatic'
  ): LaunchDecision => ({
    kind: 'use',
    selection: {
      kind: 'pinned',
      pinId: 'p',
      reason,
      wineBin: '/w',
      wineserverBin: '/ws',
      label: 'Built-in',
      version: '1',
      dxvk: null
    },
    preflight: null,
    pin: null,
    needsDownload: false,
    override,
    logLines: []
  })
  it('publishes an increasing launchNotice for an automatic fallback launch', () => {
    const { deps } = mk(healthy(null))
    const pub = jest.fn()
    setEngineStatePublisher(pub)
    recordLaunchDecision(
      '1',
      fallback('cx-expired'),
      'GameLibSteamBridge-1',
      deps
    )
    recordLaunchDecision(
      '1',
      fallback('cx-expired'),
      'GameLibSteamBridge-1',
      deps
    )
    expect(pub.mock.calls[0][0].launchNotice).toEqual({
      reason: 'cx-expired',
      seq: 1
    })
    expect(pub.mock.calls[1][0].launchNotice).toEqual({
      reason: 'cx-expired',
      seq: 2
    })
  })
  it('WR-01: inconclusive pinned decision publishes no launchNotice', () => {
    const { deps } = mk(healthy(null))
    const pub = jest.fn()
    setEngineStatePublisher(pub)
    recordLaunchDecision(
      '1',
      fallback('cx-inconclusive'),
      'GameLibSteamBridge-1',
      deps
    )
    expect(pub.mock.calls[0][0].launchNotice).toBeNull()
  })
  it('WR-01: inconclusive preflight never publishes a cx-broken badge', () => {
    const { deps } = mk(healthy(null))
    const pub = jest.fn()
    setEngineStatePublisher(pub)
    const d = fallback('cx-inconclusive')
    if (d.kind !== 'use') throw new Error('expected use')
    recordLaunchDecision(
      '1',
      {
        ...d,
        preflight: {
          kind: 'broken',
          binDir: '/cx/bin',
          build: TESTED,
          detail: 'timeout',
          inconclusive: true
        }
      },
      'GameLibSteamBridge-1',
      deps
    )
    expect(pub.mock.calls[0][0].reason).not.toBe('cx-broken')
  })
  it('IN-02 (D-05 / 261107-v6q): kept built-in engine under an inconclusive pre-flight with no cache shows no badge and no launchNotice', () => {
    // The blank badge is intended: an inconclusive probe never yields a toast, notice or badge.
    const { deps } = mk(healthy(null))
    const pub = jest.fn()
    setEngineStatePublisher(pub)
    const d = fallback('cx-inconclusive')
    if (d.kind !== 'use') throw new Error('expected use')
    recordLaunchDecision(
      '1',
      {
        ...d,
        preflight: {
          kind: 'broken',
          binDir: '/cx/bin',
          build: TESTED,
          detail: 'timeout',
          inconclusive: true
        }
      },
      'GameLibSteamBridge-1',
      deps
    )
    expect(pub).toHaveBeenCalledTimes(1)
    const state = pub.mock.calls[0][0]
    expect(state.engine).toBeNull()
    expect(state.reason).toBeNull()
    expect(state.launchNotice).toBeNull()
  })
  it('publishes launchNotice null for an override or CrossOver launch; get returns null', async () => {
    const { deps } = mk(healthy(null))
    const pub = jest.fn()
    setEngineStatePublisher(pub)
    recordLaunchDecision(
      '1',
      fallback('cx-broken', 'pinned:wine-staging-11.20'),
      'GameLibSteamBridge-1',
      deps
    )
    recordLaunchDecision(
      '1',
      decision(healthy(null)),
      'GameLibSteamBridge-1',
      deps
    )
    expect(pub.mock.calls[0][0].launchNotice).toBeNull()
    expect(pub.mock.calls[1][0].launchNotice).toBeNull()
    expect((await getSteamEngineState('1', deps))?.launchNotice).toBeNull()
  })
  describe('publishOverlayExitNotice (261105-ast)', () => {
    it('re-pushes the last state with exitNotice and a rising shared seq, carrying other notices', () => {
      const { deps } = mk(healthy(null))
      const pub = jest.fn()
      setEngineStatePublisher(pub)
      recordLaunchDecision(
        '3205720',
        fallback('cx-expired'),
        'GameLibSteamBridge-1',
        deps
      )
      expect(pub.mock.calls[0][0].exitNotice).toBeNull()
      expect(publishOverlayExitNotice('3205720')).toBe(true)
      expect(publishOverlayExitNotice('3205720')).toBe(true)
      const first = pub.mock.calls[1][0]
      const second = pub.mock.calls[2][0]
      expect(first).toEqual({
        ...pub.mock.calls[0][0],
        exitNotice: { seq: 2 }
      })
      expect(first.launchNotice).toEqual({ reason: 'cx-expired', seq: 1 })
      expect(first.overlayNotice).toBeNull()
      expect(second.exitNotice).toEqual({ seq: 3 })
    })
    it('returns false without publishing for no base state or bad appId', () => {
      const { deps } = mk(healthy(null))
      const pub = jest.fn()
      setEngineStatePublisher(pub)
      expect(publishOverlayExitNotice('3205720')).toBe(false)
      recordLaunchDecision(
        '3205720',
        decision(healthy(null)),
        'GameLibSteamBridge-1',
        deps
      )
      pub.mockClear()
      expect(publishOverlayExitNotice('abc')).toBe(false)
      expect(pub).not.toHaveBeenCalled()
    })
  })
  describe('publishLaunchDeadlineNotice (61-27, WR-02)', () => {
    it('re-pushes the last state with deadlineNotice on the shared seq, carrying other notices', () => {
      const { deps } = mk(healthy(null))
      const pub = jest.fn()
      setEngineStatePublisher(pub)
      recordLaunchDecision(
        '3205720',
        fallback('cx-expired'),
        'GameLibSteamBridge-1',
        deps
      )
      expect(pub.mock.calls[0][0].deadlineNotice).toBeNull()
      expect(
        publishLaunchDeadlineNotice('3205720', { title: 'Quail', seconds: 180 })
      ).toBe(true)
      const pushed = pub.mock.calls[1][0]
      expect(pushed.deadlineNotice).toEqual({
        title: 'Quail',
        seconds: 180,
        seq: 2
      })
      expect(pushed.launchNotice).toEqual({ reason: 'cx-expired', seq: 1 })
      expect(pushed.exitNotice).toBeNull()
    })
    it('returns false without publishing for no base state or bad appId', () => {
      const { deps } = mk(healthy(null))
      const pub = jest.fn()
      setEngineStatePublisher(pub)
      const n = { title: 'Quail', seconds: 180 }
      expect(publishLaunchDeadlineNotice('3205720', n)).toBe(false)
      recordLaunchDecision(
        '3205720',
        decision(healthy(null)),
        'GameLibSteamBridge-1',
        deps
      )
      pub.mockClear()
      expect(publishLaunchDeadlineNotice('abc', n)).toBe(false)
      expect(pub).not.toHaveBeenCalled()
    })
  })
  describe('publishOverlayNotice (G4)', () => {
    it('re-pushes the last state with overlayNotice and a rising shared seq, keeping launchNotice', () => {
      const { deps } = mk(healthy(null))
      const pub = jest.fn()
      setEngineStatePublisher(pub)
      recordLaunchDecision(
        '3205720',
        fallback('cx-expired'),
        'GameLibSteamBridge-1',
        deps
      )
      expect(pub.mock.calls[0][0].overlayNotice).toBeNull()
      expect(publishOverlayNotice('3205720', 'shim')).toBe(true)
      expect(publishOverlayNotice('3205720', 'shim')).toBe(true)
      const first = pub.mock.calls[1][0]
      const second = pub.mock.calls[2][0]
      expect(first).toEqual({
        ...pub.mock.calls[0][0],
        overlayNotice: { step: 'shim', seq: 2 }
      })
      expect(first.launchNotice).toEqual({ reason: 'cx-expired', seq: 1 })
      expect(second.overlayNotice).toEqual({ step: 'shim', seq: 3 })
    })
    it('returns false without publishing for no base state, bad appId or bad step', () => {
      const { deps } = mk(healthy(null))
      const pub = jest.fn()
      setEngineStatePublisher(pub)
      expect(publishOverlayNotice('3205720', 'shim')).toBe(false)
      recordLaunchDecision(
        '3205720',
        decision(healthy(null)),
        'GameLibSteamBridge-1',
        deps
      )
      pub.mockClear()
      expect(publishOverlayNotice('abc', 'shim')).toBe(false)
      expect(pub).not.toHaveBeenCalled()
    })
  })
  it('carries the last crossoverInstalled forward when no preflight exists (IN-03)', async () => {
    const a = mk(healthy(null), {
      resolveCrossoverBinDir: async () => undefined
    })
    await getSteamEngineState('1', a.deps)
    const pub = jest.fn()
    setEngineStatePublisher(pub)
    recordLaunchDecision('1', fallback('cx-missing'), 'Other', a.deps)
    expect(pub.mock.calls[0][0].crossoverInstalled).toBe(false)
    __resetEngineStateForTests()
    setEngineStatePublisher(pub)
    recordLaunchDecision('2', fallback('cx-missing'), 'Other', a.deps)
    expect(pub.mock.calls[1][0].crossoverInstalled).toBe(true)
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

describe('generic identities (phase 61 D-12, D-15)', () => {
  const generic = (over: Partial<EngineStateDeps> = {}): EngineStateDeps => ({
    isMac: true,
    store: memStore(),
    killCrossoverWineserver: () => Promise.resolve(),
    wineManagerReleases: () => [],
    bottleFor: () => 'GameLibBottle-Fortnite',
    overrideEligible: () => true,
    overlayEligible: false,
    effective: () => ({ kind: 'override', id: 'automatic', source: 'derived' }),
    isBottleReady: () => true,
    resolveCrossoverBinDir: () => Promise.resolve('/cx/bin'),
    preflight: () => Promise.resolve(healthy(null)),
    ...over
  })
  it('a non-Steam identity carries its runner and appName', async () => {
    const s = await getEngineState(
      { runner: 'legendary', appName: 'Fortnite' },
      generic({
        prefixKind: 'bottle',
        perGameBottleName: 'GameLibBottle-Fortnite'
      })
    )
    expect(s).toMatchObject({
      runner: 'legendary',
      appName: 'Fortnite',
      engine: 'crossover',
      effectiveEngineId: 'automatic',
      engineSource: 'derived',
      prefixKind: 'bottle',
      perGameBottleName: 'GameLibBottle-Fortnite',
      overlayEligible: false
    })
  })
  it('a Legacy effective engine is unsupported and never preflights', async () => {
    const preflight = jest.fn(() => Promise.resolve(healthy(null)))
    const s = await getEngineState(
      { runner: 'legendary', appName: 'Fortnite' },
      generic({
        preflight,
        effective: () => ({ kind: 'legacy', label: 'Wine 9.0' })
      })
    )
    expect(preflight).not.toHaveBeenCalled()
    expect(s).toMatchObject({
      engine: 'unsupported',
      reason: 'override',
      engineLabel: 'Legacy: Wine 9.0',
      effectiveEngineId: 'legacy:Wine 9.0',
      legacyLabel: 'Wine 9.0'
    })
  })
  it('stateWithoutBottle yields state with no preflight', async () => {
    const preflight = jest.fn(() => Promise.resolve(healthy(null)))
    const s = await getEngineState(
      { runner: 'gog', appName: '1207658924' },
      generic({ bottleFor: () => null, stateWithoutBottle: true, preflight })
    )
    expect(preflight).not.toHaveBeenCalled()
    expect(s).toMatchObject({ runner: 'gog', crossoverInstalled: true })
  })
  it.each([
    [null],
    ['x'],
    [{ runner: 'nope', appName: 'a' }],
    [{ runner: 'legendary', appName: '../x' }],
    [{ runner: 'steam', appName: 'abc' }]
  ])('an invalid identity %j gives null', async (id) => {
    expect(await getEngineState(id, generic())).toBeNull()
  })
})

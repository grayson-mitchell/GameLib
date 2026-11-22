/**
 * `dispatchSteamLaunch` — the single Steam launch dispatch shared by the sidecar `launch`
 * handler and `protocol.ts`'s deep-link branch (Phase 35 plan 20, D-35-19-06, live-gate
 * criteria 6/10).
 *
 * WHAT THIS GUARDS. Before this module existed, the sidecar `launch` handler's
 * `runner === 'steam'` branch called `game.launch()` and returned directly — never calling
 * `addRecentGame`, the side effect every other runner gets from `launchEventCallback`. A
 * successful Steam launch therefore wrote NO `games.recent` entry (live-gate criterion 6's own
 * A/B table: `store/config.json` was written for a GOG launch and NOT for two Steam launches).
 * These cases assert the ARGUMENT `addRecentGame` is called with, not merely a call count —
 * a call-count-only assertion would pass against a handler that called `addRecentGame` with the
 * wrong game.
 */

// ── library managers — injected, so `dispatchSteamLaunch` resolves a controllable Steam game mock. ──
const getGameMock = jest.fn()
const deps = {
  libraryManagers: {
    steam: { getGame: (...args: unknown[]) => getGameMock(...args) }
  },
  // Built per test below: a fresh single-flight table, as one per boot in production.
  appRuntime: undefined
} as unknown as Parameters<typeof dispatchSteamLaunch>[0]

// ── the recent-games shim — the side effect under test. ────────────────────────────────────────────
const addRecentGameMock = jest.fn()
jest.mock('backend/info/recentGames', () => ({
  addRecentGame: (...args: unknown[]) => addRecentGameMock(...args)
}))

// ── logger — asserts the warning fired on case (c) below, rather than assuming it. ─────────
const logWarningMock = jest.fn()
jest.mock('backend/logger', () => ({
  logWarning: (...args: unknown[]) => logWarningMock(...args),
  logInfo: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

const notifyMock = jest.fn()
jest.mock('backend/dialog/dialog', () => ({
  notify: (_deps: unknown, ...args: unknown[]) => notifyMock(...args)
}))

jest.mock('i18next', () => ({
  __esModule: true,
  default: { t: (k: string, d?: string) => d ?? k }
}))

// ── Imports (after mocks) ──────────────────────────────────────────────────────────────────
import {
  dispatchSteamLaunch,
  dispatchSteamLaunchWithoutSteamOnce
} from '../launchDispatch'
import { createTestAppRuntime } from 'backend/testUtils/testAppRuntime'

describe('dispatchSteamLaunch', () => {
  const appId = '999002'
  let launchMock: jest.Mock
  let gameInfo: Record<string, unknown>

  beforeEach(() => {
    jest.clearAllMocks()
    // A fresh single-flight table per test, as one per boot in production.
    deps.appRuntime = createTestAppRuntime()
    gameInfo = {
      app_name: appId,
      title: 'Some Steam Game',
      runner: 'steam',
      is_installed: true
    }
    launchMock = jest.fn()
    getGameMock.mockReturnValue({
      launch: (...args: unknown[]) => launchMock(...args),
      getSettings: () => Promise.resolve({}),
      getGameInfo: () => gameInfo
    })
  })

  // (a) A successful launch calls addRecentGame exactly once, with the launched game's info —
  // asserted on the ARGUMENT (runner + app_name), not on call count alone.
  it('calls addRecentGame exactly once with the launched game info when launch() resolves true', async () => {
    launchMock.mockResolvedValue(true)
    addRecentGameMock.mockResolvedValue(undefined)

    const result = await dispatchSteamLaunch(deps, appId)

    expect(result).toBe(true)
    expect(getGameMock).toHaveBeenCalledWith(appId)
    expect(addRecentGameMock).toHaveBeenCalledTimes(1)
    expect(addRecentGameMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ runner: 'steam', app_name: appId })
    )
  })

  // (b) A launch that never started is not a recent game.
  it('calls addRecentGame ZERO times and returns false when launch() resolves false', async () => {
    launchMock.mockResolvedValue(false)

    const result = await dispatchSteamLaunch(deps, appId)

    expect(result).toBe(false)
    expect(addRecentGameMock).not.toHaveBeenCalled()
  })

  // (c) RED-proven: recording a recent game is bookkeeping. Removing the try/catch around
  // `addRecentGame` in `launchDispatch.ts` makes this case fail with an unhandled rejection
  // instead of resolving `true` — see the SUMMARY for the captured RED output.
  it('still resolves true and logs a warning when addRecentGame rejects', async () => {
    launchMock.mockResolvedValue(true)
    addRecentGameMock.mockRejectedValue(new Error('store write failed'))

    const result = await dispatchSteamLaunch(deps, appId)

    expect(result).toBe(true)
    expect(logWarningMock).toHaveBeenCalledTimes(1)
  })
})

describe('WR-03: single-flight at the launch IPC entry', () => {
  const appId = '999003'
  let launchMock: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    // A fresh single-flight table per test, as one per boot in production.
    deps.appRuntime = createTestAppRuntime()
    launchMock = jest.fn()
    getGameMock.mockReturnValue({
      launch: (...args: unknown[]) => launchMock(...args),
      getSettings: () => Promise.resolve({}),
      getGameInfo: () => ({
        app_name: appId,
        title: 'Some Steam Game',
        runner: 'steam',
        is_installed: true
      })
    })
    addRecentGameMock.mockResolvedValue(undefined)
  })

  it('two concurrent dispatches launch once, record once, notify once', async () => {
    let resolveLaunch!: (v: boolean) => void
    launchMock.mockReturnValue(
      new Promise<boolean>((res) => {
        resolveLaunch = res
      })
    )

    const a = dispatchSteamLaunch(deps, appId)
    const b = dispatchSteamLaunch(deps, appId)
    await new Promise(setImmediate)
    resolveLaunch(true)

    await expect(a).resolves.toBe(true)
    await expect(b).resolves.toBe(true)
    await new Promise(setImmediate)

    expect(launchMock).toHaveBeenCalledTimes(1)
    expect(addRecentGameMock).toHaveBeenCalledTimes(1)
    expect(notifyMock).toHaveBeenCalledTimes(1)
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Some Steam Game',
        body: expect.stringContaining('already starting')
      })
    )
  })

  it('releases after settle: a later dispatch launches again', async () => {
    launchMock.mockResolvedValue(true)
    await dispatchSteamLaunch(deps, appId)
    await new Promise(setImmediate)
    await dispatchSteamLaunch(deps, appId)
    expect(launchMock).toHaveBeenCalledTimes(2)
  })
})

describe('quick 261117-q1t: the launchWithoutSteam game setting', () => {
  const appId = '999004'
  const launchMock = jest.fn()
  const withoutMock = jest.fn()

  function game(getSettings: () => Promise<unknown>) {
    getGameMock.mockReturnValue({
      launch: (...args: unknown[]) => launchMock(...args),
      launchWithoutSteam: (...args: unknown[]) => withoutMock(...args),
      getSettings,
      getGameInfo: () => ({ app_name: appId, runner: 'steam' })
    })
  }

  beforeEach(() => {
    jest.clearAllMocks()
    deps.appRuntime = createTestAppRuntime()
    launchMock.mockResolvedValue(true)
    withoutMock.mockResolvedValue(true)
    addRecentGameMock.mockResolvedValue(undefined)
  })

  it('D-06 (Phase 81): on, the adoption gate never runs: launchWithoutSteam() is called and launch() never is', async () => {
    game(() => Promise.resolve({ launchWithoutSteam: true }))
    expect(await dispatchSteamLaunch(deps, appId)).toBe(true)
    expect(withoutMock).toHaveBeenCalledTimes(1)
    expect(launchMock).not.toHaveBeenCalled()
    expect(addRecentGameMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    [{}],
    [{ launchWithoutSteam: false }],
    [{ launchWithoutSteam: 'yes' }]
  ])(
    'D-06 (Phase 81) off or absent (%j): normal Steam launch, the gate runs inside launch()',
    async (settings) => {
      game(() => Promise.resolve(settings))
      expect(await dispatchSteamLaunch(deps, appId)).toBe(true)
      expect(launchMock).toHaveBeenCalledTimes(1)
      expect(withoutMock).not.toHaveBeenCalled()
    }
  )

  it('unreadable settings: warns and uses the normal Steam launch', async () => {
    game(() => Promise.reject(new Error('no config')))
    expect(await dispatchSteamLaunch(deps, appId)).toBe(true)
    expect(logWarningMock).toHaveBeenCalledTimes(1)
    expect(launchMock).toHaveBeenCalledTimes(1)
    expect(withoutMock).not.toHaveBeenCalled()
  })
})

describe('Phase 81 D-05: the one-shot launch without Steam from the refused-restart notice', () => {
  const appId = '999005'
  const launchMock = jest.fn()
  const withoutMock = jest.fn()
  const verdictMock = jest.fn()
  const getSettingsMock = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    deps.appRuntime = createTestAppRuntime()
    launchMock.mockResolvedValue(true)
    withoutMock.mockResolvedValue(true)
    verdictMock.mockResolvedValue({ applies: true })
    addRecentGameMock.mockResolvedValue(undefined)
    getGameMock.mockReturnValue({
      launch: (...args: unknown[]) => launchMock(...args),
      launchWithoutSteam: (...args: unknown[]) => withoutMock(...args),
      getDirectLaunchVerdict: () => verdictMock(),
      getSettings: (...args: unknown[]) => getSettingsMock(...args),
      getGameInfo: () => ({
        app_name: appId,
        title: 'Some Steam Game',
        runner: 'steam'
      })
    })
  })

  it('a game that does not qualify launches nothing at all and answers false', async () => {
    verdictMock.mockResolvedValue({ applies: false, reason: 'steam-drm' })
    expect(await dispatchSteamLaunchWithoutSteamOnce(deps, appId)).toBe(false)
    expect(withoutMock).not.toHaveBeenCalled()
    expect(launchMock).not.toHaveBeenCalled()
    expect(addRecentGameMock).not.toHaveBeenCalled()
  })

  it('a game that qualifies launches without Steam once, never through Steam, and records the recent game', async () => {
    expect(await dispatchSteamLaunchWithoutSteamOnce(deps, appId)).toBe(true)
    expect(withoutMock).toHaveBeenCalledTimes(1)
    expect(launchMock).not.toHaveBeenCalled()
    expect(addRecentGameMock).toHaveBeenCalledWith(
      deps,
      expect.objectContaining({ app_name: appId })
    )
  })

  it('a launch that did not start is not a recent game', async () => {
    withoutMock.mockResolvedValue(false)
    expect(await dispatchSteamLaunchWithoutSteamOnce(deps, appId)).toBe(false)
    expect(addRecentGameMock).not.toHaveBeenCalled()
  })

  it('D-06: it never reads or writes the per-game setting', async () => {
    await dispatchSteamLaunchWithoutSteamOnce(deps, appId)
    expect(getSettingsMock).not.toHaveBeenCalled()
  })

  it('joins the Steam single flight: a second press gets the already-starting notice and launches nothing more', async () => {
    let resolveLaunch!: (v: boolean) => void
    withoutMock.mockReturnValue(
      new Promise<boolean>((res) => {
        resolveLaunch = res
      })
    )
    const a = dispatchSteamLaunchWithoutSteamOnce(deps, appId)
    const b = dispatchSteamLaunchWithoutSteamOnce(deps, appId)
    await new Promise(setImmediate)
    resolveLaunch(true)
    await expect(a).resolves.toBe(true)
    await expect(b).resolves.toBe(true)
    expect(withoutMock).toHaveBeenCalledTimes(1)
    expect(notifyMock).toHaveBeenCalledTimes(1)
  })
})

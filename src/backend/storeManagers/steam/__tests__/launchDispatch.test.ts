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

// ── storeManagers — mocked so `dispatchSteamLaunch`'s lazy
// `await import('backend/storeManagers')` resolves to a controllable Steam game mock. ────────
const getGameMock = jest.fn()
jest.mock('backend/storeManagers', () => ({
  libraryManagerMap: {
    steam: {
      getGame: (...args: unknown[]) => getGameMock(...args)
    }
  }
}))

// ── recent_games — the side effect under test. ────────────────────────────────────────────
const addRecentGameMock = jest.fn()
jest.mock('backend/recent_games/recent_games', () => ({
  addRecentGame: (...args: unknown[]) => addRecentGameMock(...args)
}))

// ── logger — asserts the warning fired on case (c) below, rather than assuming it. ─────────
const logWarningMock = jest.fn()
jest.mock('backend/logger', () => ({
  logWarning: (...args: unknown[]) => logWarningMock(...args),
  LogPrefix: { Steam: 'Steam' }
}))

// ── Imports (after mocks) ──────────────────────────────────────────────────────────────────
import { dispatchSteamLaunch } from '../launchDispatch'

describe('dispatchSteamLaunch', () => {
  const appId = '999002'
  let launchMock: jest.Mock
  let gameInfo: Record<string, unknown>

  beforeEach(() => {
    jest.clearAllMocks()
    gameInfo = {
      app_name: appId,
      title: 'Some Steam Game',
      runner: 'steam',
      is_installed: true
    }
    launchMock = jest.fn()
    getGameMock.mockReturnValue({
      launch: (...args: unknown[]) => launchMock(...args),
      getGameInfo: () => gameInfo
    })
  })

  // (a) A successful launch calls addRecentGame exactly once, with the launched game's info —
  // asserted on the ARGUMENT (runner + app_name), not on call count alone.
  it('calls addRecentGame exactly once with the launched game info when launch() resolves true', async () => {
    launchMock.mockResolvedValue(true)
    addRecentGameMock.mockResolvedValue(undefined)

    const result = await dispatchSteamLaunch(appId)

    expect(result).toBe(true)
    expect(getGameMock).toHaveBeenCalledWith(appId)
    expect(addRecentGameMock).toHaveBeenCalledTimes(1)
    expect(addRecentGameMock).toHaveBeenCalledWith(
      expect.objectContaining({ runner: 'steam', app_name: appId })
    )
  })

  // (b) A launch that never started is not a recent game.
  it('calls addRecentGame ZERO times and returns false when launch() resolves false', async () => {
    launchMock.mockResolvedValue(false)

    const result = await dispatchSteamLaunch(appId)

    expect(result).toBe(false)
    expect(addRecentGameMock).not.toHaveBeenCalled()
  })

  // (c) RED-proven: recording a recent game is bookkeeping. Removing the try/catch around
  // `addRecentGame` in `launchDispatch.ts` makes this case fail with an unhandled rejection
  // instead of resolving `true` — see the SUMMARY for the captured RED output.
  it('still resolves true and logs a warning when addRecentGame rejects', async () => {
    launchMock.mockResolvedValue(true)
    addRecentGameMock.mockRejectedValue(new Error('store write failed'))

    const result = await dispatchSteamLaunch(appId)

    expect(result).toBe(true)
    expect(logWarningMock).toHaveBeenCalledTimes(1)
  })
})

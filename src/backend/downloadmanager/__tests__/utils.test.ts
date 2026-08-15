/**
 * debug/steam-cancel-abort-thread-a: regression coverage for the "cancels a
 * native Steam download... but the game stays showing 'downloading'" symptom.
 *
 * Root cause (one of three, this one in downloadmanager/utils.ts):
 * installQueueElement's finally block's "Steam: ACF poller emits the real
 * done — suppress it here" guard assumed a poller would ALWAYS eventually
 * clear the badge for a Steam runner — true for a successful native install
 * (a poller starts right before games.ts's runNativeDepotDownload returns),
 * but FALSE for a cancelled one (runNativeDepotDownload returns
 * `{status: 'abort'}` on a cancelled outcome BEFORE it ever reaches the
 * startInstallPolling call). With no poller ever started, nothing else
 * clears the "installing"/"downloading" badge.
 *
 * The fix: installQueueElement now also force-clears the badge when
 * `installResult.status === 'abort'` — the exact same shape of exception
 * Phase 17 already established for a bottle guided-setup `deferredToSetup`.
 *
 * Mock strategy mirrors downloadqueue.test.ts's established convention —
 * every dependency that would otherwise require a real Electron app context
 * (backend/constants/paths, gog/constants) is replaced with a plain mock.
 */

jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend', DownloadManager: 'DownloadManager' }
}))

const installMock = jest.fn()
const getGameInfoMock = jest.fn().mockReturnValue({ title: 'Test Game' })

jest.mock('backend/storeManagers', () => ({
  libraryManagerMap: {
    steam: {
      getGame: jest.fn().mockReturnValue({
        install: installMock,
        getGameInfo: getGameInfoMock
      })
    },
    gog: {
      getGame: jest.fn().mockReturnValue({
        install: installMock,
        getGameInfo: getGameInfoMock
      })
    }
  }
}))

const sendGameStatusUpdateMock = jest.fn()

jest.mock('../../utils', () => ({
  downloadFile: jest.fn(),
  isEpicServiceOffline: jest.fn().mockResolvedValue(false),
  sendGameStatusUpdate: sendGameStatusUpdateMock
}))

jest.mock('../../dialog/dialog', () => ({
  notify: jest.fn(),
  showDialogBoxModalAuto: jest.fn()
}))

jest.mock('../../online_monitor', () => ({
  isOnline: jest.fn().mockReturnValue(true)
}))

jest.mock('i18next', () => ({
  __esModule: true,
  default: {
    t: (
      _key: string,
      fallback = '',
      options?: Record<string, string | number>
    ) =>
      options
        ? fallback.replace(/{{(\w+)}}/g, (match, token) =>
            token in options ? String(options[token]) : match
          )
        : fallback
  }
}))

jest.mock('graceful-fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  rmSync: jest.fn()
}))

jest.mock('backend/storeManagers/gog/constants', () => ({
  gogdlConfigPath: '/mock/gogdl-config'
}))

jest.mock('backend/constants/paths', () => ({
  fixesPath: '/mock/fixes'
}))

import { installQueueElement } from '../utils'
import { libraryManagerMap } from 'backend/storeManagers'
import { isOnline } from '../../online_monitor'
import { existsSync } from 'graceful-fs'
import { showDialogBoxModalAuto } from '../../dialog/dialog'
import { logWarning } from 'backend/logger'
import type { InstallParams } from 'common/types'

function makeParams(overrides: Partial<InstallParams> = {}): InstallParams {
  return {
    appName: '1091500',
    runner: 'steam',
    path: '/mock/install/path',
    platformToInstall: 'Windows',
    gameInfo: { app_name: '1091500', runner: 'steam' } as never,
    ...overrides
  }
}

describe('installQueueElement — debug/steam-cancel-abort-thread-a: badge clearing on abort', () => {
  beforeEach(() => {
    // jest.config.js sets `resetMocks: true` globally -- every jest.fn()'s
    // implementation (including one set via a mock factory's
    // .mockReturnValue at first `require()`) is wiped before EACH test, not
    // just once. Re-apply every implementation this suite depends on here.
    getGameInfoMock.mockReturnValue({ title: 'Test Game' })
    ;(libraryManagerMap.steam.getGame as jest.Mock).mockReturnValue({
      install: installMock,
      getGameInfo: getGameInfoMock
    })
    ;(libraryManagerMap.gog.getGame as jest.Mock).mockReturnValue({
      install: installMock,
      getGameInfo: getGameInfoMock
    })
    ;(isOnline as jest.Mock).mockReturnValue(true)
    ;(existsSync as jest.Mock).mockReturnValue(true)
  })

  it('a CANCELLED native Steam install (status: "abort") force-clears the "installing" badge, even though no ACF poller ever started', async () => {
    installMock.mockResolvedValue({ status: 'abort' })

    const result = await installQueueElement(makeParams())

    expect(result.status).toBe('abort')
    expect(sendGameStatusUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appName: '1091500',
        runner: 'steam',
        status: 'done'
      })
    )
  })

  it('regression guard: a SUCCESSFUL native Steam install (status: "done") does NOT force-clear the badge here — still defers to the ACF poller, exactly as before this fix', async () => {
    installMock.mockResolvedValue({ status: 'done' })

    const result = await installQueueElement(makeParams())

    expect(result.status).toBe('done')
    // The 'installing' sendGameStatusUpdate call at the START of
    // installQueueElement still fires unconditionally — but the FINALLY
    // block's 'done' call must NOT fire for a successful steam install
    // (the poller owns that transition).
    expect(sendGameStatusUpdateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'done' })
    )
  })

  it('WR-01/D-10: a genuine ERROR (status: "error", never a user cancel) NOW force-clears the "installing" badge — the pre-33-01 gap that let the live install-hang persist despite the wasAborted fix', async () => {
    installMock.mockResolvedValue({ status: 'error', error: 'boom' })

    const result = await installQueueElement(makeParams())

    expect(result.status).toBe('error')
    expect(sendGameStatusUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appName: '1091500',
        runner: 'steam',
        status: 'done'
      })
    )
  })

  it('D-03: a Steam install error ALSO raises a failure dialog via showDialogBoxModalAuto (one coherent error story)', async () => {
    installMock.mockResolvedValue({
      status: 'error',
      error: 'Steam connection stale, try again'
    })

    await installQueueElement(makeParams())

    expect(showDialogBoxModalAuto).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ERROR',
        message: expect.stringContaining('Steam connection stale, try again')
      })
    )
  })

  it('WR-02/D-11: a non-Steam install with installDlcs populated logs a guarded warning instead of silently dropping the DLCs', async () => {
    installMock.mockResolvedValue({ status: 'done' })

    await installQueueElement(
      makeParams({
        runner: 'gog',
        gameInfo: { app_name: '1091500', runner: 'gog' } as never,
        installDlcs: ['dlc-1', 'dlc-2']
      })
    )

    expect(logWarning).toHaveBeenCalledWith(
      expect.stringContaining('installDlcs'),
      expect.anything()
    )
  })

  it('a non-Steam runner is unaffected — always force-clears the badge on completion regardless of status (no behavior change for GOG/Epic/Amazon)', async () => {
    installMock.mockResolvedValue({ status: 'abort' })

    const result = await installQueueElement(
      makeParams({
        runner: 'gog',
        gameInfo: { app_name: '1091500', runner: 'gog' } as never
      })
    )

    expect(result.status).toBe('abort')
    expect(sendGameStatusUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appName: '1091500',
        runner: 'gog',
        status: 'done'
      })
    )
  })

  it("a bottle guided-setup deferral (deferredToSetup: true, Phase 17) still force-clears the badge — unaffected by this cycle's new wasAborted exception", async () => {
    installMock.mockResolvedValue({ status: 'done', deferredToSetup: true })

    const result = await installQueueElement(makeParams())

    expect(result.status).toBe('done')
    expect(sendGameStatusUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appName: '1091500',
        runner: 'steam',
        status: 'done'
      })
    )
  })
})

describe('installQueueElement — D-01b: belt-and-suspenders install watchdog', () => {
  beforeEach(() => {
    getGameInfoMock.mockReturnValue({ title: 'Test Game' })
    ;(libraryManagerMap.steam.getGame as jest.Mock).mockReturnValue({
      install: installMock,
      getGameInfo: getGameInfoMock
    })
    ;(isOnline as jest.Mock).mockReturnValue(true)
    ;(existsSync as jest.Mock).mockReturnValue(true)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('a never-settling install() force-terminates once the watchdog bound elapses, routing down the same terminal-error surface (badge-clear + dialog)', async () => {
    jest.useFakeTimers()
    installMock.mockReturnValue(new Promise(() => {}))

    const resultPromise = installQueueElement(makeParams())
    const assertion = resultPromise.then((result) => {
      expect(result.status).toBe('error')
      expect(sendGameStatusUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          appName: '1091500',
          runner: 'steam',
          status: 'done'
        })
      )
      expect(showDialogBoxModalAuto).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ERROR' })
      )
    })

    // Advance well past every known pre-download bound (50s + 90s×3 retries
    // = 320s) and past the watchdog bound itself.
    await jest.advanceTimersByTimeAsync(10 * 60 * 1000)
    await assertion
  })

  it('an install() that resolves well before the watchdog bound is unaffected — no watchdog trip, result passes through unchanged', async () => {
    jest.useFakeTimers()
    installMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ status: 'done' }), 30000)
        })
    )

    const resultPromise = installQueueElement(makeParams())
    const assertion = resultPromise.then((result) => {
      expect(result.status).toBe('done')
    })

    await jest.advanceTimersByTimeAsync(30000)
    await assertion
  })
})

/**
 * 34.13 review A-01. The seventeen D-17 specs in
 * `storeManagers/steam/__tests__/games.test.ts` all call `game.install(...)`
 * DIRECTLY with a fixture documented as "the production call shape", and all
 * seventeen were green while the feature was completely inert in production —
 * because `installQueueElement` sits between the renderer's
 * `window.api.install({...})` and `SteamGame.install(args)` and REBUILDS the
 * argument object from a fixed field list. Anything not named in that list is
 * dropped, invisibly to `tsc` (the field is optional on `InstallArgs`).
 *
 * These specs therefore drive `installQueueElement` itself — the one function
 * that performs the reshape — and assert on the object it hands to
 * `.install()`. Proven RED against the real pre-fix source (the destructure
 * and the object literal with `steamForceWindowsViaBottle` removed): the
 * first spec fails with `Received: undefined`.
 */
describe('installQueueElement — 34.13 A-01: the reshape must not drop InstallArgs fields', () => {
  beforeEach(() => {
    getGameInfoMock.mockReturnValue({ title: 'Test Game' })
    ;(libraryManagerMap.steam.getGame as jest.Mock).mockReturnValue({
      install: installMock,
      getGameInfo: getGameInfoMock
    })
    ;(libraryManagerMap.gog.getGame as jest.Mock).mockReturnValue({
      install: installMock,
      getGameInfo: getGameInfoMock
    })
    ;(isOnline as jest.Mock).mockReturnValue(true)
    ;(existsSync as jest.Mock).mockReturnValue(true)
  })

  it('A-01: steamForceWindowsViaBottle: true survives the queue hop and reaches .install()', async () => {
    installMock.mockResolvedValue({ status: 'done' })

    await installQueueElement(makeParams({ steamForceWindowsViaBottle: true }))

    expect(installMock).toHaveBeenCalledTimes(1)
    expect(installMock.mock.calls[0][0].steamForceWindowsViaBottle).toBe(true)
  })

  it('A-01: an explicit false is forwarded as false (distinguishable from "never asked")', async () => {
    installMock.mockResolvedValue({ status: 'done' })

    await installQueueElement(makeParams({ steamForceWindowsViaBottle: false }))

    expect(installMock.mock.calls[0][0].steamForceWindowsViaBottle).toBe(false)
  })

  it('A-01: the legacy no-override shape stays undefined — the field is not fabricated', async () => {
    installMock.mockResolvedValue({ status: 'done' })

    await installQueueElement(makeParams())

    expect(
      installMock.mock.calls[0][0].steamForceWindowsViaBottle
    ).toBeUndefined()
  })

  it('A-01: the forward is runner-agnostic — a non-Steam runner receives the field untouched rather than having it stripped', async () => {
    installMock.mockResolvedValue({ status: 'done' })

    await installQueueElement(
      makeParams({
        runner: 'gog',
        gameInfo: { app_name: '1091500', runner: 'gog' } as never,
        steamForceWindowsViaBottle: true
      })
    )

    expect(installMock.mock.calls[0][0].steamForceWindowsViaBottle).toBe(true)
  })
})

describe('installQueueElement — WR-03/D-12: error-path regression coverage', () => {
  beforeEach(() => {
    getGameInfoMock.mockReturnValue({ title: 'Test Game' })
    ;(libraryManagerMap.steam.getGame as jest.Mock).mockReturnValue({
      install: installMock,
      getGameInfo: getGameInfoMock
    })
    ;(isOnline as jest.Mock).mockReturnValue(true)
    ;(existsSync as jest.Mock).mockReturnValue(true)
  })

  it('an install() call that THROWS/REJECTS (not just resolves {status:"error"}) is unaffected by the coverage gap that let WR-01 ship — badge clears AND a failure dialog is raised via the same catch-block path', async () => {
    installMock.mockRejectedValue(new Error('ECONNRESET'))

    const result = await installQueueElement(makeParams())

    expect(result.status).toBe('error')
    expect(sendGameStatusUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appName: '1091500',
        runner: 'steam',
        status: 'done'
      })
    )
    expect(showDialogBoxModalAuto).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ERROR' })
    )
  })

  it('a "abort" resolution (user cancel) is unaffected by the D-10/D-01b additions — no dialog raised for a user-initiated cancel, only badge-clear', async () => {
    installMock.mockResolvedValue({ status: 'abort' })

    const result = await installQueueElement(makeParams())

    expect(result.status).toBe('abort')
    expect(sendGameStatusUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appName: '1091500',
        runner: 'steam',
        status: 'done'
      })
    )
    expect(showDialogBoxModalAuto).not.toHaveBeenCalled()
  })
})

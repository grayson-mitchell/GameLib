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
  default: { t: (_key: string, fallback = '') => fallback }
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

  it('regression guard: a genuine ERROR (status: "error", never a user cancel) is unaffected by this fix — pre-existing behavior for a real failure is unchanged', async () => {
    installMock.mockResolvedValue({ status: 'error', error: 'boom' })

    const result = await installQueueElement(makeParams())

    expect(result.status).toBe('error')
    // wasAborted is only set true for status === 'abort' -- an 'error'
    // outcome takes the exact same (pre-existing, unchanged) path as before
    // this cycle's fix.
    expect(sendGameStatusUpdateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'done' })
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

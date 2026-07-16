/**
 * Regression coverage for D-UAT-05 (steam-dm-queue-wedge): interrupted Steam
 * native installs wedged the DownloadManager queue across an app restart and
 * could not be paused/stopped/cancelled.
 *
 * Root cause (module-level `currentElement` state): `currentElement` stayed
 * `null` from module load until initQueue()'s while loop first assigned it —
 * main.ts only calls initQueue() 5s after app startup. Every one of
 * cancelCurrentDownload/pauseCurrentDownload/stopCurrentDownload guards its
 * entire body on `if (currentElement)`, so a click during that startup
 * window (including cancelCurrentDownload's removeFromQueue call) was a
 * COMPLETE no-op — not even removing the item from the persisted queue.
 * initQueue()'s own 5s auto-resume then re-wedged on every restart.
 *
 * The fix seeds `currentElement` from the persisted queue head at module
 * load instead of leaving it null, so cancel/pause/stop work immediately —
 * before initQueue() has ever run.
 *
 * Mock strategy:
 *  - ../electron_store's TypeCheckedStoreBackend is replaced with a simple
 *    in-memory object (exposed via `__store`) so a test can seed the
 *    persisted `queue` BEFORE importing downloadqueue.ts (module load order
 *    matters here — that's the exact bug).
 *  - backend/storeManagers's libraryManagerMap is a plain jest.fn() surface
 *    matching ratingMap.test.ts's established mocking convention.
 *  - downloadqueue.ts must be require()'d fresh (jest.resetModules) in each
 *    test AFTER the store is seeded, since the currentElement seed only
 *    happens once, at first import.
 */

const __store: Record<string, unknown> = {}

jest.mock('../../electron_store', () => ({
  TypeCheckedStoreBackend: jest.fn().mockImplementation(() => ({
    has: (key: string) => key in __store,
    get: (key: string, def: unknown) => (key in __store ? __store[key] : def),
    get_nodefault: (key: string) => __store[key],
    set: (key: string, value: unknown) => {
      __store[key] = value
    },
    delete: (key: string) => {
      delete __store[key]
    }
  }))
}))

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { DownloadManager: 'DownloadManager', Backend: 'Backend' }
}))

const gameStopMock = jest.fn().mockResolvedValue(undefined)
const gameGetGameInfoMock = jest.fn().mockReturnValue({ folder_name: undefined })

jest.mock('backend/storeManagers', () => ({
  libraryManagerMap: {
    steam: {
      getGame: jest.fn().mockReturnValue({
        stop: gameStopMock,
        getGameInfo: gameGetGameInfoMock
      })
    },
    gog: {
      getGame: jest.fn().mockReturnValue({
        stop: gameStopMock,
        getGameInfo: gameGetGameInfoMock
      })
    }
  }
}))

jest.mock('../../utils', () => ({
  getFileSize: jest.fn(),
  removeFolder: jest.fn(),
  sendGameStatusUpdate: jest.fn()
}))

// downloadmanager/utils.ts (NOT backend/utils.ts above) — installQueueElement/
// updateQueueElement pull in backend/constants/paths -> tmp, which crashes
// outside a real Electron app context. Never exercised by these tests
// (initQueue() is deliberately never called — see file header).
jest.mock('../utils', () => ({
  installQueueElement: jest.fn(),
  updateQueueElement: jest.fn()
}))

jest.mock('../../ipc', () => ({
  sendFrontendMessage: jest.fn()
}))

jest.mock('backend/utils/aborthandler/aborthandler', () => ({
  callAbortController: jest.fn()
}))

jest.mock('../../dialog/dialog', () => ({
  notify: jest.fn()
}))

jest.mock('i18next', () => ({
  __esModule: true,
  default: { t: (_key: string, fallback = '') => fallback }
}))

jest.mock('backend/storeManagers/gog/redist', () => ({
  createRedistDMQueueElement: jest.fn()
}))

jest.mock('backend/storeManagers/steam/games', () => ({
  getSteamInstallSize: jest.fn().mockResolvedValue('20 GB')
}))

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true)
}))

jest.mock('backend/storeManagers/gog/constants', () => ({
  gogRedistPath: '/mock/gog-redist'
}))

jest.mock('backend/online_monitor', () => ({
  onConnectivityChange: jest.fn()
}))

import type { DMQueueElement } from 'common/types'
import { callAbortController } from 'backend/utils/aborthandler/aborthandler'

function makeQueueElement(appName: string): DMQueueElement {
  return {
    type: 'install',
    params: {
      appName,
      runner: 'steam',
      path: '/mock/install/path',
      platformToInstall: 'Windows',
      gameInfo: { app_name: appName, runner: 'steam' } as never
    },
    addToQueueTime: Date.now(),
    startTime: 0,
    endTime: 0
  }
}

describe('downloadqueue.ts — D-UAT-05 restart-wedge regression', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    for (const key of Object.keys(__store)) delete __store[key]
  })

  it('a persisted queue head from a PRIOR run is cancelable immediately on module load — BEFORE initQueue() has ever run', async () => {
    // Simulate an app restart: the persisted store already has a queue head
    // left over from an interrupted install, exactly like download-manager.json
    // in the field evidence (D-UAT-05).
    __store.queue = [makeQueueElement('1295660')]
    __store.finished = []

    // Fresh import — this is the exact module-load moment the fix's
    // currentElement seed matters for. initQueue() is NEVER called here,
    // mirroring the pre-5s-timer window on a real app restart.
    const { cancelCurrentDownload, getQueueInformation } = await import(
      '../downloadqueue'
    )

    expect(getQueueInformation().elements).toHaveLength(1)

    cancelCurrentDownload({ removeDownloaded: false })

    // The core regression: cancel must remove the item from the PERSISTED
    // queue even though initQueue() never ran and nothing was "running" yet.
    expect(getQueueInformation().elements).toHaveLength(0)
    expect(callAbortController).not.toHaveBeenCalled() // isRunning() is false pre-initQueue — stopCurrentDownload is skipped, only queue removal happens
  })

  it('a persisted queue head is pausable immediately on module load — pauseCurrentDownload does not silently no-op', async () => {
    __store.queue = [makeQueueElement('1091500')]
    __store.finished = []

    const { pauseCurrentDownload, getQueueInformation } = await import(
      '../downloadqueue'
    )

    pauseCurrentDownload()

    // Pause never removes the item (that's cancel's job) — it must, however,
    // actually run (not throw, not silently no-op) and leave state paused so
    // a subsequent initQueue() 5s auto-resume timer is at least observable.
    expect(getQueueInformation().state).toBe('paused')
    expect(getQueueInformation().elements).toHaveLength(1)
  })

  it('an empty persisted queue on a fresh install leaves currentElement falsy — cancel/pause remain safe no-ops', async () => {
    __store.queue = []
    __store.finished = []

    const { cancelCurrentDownload, pauseCurrentDownload, getQueueInformation } =
      await import('../downloadqueue')

    expect(() => cancelCurrentDownload({ removeDownloaded: false })).not.toThrow()
    expect(() => pauseCurrentDownload()).not.toThrow()
    expect(getQueueInformation().elements).toHaveLength(0)
  })

  it('removeFromQueue (the "Remove from Downloads" IPC path for a non-head item) always works directly against the persisted store, independent of currentElement', async () => {
    __store.queue = [makeQueueElement('1295660'), makeQueueElement('1091500')]
    __store.finished = []

    const { removeFromQueue, getQueueInformation } = await import('../downloadqueue')

    removeFromQueue('1091500')

    const remaining = getQueueInformation().elements
    expect(remaining).toHaveLength(1)
    expect(remaining[0].params.appName).toBe('1295660')
  })
})

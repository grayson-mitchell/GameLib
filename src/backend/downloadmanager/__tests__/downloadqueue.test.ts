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
const gameGetGameInfoMock = jest
  .fn()
  .mockReturnValue({ folder_name: undefined })

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
    const { cancelCurrentDownload, getQueueInformation } =
      await import('../downloadqueue')

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

    const { pauseCurrentDownload, getQueueInformation } =
      await import('../downloadqueue')

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

    expect(() =>
      cancelCurrentDownload({ removeDownloaded: false })
    ).not.toThrow()
    expect(() => pauseCurrentDownload()).not.toThrow()
    expect(getQueueInformation().elements).toHaveLength(0)
  })

  it('removeFromQueue (the "Remove from Downloads" IPC path for a non-head item) always works directly against the persisted store, independent of currentElement', async () => {
    __store.queue = [makeQueueElement('1295660'), makeQueueElement('1091500')]
    __store.finished = []

    const { removeFromQueue, getQueueInformation } =
      await import('../downloadqueue')

    removeFromQueue('1091500')

    const remaining = getQueueInformation().elements
    expect(remaining).toHaveLength(1)
    expect(remaining[0].params.appName).toBe('1295660')
  })
})

/**
 * debug/steam-install-slow-start (Thread B): regression coverage for
 * "an interrupted native Steam install auto-resumes on next launch" — expected
 * behavior is manual-resume-only.
 *
 * Root cause: main.ts calls `initQueue()` unconditionally 5s after every app
 * launch. initQueue()'s while loop immediately calls installQueueElement()/
 * updateQueueElement() on whatever survived at the persisted queue head —
 * i.e. it silently restarts a mid-download item, regardless of runner. This
 * is a SEPARATE mechanism from the Steam startup gate in library.ts (which
 * only surfaces a passive `steamResumePending` UI flag from an ACF scan) —
 * fixing the gate alone does not stop this auto-start.
 *
 * Fix: initQueue(isStartup) — when isStartup is true (the ONLY call main.ts
 * makes) and the queue head's runner is 'steam', the loop defers instead of
 * starting it: no installQueueElement call, queueState stays 'idle' (which
 * the frontend already renders as a "Resume download" affordance identical
 * to 'paused' — DownloadManagerItem.tsx's `isPaused = ['idle','paused']
 * .includes(state)`), currentElement is (re)pointed at the deferred item so
 * pause/cancel/resume controls keep working. GOG/Epic/Amazon are unaffected
 * — isStartup only ever changes behavior for `runner === 'steam'`, and every
 * other initQueue() call site (resumeCurrentDownload, addToQueue's
 * isIdle() kick, the online-reconnect auto-resume) leaves isStartup at its
 * default `false`.
 */
describe('downloadqueue.ts — debug/steam-install-slow-start Thread B: no auto-resume on launch for Steam', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    for (const key of Object.keys(__store)) delete __store[key]
    // jest.clearAllMocks() also clears the mockReturnValue set at file-load
    // time (unlike mockClear() called in isolation) — processNotification
    // (only reachable via this describe block's real initQueue() calls,
    // unlike the other describe blocks here) needs a defined getGameInfo()
    // result to destructure `title` from.
    gameGetGameInfoMock.mockReturnValue({ folder_name: undefined })
  })

  it('initQueue(true) (the app-startup call) does NOT call installQueueElement for a persisted Steam queue head', async () => {
    __store.queue = [makeQueueElement('1091500')]
    __store.finished = []

    const { installQueueElement } = await import('../utils')
    const { initQueue, getQueueInformation } = await import('../downloadqueue')

    await initQueue(true)

    expect(installQueueElement).not.toHaveBeenCalled()
    // Deferred, not removed — still there for the user to explicitly resume.
    expect(getQueueInformation().elements).toHaveLength(1)
    expect(getQueueInformation().elements[0].params.appName).toBe('1091500')
  })

  it('initQueue(true) leaves queueState idle/paused for a deferred Steam item — frontend renders this identically to "Resume download"', async () => {
    __store.queue = [makeQueueElement('1091500')]
    __store.finished = []

    const { initQueue, getQueueInformation } = await import('../downloadqueue')

    await initQueue(true)

    expect(['idle', 'paused']).toContain(getQueueInformation().state)
  })

  it('a deferred Steam item is still cancelable after initQueue(true) — currentElement correctly points at it, not a stale earlier item', async () => {
    __store.queue = [makeQueueElement('1091500')]
    __store.finished = []

    const { initQueue, cancelCurrentDownload, getQueueInformation } =
      await import('../downloadqueue')

    await initQueue(true)
    cancelCurrentDownload({ removeDownloaded: false })

    expect(getQueueInformation().elements).toHaveLength(0)
  })

  it('initQueue(true) DOES auto-start a persisted GOG queue head — no regression for GOG/Epic/Amazon', async () => {
    const gogElement = makeQueueElement('gog-game')
    gogElement.params.runner = 'gog'
    __store.queue = [gogElement]
    __store.finished = []

    const { installQueueElement } = await import('../utils')
    ;(installQueueElement as jest.Mock).mockResolvedValue({ status: 'done' })

    const { initQueue } = await import('../downloadqueue')

    await initQueue(true)

    expect(installQueueElement).toHaveBeenCalledWith(
      expect.objectContaining({ appName: 'gog-game', runner: 'gog' })
    )
  })

  it('a Steam item deferred by initQueue(true) IS processed by a subsequent explicit resumeCurrentDownload() (isStartup defaults to false)', async () => {
    __store.queue = [makeQueueElement('1091500')]
    __store.finished = []

    const { installQueueElement } = await import('../utils')
    ;(installQueueElement as jest.Mock).mockResolvedValue({ status: 'done' })

    const { initQueue, resumeCurrentDownload } =
      await import('../downloadqueue')

    await initQueue(true)
    expect(installQueueElement).not.toHaveBeenCalled()

    resumeCurrentDownload()
    // resumeCurrentDownload fires initQueue() fire-and-forget (void) — flush
    // the microtask queue so its internal awaits resolve before asserting.
    await new Promise((resolve) => setImmediate(resolve))

    expect(installQueueElement).toHaveBeenCalledWith(
      expect.objectContaining({ appName: '1091500' })
    )
  })

  it('a fresh addToQueue while idle (isIdle() kick) uses isStartup=false — an explicit user action is never blocked by a deferred Steam head', async () => {
    __store.queue = [makeQueueElement('1091500')]
    __store.finished = []

    const { installQueueElement } = await import('../utils')
    ;(installQueueElement as jest.Mock).mockResolvedValue({ status: 'done' })

    const { initQueue, addToQueue } = await import('../downloadqueue')
    await initQueue(true)
    expect(installQueueElement).not.toHaveBeenCalled()

    // Re-adding the SAME appName+runner already at the queue head hits
    // addToQueue's elementIndex>=0 "update" branch (avoids the unrelated
    // getGameInfo/getInstallInfo lookup the "new element" branch performs,
    // which this file's libraryManagerMap mock does not stub) while still
    // exercising the isIdle() kick this test targets.
    await addToQueue(makeQueueElement('1091500'))
    await new Promise((resolve) => setImmediate(resolve))

    // The isIdle() kick inside addToQueue calls initQueue() with the default
    // isStartup=false, so it processes the queue head (still the deferred
    // Steam item, FIFO) normally rather than re-deferring it.
    expect(installQueueElement).toHaveBeenCalledWith(
      expect.objectContaining({ appName: '1091500' })
    )
  })
})

/**
 * quick task 260905-luf (Task 1, Test B — the SUSPECT): `processNotification`
 * (this file, error branch) destructures `const { title } =
 * libraryManagerMap[...].getGame(...).getGameInfo()` with NO `|| appName`
 * fallback (unlike downloadmanager/utils.ts's `resolveQueueElementTitle`,
 * which already guards with `title || appName`). When SteamGame.getGameInfo()
 * hits its double cache miss (games.ts ~L569, `return {} as GameInfo`), this
 * destructure yields `title === undefined`, and `notify({ title, ... })` fires
 * with an undefined subject — the OS notification, not the
 * `showDialogBoxModalAuto` install-failure dialog (that dialog's title is
 * already guarded — see utils.test.ts's control test in this same task).
 *
 * Driven through the real `initQueue()` path (not a direct unit call) per
 * this file's own established convention (Thread B describe block above) —
 * `processNotification` is only reachable this way in this suite.
 */
describe('downloadqueue.ts — 260905-luf: processNotification title fallback on a double getGameInfo() cache miss', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    for (const key of Object.keys(__store)) delete __store[key]
    gameGetGameInfoMock.mockReturnValue({ folder_name: undefined })
  })

  it("SUSPECT (Test B): processNotification's error branch notifies with a non-empty title, falling back to the queue element's captured gameInfo.title, when getGameInfo() returns {} (double cache miss)", async () => {
    __store.queue = [
      {
        type: 'install',
        params: {
          appName: '1091500',
          runner: 'steam',
          path: '/mock/install/path',
          platformToInstall: 'Windows',
          gameInfo: {
            app_name: '1091500',
            runner: 'steam',
            title: 'Cyberpunk 2077'
          } as never
        },
        addToQueueTime: Date.now(),
        startTime: 0,
        endTime: 0
      }
    ]
    __store.finished = []

    // The double cache miss this quick task root-causes: BOTH the in-memory
    // library Map and the persisted steamLibraryStore missed, so
    // SteamGame.getGameInfo() returns the `{}` sentinel.
    gameGetGameInfoMock.mockReturnValue({})

    const { installQueueElement } = await import('../utils')
    ;(installQueueElement as jest.Mock).mockResolvedValue({ status: 'error' })

    const { initQueue } = await import('../downloadqueue')
    const { notify } = await import('../../dialog/dialog')

    await initQueue(false)

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Cyberpunk 2077' })
    )
  })
})

/**
 * debug/steam-cancel-abort-thread-a: regression coverage for the "cancels a
 * native Steam download... but the game stays showing 'downloading'" symptom.
 *
 * Root cause (one of three, this one in downloadqueue.ts): removeFromQueue's
 * "Steam: ACF poller emits the real done — suppress it here" guard assumed a
 * poller would ALWAYS eventually clear the badge for a Steam runner — true
 * for a successful native install (a poller starts right before
 * runNativeDepotDownload returns), but FALSE for a cancelled one (games.ts's
 * runNativeDepotDownload returns `{status: 'abort'}` on a cancelled outcome
 * BEFORE it ever reaches the startInstallPolling call). With no poller ever
 * started, nothing else clears the "installing"/"downloading" badge for a
 * cancelled Steam native install.
 *
 * The fix: removeFromQueue takes an optional `forceStatusUpdate` parameter;
 * cancelCurrentDownload (BY DEFINITION always a deliberate user cancel)
 * passes `true`, bypassing the steam-suppression guard. initQueue's own
 * natural-completion removeFromQueue call (line 116, untouched) keeps the
 * default `false` — still deferring to the poller for a successful install.
 */
describe('downloadqueue.ts — debug/steam-cancel-abort-thread-a: cancelled Steam native install badge clearing', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    for (const key of Object.keys(__store)) delete __store[key]
  })

  it('cancelCurrentDownload for a STEAM runner clears the badge (sendGameStatusUpdate status:"done") even though no ACF poller ever started', async () => {
    __store.queue = [makeQueueElement('1091500')]
    __store.finished = []

    // debug/steam-cancel-abort-thread-a: sendGameStatusUpdate must be
    // re-imported from the SAME fresh module registry as downloadqueue.ts
    // after jest.resetModules() — a static top-level import would bind to a
    // stale mock instance from before the reset and never observe this
    // test's calls.
    const { sendGameStatusUpdate } = await import('../../utils')
    const { cancelCurrentDownload } = await import('../downloadqueue')

    cancelCurrentDownload({ removeDownloaded: false })

    expect(sendGameStatusUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ appName: '1091500', status: 'done' })
    )
  })

  it('the DLC sub-removal loop inside cancelCurrentDownload ALSO force-clears the badge for each Steam DLC appName actually present in the queue', async () => {
    const head = makeQueueElement('1091500')
    head.params.installDlcs = ['1091501', '1091502']
    // Both DLC sub-items must actually be present as their OWN steam-runner
    // queue entries for removedRunner === 'steam' to be genuinely exercised
    // (a not-found removal already sends the update regardless of
    // forceStatusUpdate, which would not prove this fix).
    __store.queue = [
      head,
      makeQueueElement('1091501'),
      makeQueueElement('1091502')
    ]
    __store.finished = []

    const { sendGameStatusUpdate } = await import('../../utils')
    const { cancelCurrentDownload } = await import('../downloadqueue')

    cancelCurrentDownload({ removeDownloaded: false })

    expect(sendGameStatusUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ appName: '1091501', status: 'done' })
    )
    expect(sendGameStatusUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ appName: '1091502', status: 'done' })
    )
  })

  it('regression guard: removeFromQueue WITHOUT forceStatusUpdate (the natural-completion call site, initQueue) still suppresses the badge clear for a Steam runner — unchanged, still defers to the ACF poller', async () => {
    __store.queue = [makeQueueElement('1091500')]
    __store.finished = []

    const { sendGameStatusUpdate } = await import('../../utils')
    const { removeFromQueue } = await import('../downloadqueue')

    // Calling with the default (no second argument) mirrors initQueue's own
    // call site (element.params.appName) — must NOT force-clear the badge.
    removeFromQueue('1091500')

    expect(sendGameStatusUpdate).not.toHaveBeenCalled()
  })

  it('removeFromQueue with forceStatusUpdate=true clears the badge for a Steam runner on demand', async () => {
    __store.queue = [makeQueueElement('1091500')]
    __store.finished = []

    const { sendGameStatusUpdate } = await import('../../utils')
    const { removeFromQueue } = await import('../downloadqueue')

    removeFromQueue('1091500', true)

    expect(sendGameStatusUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ appName: '1091500', status: 'done' })
    )
  })

  it('a non-Steam runner is unaffected by forceStatusUpdate — always cleared regardless (no behavior change for GOG/Epic/Amazon)', async () => {
    const gogElement = makeQueueElement('gog-game')
    gogElement.params.runner = 'gog'
    __store.queue = [gogElement]
    __store.finished = []

    const { sendGameStatusUpdate } = await import('../../utils')
    const { removeFromQueue } = await import('../downloadqueue')

    removeFromQueue('gog-game') // forceStatusUpdate omitted -- non-steam already always clears

    expect(sendGameStatusUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ appName: 'gog-game', status: 'done' })
    )
  })
})

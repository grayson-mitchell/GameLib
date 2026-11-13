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
 * The fix seeds `currentElement` from the persisted queue head when the queue starts (the
 * 'download-queue' boot step calls `start()`), instead of leaving it null, so cancel/pause/stop
 * work immediately, before initQueue() has ever run.
 *
 * 66.1-11: the queue is built by `createDownloadQueue(deps)`; every test builds its own through
 * `makeQueue()` with an in-memory store and a fresh library map as deps, so no module state or
 * module-registry reset is needed for the queue itself (resetModules stays only for the mocked
 * collaborators' fresh jest.fn()s).
 */

const __store: Record<string, unknown> = {}

// An in-memory stand-in for the persisted download-manager store, passed to the queue as a dep.
const memoryStore = {
  has: (key: string) => key in __store,
  get: (key: string, def: unknown) => (key in __store ? __store[key] : def),
  get_nodefault: (key: string) => __store[key],
  set: (key: string, value: unknown) => {
    __store[key] = value
  },
  delete: (key: string) => {
    delete __store[key]
  }
}

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

// A fresh library map per queue: `resetMocks: true` wipes a shared jest.fn()'s return value
// before every test, so the map is built inside each makeQueue() call.
function makeLibrary() {
  const manager = () => ({
    getGame: jest.fn().mockReturnValue({
      stop: gameStopMock,
      getGameInfo: gameGetGameInfoMock
    })
  })
  return { steam: manager(), gog: manager() }
}

// The dialog and notification helpers are mocked in this file, so the slices are opaque.
const hostSlices = {
  requestRustInvoke: jest.fn(),
  aborts: {
    has: () => false,
    call: (id: string) => callAbortController(id)
  },
  config: {} as never,
  dialogs: {} as never,
  appState: {} as never,
  notifications: {} as never,
  steamSession: {} as never,
  steamBottle: {} as never,
  engineRuntime: {} as never,
  steamLaunchRuntime: {} as never,
  appRuntime: {} as never,
  paths: {} as never
}

async function makeQueue() {
  const { createDownloadQueue } = await import('../downloadqueue')
  const library = makeLibrary()
  const onConnectivityChange = jest.fn()
  const queue = createDownloadQueue({
    sendFrontendMessage,
    stores: {
      downloadManager: { downloadManager: memoryStore },
      steam: {}
    } as never,
    managers: { library } as never,
    onlineMonitor: { isOnline: () => true, onConnectivityChange },
    ...hostSlices
  })
  // Seeds the queue head from the store seeded by the test, as the boot step does.
  queue.start()
  return { ...queue, library, onConnectivityChange }
}

// 260905-luf: behavior mirror of downloadmanager/utils.ts's real
// resolveGameTitle (live.title || fallback?.title || appName) — see the
// jest.mock('../utils', ...) factory below for why this is a mirror rather
// than the real module. `resetMocks: true` wipes any implementation
// attached at jest.fn() construction before EVERY test (same trap
// documented on `mockT`/`gameGetGameInfoMock` elsewhere in this file), so
// every describe block that reaches `processNotification` via a real
// `initQueue()` call re-applies this implementation in its own `beforeEach`.
const resolveGameTitleMock = jest.fn(
  (
    libraryManagerMap: Record<
      string,
      {
        getGame: (appName: string) => { getGameInfo: () => { title?: string } }
      }
    >,
    runner: string,
    appName: string,
    fallback?: { title?: string }
  ): string => {
    const { title } = defined(libraryManagerMap[runner], 'library manager')
      .getGame(appName)
      .getGameInfo()
    return title || fallback?.title || appName
  }
)

jest.mock('../../utils', () => ({
  getFileSize: jest.fn(),
  removeFolder: jest.fn(),
  sendGameStatusUpdate: jest.fn()
}))

// downloadmanager/utils.ts (NOT backend/utils.ts above) — installQueueElement/
// updateQueueElement pull in the install and tools stack, which needs a
// full boot. Never exercised by these tests
// (initQueue() is deliberately never called — see file header).
//
// 260905-luf: `resolveGameTitle` is real production logic downloadqueue.ts's
// processNotification now calls directly — mocked here with a behavior
// mirror (not a bare jest.fn()) so the describe blocks that DO reach
// processNotification via a real initQueue() call (Thread B, and the
// 260905-luf suite below) exercise the same fallback chain the real
// function implements, without pulling in downloadmanager/utils.ts's
// Electron-only imports.
jest.mock('../utils', () => ({
  installQueueElement: jest.fn(),
  updateQueueElement: jest.fn(),
  resolveGameTitle: resolveGameTitleMock
}))

jest.mock('../../dialog/dialog', () => ({
  notify: jest
    .requireActual('backend/testUtils/propsOnlyMock')
    .propsOnly(jest.fn())
}))

jest.mock('i18next', () => ({
  __esModule: true,
  default: { t: (_key: string, fallback = '') => fallback }
}))

jest.mock('backend/storeManagers/gog/redist', () => ({
  createRedistDMQueueElement: jest.fn()
}))

jest.mock('backend/storeManagers/steam/gameRequirements', () => ({
  getSteamInstallSize: jest.fn().mockResolvedValue('20 GB')
}))

jest.mock('backend/storeManagers/steam/cancelDelete', () => ({
  deleteCancelledSteamInstall: jest.fn(() =>
    Promise.resolve({ status: 'deleted' })
  )
}))

jest.mock('backend/storeManagers/steam/queueHeadRevalidation', () => ({
  steamQueueHeadAlreadyInstalled: jest.fn().mockResolvedValue(false)
}))

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true)
}))

jest.mock('backend/storeManagers/gog/constants', () => ({
  deriveGogPaths: () => ({ gogRedistPath: '/mock/gog-redist' })
}))

import type { DMQueueElement } from 'common/types'
// The abort registry is injected as a dep (66.4-13); this stands in for its `call`.
const callAbortController = jest.fn()
import { defined } from 'backend/testUtils/indexed'

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

const sendFrontendMessage = jest.fn()

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
    const { cancelCurrentDownload, getQueueInformation } = await makeQueue()

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

    const { pauseCurrentDownload, getQueueInformation } = await makeQueue()

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
      await makeQueue()

    expect(() =>
      cancelCurrentDownload({ removeDownloaded: false })
    ).not.toThrow()
    expect(() => pauseCurrentDownload()).not.toThrow()
    expect(getQueueInformation().elements).toHaveLength(0)
  })

  it('removeFromQueue (the "Remove from Downloads" IPC path for a non-head item) always works directly against the persisted store, independent of currentElement', async () => {
    __store.queue = [makeQueueElement('1295660'), makeQueueElement('1091500')]
    __store.finished = []

    const { removeFromQueue, getQueueInformation } = await makeQueue()

    removeFromQueue('1091500')

    const remaining = getQueueInformation().elements
    expect(remaining).toHaveLength(1)
    expect(defined(remaining[0], 'queue head').params.appName).toBe('1295660')
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
    // 260905-luf: same resetMocks:true trap — resolveGameTitleMock's
    // implementation (set at jest.fn() construction) is wiped before every
    // test; processNotification calls it via the mocked '../utils' module.
    resolveGameTitleMock.mockImplementation(
      (libraryManagerMap, runner, appName, fallback) => {
        const { title } = defined(libraryManagerMap[runner], 'library manager')
          .getGame(appName)
          .getGameInfo()
        return title || fallback?.title || appName
      }
    )
  })

  it('initQueue(true) (the app-startup call) does NOT call installQueueElement for a persisted Steam queue head', async () => {
    __store.queue = [makeQueueElement('1091500')]
    __store.finished = []

    const { installQueueElement } = await import('../utils')
    const { initQueue, getQueueInformation } = await makeQueue()

    await initQueue(true)

    expect(installQueueElement).not.toHaveBeenCalled()
    // Deferred, not removed — still there for the user to explicitly resume.
    expect(getQueueInformation().elements).toHaveLength(1)
    expect(
      defined(getQueueInformation().elements[0], 'queue head').params.appName
    ).toBe('1091500')
  })

  it('initQueue(true) leaves queueState idle/paused for a deferred Steam item — frontend renders this identically to "Resume download"', async () => {
    __store.queue = [makeQueueElement('1091500')]
    __store.finished = []

    const { initQueue, getQueueInformation } = await makeQueue()

    await initQueue(true)

    expect(['idle', 'paused']).toContain(getQueueInformation().state)
  })

  it('a deferred Steam item is still cancelable after initQueue(true) — currentElement correctly points at it, not a stale earlier item', async () => {
    __store.queue = [makeQueueElement('1091500')]
    __store.finished = []

    const { initQueue, cancelCurrentDownload, getQueueInformation } =
      await makeQueue()

    await initQueue(true)
    cancelCurrentDownload({ removeDownloaded: false })

    expect(getQueueInformation().elements).toHaveLength(0)
  })

  it('initQueue(true) drops persisted queue/finished elements with an unknown runner (legacy zoom) with one warning', async () => {
    const zoomElement = makeQueueElement('zoom-game')
    ;(zoomElement.params as { runner: string }).runner = 'zoom'
    const gogElement = makeQueueElement('gog-game')
    gogElement.params.runner = 'gog'
    const zoomFinished = makeQueueElement('zoom-done')
    ;(zoomFinished.params as { runner: string }).runner = 'zoom'
    __store.queue = [zoomElement, gogElement]
    __store.finished = [zoomFinished]

    const { installQueueElement } = await import('../utils')
    ;(installQueueElement as jest.Mock).mockResolvedValue({ status: 'done' })
    const { logWarning } = await import('backend/logger')
    const { initQueue, library } = await makeQueue()

    await initQueue(true)

    expect((library as unknown as Record<string, unknown>).zoom).toBeUndefined()
    expect(installQueueElement).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ appName: 'zoom-game' })
    )
    expect(__store.finished).not.toContainEqual(zoomFinished)
    expect(logWarning).toHaveBeenCalledTimes(1)
  })

  it('initQueue(true) DOES auto-start a persisted GOG queue head — no regression for GOG/Epic/Amazon', async () => {
    const gogElement = makeQueueElement('gog-game')
    gogElement.params.runner = 'gog'
    __store.queue = [gogElement]
    __store.finished = []

    const { installQueueElement } = await import('../utils')
    ;(installQueueElement as jest.Mock).mockResolvedValue({ status: 'done' })

    const { initQueue } = await makeQueue()

    await initQueue(true)

    expect(installQueueElement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ appName: 'gog-game', runner: 'gog' })
    )
  })

  it('a Steam item deferred by initQueue(true) IS processed by a subsequent explicit resumeCurrentDownload() (isStartup defaults to false)', async () => {
    __store.queue = [makeQueueElement('1091500')]
    __store.finished = []

    const { installQueueElement } = await import('../utils')
    ;(installQueueElement as jest.Mock).mockResolvedValue({ status: 'done' })

    const { initQueue, resumeCurrentDownload } = await makeQueue()

    await initQueue(true)
    expect(installQueueElement).not.toHaveBeenCalled()

    resumeCurrentDownload()
    // resumeCurrentDownload fires initQueue() fire-and-forget (void) — flush
    // the microtask queue so its internal awaits resolve before asserting.
    await new Promise((resolve) => setImmediate(resolve))

    expect(installQueueElement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ appName: '1091500' })
    )
  })

  it('a fresh addToQueue while idle (isIdle() kick) uses isStartup=false — an explicit user action is never blocked by a deferred Steam head', async () => {
    __store.queue = [makeQueueElement('1091500')]
    __store.finished = []

    const { installQueueElement } = await import('../utils')
    ;(installQueueElement as jest.Mock).mockResolvedValue({ status: 'done' })

    const { initQueue, addToQueue } = await makeQueue()
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
      expect.anything(),
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
    resolveGameTitleMock.mockImplementation(
      (libraryManagerMap, runner, appName, fallback) => {
        const { title } = defined(libraryManagerMap[runner], 'library manager')
          .getGame(appName)
          .getGameInfo()
        return title || fallback?.title || appName
      }
    )
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

    const { initQueue } = await makeQueue()
    const { notify } = await import('../../dialog/dialog')

    await initQueue(false)

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Cyberpunk 2077' })
    )
  })

  it('260905-luf (Task 3, no-regression): still notifies with the LIVE getGameInfo() title when hydrated — the fallback chain never overrides a real title', async () => {
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
            title: 'Stale Enqueue-Time Title'
          } as never
        },
        addToQueueTime: Date.now(),
        startTime: 0,
        endTime: 0
      }
    ]
    __store.finished = []

    // Library IS hydrated this time — getGameInfo() returns a live title that
    // differs from the queue element's captured (stale) gameInfo.title, so a
    // pass here can only mean the live title actually won.
    gameGetGameInfoMock.mockReturnValue({ title: 'Cyberpunk 2077' })

    const { installQueueElement } = await import('../utils')
    ;(installQueueElement as jest.Mock).mockResolvedValue({ status: 'error' })

    const { initQueue } = await makeQueue()
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
    const { cancelCurrentDownload } = await makeQueue()

    cancelCurrentDownload({ removeDownloaded: false })

    expect(sendGameStatusUpdate).toHaveBeenCalledWith(
      expect.anything(),
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
    const { cancelCurrentDownload } = await makeQueue()

    cancelCurrentDownload({ removeDownloaded: false })

    expect(sendGameStatusUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ appName: '1091501', status: 'done' })
    )
    expect(sendGameStatusUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ appName: '1091502', status: 'done' })
    )
  })

  it('regression guard: removeFromQueue WITHOUT forceStatusUpdate (the natural-completion call site, initQueue) still suppresses the badge clear for a Steam runner — unchanged, still defers to the ACF poller', async () => {
    __store.queue = [makeQueueElement('1091500')]
    __store.finished = []

    const { sendGameStatusUpdate } = await import('../../utils')
    const { removeFromQueue } = await makeQueue()

    // Calling with the default (no second argument) mirrors initQueue's own
    // call site (element.params.appName) — must NOT force-clear the badge.
    removeFromQueue('1091500')

    expect(sendGameStatusUpdate).not.toHaveBeenCalled()
  })

  it('removeFromQueue with forceStatusUpdate=true clears the badge for a Steam runner on demand', async () => {
    __store.queue = [makeQueueElement('1091500')]
    __store.finished = []

    const { sendGameStatusUpdate } = await import('../../utils')
    const { removeFromQueue } = await makeQueue()

    removeFromQueue('1091500', true)

    expect(sendGameStatusUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ appName: '1091500', status: 'done' })
    )
  })

  it('a non-Steam runner is unaffected by forceStatusUpdate — always cleared regardless (no behavior change for GOG/Epic/Amazon)', async () => {
    const gogElement = makeQueueElement('gog-game')
    gogElement.params.runner = 'gog'
    __store.queue = [gogElement]
    __store.finished = []

    const { sendGameStatusUpdate } = await import('../../utils')
    const { removeFromQueue } = await makeQueue()

    removeFromQueue('gog-game') // forceStatusUpdate omitted -- non-steam already always clears

    expect(sendGameStatusUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ appName: 'gog-game', status: 'done' })
    )
  })
})

describe('downloadqueue.ts — quick 261024-cjq: deferred-to-setup installs are not "Finished"', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    for (const key of Object.keys(__store)) delete __store[key]
    gameGetGameInfoMock.mockReturnValue({ title: 'Some Game' })
    resolveGameTitleMock.mockImplementation(
      (libraryManagerMap, runner, appName, fallback) => {
        const { title } = defined(libraryManagerMap[runner], 'library manager')
          .getGame(appName)
          .getGameInfo()
        return title || fallback?.title || appName
      }
    )
  })

  async function runOne(installResult: Record<string, unknown>) {
    __store.queue = [makeQueueElement('555')]
    __store.finished = []
    const { installQueueElement } = await import('../utils')
    ;(installQueueElement as jest.Mock).mockResolvedValue(installResult)
    const { initQueue } = await makeQueue()
    const { logInfo } = await import('backend/logger')
    await initQueue(false)
    const lines = (logInfo as jest.Mock).mock.calls.map((c) =>
      Array.isArray(c[0]) ? c[0].join(' ') : String(c[0])
    )
    return lines
  }

  it('logs "deferred", no "Finished", records nothing as finished, and still dequeues', async () => {
    const lines = await runOne({ status: 'done', deferredToSetup: true })
    expect(lines.some((l) => l.includes('Finished'))).toBe(false)
    expect(lines.some((l) => l.includes('deferred'))).toBe(true)
    expect(__store.finished).toEqual([])
    expect(__store.queue).toEqual([])
  })

  it('a plain done install still logs "Finished Installation of" and is recorded', async () => {
    const lines = await runOne({ status: 'done' })
    expect(lines).toContain('Finished Installation of 555')
    expect((__store.finished as unknown[]).length).toBe(1)
  })
})

describe('downloadqueue.ts — quick-261027-cux: Steam Delete Files routing', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    for (const key of Object.keys(__store)) delete __store[key]
  })

  it('steam head with removeDownloaded calls deleteCancelledSteamInstall once and never removeFolder', async () => {
    __store.queue = [makeQueueElement('1091500')]
    __store.finished = []
    const { deleteCancelledSteamInstall } =
      await import('backend/storeManagers/steam/cancelDelete')
    const { removeFolder } = await import('../../utils')
    const { cancelCurrentDownload } = await makeQueue()

    cancelCurrentDownload({ removeDownloaded: true })

    expect(deleteCancelledSteamInstall).toHaveBeenCalledTimes(1)
    expect(deleteCancelledSteamInstall).toHaveBeenCalledWith(
      expect.anything(),
      '1091500'
    )
    expect(removeFolder).not.toHaveBeenCalled()
  })

  it('steam head without removeDownloaded never calls deleteCancelledSteamInstall', async () => {
    __store.queue = [makeQueueElement('1091500')]
    __store.finished = []
    const { deleteCancelledSteamInstall } =
      await import('backend/storeManagers/steam/cancelDelete')
    const { cancelCurrentDownload } = await makeQueue()

    cancelCurrentDownload({ removeDownloaded: false })

    expect(deleteCancelledSteamInstall).not.toHaveBeenCalled()
  })

  it('non-steam head with removeDownloaded keeps the folder_name/removeFolder path', async () => {
    const gogElement = makeQueueElement('gog-game')
    gogElement.params.runner = 'gog'
    __store.queue = [gogElement]
    __store.finished = []
    gameGetGameInfoMock.mockReturnValue({ folder_name: 'GogFolder' })
    const { deleteCancelledSteamInstall } =
      await import('backend/storeManagers/steam/cancelDelete')
    const { removeFolder } = await import('../../utils')
    jest.mocked(removeFolder).mockResolvedValue(undefined)
    const { cancelCurrentDownload } = await makeQueue()

    cancelCurrentDownload({ removeDownloaded: true })

    expect(removeFolder).toHaveBeenCalledWith(
      expect.anything(),
      '/mock/install/path',
      'GogFolder'
    )
    expect(deleteCancelledSteamInstall).not.toHaveBeenCalled()
  })
})

describe('downloadqueue.ts — todo 2026-11-09: stale already-installed Steam head is dropped', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    for (const key of Object.keys(__store)) delete __store[key]
    gameGetGameInfoMock.mockReturnValue({ folder_name: undefined })
    resolveGameTitleMock.mockImplementation(
      (libraryManagerMap, runner, appName, fallback) => {
        const { title } = defined(libraryManagerMap[runner], 'library manager')
          .getGame(appName)
          .getGameInfo()
        return title || fallback?.title || appName
      }
    )
  })

  async function load(stale: string[]) {
    const { installQueueElement, updateQueueElement } = await import('../utils')
    const { steamQueueHeadAlreadyInstalled } =
      await import('backend/storeManagers/steam/queueHeadRevalidation')
    jest
      .mocked(steamQueueHeadAlreadyInstalled)
      .mockImplementation((_deps, appId) =>
        Promise.resolve(stale.includes(appId))
      )
    jest
      .mocked(installQueueElement)
      .mockResolvedValue({ status: 'done', deferredToSetup: false } as never)
    jest
      .mocked(updateQueueElement)
      .mockResolvedValue({ status: 'done' } as never)
    const queue = await makeQueue()
    return {
      installQueueElement,
      updateQueueElement,
      steamQueueHeadAlreadyInstalled,
      ...queue
    }
  }

  it('drops the stale head, starts the next element, and records nothing finished for the dropped head', async () => {
    __store.queue = [makeQueueElement('108600'), makeQueueElement('DREDGE')]
    __store.finished = []
    const { initQueue, installQueueElement } = await load(['108600'])

    await initQueue()

    expect(installQueueElement).toHaveBeenCalledTimes(1)
    expect(installQueueElement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ appName: 'DREDGE' })
    )
    const finished = (__store.finished as DMQueueElement[]).map(
      (e) => e.params.appName
    )
    expect(finished).not.toContain('108600')
    expect(finished).toContain('DREDGE')
    expect(__store.queue).toEqual([])
  })

  it('drops a lone stale head at startup instead of surfacing it as resumable', async () => {
    __store.queue = [makeQueueElement('108600')]
    __store.finished = []
    const { initQueue, installQueueElement, getQueueInformation } = await load([
      '108600'
    ])

    await initQueue(true)

    expect(installQueueElement).not.toHaveBeenCalled()
    expect(getQueueInformation().elements).toHaveLength(0)
  })

  it('helper false keeps the existing behaviour (starts the head)', async () => {
    __store.queue = [makeQueueElement('108600')]
    __store.finished = []
    const { initQueue, installQueueElement } = await load([])

    await initQueue()

    expect(installQueueElement).toHaveBeenCalledTimes(1)
  })

  it('update elements and non-Steam runners never call the helper', async () => {
    const update = makeQueueElement('108600')
    update.type = 'update'
    const gog = makeQueueElement('gog-game')
    gog.params.runner = 'gog'
    __store.queue = [update, gog]
    __store.finished = []
    const { initQueue, steamQueueHeadAlreadyInstalled } = await load(['108600'])

    await initQueue()

    expect(steamQueueHeadAlreadyInstalled).not.toHaveBeenCalled()
  })
})

describe('downloadqueue.ts — 66.1-11: boot service, no import-time effects', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    for (const key of Object.keys(__store)) delete __store[key]
  })

  function depsWith(
    overrides: { get?: jest.Mock; subscribe?: jest.Mock } = {}
  ) {
    const get = overrides.get ?? jest.fn((_k: string, def: unknown) => def)
    const subscribe = overrides.subscribe ?? jest.fn()
    return {
      get,
      subscribe,
      deps: {
        sendFrontendMessage,
        stores: {
          downloadManager: { downloadManager: { ...memoryStore, get } },
          steam: {}
        } as never,
        managers: { library: makeLibrary() } as never,
        onlineMonitor: {
          isOnline: () => true,
          onConnectivityChange: subscribe
        },
        ...hostSlices
      }
    }
  }

  it('importing the module and constructing a queue reads no store and subscribes to nothing', async () => {
    const { createDownloadQueue } = await import('../downloadqueue')
    const { get, subscribe, deps } = depsWith()

    createDownloadQueue(deps)

    expect(get).not.toHaveBeenCalled()
    expect(subscribe).not.toHaveBeenCalled()
  })

  it('start() reads the first element once and subscribes once', async () => {
    const { createDownloadQueue } = await import('../downloadqueue')
    const { get, subscribe, deps } = depsWith()

    createDownloadQueue(deps).start()

    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('queue', [])
    expect(subscribe).toHaveBeenCalledTimes(1)
  })

  it('two queues created in one test keep independent state', async () => {
    __store.queue = [makeQueueElement('1295660')]
    __store.finished = []
    const first = await makeQueue()
    const second = await makeQueue()

    first.pauseCurrentDownload()

    expect(first.getQueueInformation().state).toBe('paused')
    expect(second.getQueueInformation().state).toBe('idle')
  })
})

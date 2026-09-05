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
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend', DownloadManager: 'DownloadManager' }
}))

jest.mock('backend/utils/aborthandler/aborthandler', () => ({
  callAbortController: jest.fn(),
  hasAbortController: jest.fn()
}))

const installMock = jest.fn()
const getGameInfoMock = jest.fn().mockReturnValue({ title: 'Test Game' })
const stopMock = jest.fn()

jest.mock('backend/storeManagers', () => ({
  libraryManagerMap: {
    steam: {
      getGame: jest.fn().mockReturnValue({
        install: installMock,
        getGameInfo: getGameInfoMock,
        stop: stopMock
      })
    },
    gog: {
      getGame: jest.fn().mockReturnValue({
        install: installMock,
        getGameInfo: getGameInfoMock,
        stop: stopMock
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

// mockT is spy-able (jest.fn) so the honest-copy spec below can assert on
// the KEY i18next.t was called with, not on rendered English -- but
// jest.config's `resetMocks: true` wipes even an implementation passed
// directly to `jest.fn(impl)` at factory-eval time (confirmed empirically),
// so the fallback-interpolation behavior every OTHER spec in this file
// depends on must be re-applied in a file-scope `beforeEach` below.
const mockT = jest.fn(
  (_key: string, fallback = '', options?: Record<string, string | number>) =>
    options
      ? fallback.replace(/{{(\w+)}}/g, (match: string, token: string) =>
          token in options ? String(options[token]) : match
        )
      : fallback
)

jest.mock('i18next', () => ({
  __esModule: true,
  default: {
    t: mockT
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

import { installQueueElement, resolveGameTitle } from '../utils'
import { libraryManagerMap } from 'backend/storeManagers'
import { isOnline } from '../../online_monitor'
import { existsSync } from 'graceful-fs'
import { showDialogBoxModalAuto } from '../../dialog/dialog'
import { logWarning, logError, LogPrefix } from 'backend/logger'
import {
  callAbortController,
  hasAbortController
} from 'backend/utils/aborthandler/aborthandler'
import { backendEvents } from 'backend/backend_events'
import type { InstallParams, GameStatus, GameInfo } from 'common/types'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * 37-05 (REQ-37-04, Wave 4 Task 1): the pre-existing `aborthandler` mock
 * (above) was `{ callAbortController: jest.fn() }` with no implementation --
 * fine for asserting "was callAbortController called with this id", but
 * blind to what callAbortController itself LOGS on a lookup miss, which is
 * the actual user-visible artifact this plan is about. This test-local
 * registry mirrors the real module's has()/set()-on-abort semantics closely
 * enough to reproduce its log behaviour, without importing the real,
 * shared-Map module (aborthandler.test.ts already owns unit coverage of
 * that). The `callAbortController` mock's implementation is (re)installed
 * against this registry in the file-scope `beforeEach` below -- resetMocks:
 * true wipes any implementation set here before every test, the same trap
 * `mockT` above already documents.
 */
const abortControllerRegistry = new Map<string, boolean>()

function registerFakeAbortController(id: string) {
  abortControllerRegistry.set(id, false)
}

function loggedAbortControllerMiss(): boolean {
  return (logError as jest.Mock).mock.calls.some(([arg]) => {
    if (!Array.isArray(arg)) return false
    return arg.some(
      (part) =>
        typeof part === 'string' &&
        /could not find a matching abort controller/i.test(part)
    )
  })
}

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

function emitAdvance(
  appName: string,
  progress: { percent?: number; bytes?: string }
) {
  const payload: GameStatus = {
    appName,
    runner: 'steam',
    status: 'installing',
    progress: { bytes: '', eta: '', ...progress }
  }
  backendEvents.emit(`progressUpdate-${appName}`, payload)
}

// File-scope, applies to every test in this file (registered outside any
// describe): resetMocks:true wipes mockT's implementation before EACH test,
// including the very first one -- re-apply it here rather than duplicating
// this block into every describe's own beforeEach.
beforeEach(() => {
  mockT.mockImplementation(
    (_key: string, fallback = '', options?: Record<string, string | number>) =>
      options
        ? fallback.replace(/{{(\w+)}}/g, (match: string, token: string) =>
            token in options ? String(options[token]) : match
          )
        : fallback
  )

  // 37-05 (REQ-37-04): same resetMocks:true trap as mockT above -- re-apply
  // callAbortController's fake implementation and clear the registry so one
  // test's registration never leaks into the next (mirrors
  // aborthandler.test.ts's own afterEach discipline for the real module's
  // shared Map).
  abortControllerRegistry.clear()
  ;(callAbortController as jest.Mock).mockImplementation((id: string) => {
    if (abortControllerRegistry.has(id)) {
      abortControllerRegistry.set(id, true)
      return
    }
    logError(
      [
        'Aborting not possible. Could not find a matching abort controller for',
        id
      ],
      'Backend'
    )
  })
  ;(hasAbortController as jest.Mock).mockImplementation((id: string) =>
    abortControllerRegistry.has(id)
  )
})

describe('installQueueElement — debug/steam-cancel-abort-thread-a: badge clearing on abort', () => {
  beforeEach(() => {
    // jest.config.js sets `resetMocks: true` globally -- every jest.fn()'s
    // implementation (including one set via a mock factory's
    // .mockReturnValue at first `require()`) is wiped before EACH test, not
    // just once. Re-apply every implementation this suite depends on here.
    getGameInfoMock.mockReturnValue({ title: 'Test Game' })
    stopMock.mockResolvedValue(undefined)
    ;(libraryManagerMap.steam.getGame as jest.Mock).mockReturnValue({
      install: installMock,
      getGameInfo: getGameInfoMock,
      stop: stopMock
    })
    ;(libraryManagerMap.gog.getGame as jest.Mock).mockReturnValue({
      install: installMock,
      getGameInfo: getGameInfoMock,
      stop: stopMock
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

  it('37-02 (D-07): an install error classified with errorAction "signIn" raises a dialog with exactly one "steamSignIn" button', async () => {
    installMock.mockResolvedValue({
      status: 'error',
      error: 'You are not signed in to Steam',
      errorAction: 'signIn'
    })

    await installQueueElement(makeParams())

    const dialogCall = (showDialogBoxModalAuto as jest.Mock).mock.calls[0][0]
    expect(dialogCall.buttons).toHaveLength(1)
    // Assert on the serializable `action`, never on `text` — the text is
    // translated prose and would make this assertion stale by wording.
    expect(dialogCall.buttons[0].action).toBe('steamSignIn')
  })

  it('37-02 (D-07) regression guard: an install error with NO errorAction raises a dialog with no buttons — byte-identical to today', async () => {
    installMock.mockResolvedValue({
      status: 'error',
      error: 'boom'
    })

    await installQueueElement(makeParams())

    const dialogCall = (showDialogBoxModalAuto as jest.Mock).mock.calls[0][0]
    expect(dialogCall.buttons).toBeUndefined()
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

describe('installQueueElement — 260817-dib: no-progress (stall) install watchdog', () => {
  beforeEach(() => {
    getGameInfoMock.mockReturnValue({ title: 'Test Game' })
    stopMock.mockResolvedValue(undefined)
    ;(libraryManagerMap.steam.getGame as jest.Mock).mockReturnValue({
      install: installMock,
      getGameInfo: getGameInfoMock,
      stop: stopMock
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

  it('RED (the defect): advancing progress every 100s keeps a native Steam install running past 20 minutes of fake time -- no error, no dialog', async () => {
    jest.useFakeTimers()
    installMock.mockReturnValue(new Promise(() => {}))

    const resultPromise = installQueueElement(makeParams())
    let settled = false
    resultPromise.then(() => (settled = true))

    let percent = 0
    // 12 * 100s = 1200s = 20 minutes, each tick reports a genuine advance.
    for (let i = 0; i < 12; i++) {
      await jest.advanceTimersByTimeAsync(100_000)
      percent += 1
      emitAdvance('1091500', { percent, bytes: `${percent} MB` })
    }

    expect(settled).toBe(false)
    expect(sendGameStatusUpdateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'done' })
    )
    expect(showDialogBoxModalAuto).not.toHaveBeenCalled()
  })

  it('stall trip still aborts (locked decision 4): callAbortController + steam-gated stop(false) still fire on a stall trip', async () => {
    // 37-05: a never-settling install() models a depot download that is
    // genuinely STILL RUNNING when the stall watchdog trips, so its own
    // controller has not been deleted yet — register one to model that.
    registerFakeAbortController('1091500')
    jest.useFakeTimers()
    installMock.mockReturnValue(new Promise(() => {}))

    const resultPromise = installQueueElement(makeParams())
    const assertion = resultPromise.then((result) => {
      expect(result.status).toBe('error')
      expect(callAbortController).toHaveBeenCalledWith('1091500')
      expect(stopMock).toHaveBeenCalledWith(false)
    })

    // No progress events at all -- a genuine stall.
    await jest.advanceTimersByTimeAsync(9 * 60 * 1000)
    await assertion
  })

  // 260902-qgd: the key is pinned WITH its `gamelib:` namespace, matching
  // utils.ts:266. Quick 260901-ud5 (Bucket R) moved every fork-authored
  // string into the gamelib namespace to satisfy D-05, and this assertion --
  // written earlier, in 260817-dib -- was left pinning the bare key.
  it('honest copy: a stall trip uses gamelib:box.error.install.stalled and the dialog does not say "connection may be stale"', async () => {
    jest.useFakeTimers()
    installMock.mockReturnValue(new Promise(() => {}))

    const resultPromise = installQueueElement(makeParams())
    const assertion = resultPromise.then(() => {
      expect(mockT).toHaveBeenCalledWith(
        'gamelib:box.error.install.stalled',
        expect.any(String),
        expect.objectContaining({ minutes: expect.any(Number) })
      )
      const dialogCall = (showDialogBoxModalAuto as jest.Mock).mock
        .calls[0][0] as { message: string }
      expect(dialogCall.message).not.toMatch(/connection may be stale/)
    })

    await jest.advanceTimersByTimeAsync(9 * 60 * 1000)
    await assertion
  })

  it('inner CM timeout copy is preserved: an install() that REJECTS with isTimeout:true still produces the "connection may be stale" reason', async () => {
    installMock.mockRejectedValue(
      Object.assign(new Error('CM socket stale'), { isTimeout: true as const })
    )

    await installQueueElement(makeParams())

    expect(showDialogBoxModalAuto).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('connection may be stale')
      })
    )
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
    stopMock.mockResolvedValue(undefined)
    ;(libraryManagerMap.steam.getGame as jest.Mock).mockReturnValue({
      install: installMock,
      getGameInfo: getGameInfoMock,
      stop: stopMock
    })
    ;(libraryManagerMap.gog.getGame as jest.Mock).mockReturnValue({
      install: installMock,
      getGameInfo: getGameInfoMock,
      stop: stopMock
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
    stopMock.mockResolvedValue(undefined)
    ;(libraryManagerMap.steam.getGame as jest.Mock).mockReturnValue({
      install: installMock,
      getGameInfo: getGameInfoMock,
      stop: stopMock
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

  // quick task 260905-luf (Task 1, Test A — the CONTROL): falsifies evidence
  // item 6 (the plan's own claim that this dialog is ALREADY guarded).
  // resolveQueueElementTitle (this module, ~L55-62) is `title || appName`, so
  // even a `{} as GameInfo` double cache miss must still render the raw
  // appName rather than an empty subject. EXPECTED: GREEN. If this comes
  // back RED, evidence item 6 is wrong and that is the headline finding, not
  // this test.
  it('260905-luf Test A (CONTROL): a Steam install error dialog renders a NON-EMPTY subject even when getGameInfo() returns {} (double cache miss)', async () => {
    getGameInfoMock.mockReturnValue({})
    installMock.mockResolvedValue({ status: 'error' })

    await installQueueElement(makeParams({ appName: '1091500' }))

    expect(showDialogBoxModalAuto).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('1091500')
      })
    )
  })
})

// quick task 260905-luf (Task 3, D-01): resolveGameTitle is the single
// shared fallback chain every DownloadManager title consumer now delegates
// to (resolveQueueElementTitle above, downloadqueue.ts's processNotification,
// installFlowRegistration.ts's moveInstall/importGame). Locking its four
// behavior cases directly guards the contract independent of any one caller.
describe('resolveGameTitle — 260905-luf (D-01): the shared title fallback chain', () => {
  beforeEach(() => {
    getGameInfoMock.mockReturnValue({ title: 'Test Game' })
    ;(libraryManagerMap.steam.getGame as jest.Mock).mockReturnValue({
      install: installMock,
      getGameInfo: getGameInfoMock,
      stop: stopMock
    })
  })

  it('a live (non-empty) title from getGameInfo() wins over both the fallback and the raw appName', () => {
    getGameInfoMock.mockReturnValue({ title: 'Live Title' })

    const result = resolveGameTitle(libraryManagerMap, 'steam', '1091500', {
      title: 'Fallback Title'
    } as GameInfo)

    expect(result).toBe('Live Title')
  })

  it('a double cache miss ({} from getGameInfo()) falls back to fallback.title when provided', () => {
    getGameInfoMock.mockReturnValue({})

    const result = resolveGameTitle(libraryManagerMap, 'steam', '1091500', {
      title: 'Cyberpunk 2077'
    } as GameInfo)

    expect(result).toBe('Cyberpunk 2077')
  })

  it('a double cache miss with NO fallback provided falls back to the raw appName — never an empty subject', () => {
    getGameInfoMock.mockReturnValue({})

    const result = resolveGameTitle(libraryManagerMap, 'steam', '1091500')

    expect(result).toBe('1091500')
  })

  it('an empty-string live title is treated as absent (falsy), same as undefined — falls through to fallback.title', () => {
    getGameInfoMock.mockReturnValue({ title: '' })

    const result = resolveGameTitle(libraryManagerMap, 'steam', '1091500', {
      title: 'Cyberpunk 2077'
    } as GameInfo)

    expect(result).toBe('Cyberpunk 2077')
  })
})

/**
 * quick task 260816-vgc: live evidence, HUMANKIND appId `1124300`, 2026-08-16
 * 21:36:40 — a `DownloadManager` install failure ("install did not settle —
 * connection may be stale") did NOT abort its own in-flight native depot
 * download. The chunk-stream loop kept running for ~5 more minutes, writing
 * 4,486 orphaned files, with no `appmanifest_*.acf` ever written.
 *
 * The abort machinery already existed and worked: a user Cancel on the same
 * build, same session, on Cyberpunk 2077 appId `1091500` at 21:50:44 logged
 * `SteamGame: aborting in-flight native depot download for appId 1091500`
 * and the chunk loop stopped the same second. This suite proves the
 * DownloadManager failure path routes through the SAME `.stop(false)` call
 * (`libraryManagerMap.steam.getGame(appName).stop(false)`, steam runner
 * only — non-steam runners must NOT get an automatic `.stop()`, see spec 6's
 * `killPattern` blast-radius guard) the Cancel path
 * (`downloadqueue.ts`'s `stopCurrentDownload`) already makes.
 *
 * REVISED by 37-05 (REQ-37-04): `callAbortController(appName)` does NOT fire
 * "for every runner" as originally written here — that was the very
 * misleading-ERROR defect this plan fixes. Measured at HEAD (37-05-SUMMARY.md):
 * a native Steam depot download's own `finally` (games.ts's
 * runNativeDepotDownload) always deletes its controller before a settled or
 * rejected InstallResult ever reaches this function, and gogdl/legendary's
 * install() never calls createAbortController at all — so in BOTH cases
 * there was never anything for callAbortController to find once installQueueElement's
 * finally runs. Only a depot download that is STILL actively running when the
 * outer watchdog gives up (spec 1) has a live registration to abort.
 */
describe('installQueueElement — orphaned-depot abort: a terminal install failure routes through the same abort as user Cancel', () => {
  beforeEach(() => {
    getGameInfoMock.mockReturnValue({ title: 'Test Game' })
    stopMock.mockResolvedValue(undefined)
    ;(libraryManagerMap.steam.getGame as jest.Mock).mockReturnValue({
      install: installMock,
      getGameInfo: getGameInfoMock,
      stop: stopMock
    })
    ;(libraryManagerMap.gog.getGame as jest.Mock).mockReturnValue({
      install: installMock,
      getGameInfo: getGameInfoMock,
      stop: stopMock
    })
    ;(isOnline as jest.Mock).mockReturnValue(true)
    ;(existsSync as jest.Mock).mockReturnValue(true)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('spec 1 (the reported defect — watchdog trip): a never-settling install() aborts the in-flight steam depot download once the watchdog fires', async () => {
    // 37-05: a never-settling install() models a depot download that is
    // genuinely STILL RUNNING — games.ts's runNativeDepotDownload has not
    // returned, so its own `finally` has not deleted the controller yet.
    // Register one to model that real, still-live state; this is the ONE
    // spec in this describe where hasAbortController(appName) is true.
    registerFakeAbortController('1091500')
    jest.useFakeTimers()
    installMock.mockReturnValue(new Promise(() => {}))

    const resultPromise = installQueueElement(makeParams())
    const assertion = resultPromise.then((result) => {
      expect(result.status).toBe('error')
      expect(callAbortController).toHaveBeenCalledWith('1091500')
      expect(stopMock).toHaveBeenCalledWith(false)
    })

    await jest.advanceTimersByTimeAsync(10 * 60 * 1000)
    await assertion
  })

  it('spec 2 (install resolves {status: "error"}, REVISED by 37-05): the depot download has already settled, so games.ts has already deleted its own controller by construction — nothing left for callAbortController to abort, but .stop(false) still fires unconditionally', async () => {
    installMock.mockResolvedValue({ status: 'error', error: 'boom' })

    const result = await installQueueElement(makeParams())

    expect(result.status).toBe('error')
    expect(callAbortController).not.toHaveBeenCalled()
    expect(logWarning).toHaveBeenCalledWith(
      expect.stringContaining('No in-flight download to abort for 1091500'),
      LogPrefix.DownloadManager
    )
    expect(stopMock).toHaveBeenCalledWith(false)
  })

  it('spec 3 (install() throws/rejects, REVISED by 37-05): a finally block runs on rejection exactly as it does on resolution, so this shape ALSO has no registered controller left by the time installQueueElement sees it — .stop(false) still fires unconditionally', async () => {
    installMock.mockRejectedValue(new Error('ECONNRESET'))

    const result = await installQueueElement(makeParams())

    expect(result.status).toBe('error')
    expect(callAbortController).not.toHaveBeenCalled()
    expect(stopMock).toHaveBeenCalledWith(false)
  })

  it('spec 4 (regression — {status: "done"}): a successful install does NOT trigger an abort', async () => {
    installMock.mockResolvedValue({ status: 'done' })

    const result = await installQueueElement(makeParams())

    expect(result.status).toBe('done')
    expect(callAbortController).not.toHaveBeenCalled()
    expect(stopMock).not.toHaveBeenCalled()
  })

  it('spec 5 (regression — {status: "abort"}): a user cancel that already aborted does NOT get a second, redundant abort issued', async () => {
    installMock.mockResolvedValue({ status: 'abort' })

    const result = await installQueueElement(makeParams())

    expect(result.status).toBe('abort')
    expect(callAbortController).not.toHaveBeenCalled()
    expect(stopMock).not.toHaveBeenCalled()
  })

  it('spec 6 (blast-radius gate — non-steam runner, REVISED by 37-05): a failed gog install never had a registered controller in the first place — gogdl/legendary install() never calls createAbortController anywhere in this codebase — so callAbortController correctly does NOT fire, and .stop() must NOT either — legendary/gog stop() has a wider kill blast radius than a targeted abort', async () => {
    installMock.mockResolvedValue({ status: 'error', error: 'boom' })

    const result = await installQueueElement(
      makeParams({
        runner: 'gog',
        gameInfo: { app_name: '1091500', runner: 'gog' } as never
      })
    )

    expect(result.status).toBe('error')
    expect(callAbortController).not.toHaveBeenCalled()
    expect(stopMock).not.toHaveBeenCalled()
  })
})

describe('installQueueElement — REQ-37-03: the install-failure dialog always names a game', () => {
  beforeEach(() => {
    // jest.config.js sets `resetMocks: true` globally -- re-apply every
    // implementation this suite depends on, same convention as the other
    // describe blocks in this file.
    stopMock.mockResolvedValue(undefined)
    ;(libraryManagerMap.steam.getGame as jest.Mock).mockReturnValue({
      install: installMock,
      getGameInfo: getGameInfoMock,
      stop: stopMock
    })
    ;(isOnline as jest.Mock).mockReturnValue(true)
    ;(existsSync as jest.Mock).mockReturnValue(true)
  })

  it('D-09/RED: SteamGame.getGameInfo() returning {} (the exact shape on an async cache miss) still names the appid, never an empty gap', async () => {
    getGameInfoMock.mockReturnValue({})
    installMock.mockResolvedValue({ status: 'error', error: 'boom' })

    await installQueueElement(makeParams())

    const [dialogArg] = (showDialogBoxModalAuto as jest.Mock).mock.calls[0]
    // Assert on the RENDERED message, not the i18next.t options object --
    // an options-object assertion would pass on `{ title: undefined }` just
    // as happily as on a fixed value, and the defect the user saw was in
    // the rendered string.
    expect(dialogArg.message).toContain('1091500')
    expect(dialogArg.message).not.toMatch(/installation of\s+failed/i)
  })

  it('regression guard: a real title still renders the title, and never the appid, once the fallback exists', async () => {
    getGameInfoMock.mockReturnValue({ title: 'Test Game' })
    installMock.mockResolvedValue({ status: 'error', error: 'boom' })

    await installQueueElement(makeParams())

    const [dialogArg] = (showDialogBoxModalAuto as jest.Mock).mock.calls[0]
    expect(dialogArg.message).toContain('Test Game')
    expect(dialogArg.message).not.toContain('1091500')
  })

  it("scope pin: the existing `error` fallback ('Unknown error') is unchanged by this fix", async () => {
    getGameInfoMock.mockReturnValue({ title: 'Test Game' })
    installMock.mockResolvedValue({ status: 'error' })

    await installQueueElement(makeParams())

    const [dialogArg] = (showDialogBoxModalAuto as jest.Mock).mock.calls[0]
    expect(dialogArg.message).toContain('Unknown error')
  })
})

/**
 * 37-05 (REQ-37-04): live evidence recorded in
 * .planning/todos/pending/2026-08-21-abort-controller-missing-on-terminal-
 * steam-install-failure.md — a terminal Steam install failure logs
 * `[ERROR] [Backend]: Aborting not possible. Could not find a matching
 * abort controller <appid>` on EVERY observed case, including a plan-build
 * failure that aborted in ~1ms, before any depot download started. That
 * ERROR describes a teardown race that is not happening — see this plan's
 * SUMMARY for the measured mechanism (games.ts's runNativeDepotDownload
 * deletes its own controller in its `finally`, before the InstallResult
 * ever reaches installQueueElement's own finally below, which then asks
 * unconditionally).
 *
 * Case 1 is the RED case: it fails against unmodified downloadmanager/
 * utils.ts and must only start passing once Task 2 gates the call on
 * hasAbortController(appName).
 */
describe('installQueueElement — REQ-37-04: no spurious abort-controller-miss ERROR', () => {
  beforeEach(() => {
    getGameInfoMock.mockReturnValue({ title: 'Test Game' })
    stopMock.mockResolvedValue(undefined)
    ;(libraryManagerMap.steam.getGame as jest.Mock).mockReturnValue({
      install: installMock,
      getGameInfo: getGameInfoMock,
      stop: stopMock
    })
    ;(isOnline as jest.Mock).mockReturnValue(true)
    ;(existsSync as jest.Mock).mockReturnValue(true)
  })

  it('case 1 (RED against unmodified utils.ts): a terminal Steam install failure with NO abort controller registered for the appName does not log the misleading "could not find a matching abort controller" ERROR, and logs an honest WARNING naming the appName instead — not silence, not ERROR', async () => {
    installMock.mockResolvedValue({ status: 'error', error: 'boom' })

    const result = await installQueueElement(makeParams())

    expect(result.status).toBe('error')
    expect(loggedAbortControllerMiss()).toBe(false)
    // Task 3 mutation check 3: if the WARNING branch is ever deleted so the
    // "nothing to abort" case logs nothing at all, THIS assertion fails —
    // guards the trade of an observability defect for a blindness defect.
    expect(logWarning).toHaveBeenCalledWith(
      expect.stringContaining('1091500'),
      LogPrefix.DownloadManager
    )
  })

  it("case 2 (the user-cancel pin, CONTEXT.md's recorded first check being discharged): when a controller IS registered for the appName, callAbortController still aborts it and no miss is ever logged — true both before and after Task 2's fix", async () => {
    registerFakeAbortController('1091500')
    installMock.mockResolvedValue({ status: 'error', error: 'boom' })

    const result = await installQueueElement(makeParams())

    expect(result.status).toBe('error')
    expect(callAbortController).toHaveBeenCalledWith('1091500')
    expect(abortControllerRegistry.get('1091500')).toBe(true)
    expect(loggedAbortControllerMiss()).toBe(false)
  })

  it("case 2b (ordering pin): downloadqueue.ts's stopCurrentDownload() calls callAbortController(appName) then .stop(false) synchronously, with no `await` between them — the reason a user Cancel already finds the controller registered and is unaffected by this plan", () => {
    const source = readFileSync(
      join(__dirname, '..', 'downloadqueue.ts'),
      'utf-8'
    )
    const fnMatch = source.match(
      /function stopCurrentDownload\(\) {([\s\S]*?)\n}/
    )
    expect(fnMatch).not.toBeNull()

    const body = fnMatch![1]
    expect(body).not.toMatch(/await/)
    const abortIdx = body.indexOf('callAbortController(appName)')
    const stopIdx = body.indexOf('.stop(false)')
    expect(abortIdx).toBeGreaterThan(-1)
    expect(stopIdx).toBeGreaterThan(abortIdx)
  })

  it('case 3 (blindness guard): callAbortController called directly for an id that was never registered — simulating any caller OTHER than the terminal-error branch (SteamGame.stop, stopCurrentDownload, callAllAbortControllers) — still reaches logError, unchanged by this plan', () => {
    callAbortController('some-other-caller-genuinely-unregistered-id')

    expect(loggedAbortControllerMiss()).toBe(true)
  })
})

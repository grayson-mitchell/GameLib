/**
 * End-to-end wiring test for the sidecar's curated download-queue channels
 * (Phase 32 Plan 01 — REQ-32-02/REQ-32-03/REQ-32-04/REQ-32-05/REQ-32-08).
 *
 * Drives the REAL sidecar RPC server in-process (`settingsFlows.test.ts`'s own
 * real-shim black-box pattern — the shims under test are the actual
 * electronStub.ts/fileStore.ts modules, unmocked) against injected
 * `stream.PassThrough` pairs.
 *
 * **GAP FIX precedent (2026-07-22, see skeletonFlows.test.ts's own header):**
 * this suite's config directory is NOT the real OS config directory. The
 * `jest.mock('os', ...)` below overrides `homedir()` to a disposable
 * per-process tmp directory so the real electronStub/fileStore CODE runs
 * (preserving this suite's fidelity), while the location it reads/writes can
 * never be the developer's real config directory.
 *
 * `jest.mock('electron', ...)` / `jest.mock('electron-store', ...)` below
 * point Jest's OWN module resolution at electronStub.ts/fileStore.ts
 * directly — see skeletonFlows.test.ts's header for why this is necessary.
 * Because `electron-store` resolves to the REAL `fileStore.ts` (not a mock
 * class), `downloadmanager/electronStores.ts`'s `downloadManager` store is a
 * REAL, disk-backed `TypeCheckedStoreBackend` for this suite — no separate
 * mock is needed for it (32-PATTERNS.md's own note); this suite seeds/reads
 * its `queue`/`finished` keys directly via the same singleton instance
 * `downloadqueue.ts` uses in production.
 *
 * Mocked only at the boundaries this plan's own module docstring names
 * (32-PATTERNS.md §mock-boundaries):
 *   - `backend/storeManagers` (`libraryManagerMap`) — a `jest.fn()`-backed
 *     stub for the `steam` runner's `getGame(...).stop`/`getGame(...).getGameInfo`
 *     and `getInstallInfo`, mirroring `settingsFlows.test.ts:100-106`'s shape.
 *     `cancelCurrentDownload`/`stopCurrentDownload` (`downloadqueue.ts`) reach
 *     these directly; a real `SteamGame`/`SteamLibraryManager` construction
 *     would otherwise pull in the real depot/PICS/filesystem machinery this
 *     suite must not exercise.
 *   - `storeManagers/steam/games`'s `getSteamInstallSize` — `addToQueue()`'s
 *     Steam-size-fetch branch hits the real Steam store appdetails API; not
 *     exercised by this plan's channels directly, but mocked defensively per
 *     32-PATTERNS.md L206 (the module is imported into `downloadqueue.ts`'s
 *     graph regardless). The module's default `SteamGame` export is preserved
 *     via `jest.requireActual` so `installFlowRegistration.ts` (also imported
 *     transitively via `handlers.ts`) still constructs a real class.
 *   - `downloadmanager/utils`'s `installQueueElement`/`updateQueueElement` —
 *     mirrors `downloadqueue.test.ts`'s OWN precedent mock (this plan's
 *     read_first companion suite) for the identical reason: these functions
 *     dispatch into a runner's REAL `.install()`/`.update()` (depot download,
 *     filesystem, network) once `isOnline()` allows it. This suite exists to
 *     prove the CHANNEL WIRING (`resumeCurrentDownload` reaches `initQueue()`
 *     reaches `installQueueElement()` with the correct queue-head args), not
 *     the download pipeline underneath it — the exact same boundary the
 *     Phase 30/31 `installFlowRegistration.ts`/`settingsFlowRegistration.ts`
 *     suites draw one layer further in. Controlling this mock's resolution
 *     timing is also what makes the pause→resume SEQUENCE test below possible
 *     (RESEARCH.md Open Question 2): a never-resolving mock return value
 *     simulates an in-flight download so `currentElement` stays pointed at
 *     the queue head across a `pauseCurrentDownload` call, without needing a
 *     real, timing-sensitive async depot transfer.
 *
 * Every other module in the registration/transport/store path
 * (`downloadQueueFlowRegistration.ts`, `handlers.ts`, `sidecarRpc.ts`,
 * `bootstrap.ts`, `electronStub.ts`, `fileStore.ts`, `downloadqueue.ts`,
 * `backend/ipc.ts`, `backend/utils/aborthandler/aborthandler.ts`,
 * `backend/dialog/dialog.ts`, `backend/online_monitor.ts`) runs for real,
 * unmodified — in particular `backend/logger` is intentionally NOT mocked
 * (mirrors `installFlows.test.ts`/`settingsFlows.test.ts`; `bootstrap.ts`'s
 * own `initHeadless()` sets up real, tmp-dir-redirected file logging safely).
 *
 * The D-05 boot-omission and REQ-32-08 no-electron-import checks are
 * by-construction SOURCE GATES (mirrors `electronUntouched.test.ts`'s own
 * final two tests), not runtime mock-call assertions: the project's shared
 * Jest config sets `resetMocks: true` (`src/backend/jest.config.js`), which
 * wipes every mock's call history before EVERY test — including a call made
 * once, at this file's static top-level `import { init } from '../bootstrap'`
 * (which is what triggers `registerDownloadQueueFlows()`, and with it any D-05
 * boot-time log line). That call's history is gone before the first `it()`
 * body ever runs, so a runtime `expect(mockedLogInfo).toHaveBeenCalledWith(...)`
 * assertion for a boot-time-only log line is fundamentally unreliable under
 * this config — a source-gate proves the same invariant by construction
 * instead.
 */

import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { stripSourceComments as stripComments } from 'backend/testUtils/stripSourceComments'

// ── os — GAP FIX precedent: redirect homedir() to a disposable per-process
// tmp directory so this suite can never touch a developer's real config
// directory ──────────────────────────────────────────────────────────────
jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(
        actual.tmpdir(),
        `gamelib-downloadqueueflows-test-home-${process.pid}`
      )
  }
})

// ── electron / electron-store — route Jest's own module resolution at the
// REAL sidecar shims (see module docstring above) ───────────────────────────
jest.mock('electron', () => jest.requireActual('../electronStub'))
jest.mock('electron-store', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── axios — fix/steam-native-install-stability (33-05 live-gate gap): `init()` now wires
// the REAL `initOnlineMonitor()` (backend/online_monitor.ts), which -- now that the real
// electronStub's `net.isOnline()` returns `true` (mocked above) -- immediately calls the real
// `pingSites()`, a live `axios.head()` against github/epic/gog/cloudflare. Mocked so this suite
// (which drives the real, unmocked RPC/handler graph) never makes a real network call.
jest.mock('axios', () => {
  const mockInstance = {
    get: jest.fn(() => Promise.resolve({ data: {} })),
    head: jest.fn(() => Promise.resolve({ status: 200 }))
  }
  return {
    __esModule: true,
    default: {
      head: jest.fn(() => Promise.resolve({ status: 200 })),
      create: jest.fn(() => mockInstance)
    }
  }
})

// ── backend/constants/environment mock — pins a deterministic branch
// regardless of the host OS running this test (mirrors installFlows.test.ts /
// settingsFlows.test.ts) ─────────────────────────────────────────────────────
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true
}))

// ── backend/storeManagers mock — the boundary cancelCurrentDownload/
// stopCurrentDownload/processNotification/addToQueue touch; a plain
// jest.fn()-backed stub proves the routing without any real
// SteamGame/depot/PICS involvement. `getGameInfo` (Plan 32-02 addition) is
// the enqueue-time call `addToQueue()` itself makes (distinct from
// `.getGame(appName).getGameInfo()`, which is a different call site) ────────
jest.mock('backend/storeManagers', () => ({
  libraryManagerMap: {
    steam: {
      getGame: jest.fn(),
      getInstallInfo: jest.fn(),
      getGameInfo: jest.fn()
    }
  }
}))

// ── storeManagers/steam/games mock — override ONLY getSteamInstallSize (the
// real Steam store appdetails network call), preserve the real default
// `SteamGame` export for installFlowRegistration.ts's own transitively-loaded
// import (32-PATTERNS.md L206) ───────────────────────────────────────────────
jest.mock('../../storeManagers/steam/games', () => ({
  __esModule: true,
  ...jest.requireActual('../../storeManagers/steam/games'),
  getSteamInstallSize: jest.fn()
}))

// ── downloadmanager/utils mock — installQueueElement/updateQueueElement's
// REAL bodies dispatch into a runner's real .install()/.update(); mirrors
// downloadqueue.test.ts's own precedent boundary (this plan's read_first
// companion suite) ───────────────────────────────────────────────────────────
jest.mock('../../downloadmanager/utils', () => ({
  installQueueElement: jest.fn(),
  updateQueueElement: jest.fn()
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { startSidecar, writeInvoke, writeSend } from './helpers/sidecarHarness'
import { libraryManagerMap } from 'backend/storeManagers'
import {
  installQueueElement,
  updateQueueElement
} from '../../downloadmanager/utils'
import { downloadManager } from '../../downloadmanager/electronStores'
import { sendFrontendMessage } from '../../ipc'
import type { DMQueueElement } from 'common/types'

const mockedSteamGetGame = libraryManagerMap.steam.getGame as jest.Mock
const mockedSteamGetGameInfo = libraryManagerMap.steam.getGameInfo as jest.Mock
const mockedInstallQueueElement = installQueueElement as jest.Mock
const mockedUpdateQueueElement = updateQueueElement as jest.Mock

/** Waits a couple of microtask/macrotask turns for async invoke handlers to resolve. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

// Comment-stripping now delegates to the shared
// `backend/testUtils/stripSourceComments` util (strips block comments first,
// then the line-prefix filter), imported above as `stripComments`.

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

describe('sidecar download-queue flows (Phase 32 Plan 01 — REQ-32-02/03/04/05/08)', () => {
  beforeEach(() => {
    // Real, disk-backed store (32-PATTERNS.md's own note) — reset to an empty
    // queue/finished for every test so no test leaks state into the next.
    downloadManager.set('queue', [])
    downloadManager.set('finished', [])
    mockedSteamGetGame.mockReset().mockReturnValue({
      stop: jest.fn(),
      getGameInfo: jest.fn(() => ({
        title: 'Test Game',
        folder_name: undefined
      }))
    })
    // addToQueue()'s own enqueue-time call — distinct from
    // `.getGame(appName).getGameInfo()` above. Defaults to a plain (non-EA,
    // non-Ubisoft) game so addToQueue() takes its steam-size-fetch branch.
    mockedSteamGetGameInfo.mockReset().mockReturnValue({
      title: 'Test Game',
      isEAManaged: false,
      isUbisoftManaged: false
    })
    mockedInstallQueueElement.mockReset().mockResolvedValue({ status: 'done' })
    mockedUpdateQueueElement.mockReset().mockResolvedValue({ status: 'done' })
  })

  // Must-have (REQ-32-04): getDMQueueInformation is invoke-kind — a response
  // frame carries the real getQueueInformation() shape, not the unported marker.
  it('getDMQueueInformation (invoke) resolves the real elements/finished/state shape', async () => {
    downloadManager.set('queue', [makeQueueElement('999001')])
    downloadManager.set('finished', [])

    const { input, frames } = startSidecar()
    writeInvoke(input, 'queue-info-1', 'getDMQueueInformation', [])
    await flush()

    const response = frames.find((f) => f.id === 'queue-info-1') as
      | {
          ok: boolean
          result?: {
            elements?: unknown[]
            finished?: unknown[]
            state?: string
          }
          error?: string
        }
      | undefined
    expect(response?.ok).toBe(true)
    expect(response?.error).toBeUndefined()
    expect(response?.result?.elements).toHaveLength(1)
    expect(response?.result?.state).toBe('idle')
  })

  // Must-have (REQ-32-04/REQ-32-05): removeFromDMQueue is send-kind — no
  // response frame, but the real removeFromQueue(appName) runs (the item
  // leaves the REAL persisted queue) and changedDMQueueInformation is pushed
  // through the generic relay (REQ-32-07's undeclared fifth channel).
  it('removeFromDMQueue (send) reaches the real removeFromQueue(appName) — item removed, changedDMQueueInformation pushed, no response frame', async () => {
    downloadManager.set('queue', [makeQueueElement('999002')])

    const { input, frames } = startSidecar()
    writeSend(input, 'remove-1', 'removeFromDMQueue', ['999002'])
    await flush()

    expect(downloadManager.get('queue', [])).toHaveLength(0)
    const pushed = frames.find(
      (f) =>
        f.kind === 'frontendMessage' &&
        f.channel === 'changedDMQueueInformation'
    )
    expect(pushed).toBeDefined()
    expect(frames.find((f) => f.id === 'remove-1')).toBeUndefined()
  })

  // Must-have (REQ-32-04): pauseCurrentDownload is send-kind — no response
  // frame, but the real pauseCurrentDownload() runs: queueState flips to
  // 'paused' and changedDMQueueInformation carries it through the relay.
  it('pauseCurrentDownload (send) reaches the real pauseCurrentDownload() — queueState flips to paused, no response frame', async () => {
    const { input, frames } = startSidecar()
    writeSend(input, 'pause-1', 'pauseCurrentDownload', [])
    await flush()

    const pushed = frames.find(
      (f) =>
        f.kind === 'frontendMessage' &&
        f.channel === 'changedDMQueueInformation'
    ) as { args?: unknown[] } | undefined
    expect(pushed).toBeDefined()
    expect((pushed?.args as unknown[])?.[1]).toBe('paused')
    expect(frames.find((f) => f.id === 'pause-1')).toBeUndefined()
  })

  // Must-have (REQ-32-04, RESEARCH.md Open Question 2): the pause→resume
  // SEQUENCE. A same-session resumeCurrentDownload -> pauseCurrentDownload ->
  // resumeCurrentDownload -> cancelDownload flow, all via the PLAIN
  // pause/resume button channels (never initQueue(true)), proves resume
  // re-targets the CORRECT currentElement — not a stale or null reference —
  // on the second resume, and that cancelDownload's currentElement-gated body
  // (only reachable once a real currentElement is set) actually runs.
  it('resumeCurrentDownload -> pauseCurrentDownload -> resumeCurrentDownload -> cancelDownload: resume re-targets the correct currentElement, not stale/null', async () => {
    downloadManager.set('queue', [makeQueueElement('999003')])
    // Never resolves during this test — simulates an in-flight download so
    // currentElement stays pointed at the queue head across the pause,
    // mirroring downloadqueue.test.ts:317's own timing-control precedent.
    mockedInstallQueueElement.mockReturnValue(new Promise<never>(() => {}))

    const { input } = startSidecar()

    writeSend(input, 'resume-1', 'resumeCurrentDownload', [])
    await flush()
    expect(mockedInstallQueueElement).toHaveBeenCalledTimes(1)
    expect(mockedInstallQueueElement).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ appName: '999003' })
    )

    writeSend(input, 'pause-2', 'pauseCurrentDownload', [])
    await flush()

    // pauseCurrentDownload's currentElement-gated stopCurrentDownload() branch
    // actually ran — the mocked steam getGame(...).stop(false) was called,
    // proving currentElement was truthy (not null) at pause time.
    const gameHandleAtPause = mockedSteamGetGame.mock.results.at(-1)?.value as {
      stop: jest.Mock
    }
    expect(gameHandleAtPause.stop).toHaveBeenCalledWith(false)

    // Resume AGAIN — the first initQueue() call is still suspended inside its
    // never-resolving installQueueElement() await, so the persisted queue was
    // never popped. This second resume's getFirstQueueElement()/currentElement
    // must still correctly re-target '999003' — not stale, not null.
    writeSend(input, 'resume-2', 'resumeCurrentDownload', [])
    await flush()
    expect(mockedInstallQueueElement).toHaveBeenCalledTimes(2)
    expect(mockedInstallQueueElement).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ appName: '999003' })
    )

    // cancelDownload's currentElement-gated body (removeFromQueue) now runs
    // against the correct, non-stale currentElement set by the second resume.
    writeSend(input, 'cancel-1', 'cancelDownload', [false])
    await flush()
    expect(downloadManager.get('queue', [])).toHaveLength(0)
  })

  // Must-have (REQ-32-03): progressUpdate relay-reach — a simulated depot
  // emitProgress push (the exact payload shape depot.ts:1698-1719 emits)
  // reaches the frontend_message relay unchanged, with zero sidecar
  // throttle/coalesce logic added on top of depot.ts's own 500ms/1%/1000ms
  // throttle.
  it('progressUpdate relay-reach: a simulated depot emitProgress push reaches frontend_message with the exact depot.ts payload shape', async () => {
    const { input, frames } = startSidecar()
    void input // no RPC frame needed — this proves the PUSH path, not a channel handler

    sendFrontendMessage('progressUpdate', {
      appName: '999004',
      runner: 'steam',
      status: 'installing',
      progress: {
        percent: 42,
        bytes: '1 GB',
        downSpeed: 5,
        diskSpeed: 5,
        eta: '00:01:00'
      }
    })
    await flush()

    const pushed = frames.find(
      (f) => f.kind === 'frontendMessage' && f.channel === 'progressUpdate'
    ) as { args?: unknown[] } | undefined
    expect(pushed).toBeDefined()
    expect(pushed?.args?.[0]).toMatchObject({
      appName: '999004',
      runner: 'steam',
      status: 'installing',
      progress: expect.objectContaining({ percent: 42 })
    })
  })

  // Must-have (REQ-32-07, the undeclared "fifth" channel — Pitfall 4):
  // changedDMQueueInformation reaches the SAME generic relay, driven by a
  // REAL downloadqueue.ts call site (removeFromQueue), not a synthetic push.
  it('changedDMQueueInformation relay-reach: a real downloadqueue.ts push (removeFromQueue) reaches frontend_message', async () => {
    downloadManager.set('queue', [makeQueueElement('999005')])

    const { input, frames } = startSidecar()
    writeSend(input, 'remove-2', 'removeFromDMQueue', ['999005'])
    await flush()

    const pushed = frames.filter(
      (f) =>
        f.kind === 'frontendMessage' &&
        f.channel === 'changedDMQueueInformation'
    )
    expect(pushed.length).toBeGreaterThan(0)
  })

  // Must-have (REQ-32-01, Plan 32-02): install re-routes onto the real
  // addToQueue() (Electron parity, D-01) instead of the Phase 30 D-05a direct
  // SteamGame.install() bypass. Proof of the real enqueue path (not the
  // bypass) is that `installQueueElement` (downloadmanager/utils) — a
  // function the bypass NEVER called — was reached, with the invoke's own
  // args flowing through as DMQueueElement.params. The invoke itself resolves
  // `undefined` (Promise<void>, Pitfall 3), not a reconstructed `{status}`
  // shape.
  it('install (invoke) enqueues via the real addToQueue() — resolves undefined and reaches installQueueElement (not the retired SteamGame bypass)', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'install-enqueue-1', 'install', [
      {
        appName: '999010',
        runner: 'steam',
        path: '/fake/steam/library',
        platformToInstall: 'Windows',
        installDlcs: [],
        sdlList: [],
        gameInfo: { app_name: '999010', runner: 'steam', title: 'Test Game' }
      }
    ])
    await flush()

    const response = frames.find((f) => f.id === 'install-enqueue-1') as
      | { ok: boolean; result?: unknown; error?: string }
      | undefined
    expect(response?.ok).toBe(true)
    expect(response?.error).toBeUndefined()
    // Promise<void> — resolves once QUEUED, not a synthetic {status} shape.
    expect(response?.result).toBeUndefined()

    // The enqueue side effect: installQueueElement is the function
    // initQueue() calls for a queue-head 'install' element — this is ONLY
    // reachable via addToQueue()->initQueue(), never via the retired direct
    // SteamGame.install() bypass.
    expect(mockedInstallQueueElement).toHaveBeenCalledTimes(1)
    expect(mockedInstallQueueElement).toHaveBeenCalledWith(
      expect.objectContaining({ appName: '999010', runner: 'steam' })
    )

    // single-push regression (RESEARCH.md Open Question 1): no leftover
    // manual push duplicates the 'queued' status addToQueue() itself sends.
    const queuedPushes = frames.filter(
      (f) =>
        f.kind === 'frontendMessage' &&
        f.channel === 'gameStatusUpdate' &&
        ((f.args as unknown[])?.[0] as { status?: string })?.status === 'queued'
    )
    expect(queuedPushes).toHaveLength(1)
  })

  // Must-have (REQ-32-01, Plan 32-02): updateGame re-routes onto the real
  // addToQueue() identically, deriving params.path/platformToInstall from
  // gameInfo.install (ipc_handler.ts's own shape) — proof is reaching
  // updateQueueElement (downloadmanager/utils), never the bypass's direct
  // SteamGame.update() call.
  it('updateGame (invoke) enqueues via the real addToQueue() — resolves undefined and reaches updateQueueElement with path/platformToInstall derived from gameInfo.install', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'update-enqueue-1', 'updateGame', [
      {
        appName: '999011',
        runner: 'steam',
        gameInfo: {
          app_name: '999011',
          runner: 'steam',
          title: 'Test Game',
          install: { platform: 'Windows', install_path: '/fake/steam/library' }
        }
      }
    ])
    await flush()

    const response = frames.find((f) => f.id === 'update-enqueue-1') as
      | { ok: boolean; result?: unknown; error?: string }
      | undefined
    expect(response?.ok).toBe(true)
    expect(response?.error).toBeUndefined()
    expect(response?.result).toBeUndefined()

    expect(mockedUpdateQueueElement).toHaveBeenCalledTimes(1)
    expect(mockedUpdateQueueElement).toHaveBeenCalledWith(
      expect.objectContaining({
        appName: '999011',
        runner: 'steam',
        path: '/fake/steam/library',
        platformToInstall: 'Windows'
      })
    )
  })

  // D-05: by-construction source gate. The runtime mock-call approach is
  // unreliable here (module docstring above explains why: resetMocks:true
  // wipes a boot-time-only call's history before the first test body runs) —
  // read the NEW registration module's own source instead, comments stripped.
  it('D-05 source gate: downloadQueueFlowRegistration.ts never calls initQueue(true)/isStartup=true, and logs the deliberate boot-resume disablement', () => {
    const source = readFileSync(
      join(__dirname, '../downloadQueueFlowRegistration.ts'),
      'utf-8'
    )
    const stripped = stripComments(source)

    expect(stripped).not.toMatch(/initQueue\s*\(\s*true\s*\)/)
    expect(stripped).not.toMatch(/isStartup\s*[:=]\s*true/)
    expect(stripped).not.toMatch(/setTimeout\(\s*initQueue/)
    // The disablement itself must be logged, never silent (D-04/D-05 house style).
    expect(stripped).toMatch(/logInfo/)
    expect(source.toLowerCase()).toMatch(/auto-resume/)
  })

  // REQ-32-08 source gate: mirrors electronUntouched.test.ts's own
  // by-construction gate — no file under src/backend/sidecar/ (this plan's
  // new module included) imports the real 'electron' module.
  it('REQ-32-08 source gate: no file under src/backend/sidecar/ imports the real electron module', () => {
    const sidecarDir = join(__dirname, '..')
    const files = readdirSync(sidecarDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name)

    expect(files.length).toBeGreaterThan(0)

    for (const file of files) {
      const stripped = stripComments(
        readFileSync(join(sidecarDir, file), 'utf-8')
      )
      expect(stripped).not.toMatch(/from\s+['"]electron['"]/)
    }
  })
})

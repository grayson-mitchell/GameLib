/**
 * End-to-end wiring test for the sidecar's curated game-details/settings
 * channels (Phase 34.2 Plan 04 — REQ-34.2-01/REQ-34.2-08/REQ-34.2-09/
 * REQ-34.2-10/REQ-34.2-14).
 *
 * Drives the REAL sidecar RPC server in-process (`appShellFlows.test.ts`'s /
 * `downloadQueueFlows.test.ts`'s own real-shim black-box pattern — the shims
 * under test are the actual electronStub.ts/fileStore.ts modules, unmocked)
 * against injected `stream.PassThrough` pairs.
 *
 * **This suite does NOT mock `i18next`.** `repair`'s notification body is
 * exactly what plan 34.2-01's D-02 bootstrap fix exists to make return a
 * real translated string under the sidecar; mocking i18next here would
 * reproduce the exact 34.1 CR-01 blind spot this slice's own objective names
 * (a suite that would pass whether or not the fix existed). This suite goes
 * through the real `init()`, so the D-02 i18next init runs for real.
 *
 * **GAP FIX precedent (2026-07-22, see skeletonFlows.test.ts's own header):**
 * this suite's config directory is NOT the real OS config directory. The
 * `jest.mock('os', ...)` below overrides `homedir()` to a disposable
 * per-process tmp directory so the real electronStub/fileStore CODE runs
 * (preserving this suite's fidelity), while the location it reads/writes can
 * never be the developer's real config directory.
 *
 * **CR-03 (34.2-10):** the `jest.mock('os', ...)` `homedir()` override alone
 * is insufficient — `pathShim.ts`'s real `resolveAppDataDir()` prefers
 * `env.APPDATA` (win32) / `env.XDG_CONFIG_HOME` (default/Linux) over
 * `homedir()`, so on those platforms `constants/paths.ts`'s module-scope
 * `appFolder`/`userDataPath`/`fixesPath` resolve to the REAL user config
 * directory instead — where this suite's two `beforeEach` blocks then
 * `gameOverridesStore.set('overrides', {})`, wiping a real user's title/art
 * customizations. `jest.mock('os', ...)` is KEPT below as defence-in-depth;
 * the actual redirect mocks `pathShim` itself — the single choke point
 * `electronStub.ts`'s `app.getPath()` calls through — with no platform
 * branch and no environment variable participating, and a `beforeAll`
 * containment guard (`resolve`+`relative`, never `startsWith`/`join` — see
 * Phase 18's recorded "join is not containment" lesson) asserts
 * `appFolder`/`userDataPath`/`fixesPath` all resolve inside `os.tmpdir()`
 * before the first destructive write can run.
 *
 * `jest.mock('electron', ...)` / `jest.mock('electron-store', ...)` below
 * point Jest's OWN module resolution at electronStub.ts/fileStore.ts
 * directly — see skeletonFlows.test.ts's header for why this is necessary.
 * Because `electron-store` resolves to the REAL `fileStore.ts` (not a mock
 * class), `game_overrides/electronStores.ts`'s `gameOverridesStore` is a
 * REAL, disk-backed `TypeCheckedStoreBackend` for this suite — the
 * `getGameMetadataOverride`/`getAllGameOverrides` tests below write through
 * it directly, proving the Phase 29 store registration
 * (`storeRegistration.ts:99`) is genuinely sufficient with zero new
 * plumbing, rather than asserting against a mock.
 *
 * Mocked only at the boundaries this plan's own module docstring names:
 *   - `backend/storeManagers` (`libraryManagerMap`) — six scriptable
 *     managers (one per `Runner`), mirroring `downloadQueueFlows.test.ts`'s
 *     own boundary role. This is the boundary `gamedetails/dispatch.ts`'s 13
 *     bodies call into; a real `SteamLibraryManager`/`LegendaryLibraryManager`
 *     construction would otherwise pull in real depot/PICS/filesystem
 *     machinery this suite must not exercise.
 *   - `backend/dialog/dialog`'s `notify` — a narrow `jest.fn()` boundary
 *     (real module spread, only `notify` overridden) so `repair`'s
 *     notification call can be asserted directly without a real Rust
 *     `notification_show` invoke round-trip.
 *   - `backend/utils`'s `sendGameStatusUpdate` — same narrow-override shape,
 *     so `repair`'s status-update pushes can be asserted directly without
 *     pulling every OTHER `backend/utils` export (`handleExit`,
 *     `openUrlOrFile`, `writeConfig`, …) away from their real bodies, which
 *     `appShellFlowRegistration.ts`/`settingsFlowRegistration.ts` (also
 *     loaded via the real `handlers.ts` this suite drives) still depend on.
 *   - `backend/online_monitor` (full surface, per `bootstrap.test.ts`'s own
 *     reasoning) — `repair`'s `isOnline()` gate needs a deterministic `true`
 *     regardless of the host's real network state; `initOnlineMonitor`/
 *     `runOnceWhenOnline`/`onConnectivityChange` stubbed alongside it so
 *     `bootstrap.ts`'s own call into this module never touches the real
 *     `electron` `net` surface.
 *   - `backend/game_overrides` is intentionally NOT mocked — see the
 *     `getGameMetadataOverride`/`getAllGameOverrides` note above; this is
 *     the one already-clean pass-through pair this plan's own module
 *     docstring calls out as never having been extracted, and the REAL
 *     store is the only way to prove it.
 *   - `backend/storeManagers/legendary/user`'s `LegendaryUser` — a narrow
 *     `{ getUserInfo: jest.fn() }` stub; `readConfig('user')`'s real call
 *     target.
 *   - `backend/utils/aborthandler/aborthandler`'s `callAbortController` —
 *     real module spread, only this export overridden, so `kill`'s
 *     call-before-`.stop()` ordering can be observed directly (mirrors
 *     `appShellFlows.test.ts`'s own boundary choice for the same module).
 *
 * Every other module in the registration/transport/store path
 * (`gameDetailsFlowRegistration.ts`, `handlers.ts`, `bootstrap.ts`,
 * `electronStub.ts`, `fileStore.ts`, `backend/logger`, every OTHER curated
 * registration module `handlers.ts` also wires up) runs for real, unmodified.
 */

// ── i18next -- DEFEAT Jest's project-wide automatic manual mock. This is the
// load-bearing line of this whole suite: `src/backend/__mocks__/i18next.ts`
// sits adjacent to this jest project's `roots` (`src/backend`), so Jest
// substitutes it for the REAL npm `i18next` package in EVERY backend test
// file automatically -- with NO `jest.mock('i18next', ...)` call required
// anywhere (discovered by 34.2-01's `bootstrapWirings.test.ts`, re-confirmed
// live here: without this line the `repair` notify-body test below still
// PASSES on a body of the literal string `'notify.finished.reparing'` --
// the automock's `t(key) => key` echo -- proving nothing about whether
// 34.2-01's real i18next.init() ever ran). `jest.unmock` -- not
// `jest.mock` -- restores default (real) module resolution; it does not
// substitute a replacement, and it is NOT the `jest.mock('i18next', ...)`
// block this suite's own module docstring says not to copy from
// `appShellFlows.test.ts` (that WOULD be a second, different automock). ────
jest.unmock('i18next')

import { PassThrough } from 'node:stream'

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
        `gamelib-gamedetailsflows-test-home-${process.pid}`
      )
  }
})

// ── pathShim — CR-03: the REAL choke point. `constants/paths.ts`'s
// module-scope `app.getPath('appData'|'userData')` calls resolve through
// `electronStub.ts` -> `pathShim.getPath()`, whose real `resolveAppDataDir()`
// prefers `env.APPDATA`/`env.XDG_CONFIG_HOME` over `homedir()` — bypassing
// the `jest.mock('os', ...)` redirect above on win32/default. This factory
// reimplements all four names the real shim supports, rooted at a single
// per-suite tmp directory, with NO platform branch and NO env var reference —
// see the module docstring above ───────────────────────────────────────────
jest.mock('../pathShim', () => {
  const actualOs = jest.requireActual('os')
  const actualPath = jest.requireActual('path')
  const tmpRoot = actualPath.join(
    actualOs.tmpdir(),
    `gamelib-gamedetailsflows-test-home-${process.pid}`
  )
  return {
    getPath: (name: string) => {
      switch (name) {
        case 'appData':
          return tmpRoot
        case 'userData':
          return actualPath.join(tmpRoot, 'GameLib')
        case 'temp':
          return actualOs.tmpdir()
        case 'home':
          return tmpRoot
        default:
          throw new Error(
            `[pathShim mock] getPath('${name}') is not shimmed for this test`
          )
      }
    }
  }
})

// ── backend/logger/paths — WR-01 (34.2 gap cycle 2, plan 34.2-18): the log
// path is computed INDEPENDENTLY of pathShim -- `getBaseLogPath()`
// (`backend/logger/paths.ts`) reads `process.env.LOCALAPPDATA`/
// `XDG_STATE_HOME` plus `homedir()` directly, so it bypasses BOTH the `os`
// mock and the `pathShim` mock above. This factory reimplements
// `getLogFilePath`'s relative-path derivation, rooted at the SAME per-suite
// tmp root, so distinct arguments still yield distinct paths. Does NOT call
// `jest.requireActual('backend/logger')` -- `backend/logger/index.ts` and
// `log_writer.ts` import each other circularly, and re-entering that cycle
// from inside a mock factory throws inside `LogWriter`'s constructor (see
// `sidecarRejectionGuard.test.ts`'s own note on this) -- not a concern here
// since this suite never imports `backend/logger` at all. ───────────────────
jest.mock('backend/logger/paths', () => {
  const actualPath = jest.requireActual('path')
  const actualOs = jest.requireActual('os')
  const tmpRoot = actualPath.join(
    actualOs.tmpdir(),
    `gamelib-gamedetailsflows-test-home-${process.pid}`
  )
  const logBaseDir = actualPath.join(tmpRoot, 'logs')
  return {
    getLogFilePath: (
      args: { appName?: string; runner?: string; type?: string } = {}
    ): string => {
      let relativeFilePath: string
      if (!(args?.appName || args?.runner)) {
        relativeFilePath = 'gamelib'
      } else if (args.runner && !args.appName) {
        relativeFilePath = actualPath.join('runners', args.runner)
      } else {
        const { appName, runner, type = 'launch' } = args
        relativeFilePath = actualPath.join(
          'games',
          `${appName}_${runner}`,
          type
        )
      }
      return actualPath.join(logBaseDir, relativeFilePath + '.log')
    }
  }
})

// ── electron / electron-store — route Jest's own module resolution at the
// REAL sidecar shims (see module docstring above) ───────────────────────────
jest.mock('electron', () => jest.requireActual('../electronStub'))
jest.mock('electron-store', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── axios — fix/steam-native-install-stability (33-05 live-gate gap): `init()`
// wires the REAL `initOnlineMonitor()`/`fetchLastestReleases()` call paths,
// which reach `axiosClient` (backend/utils.ts, `axios.create()` at module
// scope). Mocked so this suite (real, unmocked RPC/handler graph) never makes
// a real network call. ───────────────────────────────────────────────────────
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
// regardless of the host OS running this test (mirrors appShellFlows.test.ts /
// downloadQueueFlows.test.ts) ────────────────────────────────────────────────
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true,
  isIntelMac: false,
  isSteamDeckGameMode: false,
  isFlatpak: false
}))

// ── backend/config mock — avoid a real on-disk config.json write while still
// exercising bootstrap.ts's real i18next init (settings.language) ───────────
jest.mock('backend/config', () => ({
  GlobalConfig: {
    get: jest.fn()
  }
}))

// ── backend/online_monitor mock (full surface, per bootstrap.test.ts's own
// reasoning) — deterministic isOnline()=true for repair's gate, and no real
// `electron` `net` surface touched by bootstrap.ts's initOnlineMonitor() call ─
jest.mock('../../online_monitor', () => ({
  initOnlineMonitor: jest.fn(),
  isOnline: jest.fn(() => true),
  runOnceWhenOnline: jest.fn((callback: () => unknown) => callback()),
  onConnectivityChange: jest.fn()
}))

// ── backend/storeManagers mock — the boundary all 13 gamedetails/dispatch.ts
// bodies call into. Six scriptable managers (one per Runner), mirroring
// downloadQueueFlows.test.ts's own boundary role. `addNewApp` (Plan 05,
// REQ-34.2-09) is the sideload-only entry the new send-kind channel below
// dispatches to ─────────────────────────────────────────────────────────────
jest.mock('backend/storeManagers', () => {
  const makeManager = () => ({
    getGame: jest.fn(),
    hasGame: jest.fn(() => true),
    changeGameInstallPath: jest.fn(),
    getLaunchOptions: jest.fn(),
    changeVersionPinnedStatus: jest.fn(),
    getGameOverride: jest.fn(),
    getGameSdl: jest.fn(),
    refresh: jest.fn(),
    getListOfGames: jest.fn(),
    getCyberpunkMods: jest.fn(),
    setCyberpunkModConfig: jest.fn(),
    addNewApp: jest.fn(),
    // F-34.5-G6-10 (34.5-43): getInstallInfo -- late-discovered channel.
    getInstallInfo: jest.fn()
  })
  return {
    libraryManagerMap: {
      legendary: makeManager(),
      gog: makeManager(),
      steam: makeManager(),
      nile: makeManager(),
      zoom: makeManager(),
      sideload: makeManager()
    }
  }
})

// ── backend/dialog/dialog mock — narrow override, real module spread, so
// `repair`'s notify() call can be asserted directly without a real Rust
// notification_show round-trip ───────────────────────────────────────────────
jest.mock('../../dialog/dialog', () => ({
  ...jest.requireActual('../../dialog/dialog'),
  notify: jest.fn()
}))

// ── backend/utils mock — narrow override (sendGameStatusUpdate only), real
// module spread so every OTHER export (handleExit/openUrlOrFile/writeConfig/
// axiosClient/...) stays real for the sibling registration modules
// handlers.ts also wires up ───────────────────────────────────────────────────
jest.mock('../../utils', () => ({
  ...jest.requireActual('../../utils'),
  sendGameStatusUpdate: jest.fn()
}))

// ── backend/storeManagers/legendary/user mock — readConfig('user')'s real
// call target ──────────────────────────────────────────────────────────────
jest.mock('../../storeManagers/legendary/user', () => ({
  LegendaryUser: {
    getUserInfo: jest.fn()
  }
}))

// ── abort handler mock — narrow override (callAbortController only), real
// module spread, mirrors appShellFlows.test.ts's own boundary choice ────────
jest.mock('../../utils/aborthandler/aborthandler', () => ({
  ...jest.requireActual('../../utils/aborthandler/aborthandler'),
  callAbortController: jest.fn()
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { init } from '../bootstrap'
import { GlobalConfig } from 'backend/config'
import { libraryManagerMap } from 'backend/storeManagers'
import { isOnline } from '../../online_monitor'
import { notify } from '../../dialog/dialog'
import { sendGameStatusUpdate } from '../../utils'
import { LegendaryUser } from '../../storeManagers/legendary/user'
import { callAbortController } from '../../utils/aborthandler/aborthandler'
import { handlerRegistry, listenerRegistry } from '../electronStub'
// Namespace import (not a named import) so `jest.spyOn(sidecarRpc,
// 'pushFrontendMessage')` (Test 7, crash containment) can override the
// SAME shared module.exports property `gameDetailsFlowRegistration.ts`'s own
// compiled `sidecarRpc_1.pushFrontendMessage(...)` call site reads at call
// time — real, unmocked `sidecarRpc.ts`, per this suite's own module
// docstring (every module in the transport/registration path runs for real).
import * as sidecarRpc from '../sidecarRpc'
import { gameOverridesStore } from '../../game_overrides/electronStores'
import { UNPORTED_CHANNEL_MARKER } from 'common/types/sidecarTransport'
import { relative, resolve, isAbsolute, join } from 'path'
import { readFileSync } from 'fs'
import { tmpdir } from 'os'
import { fixesPath, appFolder, userDataPath } from '../../constants/paths'
import { getLogFilePath } from 'backend/logger/paths'

// ── CR-03 / WR-01 containment guard — MUST run before either describe
// block's first beforeEach (both end in a destructive
// gameOverridesStore.set('overrides', {})). Jest runs a top-level beforeAll
// before any nested describe's beforeEach. Uses resolve+relative, never
// startsWith/join (Phase 18: "join is not containment"; a bare prefix check
// would also pass for a sibling directory sharing the tmp prefix). Throws
// loudly rather than relying on an afterAll as a safety net — see this
// repo's tests-clobbering-real-steam-store lesson (commit 92c29a5e): an
// afterAll restore is not a safety net under jest worker force-exit. Asserts
// fixesPath too (this suite doesn't touch it today) so the two suites'
// guards stay textually identical and any future test in this file that
// starts using fixesPath inherits the tripwire. Now also covers
// getLogFilePath({}) (WR-01, 34.2 gap cycle 2 plan 34.2-18) — the log path
// is env-driven and bypasses BOTH the os mock and the pathShim mock above,
// so it needed its own separate module mock rather than another entry in
// the same pathShim factory ─────────────────────────────────────────────
beforeAll(() => {
  const tmpRoot = resolve(tmpdir())
  const candidates = [appFolder, userDataPath, fixesPath, getLogFilePath({})]
  for (const candidate of candidates) {
    const rel = relative(tmpRoot, resolve(candidate))
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(
        `[gameDetailsFlows.test.ts] REFUSING TO RUN: "${candidate}" resolves ` +
          `outside os.tmpdir() (${tmpRoot}) — the pathShim mock redirect is ` +
          'not in effect, and this suite would overwrite a real user config ' +
          'directory.'
      )
    }
  }
})

const mockedGlobalConfigGet = GlobalConfig.get as jest.Mock
const mockedIsOnline = isOnline as jest.Mock
const mockedNotify = notify as jest.Mock
const mockedSendGameStatusUpdate = sendGameStatusUpdate as jest.Mock
const mockedGetUserInfo = LegendaryUser.getUserInfo as jest.Mock
const mockedCallAbortController = callAbortController as jest.Mock

const legendaryManager = libraryManagerMap.legendary as unknown as Record<
  string,
  jest.Mock
>
const gogManager = libraryManagerMap.gog as unknown as Record<string, jest.Mock>
const steamManager = libraryManagerMap.steam as unknown as Record<
  string,
  jest.Mock
>
const sideloadManager = libraryManagerMap.sideload as unknown as Record<
  string,
  jest.Mock
>

/** Points the mocked GlobalConfig.get() at a fresh settings object. */
function mockAppSettings(partial: Record<string, unknown>) {
  const setSetting = jest.fn()
  mockedGlobalConfigGet.mockReturnValue({
    getSettings: () => partial,
    setSetting,
    set: jest.fn(),
    flush: jest.fn()
  })
  return { setSetting }
}

/** A scriptable per-game handle, as `getGame(appName)` returns. */
function makeGameHandle(overrides: Record<string, jest.Mock> = {}) {
  return {
    getGameInfo: jest.fn(() => ({})),
    getExtraInfo: jest.fn(() => ({})),
    getSettings: jest.fn(() => Promise.resolve({})),
    stop: jest.fn(() => Promise.resolve()),
    repair: jest.fn(() => Promise.resolve()),
    isGameAvailable: jest.fn(() => Promise.resolve(true)),
    ...overrides
  }
}

type Frame = Record<string, unknown>

/** Buffers newline-delimited output from a PassThrough into parsed frames. */
function collectFrames(stream: PassThrough): Frame[] {
  const frames: Frame[] = []
  let buffer = ''
  stream.on('data', (chunk: Buffer | string) => {
    buffer += chunk.toString()
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)
      if (line.trim().length > 0) {
        try {
          frames.push(JSON.parse(line))
        } catch {
          // Non-JSON diagnostic line (e.g. READY_SENTINEL) — ignore.
        }
      }
      newlineIndex = buffer.indexOf('\n')
    }
  })
  return frames
}

/** Waits a couple of microtask/macrotask turns for async invoke handlers to resolve. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

/** Starts a fresh sidecar RPC loop bound to its own stream pair. */
function startSidecar(): { input: PassThrough; frames: Frame[] } {
  const input = new PassThrough()
  const output = new PassThrough()
  const frames = collectFrames(output)
  init(input, output)
  return { input, frames }
}

/** Writes a well-formed `invoke` request frame to the sidecar's stdin. */
function writeInvoke(
  input: PassThrough,
  id: string,
  channel: string,
  args: unknown[]
): void {
  input.write(`${JSON.stringify({ id, kind: 'invoke', channel, args })}\n`)
}

/**
 * Writes a well-formed `send` (fire-and-forget) request frame to the
 * sidecar's stdin (mirrors `appShellFlows.test.ts`'s own `writeSend` helper).
 * Unlike `writeInvoke`, no response frame is ever produced for this `id` —
 * see the send-kind describe block below for why that matters.
 */
function writeSend(
  input: PassThrough,
  id: string,
  channel: string,
  args: unknown[]
): void {
  input.write(`${JSON.stringify({ id, kind: 'send', channel, args })}\n`)
}

function findResponse(
  frames: Frame[],
  id: string
): { ok: boolean; result?: unknown; error?: string } | undefined {
  return frames.find((f) => f.id === id) as
    | { ok: boolean; result?: unknown; error?: string }
    | undefined
}

const ALL_15_CHANNELS: [string, unknown[]][] = [
  ['getGameInfo', ['app-1', 'legendary']],
  ['getExtraInfo', ['app-1', 'legendary']],
  ['getGameSettings', ['app-1', 'legendary']],
  ['isGameAvailable', [{ appName: 'app-1', runner: 'legendary' }]],
  ['getLaunchOptions', ['app-1', 'legendary']],
  ['kill', ['app-1', 'legendary']],
  ['repair', ['app-1', 'legendary']],
  [
    'changeInstallPath',
    [{ appName: 'app-1', path: '/x', runner: 'legendary' }]
  ],
  ['readConfig', ['user']],
  ['getGameOverride', []],
  ['getGameSdl', ['app-1']],
  ['getAvailableCyberpunkMods', []],
  ['setCyberpunkModConfig', [{ enabled: true, modsToLoad: [] }]],
  ['getGameMetadataOverride', ['app-1']],
  ['getAllGameOverrides', []]
]

describe('sidecar game-details/settings flows (Phase 34.2 Plan 04)', () => {
  beforeEach(() => {
    mockAppSettings({ language: 'en' })
    // GOTCHA (this project's shared jest.config.js sets `resetMocks: true`,
    // which runs BEFORE every test and strips even a jest.mock FACTORY's own
    // `jest.fn(() => true)` default implementation — not just call history).
    // Without re-arming this here, `isOnline()` returns `undefined` for
    // every test in this file, including the very first one, and `repair`'s
    // `if (!isOnline())` guard silently takes its early-return branch.
    mockedIsOnline.mockReset().mockReturnValue(true)
    mockedNotify.mockClear()
    mockedSendGameStatusUpdate.mockClear()
    mockedGetUserInfo.mockReset()
    mockedCallAbortController.mockReset()

    for (const manager of [
      legendaryManager,
      gogManager,
      steamManager,
      sideloadManager
    ]) {
      for (const key of Object.keys(manager)) {
        manager[key].mockReset()
      }
    }
    legendaryManager.hasGame.mockReturnValue(true)
    legendaryManager.getGame.mockReturnValue(makeGameHandle())
    gogManager.getGame.mockReturnValue(makeGameHandle())
    steamManager.getGame.mockReturnValue(makeGameHandle())

    gameOverridesStore.set('overrides', {})
  })

  // ── REQ-34.2-01: the 8 gamedetails/dispatch generic per-game channels ─────

  it('REQ-34.2-01 getGameInfo (invoke, legendary runner) resolves the real GameInfo from the mocked manager', async () => {
    const gameInfo = { app_name: 'app-1', title: 'Legendary Game' }
    legendaryManager.getGame.mockReturnValue(
      makeGameHandle({ getGameInfo: jest.fn(() => gameInfo) })
    )

    const { input, frames } = startSidecar()
    writeInvoke(input, 'gi-1', 'getGameInfo', ['app-1', 'legendary'])
    await flush()

    const response = findResponse(frames, 'gi-1')
    expect(response?.ok).toBe(true)
    expect(response?.result).toMatchObject(gameInfo)
    expect(legendaryManager.getGame).toHaveBeenCalledWith('app-1')
  })

  it('REQ-34.2-01/D-01 getGameInfo (invoke, steam runner) still dispatches — runner-generic port, case 1', async () => {
    const gameInfo = { app_name: 'app-2', title: 'Steam Game' }
    steamManager.getGame.mockReturnValue(
      makeGameHandle({ getGameInfo: jest.fn(() => gameInfo) })
    )

    const { input, frames } = startSidecar()
    writeInvoke(input, 'gi-2', 'getGameInfo', ['app-2', 'steam'])
    await flush()

    const response = findResponse(frames, 'gi-2')
    expect(response?.ok).toBe(true)
    expect(response?.result).toMatchObject(gameInfo)
    expect(steamManager.getGame).toHaveBeenCalledWith('app-2')
    // legendary's own hasGame fastpath guard must not be consulted for a
    // non-legendary runner.
    expect(legendaryManager.hasGame).not.toHaveBeenCalled()
  })

  it('REQ-34.2-01/D-01 getGameInfo (invoke, gog runner) still dispatches — runner-generic port, case 2', async () => {
    const gameInfo = { app_name: 'app-3', title: 'GOG Game' }
    gogManager.getGame.mockReturnValue(
      makeGameHandle({ getGameInfo: jest.fn(() => gameInfo) })
    )

    const { input, frames } = startSidecar()
    writeInvoke(input, 'gi-3', 'getGameInfo', ['app-3', 'gog'])
    await flush()

    const response = findResponse(frames, 'gi-3')
    expect(response?.ok).toBe(true)
    expect(response?.result).toMatchObject(gameInfo)
    expect(gogManager.getGame).toHaveBeenCalledWith('app-3')
  })

  it('REQ-34.2-01 getExtraInfo (invoke) resolves the real ExtraInfo from the mocked manager', async () => {
    const extraInfo = { about: { description: 'A game' } }
    legendaryManager.getGame.mockReturnValue(
      makeGameHandle({ getExtraInfo: jest.fn(() => extraInfo) })
    )

    const { input, frames } = startSidecar()
    writeInvoke(input, 'ei-1', 'getExtraInfo', ['app-1', 'legendary'])
    await flush()

    const response = findResponse(frames, 'ei-1')
    expect(response?.ok).toBe(true)
    expect(response?.result).toMatchObject(extraInfo)
    expect(legendaryManager.getGame).toHaveBeenCalledWith('app-1')
  })

  it('REQ-34.2-01 getGameSettings (invoke) resolves the real GameSettings from the mocked manager', async () => {
    const settings = { winePrefix: '/wine' }
    steamManager.getGame.mockReturnValue(
      makeGameHandle({ getSettings: jest.fn(() => Promise.resolve(settings)) })
    )

    const { input, frames } = startSidecar()
    writeInvoke(input, 'gs-1', 'getGameSettings', ['app-1', 'steam'])
    await flush()

    const response = findResponse(frames, 'gs-1')
    expect(response?.ok).toBe(true)
    expect(response?.result).toMatchObject(settings)
  })

  it('REQ-34.2-01 isGameAvailable (invoke) receives its single {appName, runner} OBJECT argument intact', async () => {
    steamManager.getGame.mockReturnValue(
      makeGameHandle({ isGameAvailable: jest.fn(() => Promise.resolve(true)) })
    )

    const { input, frames } = startSidecar()
    writeInvoke(input, 'ga-1', 'isGameAvailable', [
      { appName: 'app-object-arg', runner: 'steam' }
    ])
    await flush()

    const response = findResponse(frames, 'ga-1')
    expect(response?.ok).toBe(true)
    expect(response?.result).toBe(true)
    // Proves the object was NOT unwrapped into positional args — appName
    // arrived intact as a single field of the object, not args[0]/args[1].
    expect(steamManager.getGame).toHaveBeenCalledWith('app-object-arg')
  })

  it('REQ-34.2-01 getLaunchOptions (invoke) resolves the real LaunchOption[] from the mocked manager', async () => {
    legendaryManager.getLaunchOptions.mockResolvedValue([
      { name: 'Custom', parameters: '-windowed', type: 'basic' }
    ])

    const { input, frames } = startSidecar()
    writeInvoke(input, 'lo-1', 'getLaunchOptions', ['app-1', 'legendary'])
    await flush()

    const response = findResponse(frames, 'lo-1')
    expect(response?.ok).toBe(true)
    expect(legendaryManager.getLaunchOptions).toHaveBeenCalledWith('app-1')
    expect(
      (response?.result as { name: string }[]).some((o) => o.name === 'Custom')
    ).toBe(true)
  })

  it('REQ-34.2-01 kill (invoke) calls callAbortController BEFORE .stop() — call-order proof', async () => {
    const callOrder: string[] = []
    mockedCallAbortController.mockImplementation(() => {
      callOrder.push('callAbortController')
    })
    steamManager.getGame.mockReturnValue(
      makeGameHandle({
        stop: jest.fn(() => {
          callOrder.push('stop')
          return Promise.resolve()
        })
      })
    )

    const { input, frames } = startSidecar()
    writeInvoke(input, 'kill-1', 'kill', ['app-1', 'steam'])
    await flush()

    expect(findResponse(frames, 'kill-1')?.ok).toBe(true)
    expect(callOrder).toEqual(['callAbortController', 'stop'])
  })

  it('REQ-34.2-01 repair (invoke) resolves and pushes real gameStatusUpdate frames (repairing then done)', async () => {
    legendaryManager.getGame.mockReturnValue(
      makeGameHandle({
        getGameInfo: jest.fn(() => ({ title: 'Repair Game' })),
        repair: jest.fn(() => Promise.resolve())
      })
    )

    const { input, frames } = startSidecar()
    writeInvoke(input, 'repair-1', 'repair', ['app-1', 'legendary'])
    await flush()

    expect(findResponse(frames, 'repair-1')?.ok).toBe(true)
    expect(mockedSendGameStatusUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ appName: 'app-1', status: 'repairing' })
    )
    expect(mockedSendGameStatusUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ appName: 'app-1', status: 'done' })
    )
  })

  // REQ-34.2-01/REQ-34.2-02 — the end-to-end exercise of plan 34.2-01's D-02
  // i18next bootstrap fix. This assertion is WORTHLESS if i18next is ever
  // mocked in this file (see the module docstring above) — spot-checked live
  // by temporarily removing bootstrap.ts's i18next init block, which makes
  // this exact test fail (recorded verbatim in 34.2-04-SUMMARY.md).
  it('REQ-34.2-01/REQ-34.2-02 repair (invoke): notify() body is a real, non-empty translated string — not undefined', async () => {
    legendaryManager.getGame.mockReturnValue(
      makeGameHandle({
        getGameInfo: jest.fn(() => ({ title: 'Repair Game' })),
        repair: jest.fn(() => Promise.resolve())
      })
    )

    const { input } = startSidecar()
    writeInvoke(input, 'repair-notify-1', 'repair', ['app-1', 'legendary'])
    await flush()

    expect(mockedNotify).toHaveBeenCalledTimes(1)
    const [{ body }] = mockedNotify.mock.calls[0] as [{ body: unknown }]
    expect(typeof body).toBe('string')
    expect((body as string).length).toBeGreaterThan(0)
  })

  it('REQ-34.2-01 changeInstallPath (invoke) receives its single {appName, path, runner} OBJECT argument intact', async () => {
    steamManager.changeGameInstallPath.mockResolvedValue(undefined)

    const { input, frames } = startSidecar()
    writeInvoke(input, 'cip-1', 'changeInstallPath', [
      { appName: 'app-object-arg-2', path: '/new/path', runner: 'steam' }
    ])
    await flush()

    expect(findResponse(frames, 'cip-1')?.ok).toBe(true)
    expect(steamManager.changeGameInstallPath).toHaveBeenCalledWith(
      'app-object-arg-2',
      '/new/path'
    )
  })

  // ── REQ-34.2-09: the four pinned-manager channels ──────────────────────────

  it("REQ-34.2-09 readConfig('library') dispatches to the pinned legendary manager only", async () => {
    const games = [{ app_name: 'lib-1', title: 'Library Game' }]
    legendaryManager.refresh.mockResolvedValue(null)
    legendaryManager.getListOfGames.mockReturnValue(games)

    const { input, frames } = startSidecar()
    writeInvoke(input, 'rc-lib-1', 'readConfig', ['library'])
    await flush()

    const response = findResponse(frames, 'rc-lib-1')
    expect(response?.ok).toBe(true)
    expect(response?.result).toEqual(games)
    expect(legendaryManager.refresh).toHaveBeenCalledTimes(1)
    expect(gogManager.getGame).not.toHaveBeenCalled()
    expect(steamManager.getGame).not.toHaveBeenCalled()
  })

  it("REQ-34.2-09 readConfig('user') dispatches to the pinned LegendaryUser.getUserInfo() only", async () => {
    mockedGetUserInfo.mockReturnValue({ displayName: 'Test User' })

    const { input, frames } = startSidecar()
    writeInvoke(input, 'rc-user-1', 'readConfig', ['user'])
    await flush()

    const response = findResponse(frames, 'rc-user-1')
    expect(response?.ok).toBe(true)
    expect(response?.result).toBe('Test User')
    expect(mockedGetUserInfo).toHaveBeenCalledTimes(1)
  })

  it('REQ-34.2-09 getGameOverride dispatches to the pinned legendary manager only, no args', async () => {
    const override = { selectiveDownload: { sdl: [] } }
    legendaryManager.getGameOverride.mockResolvedValue(override)

    const { input, frames } = startSidecar()
    writeInvoke(input, 'go-1', 'getGameOverride', [])
    await flush()

    const response = findResponse(frames, 'go-1')
    expect(response?.ok).toBe(true)
    expect(response?.result).toEqual(override)
    expect(legendaryManager.getGameOverride).toHaveBeenCalledTimes(1)
    expect(steamManager.getGame).not.toHaveBeenCalled()
    expect(gogManager.getGame).not.toHaveBeenCalled()
  })

  it('REQ-34.2-09 getGameSdl dispatches to the pinned legendary manager only, forwarding appName', async () => {
    legendaryManager.getGameSdl.mockResolvedValue(['selective-download-1'])

    const { input, frames } = startSidecar()
    writeInvoke(input, 'sdl-1', 'getGameSdl', ['app-sdl'])
    await flush()

    const response = findResponse(frames, 'sdl-1')
    expect(response?.ok).toBe(true)
    expect(response?.result).toEqual(['selective-download-1'])
    expect(legendaryManager.getGameSdl).toHaveBeenCalledWith('app-sdl')
  })

  it('REQ-34.2-09 getAvailableCyberpunkMods dispatches to the pinned gog manager only', async () => {
    gogManager.getCyberpunkMods.mockResolvedValue(['mod-a', 'mod-b'])

    const { input, frames } = startSidecar()
    writeInvoke(input, 'cpm-1', 'getAvailableCyberpunkMods', [])
    await flush()

    const response = findResponse(frames, 'cpm-1')
    expect(response?.ok).toBe(true)
    expect(response?.result).toEqual(['mod-a', 'mod-b'])
    expect(gogManager.getCyberpunkMods).toHaveBeenCalledTimes(1)
    expect(legendaryManager.getGame).not.toHaveBeenCalled()
  })

  it('REQ-34.2-09 setCyberpunkModConfig dispatches to the pinned gog manager only, forwarding props intact', async () => {
    gogManager.setCyberpunkModConfig.mockResolvedValue(undefined)

    const { input, frames } = startSidecar()
    writeInvoke(input, 'scmc-1', 'setCyberpunkModConfig', [
      { enabled: true, modsToLoad: ['mod-a'] }
    ])
    await flush()

    expect(findResponse(frames, 'scmc-1')?.ok).toBe(true)
    expect(gogManager.setCyberpunkModConfig).toHaveBeenCalledWith({
      enabled: true,
      modsToLoad: ['mod-a']
    })
  })

  // ── F-34.5-G6-10 (34.5-43): getInstallInfo (REQ-34.5-10/REQ-34.5-11/
  // REQ-34.5-13) -- a real preload channel that was registered ONLY on the
  // Electron side until this plan. These tests prove DISPATCH only: the
  // sidecar registration reaches the same extracted `gamedetails/dispatch.ts`
  // body as `main.ts`. F-34.5-G6-10 itself does NOT close on this evidence --
  // it closes when a live session observes zero
  // `[GAMELIB_UNPORTED_CHANNEL] No handler registered for channel
  // 'getInstallInfo'` lines on a details-page open. ───────────────────────────

  it('REQ-34.5-10/13 getInstallInfo (invoke, gog runner) forwards build then branch to the gog manager, sentinels distinct so a transposition fails', async () => {
    gogManager.getInstallInfo.mockResolvedValue({
      game: { app_name: 'appName' }
    })

    const { input, frames } = startSidecar()
    writeInvoke(input, 'gii-1', 'getInstallInfo', [
      'appName',
      'gog',
      'windows',
      'BUILD_SENTINEL',
      'BRANCH_SENTINEL'
    ])
    await flush()

    const response = findResponse(frames, 'gii-1')
    expect(response?.ok).toBe(true)
    expect(gogManager.getInstallInfo).toHaveBeenCalledWith(
      'appName',
      'windows',
      { build: 'BUILD_SENTINEL', branch: 'BRANCH_SENTINEL' }
    )
  })

  it('REQ-34.5-10/13 getInstallInfo (invoke, legendary runner) with no build/branch calls legendary with both undefined, and never dispatches to gog or steam', async () => {
    legendaryManager.getInstallInfo.mockResolvedValue({
      game: { app_name: 'appName' }
    })

    const { input, frames } = startSidecar()
    writeInvoke(input, 'gii-2', 'getInstallInfo', [
      'appName',
      'legendary',
      'windows'
    ])
    await flush()

    const response = findResponse(frames, 'gii-2')
    expect(response?.ok).toBe(true)
    expect(legendaryManager.getInstallInfo).toHaveBeenCalledWith(
      'appName',
      'windows',
      { build: undefined, branch: undefined }
    )
    expect(gogManager.getInstallInfo).not.toHaveBeenCalled()
    expect(steamManager.getInstallInfo).not.toHaveBeenCalled()
  })

  it('REQ-34.5-13 getInstallInfo resolves null (never undefined) when the manager resolves undefined', async () => {
    gogManager.getInstallInfo.mockResolvedValue(undefined)

    const { input, frames } = startSidecar()
    writeInvoke(input, 'gii-3', 'getInstallInfo', ['appName', 'gog', 'windows'])
    await flush()

    const response = findResponse(frames, 'gii-3')
    expect(response?.ok).toBe(true)
    expect(response?.result).toBeNull()
  })

  it('REQ-34.5-13 getInstallInfo resolves null (never rejects) when the manager rejects, parity with main.ts', async () => {
    gogManager.getInstallInfo.mockRejectedValue(
      new Error('boom-getInstallInfo')
    )

    const { input, frames } = startSidecar()
    writeInvoke(input, 'gii-4', 'getInstallInfo', ['appName', 'gog', 'windows'])
    await flush()

    await expect(
      Promise.resolve(findResponse(frames, 'gii-4'))
    ).resolves.toMatchObject({ ok: true, result: null })
  })

  it('REQ-34.5-13 getInstallInfo resolves null (never rejects) for a runner string absent from libraryManagerMap', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'gii-5', 'getInstallInfo', [
      'appName',
      'not-a-real-runner',
      'windows'
    ])
    await flush()

    const response = findResponse(frames, 'gii-5')
    expect(response?.ok).toBe(true)
    expect(response?.result).toBeNull()
  })

  it('REQ-34.5-11 getInstallInfo is registered as INVOKE only (handlerRegistry has it, listenerRegistry does not), and its resolved value is never UNPORTED_CHANNEL_MARKER', async () => {
    gogManager.getInstallInfo.mockResolvedValue({
      game: { app_name: 'appName' }
    })

    const { input, frames } = startSidecar()
    writeInvoke(input, 'gii-6', 'getInstallInfo', ['appName', 'gog', 'windows'])
    await flush()

    expect(handlerRegistry.has('getInstallInfo')).toBe(true)
    expect(listenerRegistry.has('getInstallInfo')).toBe(false)

    const response = findResponse(frames, 'gii-6')
    expect(String(response?.result ?? '')).not.toContain(
      UNPORTED_CHANNEL_MARKER
    )
  })

  // Source-text cross-check (T-34.5-C6 interfaces note 3): `ipc.ts`'s
  // declared parameter NAMES for positions 4/5 disagree with every real
  // caller, and `npx tsc --noEmit` is structurally incapable of catching a
  // transposition there (both positions are `string | undefined`). This test
  // reads the REAL wrapper and REAL registration off disk and asserts they
  // agree on build-then-branch ordering -- proven RED at authoring time by
  // temporarily swapping the registration's `const build = args[3]` /
  // `const branch = args[4]` assignments; see 34.5-43-SUMMARY.md for the
  // verbatim failure/pass transcript.
  it('REQ-34.5-10 source-text cross-check: the wrapper forwards build before branch, and the registration reads args[3] as build / args[4] as branch', () => {
    const wrapperSource = readFileSync(
      join(__dirname, '..', '..', '..', 'frontend', 'helpers', 'index.ts'),
      'utf-8'
    )
    const registrationSource = readFileSync(
      join(__dirname, '..', 'gameDetailsFlowRegistration.ts'),
      'utf-8'
    )

    // Ground truth 1: frontend/helpers/index.ts:88's wrapper forwards
    // (appName, runner, installPlatform, build, branch) -- build BEFORE
    // branch -- to window.api.getInstallInfo.
    const wrapperCallMatch = wrapperSource.match(
      /window\.api\.getInstallInfo\(\s*appName,\s*runner,\s*handleRunnersPlatforms\([^)]*\),\s*build,\s*branch\s*\)/
    )
    expect(wrapperCallMatch).not.toBeNull()

    // Ground truth 2: the sidecar registration must read args[3] as BUILD
    // and args[4] as BRANCH, in that order.
    const buildAssignIndex = registrationSource.indexOf(
      'const build = args[3] as string | undefined'
    )
    const branchAssignIndex = registrationSource.indexOf(
      'const branch = args[4] as string | undefined'
    )
    expect(buildAssignIndex).toBeGreaterThan(-1)
    expect(branchAssignIndex).toBeGreaterThan(buildAssignIndex)

    // And the extracted `getInstallInfo(...)` call must pass build before
    // branch as its final two positional arguments.
    const callMatch = registrationSource.match(
      /getInstallInfo\(\s*args\[0\] as string,\s*args\[1\] as Runner,\s*args\[2\] as InstallPlatform,\s*build,\s*branch\s*\)/
    )
    expect(callMatch).not.toBeNull()
  })

  // ── REQ-34.2-08: the two already-clean game_overrides pass-throughs, real store ─

  it('REQ-34.2-08 getGameMetadataOverride reads the REAL, already-registered gameOverridesStore — zero new plumbing', async () => {
    gameOverridesStore.set('overrides', {
      'override-app': { title: 'Custom Title' }
    })

    const { input, frames } = startSidecar()
    writeInvoke(input, 'gmo-1', 'getGameMetadataOverride', ['override-app'])
    await flush()

    const response = findResponse(frames, 'gmo-1')
    expect(response?.ok).toBe(true)
    expect(response?.result).toEqual({ title: 'Custom Title' })
  })

  it('REQ-34.2-08 getAllGameOverrides reads the REAL, already-registered gameOverridesStore — zero new plumbing', async () => {
    gameOverridesStore.set('overrides', {
      'app-a': { title: 'A' },
      'app-b': { title: 'B' }
    })

    const { input, frames } = startSidecar()
    writeInvoke(input, 'ago-1', 'getAllGameOverrides', [])
    await flush()

    const response = findResponse(frames, 'ago-1')
    expect(response?.ok).toBe(true)
    expect(response?.result).toEqual({
      'app-a': { title: 'A' },
      'app-b': { title: 'B' }
    })
  })

  // ── REQ-34.2-14 / SEAM Invariant B ──────────────────────────────────────────

  // UPDATED (Phase 34.3 Plan 01): `checkDiskSpace` — this test's original
  // example channel — is no longer unported. It is now registered for real
  // by `shellFilesFlowRegistration.ts` (REQ-34.3-02, `shellFilesFlows.test.ts`
  // covers its ported behavior). `getLegendaryVersion` substituted here as a
  // channel that plan did not touch and that stayed genuinely unported until
  // Phase 34.5.
  //
  // UPDATED AGAIN (Phase 34.5 Plan 07, REQ-34.5-06): `getLegendaryVersion` is
  // ALSO no longer unported — it is now registered for real by
  // `runnerMiscFlowRegistration.ts` (`runnerMiscFlows.test.ts` covers its
  // ported registration kind). `winetricksInstall` substitutes here as a
  // channel D-03 permanently DEFERS to Phase 34.6, so this test will not
  // need a further substitution once plan 34.5-12 lands.
  it('REQ-34.2-14/SEAM Invariant B: an UNPORTED channel (winetricksInstall, deferred to Phase 34.6) still returns UNPORTED_CHANNEL_MARKER', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'unported-1', 'winetricksInstall', [])
    await flush()

    const response = findResponse(frames, 'unported-1')
    expect(response?.ok).toBe(false)
    expect(response?.error).toContain(UNPORTED_CHANNEL_MARKER)
  })

  it('REQ-34.2-14 none of the 15 ported channels return UNPORTED_CHANNEL_MARKER', async () => {
    const { input, frames } = startSidecar()
    ALL_15_CHANNELS.forEach(([channel, args], index) => {
      writeInvoke(input, `all15-${index}`, channel, args)
    })
    await flush()

    for (let index = 0; index < ALL_15_CHANNELS.length; index++) {
      const [channel] = ALL_15_CHANNELS[index]
      const response = findResponse(frames, `all15-${index}`)
      expect(response).toBeDefined()
      expect(String(response?.error ?? '')).not.toContain(
        UNPORTED_CHANNEL_MARKER
      )
      // Every one of the 15 must have actually been dispatched (present in
      // the handler registry), not merely "didn't error" by coincidence.
      expect(handlerRegistry.has(channel)).toBe(true)
    }
  })

  // ── REQ-34.2-10: requestGameSettings's own, untouched registration ─────────

  it('REQ-34.2-10/D-09 requestGameSettings resolves through its OWN registration, a distinct function from getGameSettings', async () => {
    startSidecar()
    await flush()

    const getGameSettingsHandler = handlerRegistry.get('getGameSettings')
    const requestGameSettingsHandler = handlerRegistry.get(
      'requestGameSettings'
    )

    expect(getGameSettingsHandler).toBeDefined()
    expect(requestGameSettingsHandler).toBeDefined()
    expect(requestGameSettingsHandler).not.toBe(getGameSettingsHandler)
  })
})

// ── send-kind channels (Phase 34.2 Plan 05 — REQ-34.2-08/REQ-34.2-01/
// REQ-34.2-09) ────────────────────────────────────────────────────────────
//
// An unported OR broken `send` channel produces NO signal at runtime — no
// reject, no timeout, no unported-channel error marker, no log line. "The
// call didn't throw" and "no marker appeared" are explicitly NOT acceptable
// evidence in this block; this is the project's own G-30-01 (`logoutSteam`)
// failure class. Every assertion below is a POSITIVE side-effect assertion:
// a value read back from the real store, a real mocked-manager call, or a
// real frame collected off the transport.
describe('send-kind channels (REQ-34.2-08/REQ-34.2-01/REQ-34.2-09)', () => {
  beforeEach(() => {
    mockAppSettings({ language: 'en' })
    mockedIsOnline.mockReset().mockReturnValue(true)
    for (const manager of [
      legendaryManager,
      gogManager,
      steamManager,
      sideloadManager
    ]) {
      for (const key of Object.keys(manager)) {
        manager[key].mockReset()
      }
    }
    gameOverridesStore.set('overrides', {})
  })

  // ── REQ-34.2-08: setGameMetadataOverride round-trip, push, delete ────────

  it('REQ-34.2-08 setGameMetadataOverride (send) round-trip: a subsequent getAllGameOverrides invoke reads back the exact write', async () => {
    const { input, frames } = startSidecar()
    writeSend(input, 'sgmo-rt-1', 'setGameMetadataOverride', [
      { appName: 'X', title: 'T', art_cover: 'C', art_square: 'S' }
    ])
    await flush()

    writeInvoke(input, 'ago-rt-1', 'getAllGameOverrides', [])
    await flush()

    const response = findResponse(frames, 'ago-rt-1')
    expect(response?.ok).toBe(true)
    expect(response?.result).toMatchObject({
      X: { title: 'T', art_cover: 'C', art_square: 'S' }
    })
  })

  it('REQ-34.2-08 setGameMetadataOverride (send) pushes a metadataChanged frontendMessage frame whose payload equals the full overrides map', async () => {
    const { input, frames } = startSidecar()
    writeSend(input, 'sgmo-push-1', 'setGameMetadataOverride', [
      { appName: 'Y', title: 'Pushed Title' }
    ])
    await flush()

    writeInvoke(input, 'ago-push-1', 'getAllGameOverrides', [])
    await flush()
    const storeResponse = findResponse(frames, 'ago-push-1')

    const pushFrame = frames.find(
      (f) => f.kind === 'frontendMessage' && f.channel === 'metadataChanged'
    ) as { args?: unknown[] } | undefined

    // The proof is the FRAME reaching the transport, not a spy on the
    // notifier function — asserted against the collected output stream.
    expect(pushFrame).toBeDefined()
    expect(pushFrame?.args?.[0]).toEqual(storeResponse?.result)
    expect(pushFrame?.args?.[0]).toMatchObject({ Y: { title: 'Pushed Title' } })
  })

  it('REQ-34.2-08 setGameMetadataOverride (send) with every field empty deletes the entry — a subsequent getGameMetadataOverride invoke returns null', async () => {
    gameOverridesStore.set('overrides', { Z: { title: 'Stale' } })

    const { input, frames } = startSidecar()
    writeSend(input, 'sgmo-del-1', 'setGameMetadataOverride', [
      { appName: 'Z' }
    ])
    await flush()

    writeInvoke(input, 'gmo-del-1', 'getGameMetadataOverride', ['Z'])
    await flush()

    const response = findResponse(frames, 'gmo-del-1')
    expect(response?.ok).toBe(true)
    expect(response?.result).toBeNull()
  })

  // ── REQ-34.2-09: addNewApp ────────────────────────────────────────────────

  it('REQ-34.2-09 addNewApp (send) reaches the sideload manager only, with the GameInfo fixture intact', async () => {
    const gameInfoFixture = {
      app_name: 'sideload-app-1',
      title: 'Sideload Game',
      runner: 'sideload'
    }

    const { input } = startSidecar()
    writeSend(input, 'ana-1', 'addNewApp', [gameInfoFixture])
    await flush()

    expect(sideloadManager.addNewApp).toHaveBeenCalledWith(gameInfoFixture)
    expect(legendaryManager.getGame).not.toHaveBeenCalled()
    expect(gogManager.getGame).not.toHaveBeenCalled()
    expect(steamManager.getGame).not.toHaveBeenCalled()
  })

  // ── REQ-34.2-01: changeGameVersionPinnedStatus's 3 positional args ───────

  it('REQ-34.2-01 changeGameVersionPinnedStatus (send) unwraps its 3 positional args in order — status=true', async () => {
    const { input } = startSidecar()
    writeSend(input, 'cgvps-true-1', 'changeGameVersionPinnedStatus', [
      'X',
      'gog',
      true
    ])
    await flush()

    expect(gogManager.changeVersionPinnedStatus).toHaveBeenCalledWith('X', true)
  })

  it('REQ-34.2-01 changeGameVersionPinnedStatus (send) unwraps its 3 positional args in order — status=false', async () => {
    const { input } = startSidecar()
    writeSend(input, 'cgvps-false-1', 'changeGameVersionPinnedStatus', [
      'X',
      'gog',
      false
    ])
    await flush()

    expect(gogManager.changeVersionPinnedStatus).toHaveBeenCalledWith(
      'X',
      false
    )
  })

  // ── Kind gate ──────────────────────────────────────────────────────────

  it('REQ-34.2-01/REQ-34.2-08/REQ-34.2-09 kind gate: all 3 send channels are registered exactly once as listeners, never as handlers', async () => {
    startSidecar()
    await flush()

    for (const channel of [
      'setGameMetadataOverride',
      'changeGameVersionPinnedStatus',
      'addNewApp'
    ]) {
      expect(listenerRegistry.get(channel)?.length).toBe(1)
      expect(handlerRegistry.get(channel)).toBeUndefined()
    }
  })

  // ── Crash containment ──────────────────────────────────────────────────

  it('REQ-34.2-08/REQ-34.2-09 crash containment: a throwing addNewApp AND a throwing notifier both leave the sidecar alive — health still resolves, zero unhandledRejection events', async () => {
    const unhandledRejections: unknown[] = []
    const onUnhandledRejection = (reason: unknown): void => {
      unhandledRejections.push(reason)
    }
    process.on('unhandledRejection', onUnhandledRejection)

    const pushSpy = jest
      .spyOn(sidecarRpc, 'pushFrontendMessage')
      .mockImplementationOnce(() => {
        throw new Error('boom-notifier')
      })

    try {
      sideloadManager.addNewApp.mockImplementation(() => {
        throw new Error('boom-addNewApp')
      })

      const { input, frames } = startSidecar()

      writeSend(input, 'ana-throw-1', 'addNewApp', [{ app_name: 'boom-app' }])
      await flush()

      writeSend(input, 'sgmo-throw-1', 'setGameMetadataOverride', [
        { appName: 'Boom', title: 'Boom Title' }
      ])
      await flush()

      writeInvoke(input, 'health-after-throws-1', 'health', [])
      await flush()

      const healthResponse = findResponse(frames, 'health-after-throws-1')
      expect(healthResponse).toMatchObject({ ok: true, result: 'ok' })
      expect(unhandledRejections).toHaveLength(0)
    } finally {
      pushSpy.mockRestore()
      process.off('unhandledRejection', onUnhandledRejection)
    }
  })

  // ── Idempotency ────────────────────────────────────────────────────────

  it('REQ-34.2-01/REQ-34.2-08/REQ-34.2-09 idempotency: two startSidecar() calls do not double-register any of the 3 send channels', async () => {
    startSidecar()
    await flush()
    startSidecar()
    await flush()

    for (const channel of [
      'setGameMetadataOverride',
      'changeGameVersionPinnedStatus',
      'addNewApp'
    ]) {
      // registerGameDetailsFlows() runs once at handlers.ts module scope —
      // this pins that assumption directly against the runtime registry.
      expect(listenerRegistry.get(channel)?.length).toBe(1)
    }
  })
})

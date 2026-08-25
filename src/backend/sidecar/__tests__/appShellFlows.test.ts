/**
 * End-to-end wiring test for the sidecar's curated app-shell channels
 * (Phase 34.1 Plan 04 — REQ-34.1-05/REQ-34.1-09).
 *
 * Drives the REAL sidecar RPC server in-process (`downloadQueueFlows.test.ts`'s
 * own real-shim black-box pattern — the shims under test are the actual
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
 *
 * `../sidecarRpc` is PARTIALLY mocked (`jest.requireActual` spread, only
 * `requestRustInvoke` overridden) — this suite is the first curated-module
 * suite that needs BOTH the real RPC dispatch loop (`init()`, for
 * `startRpcServer`/`pushFrontendMessage`/`requestOpenExternal`) AND a
 * scriptable `requestRustInvoke` (for `notify`/`quit`, which reach it via
 * `electronStub.Notification.show()`/`app.exit()`). A full `{
 * requestRustInvoke: jest.fn() }` replacement (`lifecycleStub.test.ts`'s
 * style) would leave `startRpcServer` undefined and break the whole loop —
 * this suite is not a candidate for that shape (mirrors `dialogStub.test.ts`'s
 * module docstring, which explains why IT calls `dialog.showOpenDialog`
 * directly instead of driving the RPC loop, for the mirror-image reason).
 *
 * Mocked only at the boundaries this plan's own module docstring names:
 *   - `backend/config` (`GlobalConfig.get`) — mirrors `settingsFlows.test.ts`'s
 *     own strategy: a plain `{ getSettings, setSetting, set, flush }` stub
 *     avoids GlobalConfigV0's own on-disk read/write path.
 *   - `i18next` — `changeLanguage()`'s real call target; mirrors
 *     `appshellModules.test.ts`'s own `__esModule` default-shape mock.
 *   - `backend/storeManagers/legendary/electronStores` (`gameInfoStore`) —
 *     mirrors `appshellModules.test.ts`'s own choice to avoid a real
 *     disk-backed `CacheStore` construction for this plan's own extracted
 *     `changeLanguage` body (this repo's own "tests clobbering real store"
 *     precedent).
 *   - `backend/utils/aborthandler/aborthandler` (`callAbortController`) — a
 *     narrow jest.fn() boundary mock so `abort`'s wiring can be asserted
 *     directly, mirroring `backend/storeManagers`'s boundary role in
 *     `downloadQueueFlows.test.ts`.
 *
 * Every other module in the registration/transport/store path
 * (`appShellFlowRegistration.ts`, `handlers.ts`, `bootstrap.ts`,
 * `electronStub.ts`, `fileStore.ts`, `backend/utils` — `handleExit`/
 * `openUrlOrFile`, `backend/dialog/dialog` — `notify`, `backend/appshell/*`,
 * `backend/main_window`, `backend/online_monitor`) runs for real, unmodified
 * — in particular `backend/logger` is intentionally NOT mocked (mirrors
 * `installFlows.test.ts`/`settingsFlows.test.ts`; `bootstrap.ts`'s own
 * `initHeadless()` sets up real, tmp-dir-redirected file logging safely,
 * satisfying `changeLanguage`'s `logInfo()` call without the
 * `heroicLogWriter`-unset workaround `appshellModules.test.ts`'s DIRECT-call
 * unit test needed — this suite always goes through the real `init()`).
 *
 * `powerId`/`displaySleepId` (the `lock`/`unlock` module-scope guards inside
 * `appShellFlowRegistration.ts`) persist across every `startSidecar()` call
 * in this file, because `registerAppShellFlows()` itself runs exactly ONCE,
 * at `handlers.ts`'s own module-scope import (not per `init()` call) — the
 * lock/unlock coverage below is therefore a single combined test exercising
 * both channels in one deterministic sequence, rather than two independent
 * tests that would otherwise depend on execution order.
 */

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

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
        `gamelib-appshellflows-test-home-${process.pid}`
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

// ── sidecarRpc — PARTIAL mock: real startRpcServer/pushFrontendMessage/
// requestOpenExternal, scriptable requestRustInvoke only (see module
// docstring above for why this differs from every prior stub-only suite) ────
jest.mock('../sidecarRpc', () => ({
  ...jest.requireActual('../sidecarRpc'),
  requestRustInvoke: jest.fn()
}))

// ── axios — fix/steam-native-install-stability (33-05 live-gate gap): `init()` now wires
// the REAL `initOnlineMonitor()` (backend/online_monitor.ts), which -- now that the real
// electronStub's `net.isOnline()` returns `true` -- immediately calls the real `pingSites()`,
// a live `axios.head()` against github/epic/gog/cloudflare. Mocked so this suite (which drives
// the real, unmocked RPC/handler graph) never makes a real network call.
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
// settingsFlows.test.ts), plus the two additional flags THIS plan's own
// channels newly reach (`isIntelMac` — appShellFlowRegistration.ts,
// `isSteamDeckGameMode` — dialog/dialog.ts's notify(), now sidecar-reachable
// for the first time via the `notify` channel) ──────────────────────────────
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true,
  isIntelMac: false,
  isSteamDeckGameMode: false,
  isFlatpak: false,
  // Plan 05 (REQ-34.6-04/07/13): frontendReady's two byte-equivalent branches.
  // Fixed false so this suite exercises the normal (non-Snap, non-CLI) boot
  // path — the plan's own <behavior> spec targets the exclusion assertions
  // (initQueue/handleProtocol never called), not these two branches.
  isSnap: false,
  isCLINoGui: false
}))

// ── backend/config mock — avoid a real on-disk config.json write while
// still exercising the real handler bodies (themes/releases/changeLanguage) ─
jest.mock('backend/config', () => ({
  GlobalConfig: {
    get: jest.fn()
  }
}))

// ── i18next mock (changeLanguage's real call target) — mirrors
// appshellModules.test.ts's own __esModule default shape ───────────────────
jest.mock('i18next', () => ({
  __esModule: true,
  default: {
    changeLanguage: jest.fn().mockResolvedValue(undefined)
  }
}))

// ── legendary electronStores mock — gameInfoStore is a real CacheStore
// backed by electron-store; mocked to avoid any real disk I/O (this repo's
// own "tests clobbering real store" precedent, mirrors appshellModules.test.ts) ─
jest.mock('../../storeManagers/legendary/electronStores', () => ({
  gameInfoStore: {
    clear: jest.fn()
  }
}))

// ── abort handler mock — a narrow jest.fn() boundary so `abort`'s wiring can
// be asserted directly, mirroring downloadQueueFlows.test.ts's own boundary
// choice for backend/storeManagers ───────────────────────────────────────────
jest.mock('../../utils/aborthandler/aborthandler', () => ({
  callAbortController: jest.fn(),
  // CR-04: `handleExit`'s DESTRUCTIVE branch calls `callAllAbortControllers()` (it
  // aborts every in-flight download). It was missing from this mock, so that branch
  // threw a TypeError partway through instead of running -- which silently made any
  // "did the destructive branch run?" assertion vacuous. Present and asserted-against
  // by the CR-04 fail-safe test below.
  callAllAbortControllers: jest.fn()
}))

// ── downloadmanager/downloadqueue mock — Plan 05 (REQ-34.6-04/07/13): spreads the REAL
// module (already transitively loaded today via `utils.ts`'s own `import { isRunning } from
// './downloadmanager/downloadqueue'`, exercised by the CR-04 quit tests above — this mock
// introduces no new import-graph risk) and overrides ONLY `initQueue` with a `jest.fn()` so
// the frontendReady exclusion test below can assert it was never called. `isRunning` (and
// every other real export `handleExit` depends on) stays real and unchanged.
jest.mock('../../downloadmanager/downloadqueue', () => ({
  ...jest.requireActual('../../downloadmanager/downloadqueue'),
  initQueue: jest.fn()
}))

// ── protocol mock — Plan 05 (REQ-34.6-04/07/13): spreads the REAL module (already
// transitively loaded today via `bootstrap.ts`'s own `import { handleProtocol } from
// '../protocol'`, exercised by every `startSidecar()` call in this file — no new risk) and
// overrides ONLY `handleProtocol` with a `jest.fn()` so the frontendReady exclusion test
// below can assert it was never called from the ported listener body specifically (a
// startup `deliverStartupProtocolUrl` call is a SEPARATE call site this mock does not
// distinguish from — the exclusion test only cares whether frontendReady's OWN body reaches
// it, so it clears the mock immediately before invoking frontendReady).
jest.mock('../../protocol', () => ({
  ...jest.requireActual('../../protocol'),
  handleProtocol: jest.fn()
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { startSidecar, writeInvoke, writeSend } from './helpers/sidecarHarness'
import { GlobalConfig } from 'backend/config'
import i18next from 'i18next'
import { gameInfoStore } from '../../storeManagers/legendary/electronStores'
import { backendEvents } from '../../backend_events'
import {
  callAbortController,
  callAllAbortControllers
} from '../../utils/aborthandler/aborthandler'
import { requestRustInvoke } from '../sidecarRpc'
import { listenerRegistry, handlerRegistry } from '../electronStub'
import * as loggerModule from '../../logger'
import { initQueue } from '../../downloadmanager/downloadqueue'
import { handleProtocol } from '../../protocol'
import {
  RUST_APP_EXIT,
  RUST_DIALOG_MESSAGE,
  RUST_NOTIFICATION_SHOW,
  RUST_TRAY_SET_ICON,
  RUST_INVOKE_CHANNELS
} from 'common/types/sidecarTransport'
import { gamesConfigPath } from '../../constants/paths'
import pkgJson from '../../../../package.json'

const mockedGlobalConfigGet = GlobalConfig.get as jest.Mock
const mockedI18nextChangeLanguage = i18next.changeLanguage as jest.Mock
const mockedGameInfoStoreClear = gameInfoStore.clear as jest.Mock
const mockedCallAbortController = callAbortController as jest.Mock
const mockedCallAllAbortControllers = callAllAbortControllers as jest.Mock
const mockRequestRustInvoke = requestRustInvoke as jest.Mock
const mockedInitQueue = initQueue as jest.Mock
const mockedHandleProtocol = handleProtocol as jest.Mock

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

/** Waits a couple of microtask/macrotask turns for async invoke handlers to resolve. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

let warnSpy: jest.SpyInstance

describe('sidecar app-shell flows (Phase 34.1 Plan 04 — REQ-34.1-05/REQ-34.1-09)', () => {
  beforeEach(() => {
    mockAppSettings({
      customThemesPath: '/does/not/exist',
      customCSS: '.gamelib {}',
      checkForUpdatesOnStartup: false,
      language: 'en'
    })
    mockedI18nextChangeLanguage.mockClear().mockResolvedValue(undefined)
    mockedGameInfoStoreClear.mockClear()
    mockedCallAbortController.mockClear()
    mockedCallAllAbortControllers.mockClear()
    mockRequestRustInvoke.mockReset().mockResolvedValue(undefined)
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  // ── invoke (8) ──────────────────────────────────────────────────────────

  it('REQ-34.1-05 getCustomThemes (invoke) resolves an array, not the unported marker', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'themes-1', 'getCustomThemes', [])
    await flush()

    const response = frames.find((f) => f.id === 'themes-1') as
      | { ok: boolean; result?: unknown; error?: string }
      | undefined
    expect(response?.ok).toBe(true)
    expect(response?.error).toBeUndefined()
    expect(Array.isArray(response?.result)).toBe(true)
  })

  it('REQ-34.1-05 getThemeCSS (invoke) forwards its argument and returns the seeded theme file contents', async () => {
    const themesDir = join(
      tmpdir(),
      `gamelib-appshellflows-themes-${process.pid}`
    )
    mkdirSync(themesDir, { recursive: true })
    writeFileSync(join(themesDir, 'dark.css'), '.dark { color: red }')
    mockAppSettings({ customThemesPath: themesDir })

    const { input, frames } = startSidecar()
    writeInvoke(input, 'theme-css-1', 'getThemeCSS', ['dark.css'])
    await flush()

    const response = frames.find((f) => f.id === 'theme-css-1') as
      | { ok: boolean; result?: unknown; error?: string }
      | undefined
    expect(response?.ok).toBe(true)
    expect(response?.result).toBe('.dark { color: red }')
  })

  it('REQ-34.1-05 getCustomCSS (invoke) resolves the configured customCSS value', async () => {
    mockAppSettings({ customCSS: '.my-theme { color: blue }' })

    const { input, frames } = startSidecar()
    writeInvoke(input, 'custom-css-1', 'getCustomCSS', [])
    await flush()

    const response = frames.find((f) => f.id === 'custom-css-1') as
      | { ok: boolean; result?: unknown }
      | undefined
    expect(response?.ok).toBe(true)
    expect(response?.result).toBe('.my-theme { color: blue }')
  })

  it('REQ-34.1-05/T-34.1-17 getHeroicVersion (invoke) resolves a real, non-empty version, never the 0.0.0 fallback', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'version-1', 'getHeroicVersion', [])
    await flush()

    const response = frames.find((f) => f.id === 'version-1') as
      | { ok: boolean; result?: unknown }
      | undefined
    expect(response?.ok).toBe(true)
    expect(typeof response?.result).toBe('string')
    expect(response?.result).not.toBe('0.0.0')
    expect(response?.result).toBe(pkgJson.version)
  })

  it('REQ-34.1-05 getLatestReleases (invoke) resolves [] when checkForUpdatesOnStartup is false', async () => {
    mockAppSettings({ checkForUpdatesOnStartup: false })

    const { input, frames } = startSidecar()
    writeInvoke(input, 'releases-1', 'getLatestReleases', [])
    await flush()

    const response = frames.find((f) => f.id === 'releases-1') as
      | { ok: boolean; result?: unknown }
      | undefined
    expect(response?.ok).toBe(true)
    expect(response?.result).toEqual([])
  })

  it('REQ-34.1-05 getCurrentChangelog (invoke) resolves without the unported marker', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'changelog-1', 'getCurrentChangelog', [])
    await flush()

    const response = frames.find((f) => f.id === 'changelog-1') as
      | { ok: boolean; result?: unknown; error?: string }
      | undefined
    expect(response?.ok).toBe(true)
    expect(response?.error).toBeUndefined()
  })

  it('REQ-34.1-05 isIntelMac (invoke) resolves the real boolean constant, not the unported marker', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'intel-mac-1', 'isIntelMac', [])
    await flush()

    const response = frames.find((f) => f.id === 'intel-mac-1') as
      | { ok: boolean; result?: unknown }
      | undefined
    expect(response?.ok).toBe(true)
    expect(response?.result).toBe(false)
  })

  it('REQ-34.1-05/D-12 getWebviewPreloadPath (invoke) resolves a declared-empty string', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'webview-preload-1', 'getWebviewPreloadPath', [])
    await flush()

    const response = frames.find((f) => f.id === 'webview-preload-1') as
      | { ok: boolean; result?: unknown }
      | undefined
    expect(response?.ok).toBe(true)
    expect(response?.result).toBe('')
  })

  // ── send (10) ───────────────────────────────────────────────────────────

  it('REQ-34.1-05 changeLanguage (send) reaches i18next.changeLanguage, clears gameInfoStore, persists the setting, and emits languageChanged', async () => {
    const { setSetting } = mockAppSettings({})
    const emitSpy = jest.spyOn(backendEvents, 'emit')

    const { input } = startSidecar()
    writeSend(input, 'change-lang-1', 'changeLanguage', ['fr'])
    await flush()

    expect(mockedI18nextChangeLanguage).toHaveBeenCalledWith('fr')
    expect(mockedGameInfoStoreClear).toHaveBeenCalledTimes(1)
    expect(setSetting).toHaveBeenCalledWith('language', 'fr')
    expect(emitSpy).toHaveBeenCalledWith('languageChanged')

    emitSpy.mockRestore()
  })

  it('REQ-34.1-05 notify (send) reaches Notification.show() -> the existing notification_show rustInvoke arm', async () => {
    const { input } = startSidecar()
    writeSend(input, 'notify-1', 'notify', [
      { title: 'GameLib', body: 'Install complete' }
    ])
    await flush()

    expect(mockRequestRustInvoke).toHaveBeenCalledWith(RUST_NOTIFICATION_SHOW, [
      { title: 'GameLib', body: 'Install complete' }
    ])
  })

  it('REQ-34.1-05 quit (send) reaches handleExit() -> app.exit() -> the existing app_exit rustInvoke arm', async () => {
    const { input } = startSidecar()
    writeSend(input, 'quit-1', 'quit', [])
    await flush()

    expect(mockRequestRustInvoke).toHaveBeenCalledWith(RUST_APP_EXIT, [])
  })

  // ── CR-04 (Phase 34.1 code review): the pending-operations quit confirm ───
  //
  // Registering `quit` made `handleExit()` sidecar-reachable for the first time, which
  // invalidated the invariant `electronStub.showMessageBox`'s own comment block reasoned
  // from. `handleExit` is the ONE caller in this codebase whose dialog sense is inverted
  // (index 0 = safe "No", index 1 = destructive "Yes" -> kill legendary/gogdl/nile +
  // callAllAbortControllers + app.exit). These two tests pin the consequences.
  describe('CR-04 quit with pending operations', () => {
    const lockFile = join(gamesConfigPath, 'lock')

    beforeEach(() => {
      mkdirSync(gamesConfigPath, { recursive: true })
      writeFileSync(lockFile, '')
    })

    afterEach(() => {
      if (existsSync(lockFile)) rmSync(lockFile)
    })

    // NOTE on what is (and is not) observable here: `electronStub.showMessageBox`
    // deliberately does NOT forward `cancelId` into the Rust payload -- it consumes it
    // locally as the `safeIndex` fail-safe default. So `cancelId: 0` cannot be asserted
    // on the wire; the second test below asserts its BEHAVIOUR instead, which is the
    // property that actually matters.
    it("REQ-34.1-05/CR-04: the confirm dialog reaches Rust with NON-BLANK labels even though this suite's i18next has no t()", async () => {
      const { input } = startSidecar()
      writeSend(input, 'quit-pending-1', 'quit', [])
      await flush()

      const dialogCall = mockRequestRustInvoke.mock.calls.find(
        ([channel]) => channel === RUST_DIALOG_MESSAGE
      )
      expect(dialogCall).toBeDefined()
      const options = (dialogCall?.[1] as Record<string, unknown>[])[0]

      // This suite's `i18next` mock exposes ONLY `changeLanguage` -- calling `t()` on it
      // throws, which is a faithful stand-in for the real uninitialized instance (whose
      // `t(key, fallback)` returns `undefined`, the fallback argument NOT saving it).
      // Either way the labels previously crossed the wire as JSON `null` and `main.rs`'s
      // `.unwrap_or("")` rendered a blank message with two blank buttons -- on a dialog
      // whose non-cancel branch kills in-flight downloads.
      const buttons = options.buttons as string[]
      expect(buttons).toHaveLength(2)
      for (const label of [...buttons, options.message, options.title]) {
        expect(typeof label).toBe('string')
        expect(String(label).length).toBeGreaterThan(0)
      }
    })

    it('REQ-34.1-05/CR-04: a FAILING confirm dialog must NOT exit the app or kill in-flight downloads (fail-safe-to-decline)', async () => {
      mockRequestRustInvoke.mockImplementation((channel: string) =>
        channel === RUST_DIALOG_MESSAGE
          ? Promise.reject(new Error('transport timeout'))
          : Promise.resolve(undefined)
      )

      const { input } = startSidecar()
      writeSend(input, 'quit-pending-2', 'quit', [])
      await flush()

      // Proves the dialog branch was actually taken (pending operations present).
      expect(
        mockRequestRustInvoke.mock.calls.some(
          ([channel]) => channel === RUST_DIALOG_MESSAGE
        )
      ).toBe(true)

      // THE assertion, and the observable proof that `handleExit` declares
      // `cancelId: 0`: with no cancelId the stub's positional fallback
      // (`buttons.length - 1`) returns index 1 = "Yes" = the DESTRUCTIVE branch, so a
      // wedged/timed-out dialog silently killed the user's in-flight install and quit
      // the app. `response === 0` is handleExit's early-return, so NEITHER the abort
      // fan-out NOR app_exit may be reached.
      expect(mockedCallAllAbortControllers).not.toHaveBeenCalled()
      expect(mockRequestRustInvoke).not.toHaveBeenCalledWith(RUST_APP_EXIT, [])
    })
  })

  it('REQ-34.1-05 openReleases (send) reaches shell.openExternal with heroicGithubURL over the openExternal parity path', async () => {
    const { input, frames } = startSidecar()
    writeSend(input, 'open-releases-1', 'openReleases', [])
    await flush()

    const pushed = frames.find((f) => f.kind === 'openExternal') as
      | { args?: unknown[] }
      | undefined
    expect(pushed).toBeDefined()
    expect((pushed?.args as unknown[])?.[0]).toContain(
      'HeroicGamesLauncher/releases/latest'
    )
  })

  it('REQ-34.1-05 openCustomThemesWiki (send) reaches shell.openExternal with customThemesWikiLink', async () => {
    const { input, frames } = startSidecar()
    writeSend(input, 'open-themes-wiki-1', 'openCustomThemesWiki', [])
    await flush()

    const pushed = frames.find((f) => f.kind === 'openExternal') as
      | { args?: unknown[] }
      | undefined
    expect(pushed).toBeDefined()
    expect((pushed?.args as unknown[])?.[0]).toContain('Custom-Themes')
  })

  it('REQ-34.1-05 openWebviewPage (send) forwards its argument to shell.openExternal', async () => {
    const { input, frames } = startSidecar()
    writeSend(input, 'open-webview-1', 'openWebviewPage', [
      'https://example.com/webview'
    ])
    await flush()

    const pushed = frames.find((f) => f.kind === 'openExternal') as
      | { args?: unknown[] }
      | undefined
    expect(pushed).toBeDefined()
    expect((pushed?.args as unknown[])?.[0]).toBe('https://example.com/webview')
  })

  it('REQ-34.1-05 abort (send) reaches callAbortController with the passed id', async () => {
    const { input } = startSidecar()
    writeSend(input, 'abort-1', 'abort', ['download-999'])
    await flush()

    expect(mockedCallAbortController).toHaveBeenCalledWith('download-999')
  })

  it('REQ-34.1-09/D-13/D-08 lock then unlock: both reach electronStub.powerSaveBlocker, both log a D-08-tagged warning, neither throws', async () => {
    const { input } = startSidecar()

    writeSend(input, 'lock-1', 'lock', [false])
    await flush()
    // electronStub's powerSaveBlocker.start() logs its own D-08-tagged warning.
    expect(
      warnSpy.mock.calls.some(
        ([msg]) =>
          String(msg).includes('powerSaveBlocker.start') &&
          String(msg).includes('D-08')
      )
    ).toBe(true)

    warnSpy.mockClear()
    writeSend(input, 'unlock-1', 'unlock', [])
    await flush()
    expect(
      warnSpy.mock.calls.some(
        ([msg]) =>
          String(msg).includes('unlock') && String(msg).includes('D-08')
      )
    ).toBe(true)
  })

  it('REQ-34.1-09/D-13 setTitleBarOverlay (send) logs a D-13-tagged warning naming the channel, never throws', async () => {
    const { input } = startSidecar()
    writeSend(input, 'title-bar-overlay-1', 'setTitleBarOverlay', [
      { color: '#000000' }
    ])
    await flush()

    expect(
      warnSpy.mock.calls.some(
        ([msg]) =>
          String(msg).includes('setTitleBarOverlay') &&
          String(msg).includes('D-13')
      )
    ).toBe(true)
  })

  // ── frontendReady (send, D-11) — Phase 34.6 Plan 05 (REQ-34.6-04/07/13) ────

  describe('REQ-34.6-04/07/13 frontendReady (send, D-11)', () => {
    it('is registered send-kind (listenerRegistry), never handle-kind (handlerRegistry)', () => {
      startSidecar()

      expect(listenerRegistry.get('frontendReady')?.length).toBe(1)
      expect(handlerRegistry.has('frontendReady')).toBe(false)
    })

    it("calls logSendHandlerReached('frontendReady') as its FIRST observable effect, then the Frontend Ready log line", async () => {
      const logInfoSpy = jest.spyOn(loggerModule, 'logInfo')

      const { input } = startSidecar()
      writeSend(input, 'frontend-ready-1', 'frontendReady', [])
      await flush()

      // logInfoSpy.mock.calls may already carry earlier boot-time lines (real, unmocked
      // logger) -- find the observable marker line specifically and assert it precedes
      // the plain 'Frontend Ready' line, rather than assuming index 0 of the whole spy.
      const markerIndex = logInfoSpy.mock.calls.findIndex(
        ([msg]) => msg === '[GAMELIB_SIDECAR_SEND_HANDLER] frontendReady'
      )
      const readyLineIndex = logInfoSpy.mock.calls.findIndex(
        ([msg]) => msg === 'Frontend Ready'
      )
      expect(markerIndex).toBeGreaterThanOrEqual(0)
      expect(readyLineIndex).toBeGreaterThan(markerIndex)

      logInfoSpy.mockRestore()
    })

    it('does NOT call initQueue and does NOT call handleProtocol -- the two deliberate exclusions -- RED-proven by temporarily adding either call (see SUMMARY)', async () => {
      mockedInitQueue.mockClear()
      mockedHandleProtocol.mockClear()

      const { input } = startSidecar()
      writeSend(input, 'frontend-ready-2', 'frontendReady', [])
      await flush()

      expect(mockedInitQueue).not.toHaveBeenCalled()
      expect(mockedHandleProtocol).not.toHaveBeenCalled()
    })

    it('never throws out of ipcMain.on -- a synchronous throw inside the body is caught and logged via console.warn, never propagated', async () => {
      // Capture the ORIGINAL implementation before spying -- jest.spyOn replaces
      // loggerModule.logInfo in place, so `jest.requireActual('../../logger').logInfo`
      // would resolve to the very same (already-spied) property and recurse forever.
      const originalLogInfo = loggerModule.logInfo
      const logInfoSpy = jest
        .spyOn(loggerModule, 'logInfo')
        .mockImplementation((message: unknown, ...rest: unknown[]) => {
          if (message === 'Frontend Ready') {
            throw new Error('synchronous logger failure')
          }
          // Delegate every other call (the D-11 marker line, and any other boot-time
          // logInfo call) to the real implementation so this suite's other behaviour
          // is unaffected.
          return (
            originalLogInfo as (message: unknown, ...rest: unknown[]) => void
          )(message, ...rest)
        })

      const { input } = startSidecar()
      expect(() => {
        writeSend(input, 'frontend-ready-3', 'frontendReady', [])
      }).not.toThrow()
      await flush()

      // logSendFailure logs `console.warn('[...] frontendReady failed:', error)` --
      // the channel name and the failure text live in SEPARATE args, not one string.
      expect(
        warnSpy.mock.calls.some(
          ([msg, err]) =>
            String(msg).includes('frontendReady') &&
            String(err).includes('synchronous logger failure')
        )
      ).toBe(true)

      logInfoSpy.mockRestore()
    })
  })

  // ── set-connectivity-online: already live via bootstrap.ts (D-03/D-09) ────

  it('REQ-34.1-05/D-03 set-connectivity-online is reachable WITHOUT this plan registering it, and is registered exactly once', async () => {
    startSidecar()
    await flush()

    expect(listenerRegistry.get('set-connectivity-online')?.length).toBe(1)
  })

  // ── Zero-new-Rust-arms guard ───────────────────────────────────────────────

  it("REQ-34.1-05 zero new Rust arms: every requestRustInvoke channel used by this plan's flows is a member of the existing RUST_INVOKE_CHANNELS set", async () => {
    const { input } = startSidecar()
    writeSend(input, 'notify-guard', 'notify', [
      { title: 'GameLib', body: 'test' }
    ])
    writeSend(input, 'quit-guard', 'quit', [])
    await flush()

    expect(mockRequestRustInvoke.mock.calls.length).toBeGreaterThan(0)
    for (const [channel] of mockRequestRustInvoke.mock.calls) {
      expect(
        (RUST_INVOKE_CHANNELS as readonly string[]).includes(channel)
      ).toBe(true)
    }

    // Plan 06/D-11: tray_set_icon is the ONE legitimate new arm this slice adds --
    // this is the one place the permitted set legitimately grew. changeTrayColor's
    // own 500ms settle delay means it can't cheaply join the live exercise above
    // without a real wait, so it's asserted statically here and exercised live (via
    // fake timers) by the 'REQ-34.1-07 changeTrayColor -> tray_set_icon' block below.
    expect(
      (RUST_INVOKE_CHANNELS as readonly string[]).includes(RUST_TRAY_SET_ICON)
    ).toBe(true)
  })

  // ── changeTrayColor -> tray_set_icon (Plan 06, D-11) ────────────────────────
  //
  // Fires the registered `changeTrayColor` listener DIRECTLY via `listenerRegistry`
  // rather than through the RPC/stream pipe `writeSend`/`flush` use elsewhere in this
  // file -- `registerAppShellFlows()` runs exactly ONCE at this file's module-scope
  // import (same precedent as the lock/unlock coverage above), so the listener is
  // already registered before any test body runs; going through the stream layer
  // would add real-I/O-vs-fake-timer interleaving this suite doesn't need for a
  // channel with no stream-side effects of its own.
  describe('REQ-34.1-07 changeTrayColor -> tray_set_icon (Phase 34.1 Plan 06, D-11)', () => {
    function fireChangeTrayColor(): void {
      const listeners = listenerRegistry.get('changeTrayColor') ?? []
      expect(listeners.length).toBeGreaterThan(0)
      listeners[listeners.length - 1](undefined)
    }

    beforeEach(() => {
      // `logInfo()` (called synchronously by the changeTrayColor listener) needs
      // `heroicLogWriter` assigned, which only happens via bootstrap.ts's real
      // `initHeadless()` -- i.e. via `startSidecar()`'s `init()` call, same as every
      // other test in this file. Calling it here (discarding the result) makes this
      // describe block self-sufficient regardless of test execution order or a
      // `--testNamePattern` filter that skips the file's earlier `startSidecar()`
      // calls this block would otherwise silently rely on.
      startSidecar()
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('REQ-34.1-07 invokes nothing before 500ms have elapsed, then RUST_TRAY_SET_ICON with [{ dark: true }] after exactly 500ms when darkTrayIcon is true', () => {
      mockAppSettings({ darkTrayIcon: true })

      fireChangeTrayColor()
      expect(mockRequestRustInvoke).not.toHaveBeenCalled()

      jest.advanceTimersByTime(499)
      expect(mockRequestRustInvoke).not.toHaveBeenCalled()

      jest.advanceTimersByTime(1)
      expect(mockRequestRustInvoke).toHaveBeenCalledWith(RUST_TRAY_SET_ICON, [
        { dark: true }
      ])
    })

    it('REQ-34.1-07 invokes RUST_TRAY_SET_ICON with [{ dark: false }] after 500ms when darkTrayIcon is false', () => {
      mockAppSettings({ darkTrayIcon: false })

      fireChangeTrayColor()
      jest.advanceTimersByTime(500)

      expect(mockRequestRustInvoke).toHaveBeenCalledWith(RUST_TRAY_SET_ICON, [
        { dark: false }
      ])
    })

    it('REQ-34.1-07 invokes RUST_TRAY_SET_ICON with [{ dark: false }] when darkTrayIcon is absent from settings', () => {
      mockAppSettings({})

      fireChangeTrayColor()
      jest.advanceTimersByTime(500)

      expect(mockRequestRustInvoke).toHaveBeenCalledWith(RUST_TRAY_SET_ICON, [
        { dark: false }
      ])
    })

    it('REQ-34.1-07 a rejected requestRustInvoke is caught and logged via console.warn, never an unhandled rejection', async () => {
      mockAppSettings({ darkTrayIcon: true })
      mockRequestRustInvoke.mockRejectedValueOnce(new Error('rust unreachable'))

      fireChangeTrayColor()
      jest.advanceTimersByTime(500)
      // Let the rejected promise's .catch() handler actually run (a plain microtask,
      // independent of the fake timers controlling the 500ms setTimeout above).
      await Promise.resolve()
      await Promise.resolve()

      expect(
        warnSpy.mock.calls.some(([msg]) =>
          String(msg).includes('changeTrayColor')
        )
      ).toBe(true)
    })

    it('REQ-34.1-07 repeated changeTrayColor sends within the 500ms window collapse to a single invoke (T-34.1-23)', () => {
      mockAppSettings({ darkTrayIcon: true })

      fireChangeTrayColor()
      jest.advanceTimersByTime(200)
      fireChangeTrayColor()
      jest.advanceTimersByTime(200)
      fireChangeTrayColor()
      jest.advanceTimersByTime(500)

      expect(mockRequestRustInvoke).toHaveBeenCalledTimes(1)
    })

    it('REQ-34.1-07 registerAppShellFlows() performs exactly one initial sync invoke', () => {
      // Isolated: re-calling the SHARED module's registerAppShellFlows() here would
      // double-register every OTHER channel's listener too (breaking the lock/unlock/
      // abort tests elsewhere in this file, whose bodies assume exactly one listener
      // each). jest.isolateModules gives a fresh module registry -- a fresh
      // electronStub (own listenerRegistry), a fresh sidecarRpc mock instance, and a
      // fresh backend/config mock instance -- so this test's own registration can
      // never leak into the shared suite state.
      jest.isolateModules(() => {
        // Inside jest.isolateModules: a static import would resolve against the shared registry.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const isolatedConfigGet = require('backend/config').GlobalConfig
          .get as jest.Mock
        isolatedConfigGet.mockReturnValue({
          getSettings: () => ({ darkTrayIcon: false }),
          setSetting: jest.fn(),
          set: jest.fn(),
          flush: jest.fn()
        })
        // Inside jest.isolateModules: a static import would resolve against the shared registry.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const isolatedRequestRustInvoke = require('../sidecarRpc')
          .requestRustInvoke as jest.Mock
        isolatedRequestRustInvoke.mockResolvedValue(undefined)

        // Inside jest.isolateModules: a static import would resolve against the shared registry.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { registerAppShellFlows } = require('../appShellFlowRegistration')
        registerAppShellFlows()
        jest.runAllTimers()

        expect(isolatedRequestRustInvoke).toHaveBeenCalledTimes(1)
        expect(isolatedRequestRustInvoke).toHaveBeenCalledWith(
          RUST_TRAY_SET_ICON,
          [{ dark: false }]
        )
      })
    })
  })

  // ── Total-body guard: a rejected send-handler body must never crash the
  // sidecar process (the sidecar-dialog-reject-crashes precedent) ───────────

  // CHANGED TEST CONTRACT (CR-01, Phase 34.1 code review). This test previously
  // asserted that a failing `i18next.changeLanguage` produced a
  // `[appShellFlowRegistration] changeLanguage failed:` console.warn -- i.e. it PINNED
  // the bug: the rejection escaped `appshell/language.ts` and aborted `gameInfoStore
  // .clear()` / `setSetting('language', ...)` / `emit('languageChanged')`, so under the
  // sidecar (where i18next is NEVER init()'d -- see language.ts's own CR-01 comment) the
  // user's language choice silently never persisted. The contract is now the opposite:
  // an i18next failure is CONTAINED inside `changeLanguage` and the persist path still
  // runs. The surviving requirement -- "a send-handler body must never crash the
  // sidecar" -- is still asserted below via the post-failure health check.
  it('REQ-34.1-05/CR-01 changeLanguage (send): a REJECTED i18next.changeLanguage still persists the setting, clears the cache and emits languageChanged', async () => {
    const { setSetting } = mockAppSettings({})
    mockedI18nextChangeLanguage.mockRejectedValueOnce(new Error('boom'))
    const emitSpy = jest.spyOn(backendEvents, 'emit')

    const { input, frames } = startSidecar()
    writeSend(input, 'change-lang-fail-1', 'changeLanguage', ['de'])
    await flush()

    expect(mockedGameInfoStoreClear).toHaveBeenCalledTimes(1)
    expect(setSetting).toHaveBeenCalledWith('language', 'de')
    expect(emitSpy).toHaveBeenCalledWith('languageChanged')

    writeInvoke(input, 'health-after-change-lang-fail', 'health', [])
    await flush()
    const healthResponse = frames.find(
      (f) => f.id === 'health-after-change-lang-fail'
    )
    expect(healthResponse).toMatchObject({
      id: 'health-after-change-lang-fail',
      ok: true,
      result: 'ok'
    })

    emitSpy.mockRestore()
  })

  // CR-01 regression guard, and the shape the suite's `i18next` mock otherwise hides:
  // the REAL uninitialized i18next 22.5.1 does not reject, it throws SYNCHRONOUSLY
  // (`TypeError: Cannot read properties of undefined (reading 'toResolveHierarchy')`,
  // verified against the installed package). A `try { await ... }` catches both, but
  // only this variant proves the sync path -- a fix that merely appended `.catch()` to
  // the call expression would pass the rejection test above and still fail here.
  it('REQ-34.1-05/CR-01 changeLanguage (send): a SYNCHRONOUSLY THROWING i18next.changeLanguage (the real uninitialized-instance shape) still persists the setting', async () => {
    const { setSetting } = mockAppSettings({})
    mockedI18nextChangeLanguage.mockImplementationOnce(() => {
      throw new TypeError(
        "Cannot read properties of undefined (reading 'toResolveHierarchy')"
      )
    })
    const emitSpy = jest.spyOn(backendEvents, 'emit')

    const { input, frames } = startSidecar()
    writeSend(input, 'change-lang-throw-1', 'changeLanguage', ['pt'])
    await flush()

    expect(mockedGameInfoStoreClear).toHaveBeenCalledTimes(1)
    expect(setSetting).toHaveBeenCalledWith('language', 'pt')
    expect(emitSpy).toHaveBeenCalledWith('languageChanged')

    writeInvoke(input, 'health-after-change-lang-throw', 'health', [])
    await flush()
    expect(
      frames.find((f) => f.id === 'health-after-change-lang-throw')
    ).toMatchObject({ ok: true, result: 'ok' })

    emitSpy.mockRestore()
  })

  // ── fs-seeding cleanup guard (not a functional assertion — keeps the
  // themes-dir seeding helper's imports honest against accidental
  // graceful-fs mock leakage from a sibling suite) ──────────────────────────
  it('sanity: existsSync/readdirSync/join/mkdirSync/writeFileSync used by the themes-dir seeding above are all real', () => {
    expect(typeof existsSync).toBe('function')
    expect(typeof readdirSync).toBe('function')
    expect(typeof join).toBe('function')
    expect(typeof mkdirSync).toBe('function')
    expect(typeof writeFileSync).toBe('function')
  })
})

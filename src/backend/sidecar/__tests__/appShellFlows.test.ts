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
 * `jest.mock('electron', ...)` / `jest.mock('backend/store_backend', ...)` below
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
jest.mock('backend/store_backend', () => ({
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
// settingsFlows.test.ts), plus the one additional flag THIS plan's own
// channels newly reach (`isSteamDeckGameMode` — dialog/dialog.ts's
// notify(), now sidecar-reachable for the first time via the `notify`
// channel) ──────────────────────────────────────────────────────────────────
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true,
  isSteamDeckGameMode: false,
  isFlatpak: false,
  // Plan 05 (REQ-34.6-04/07/13): frontendReady's two byte-equivalent branches.
  // Fixed false so this suite exercises the normal (non-Snap, non-CLI) boot
  // path — the plan's own <behavior> spec targets the handleProtocol
  // exclusion assertion and (Phase 35 plan 11) the initQueue auto-resume
  // assertion, not these two branches.
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
    changeLanguage: jest.fn().mockResolvedValue(undefined),
    // CR-02 (35-REVIEW.md, plan 35-21): the Snap-warning dialog (frontendReady, isSnap
    // branch) calls `i18next.t(key, defaultValueOrOptions)` three times to build its
    // title/message/checkboxLabel. No earlier test in this file ever reached that branch,
    // so `t` was never added here -- without it, `i18next.t is not a function` throws
    // synchronously (evaluating the dialog options object, before `dialog.showMessageBox`
    // is even called), silently swallowed by the handler's own try/catch ->
    // `logSendFailure` -> `console.warn`, itself muted by this file's `warnSpy`
    // (`beforeEach` below) -- so the failure produced no visible signal at all. Mirrors
    // real i18next's own fallback shape: a string second argument is the default value
    // directly; an options object's `defaultValue` property is used instead; otherwise
    // the bare key is returned.
    t: jest.fn((key: string, defaultValueOrOptions?: unknown) => {
      if (typeof defaultValueOrOptions === 'string') {
        return defaultValueOrOptions
      }
      if (
        defaultValueOrOptions &&
        typeof defaultValueOrOptions === 'object' &&
        'defaultValue' in defaultValueOrOptions
      ) {
        return (defaultValueOrOptions as { defaultValue: string }).defaultValue
      }
      return key
    })
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
// introduces no new import-graph risk) and overrides ONLY `initQueue` with a `jest.fn()`.
// Until Phase 35 plan 11 the frontendReady test asserted it was NEVER called; plan 11 ported
// the boot-time auto-resume, so the test now asserts it IS called exactly once with `true`
// after 5s. `isRunning` (and every other real export `handleExit` depends on) stays real
// and unchanged.
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
import { listenerRegistry, handlerRegistry } from '../../platform'
import * as loggerModule from '../../logger'
import { handleProtocol } from '../../protocol'
import {
  RUST_APP_EXIT,
  RUST_DIALOG_MESSAGE,
  RUST_NOTIFICATION_SHOW,
  RUST_TRAY_SET_ICON,
  RUST_INVOKE_CHANNELS,
  RUST_WAKE_LOCK_START,
  RUST_WAKE_LOCK_STOP
} from 'common/types/sidecarTransport'
import { gamesConfigPath } from '../../constants/paths'
import pkgJson from '../../../../package.json'

const mockedGlobalConfigGet = GlobalConfig.get as jest.Mock
const mockedI18nextChangeLanguage = i18next.changeLanguage as jest.Mock
const mockedGameInfoStoreClear = gameInfoStore.clear as jest.Mock
const mockedCallAbortController = callAbortController as jest.Mock
const mockedCallAllAbortControllers = callAllAbortControllers as jest.Mock
const mockRequestRustInvoke = requestRustInvoke as jest.Mock
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

  // UPDATED by Phase 35 Plan 08 (D-08, REQ-35-06) rather than deleted. This case used to assert
  // that lock/unlock each logged a D-08-tagged "accepted gap" warning -- the marker of a no-op
  // that held nothing. Those warnings are gone with the no-op, so the assertions now pin the
  // real behaviour instead: both handlers reach Rust, with the CORRECT and DISTINCT kind.
  //
  // These call sites were NOT in plan 35-08's file list and were found by grep. Under Tauri this
  // is the live `lock`/`unlock` path (`main.ts`'s copy dies at the point of no return), and both
  // calls previously passed no kind and no id at all, because the Phase 33 stub accepted neither.
  it('REQ-34.1-09/D-13/D-08 lock then unlock take and release REAL assertions of the right kinds, neither throws', async () => {
    mockRequestRustInvoke.mockReset().mockResolvedValue(4242)
    const { input } = startSidecar()

    // playing=false is the DOWNLOAD case -> system suspension, NOT display.
    writeSend(input, 'lock-1', 'lock', [false])
    await flush()
    expect(mockRequestRustInvoke).toHaveBeenCalledWith(RUST_WAKE_LOCK_START, [
      'prevent-app-suspension'
    ])
    expect(mockRequestRustInvoke).not.toHaveBeenCalledWith(
      RUST_WAKE_LOCK_START,
      ['prevent-display-sleep']
    )

    // playing=true is the GAME case -> display sleep. Asserting both directions is what stops a
    // hardcoded single kind (threat T-35-32) from passing this test.
    writeSend(input, 'lock-2', 'lock', [true])
    await flush()
    expect(mockRequestRustInvoke).toHaveBeenCalledWith(RUST_WAKE_LOCK_START, [
      'prevent-display-sleep'
    ])

    mockRequestRustInvoke.mockClear()
    writeSend(input, 'unlock-1', 'unlock', [])
    await flush()

    // Both assertions released -- a leaked one outlives the app (threat T-35-31).
    const stopCalls = mockRequestRustInvoke.mock.calls.filter(
      ([channel]) => channel === RUST_WAKE_LOCK_STOP
    )
    expect(stopCalls).toHaveLength(2)
    expect(stopCalls).toEqual([
      [RUST_WAKE_LOCK_STOP, [4242]],
      [RUST_WAKE_LOCK_STOP, [4242]]
    ])
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

    it('does NOT call handleProtocol -- the one remaining deliberate exclusion -- RED-proven by temporarily adding the call (see SUMMARY)', async () => {
      mockedHandleProtocol.mockClear()

      const { input } = startSidecar()
      writeSend(input, 'frontend-ready-2', 'frontendReady', [])
      await flush()

      expect(mockedHandleProtocol).not.toHaveBeenCalled()
    })

    // ── Phase 35 plan 11: boot-time download-queue auto-resume (SEAM Phase 32
    // D-05, referred to in the plan text as "Phase 33 D-04"). Ported from
    // `main.ts:613` because `main.ts` is deleted at plan 35-14; without this
    // the app would permanently stop resuming interrupted downloads at
    // startup. Branch A was taken (port ENABLED) because both blockers named
    // by the original suppression measured CLOSED — see the plan summary.
    //
    // ISOLATED (jest.isolateModules, CR-02 follow-up, 35-21): `frontendReadyBootWorkDone`
    // is a module-scoped flag in `appShellFlowRegistration.ts` that -- correctly, matching
    // production, where the sidecar really is one process -- never resets between `it()`
    // blocks in the SHARED module registry. Two earlier tests in this same `describe`
    // ('calls logSendHandlerReached...' and 'does NOT call handleProtocol...') already
    // deliver `frontendReady` against that SAME shared registration, which flips the
    // shared flag `true` before this test ever runs, permanently suppressing
    // `initQueue` for the rest of the file. A fresh module registry gives this test its
    // own, never-yet-flipped `frontendReadyBootWorkDone` -- calling `registerAppShellFlows()`
    // directly (mirroring the REQ-34.1-07 precedent below) and invoking the registered
    // `frontendReady` listener directly, rather than round-tripping through
    // `startSidecar()`/`writeSend()`, both of which are statically bound to the shared/
    // outer module registry and cannot reach an isolated instance.
    //
    // `doNotFake: ['setImmediate']` because this suite's `flush()` helper is
    // built on `setImmediate`; faking it would deadlock the await below while
    // still leaving `setTimeout` faked, which is the only timer under test.
    it('Phase 35 plan 11: DOES schedule the boot-time auto-resume -- initQueue is not called before 5s, then called exactly once with isStartup true', async () => {
      let isolatedInitQueue!: jest.Mock
      let frontendReadyListener!: () => void

      jest.useFakeTimers({ doNotFake: ['setImmediate'] })
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const isolatedConfigGet = require('backend/config').GlobalConfig
          .get as jest.Mock
        isolatedConfigGet.mockReturnValue({
          getSettings: () => ({ language: 'en' }),
          setSetting: jest.fn(),
          set: jest.fn(),
          flush: jest.fn()
        })
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const isolatedRequestRustInvoke = require('../sidecarRpc')
          .requestRustInvoke as jest.Mock
        isolatedRequestRustInvoke.mockResolvedValue(undefined)
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        isolatedInitQueue = require('../../downloadmanager/downloadqueue')
          .initQueue as jest.Mock

        // `frontendReady`'s handler calls `logInfo()` unconditionally near the top of its
        // body (before the guard under test is ever reached). `logInfo` reads a
        // module-scoped `heroicLogWriter` that is only assigned by `initHeadless()` --
        // normally done once by `bootstrap.ts`'s `startSidecar()` path, which this
        // isolated instance never runs. Without this call, `logInfo` throws synchronously
        // ("Cannot read properties of undefined (reading 'logInfo')"), the handler's own
        // try/catch swallows it via `logSendFailure` (a console.warn, easy to miss), and
        // the `setTimeout` below is never reached -- this instance mirrors the (also
        // isolated) `REQ-34.1-07 registerAppShellFlows() performs exactly one initial
        // sync invoke` precedent's safety, except that precedent's `changeTrayColor` path
        // never touches the logger, so it never needed this call.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../../logger').initHeadless()

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const isolatedModule = require('../appShellFlowRegistration')
        isolatedModule.registerAppShellFlows()
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const isolatedListenerRegistry = require('../../platform').listenerRegistry
        ;[frontendReadyListener] = isolatedListenerRegistry.get('frontendReady')
      })

      try {
        frontendReadyListener()
        await flush()

        // The call must be DEFERRED, not synchronous -- a synchronous
        // initQueue at frontendReady would race the sidecar's own boot.
        expect(isolatedInitQueue).not.toHaveBeenCalled()

        jest.advanceTimersByTime(4999)
        expect(isolatedInitQueue).not.toHaveBeenCalled()

        jest.advanceTimersByTime(1)
        expect(isolatedInitQueue).toHaveBeenCalledTimes(1)
        // isStartup=true is load-bearing and is NOT merely "the same as
        // main.ts": it is ITSELF the Steam suppression. downloadqueue.ts's
        // initQueue breaks before installQueueElement() for a persisted
        // `runner === 'steam'` queue head when this argument is true,
        // surfacing it as resumable instead. A regression to
        // initQueue()/false here would silently start auto-driving Steam
        // installs on every boot.
        expect(isolatedInitQueue).toHaveBeenCalledWith(true)
      } finally {
        jest.useRealTimers()
      }
    })

    // ── CR-02 (35-REVIEW.md, plan 35-21): once-semantics for the boot-time
    // auto-resume, restored via `frontendReadyBootWorkDone`'s module-scoped guard. The
    // sidecar OUTLIVES the renderer, so a renderer reload re-delivers `frontendReady` into
    // this SAME registration -- `electronStub`'s `ipcMain.on` has no once-semantics of its
    // own, unlike Electron's real `ipcMain` the original code reached via
    // `addOneTimeListener`. `initQueue` has no re-entrancy guard, so an unguarded second
    // delivery would start a second concurrent install of the same queue head.
    //
    // ISOLATED for the same reason as the test above: a fresh module registry gives this
    // test its own, never-yet-flipped `frontendReadyBootWorkDone`, and calling the two
    // deliveries against the SAME isolated instance (rather than two separate
    // `isolateModules` calls) is exactly what proves the ONCE-per-process guarantee.
    it('CR-02: TWO frontendReady deliveries into an ISOLATED registration start the download queue only ONCE', async () => {
      let isolatedInitQueue!: jest.Mock
      let frontendReadyListener!: () => void

      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const isolatedConfigGet = require('backend/config').GlobalConfig
          .get as jest.Mock
        isolatedConfigGet.mockReturnValue({
          getSettings: () => ({ language: 'en' }),
          setSetting: jest.fn(),
          set: jest.fn(),
          flush: jest.fn()
        })
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const isolatedRequestRustInvoke = require('../sidecarRpc')
          .requestRustInvoke as jest.Mock
        isolatedRequestRustInvoke.mockResolvedValue(undefined)
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        isolatedInitQueue = require('../../downloadmanager/downloadqueue')
          .initQueue as jest.Mock

        // See the "Phase 35 plan 11" test above for why this is required: `frontendReady`
        // calls `logInfo()` unconditionally, which needs `heroicLogWriter` assigned.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../../logger').initHeadless()

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { registerAppShellFlows } = require('../appShellFlowRegistration')
        registerAppShellFlows()
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const isolatedListenerRegistry = require('../../platform').listenerRegistry
        ;[frontendReadyListener] = isolatedListenerRegistry.get('frontendReady')
      })

      jest.useFakeTimers({ doNotFake: ['setImmediate'] })
      try {
        frontendReadyListener()
        await flush()
        frontendReadyListener()
        await flush()

        jest.advanceTimersByTime(5000)

        // RED-proof (recorded verbatim in the SUMMARY): reverting the fix -- calling
        // `initQueue(true)` unconditionally on every delivery instead of behind
        // `frontendReadyBootWorkDone` -- flips this to `toHaveBeenCalledTimes(2)` and
        // this assertion fails.
        expect(isolatedInitQueue).toHaveBeenCalledTimes(1)
        expect(isolatedInitQueue).toHaveBeenCalledWith(true)
      } finally {
        jest.useRealTimers()
      }
    })

    // T-35-107 (35-21 threat model): the Snap warning dialog is DELIBERATELY left outside
    // `frontendReadyBootWorkDone`'s guard -- a repeated informational dialog is a nuisance,
    // not the re-entrancy/data-corruption class of defect CR-02 exists to close. This test
    // pins that disposition explicitly (2 deliveries -> 2 dialogs) rather than leaving it
    // an unrecorded side effect of the fix above. ISOLATED for the same reason as the test
    // above, plus this test also needs its own `isSnap: true` override, which must not leak
    // into the (isSnap: false) assumption every other test in this file relies on.
    it('CR-02: the Snap warning dialog is allowed to repeat across two ISOLATED deliveries (T-35-107: accept)', async () => {
      let isolatedRequestRustInvoke!: jest.Mock
      let frontendReadyListener!: () => void
      // Captured so `isSnap` can be reset to `false` in `finally` below. `jest.mock`'s
      // manual-mock factory return value for `backend/constants/environment` was observed
      // (empirically, not by design) to survive ACROSS separate `jest.isolateModules()`
      // calls in this file -- a later, unrelated isolate (`REQ-34.1-07 registerAppShellFlows()
      // performs exactly one initial sync invoke`) crashed on `constants/paths.ts`'s
      // `userHome` (which only reads `env.SNAP_REAL_HOME` when `isSnap` is true) after this
      // test ran, even though that test's own mock factory literal always specifies
      // `isSnap: false`. Resetting explicitly here removes the dependency on understanding
      // (or relying on) that isolation boundary.
      let isolatedEnvRef: { isSnap: boolean } | undefined

      // `isSnap: true` (below) makes `backend/constants/paths.ts` -- a REAL, unmocked
      // module transitively required by `appShellFlowRegistration.ts` regardless of
      // which branch of `frontendReady` is under test -- take its `env.SNAP_REAL_HOME!`
      // branch for `userHome` instead of `homedir()`. That env var is unset in this test
      // environment, so without this, `join(undefined, 'Games', 'GameLib')` throws
      // synchronously while `paths.ts` evaluates its top-level exports, which crashes
      // this test's `isolateModules` callback before it ever gets to `frontendReady`.
      // Saved/restored around the isolated require so it never leaks into the real
      // process env for any other test in this file.
      const originalSnapRealHome = process.env.SNAP_REAL_HOME
      process.env.SNAP_REAL_HOME = tmpdir()
      try {
        jest.isolateModules(() => {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const isolatedEnv = require('backend/constants/environment')
          isolatedEnv.isSnap = true
          isolatedEnvRef = isolatedEnv
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const isolatedConfigGet = require('backend/config').GlobalConfig
          .get as jest.Mock
        isolatedConfigGet.mockReturnValue({
          getSettings: () => ({ language: 'en' }),
          setSetting: jest.fn(),
          set: jest.fn(),
          flush: jest.fn()
        })
        isolatedRequestRustInvoke = require('../sidecarRpc')
          .requestRustInvoke as jest.Mock
        isolatedRequestRustInvoke.mockResolvedValue(undefined)
        // Forces the `showSnapWarning` branch open on BOTH deliveries regardless of
        // whatever this fresh, tmp-dir-backed store instance already has on disk from an
        // earlier test -- the property under test is the repeat COUNT, not the store's
        // own persistence semantics.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const isolatedConfigStore = require('../../constants/key_value_stores')
          .configStore
        jest.spyOn(isolatedConfigStore, 'get').mockImplementation(((
          key: string,
          defaultValue?: unknown
        ) => (key === 'showSnapWarning' ? true : defaultValue)) as never)

        // See the "Phase 35 plan 11" test above for why this is required: `frontendReady`
        // calls `logInfo()` unconditionally, which needs `heroicLogWriter` assigned.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../../logger').initHeadless()

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { registerAppShellFlows } = require('../appShellFlowRegistration')
        registerAppShellFlows()
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const isolatedListenerRegistry = require('../../platform').listenerRegistry
        ;[frontendReadyListener] = isolatedListenerRegistry.get('frontendReady')
        })

        // `isolatedEnv.isSnap = true` above was set on the module instance obtained
        // INSIDE `jest.isolateModules` -- a fresh, throwaway copy -- so it never touches
        // the shared/outer `backend/constants/environment` mock every other test in this
        // file relies on being `isSnap: false`; no cleanup of that flag is needed here.
        frontendReadyListener()
        await flush()
        frontendReadyListener()
        await flush()

        const snapDialogCalls = isolatedRequestRustInvoke.mock.calls.filter(
          ([channel]) => channel === RUST_DIALOG_MESSAGE
        )
        expect(snapDialogCalls).toHaveLength(2)
      } finally {
        // `process.env.X = undefined` stringifies to `"undefined"` (Node coerces every
        // assignment to `process.env` to a string) rather than clearing the var, so an
        // unset original value must be restored via `delete`, not a plain assignment.
        if (originalSnapRealHome === undefined) {
          delete process.env.SNAP_REAL_HOME
        } else {
          process.env.SNAP_REAL_HOME = originalSnapRealHome
        }
        // See this test's own `isolatedEnvRef` doc comment above.
        if (isolatedEnvRef) {
          isolatedEnvRef.isSnap = false
        }
      }
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

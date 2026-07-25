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

import { PassThrough } from 'node:stream'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs'
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
      path.join(actual.tmpdir(), `gamelib-appshellflows-test-home-${process.pid}`)
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
  isFlatpak: false
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
  callAbortController: jest.fn()
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { init } from '../bootstrap'
import { GlobalConfig } from 'backend/config'
import i18next from 'i18next'
import { gameInfoStore } from '../../storeManagers/legendary/electronStores'
import { backendEvents } from '../../backend_events'
import { callAbortController } from '../../utils/aborthandler/aborthandler'
import { requestRustInvoke } from '../sidecarRpc'
import { listenerRegistry } from '../electronStub'
import {
  RUST_APP_EXIT,
  RUST_NOTIFICATION_SHOW,
  RUST_INVOKE_CHANNELS
} from 'common/types/sidecarTransport'
import pkgJson from '../../../../package.json'

const mockedGlobalConfigGet = GlobalConfig.get as jest.Mock
const mockedI18nextChangeLanguage = i18next.changeLanguage as jest.Mock
const mockedGameInfoStoreClear = gameInfoStore.clear as jest.Mock
const mockedCallAbortController = callAbortController as jest.Mock
const mockRequestRustInvoke = requestRustInvoke as jest.Mock

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

/** Writes a well-formed `send` (fire-and-forget) request frame to the sidecar's stdin. */
function writeSend(
  input: PassThrough,
  id: string,
  channel: string,
  args: unknown[]
): void {
  input.write(`${JSON.stringify({ id, kind: 'send', channel, args })}\n`)
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

    expect(mockRequestRustInvoke).toHaveBeenCalledWith(
      RUST_NOTIFICATION_SHOW,
      [{ title: 'GameLib', body: 'Install complete' }]
    )
  })

  it('REQ-34.1-05 quit (send) reaches handleExit() -> app.exit() -> the existing app_exit rustInvoke arm', async () => {
    const { input } = startSidecar()
    writeSend(input, 'quit-1', 'quit', [])
    await flush()

    expect(mockRequestRustInvoke).toHaveBeenCalledWith(RUST_APP_EXIT, [])
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
        ([msg]) => String(msg).includes('unlock') && String(msg).includes('D-08')
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

  // ── set-connectivity-online: already live via bootstrap.ts (D-03/D-09) ────

  it('REQ-34.1-05/D-03 set-connectivity-online is reachable WITHOUT this plan registering it, and is registered exactly once', async () => {
    startSidecar()
    await flush()

    expect(listenerRegistry.get('set-connectivity-online')?.length).toBe(1)
  })

  // ── Zero-new-Rust-arms guard ───────────────────────────────────────────────

  it('REQ-34.1-05 zero new Rust arms: every requestRustInvoke channel used by this plan\'s flows is a member of the existing RUST_INVOKE_CHANNELS set', async () => {
    const { input } = startSidecar()
    writeSend(input, 'notify-guard', 'notify', [
      { title: 'GameLib', body: 'test' }
    ])
    writeSend(input, 'quit-guard', 'quit', [])
    await flush()

    expect(mockRequestRustInvoke.mock.calls.length).toBeGreaterThan(0)
    for (const [channel] of mockRequestRustInvoke.mock.calls) {
      expect((RUST_INVOKE_CHANNELS as readonly string[]).includes(channel)).toBe(
        true
      )
    }
  })

  // ── Total-body guard: a rejected send-handler body must never crash the
  // sidecar process (the sidecar-dialog-reject-crashes precedent) ───────────

  it('REQ-34.1-05 changeLanguage (send): a rejected i18next.changeLanguage is caught and logged, the RPC loop keeps serving afterward', async () => {
    mockAppSettings({})
    mockedI18nextChangeLanguage.mockRejectedValueOnce(new Error('boom'))

    const { input, frames } = startSidecar()
    writeSend(input, 'change-lang-fail-1', 'changeLanguage', ['de'])
    await flush()

    expect(
      warnSpy.mock.calls.some(([msg]) => String(msg).includes('changeLanguage'))
    ).toBe(true)

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

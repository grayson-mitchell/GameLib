/**
 * Startup-attach smoke check (Phase 27 Plan 03 -- Task 2's own acceptance criterion: "a
 * startup assertion / unit check proves the attach runs first"). Proves `tauriAttach.ts`'s
 * side effect actually assigns `window.api` + the 6 preload globals on import (the
 * BLOCKER-1 fix from 27-01), unconditionally now that Tauri is the only shell (Phase 35
 * plan 17 -- the Electron branch that used to leave an already-attached `window.api`
 * untouched no longer exists, since there is no Electron preload to have set it).
 *
 * Phase 34.1 Plan 03 (D-01): `tauriAttach.ts` -> `./api` -> `./api/misc.ts` now
 * statically imports `./api/tauriWindowChrome.ts`, which in turn statically imports the
 * REAL `@tauri-apps/api/window`/`@tauri-apps/api/webview` packages. Those packages'
 * classes extend `Resource` from `@tauri-apps/api/core` at module-evaluation time, which
 * this file's existing minimal `@tauri-apps/api/core` mock (below) does not provide --
 * so they must be mocked here too, or importing `../tauriAttach` for real (as every test
 * below does) throws `Class extends value undefined is not a constructor` before any
 * assertion runs.
 *
 * Phase 34.1 Plan 07 (D-12): `tauriAttach.ts` -> `./api` -> `./api/helpers.ts` now
 * statically imports `./api/tauriChildWindows.ts`, which statically imports
 * `@tauri-apps/api/webviewWindow`. That module's own top-level code calls
 * `applyMixins(WebviewWindow, [Window, Webview])`, reading `Window.prototype`/
 * `Webview.prototype` off the REAL `@tauri-apps/api/window`/`@tauri-apps/api/webview`
 * exports -- the plain-object mocks below have no `prototype`, so without this mock the
 * import chain throws `Cannot read properties of undefined (reading 'prototype')` before
 * any assertion runs.
 */

jest.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    minimize: jest.fn(),
    maximize: jest.fn(),
    unmaximize: jest.fn(),
    close: jest.fn(),
    isMaximized: jest.fn(),
    isMinimized: jest.fn(),
    setFullscreen: jest.fn(),
    setDecorations: jest.fn(),
    startDragging: jest.fn(),
    toggleMaximize: jest.fn()
  })
}))

jest.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ setZoom: jest.fn() })
}))

jest.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: jest.fn()
}))

// tauriAttach.ts's top-level code reads/assigns `window`/`navigator` immediately on
// import -- provide minimal stubs since this project's preload Jest environment is
// 'node' (no real DOM; jsdom isn't installed, per the frontend project's own documented
// constraint in src/frontend/jest.config.js).
function installWindowStub(navigatorOverrides?: { platform?: string; userAgent?: string }) {
  ;(globalThis as unknown as { window: Record<string, unknown> }).window = {}
  ;(globalThis as unknown as { navigator: { platform: string; userAgent: string } }).navigator = {
    platform: navigatorOverrides?.platform ?? 'MacIntel',
    userAgent: navigatorOverrides?.userAgent ?? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
  }
}

function readWindowStub() {
  return (
    globalThis as unknown as {
      window: {
        api?: unknown
        isSteamDeckGameMode?: boolean
        isFlatpak?: boolean
        isSteamDeck?: boolean
        platform?: string
        isE2ETesting?: boolean
        flatpakRuntimeVersion?: string
      }
    }
  ).window
}

describe('tauriAttach (BLOCKER-1 fix, 27-01)', () => {
  afterEach(() => {
    jest.resetModules()
    delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  })

  it('attaches window.api + the 6 preload globals synchronously on import', async () => {
    installWindowStub()
    jest.doMock('@tauri-apps/api/core', () => ({
      invoke: jest.fn()
    }))

    await import('../tauriAttach')

    const win = readWindowStub()
    expect(typeof win.api).toBe('object')
    expect(win.isSteamDeckGameMode).toBe(false)
    expect(win.isFlatpak).toBe(false)
    expect(win.isSteamDeck).toBe(false)
    expect(win.platform).toBe('darwin')
    expect(win.isE2ETesting).toBe(false)
  })

  it('overwrites an already-present window.api on import (Phase 35 plan 17: Tauri is the only shell now, so there is no preload left to leave it untouched for)', async () => {
    installWindowStub()
    // Historically an already-present window.api meant an Electron preload's contextBridge
    // had already run, and this module correctly no-op'd. That branch is gone: attach is now
    // unconditional, so a pre-existing window.api (e.g. a stray HMR re-attach) gets replaced,
    // not preserved. This test pins that the collapse went the correct direction (T-35-79):
    // the Tauri body survives and always runs, rather than accidentally keeping the old
    // Electron no-op behavior.
    const staleApi = { sentinel: 'stale-pre-existing-api' }
    ;(readWindowStub() as { api?: unknown }).api = staleApi
    jest.doMock('@tauri-apps/api/core', () => ({
      invoke: jest.fn()
    }))

    await import('../tauriAttach')

    const win = readWindowStub()
    expect(win.api).not.toBe(staleApi)
    expect(typeof win.api).toBe('object')
    expect(win.isSteamDeckGameMode).toBe(false)
  })

  // Phase 35 gap closure, plan 35-22 (CR-03): window.platform's three-arm derivation.
  // These pin all three reachable outcomes plus the never-throw contract, so the
  // 'win32' arm cannot silently regress back to always-'linux'.
  describe('window.platform derivation (CR-03)', () => {
    it("resolves to 'darwin' for a mac navigator.platform", async () => {
      installWindowStub({ platform: 'MacIntel', userAgent: 'Macintosh' })
      jest.doMock('@tauri-apps/api/core', () => ({ invoke: jest.fn() }))

      await import('../tauriAttach')

      expect(readWindowStub().platform).toBe('darwin')
    })

    it("resolves to 'win32' when navigator.platform is 'Win32'", async () => {
      installWindowStub({ platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })
      jest.doMock('@tauri-apps/api/core', () => ({ invoke: jest.fn() }))

      await import('../tauriAttach')

      expect(readWindowStub().platform).toBe('win32')
    })

    it("resolves to 'win32' from the userAgent signal alone, proving the second signal is live and not decorative", async () => {
      // navigator.platform deliberately does NOT match /win/i here -- only the UA carries
      // the Windows signal, matching a frozen/deprecated navigator.platform on WebView2.
      installWindowStub({ platform: 'unknown-engine', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })
      jest.doMock('@tauri-apps/api/core', () => ({ invoke: jest.fn() }))

      await import('../tauriAttach')

      expect(readWindowStub().platform).toBe('win32')
    })

    it("resolves to 'linux' when neither signal matches", async () => {
      installWindowStub({ platform: 'Linux x86_64', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })
      jest.doMock('@tauri-apps/api/core', () => ({ invoke: jest.fn() }))

      await import('../tauriAttach')

      expect(readWindowStub().platform).toBe('linux')
    })

    it("resolves to 'linux' when reading navigator throws, proving the never-throw contract", async () => {
      ;(globalThis as unknown as { window: Record<string, unknown> }).window = {}
      // A navigator whose property accessors throw simulates a hostile/broken embedder --
      // isMacWebview()/isWindowsWebview() must swallow this and fall through to 'linux'
      // rather than blanking the window (SEAM Invariant A).
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        get() {
          throw new Error('navigator access denied')
        }
      })
      jest.doMock('@tauri-apps/api/core', () => ({ invoke: jest.fn() }))

      await import('../tauriAttach')

      expect(readWindowStub().platform).toBe('linux')

      // Restore a normal navigator descriptor so subsequent tests in this file are unaffected.
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        writable: true,
        value: { platform: 'MacIntel', userAgent: 'Macintosh' }
      })
    })
  })
})

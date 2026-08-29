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
function installWindowStub() {
  ;(globalThis as unknown as { window: Record<string, unknown> }).window = {}
  ;(globalThis as unknown as { navigator: { platform: string } }).navigator = {
    platform: 'MacIntel'
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
})

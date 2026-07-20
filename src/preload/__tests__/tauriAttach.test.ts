/**
 * Startup-attach smoke check (Phase 27 Plan 03 -- Task 2's own acceptance criterion: "a
 * startup assertion / unit check proves the attach runs first"). Proves `tauriAttach.ts`'s
 * side effect actually assigns `window.api` + the 6 preload globals when `isTauri()` is
 * true (the BLOCKER-1 fix from 27-01), and does nothing when it's false (Electron path
 * unaffected -- the real preload script attaches window.api on its own, independently).
 */

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
    // Phase 27 Plan 05: tauriTransport's isTauri() now keys off this ground-truth global.
    delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  })

  it('attaches window.api + the 6 preload globals synchronously on import when isTauri() is true', async () => {
    installWindowStub()
    // Simulate a real Tauri webview: isTauri() detects the runtime-injected internals object.
    ;(globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {}
    jest.doMock('@tauri-apps/api/core', () => ({
      isTauri: () => true,
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

  it('leaves an already-attached window.api untouched when not in Tauri (Electron path unaffected)', async () => {
    installWindowStub()
    // Simulate Electron: the real preload's contextBridge already set window.api before the
    // renderer bundle runs. No __TAURI_INTERNALS__ => isTauri() false. tauriAttach must NOT
    // overwrite the existing api nor apply the Tauri global fallbacks.
    const electronApi = { sentinel: 'electron-preload-api' }
    ;(readWindowStub() as { api?: unknown }).api = electronApi
    jest.doMock('@tauri-apps/api/core', () => ({
      isTauri: () => false,
      invoke: jest.fn()
    }))

    await import('../tauriAttach')

    const win = readWindowStub()
    expect(win.api).toBe(electronApi) // not overwritten
    expect(win.isSteamDeckGameMode).toBeUndefined() // Tauri fallbacks not applied
  })

  it('attaches window.api even when isTauri() is false, as long as no api is already present (Tauri detection false-negative robustness)', async () => {
    installWindowStub()
    // No __TAURI_INTERNALS__ (isTauri() false) AND no pre-existing window.api: this models a
    // real Tauri webview where runtime detection failed. The `!apiAlreadyPresent` clause must
    // still attach so window.api is defined before the app reads it (the Phase 27 Plan 05 fix).
    jest.doMock('@tauri-apps/api/core', () => ({
      isTauri: () => false,
      invoke: jest.fn()
    }))

    await import('../tauriAttach')

    const win = readWindowStub()
    expect(typeof win.api).toBe('object')
    expect(win.platform).toBe('darwin')
    expect(win.isSteamDeckGameMode).toBe(false)
  })
})

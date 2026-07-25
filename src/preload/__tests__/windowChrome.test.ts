/**
 * Tauri window-chrome contract test (Phase 34.1 Plan 03, REQ-34.1-01).
 *
 * Mirrors `tauriTransport.test.ts`'s mocking style: `electron` is proven never
 * resolved, and each of the ten D-01 renderer-side implementations is proven to call
 * exactly its own Tauri window/webview method with the right arguments -- including
 * the two "obvious but wrong" traps this module's own comments name (`isFullscreen`,
 * `setZoomFactor`).
 *
 * jest.config sets `resetMocks: true` (see `tauriTransport.test.ts`'s own comment on
 * this) -- every `jest.fn()` below, including ones created inside a `jest.mock(...)`
 * factory, loses its implementation before each test. Every mock return value this
 * file depends on is therefore (re)established in `beforeEach`, never assumed to
 * survive from the factory's own initializer.
 */

jest.mock('electron', () => {
  throw new Error('electron must not be resolved on the Tauri path (T-27-07)')
})

const mockWindow = {
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
}

const mockWebview = {
  setZoom: jest.fn()
}

const getCurrentWindow = jest.fn()
const getCurrentWebview = jest.fn()

jest.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => getCurrentWindow()
}))

jest.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => getCurrentWebview()
}))

jest.mock('../tauriTransport', () => ({
  isTauri: jest.fn(() => true),
  snapshotGet: jest.fn()
}))

import {
  tauriMinimizeWindow,
  tauriMaximizeWindow,
  tauriUnmaximizeWindow,
  tauriCloseWindow,
  tauriIsMaximized,
  tauriIsMinimized,
  tauriIsFullscreen,
  tauriSetFullscreen,
  tauriIsFrameless,
  tauriSetZoomFactor
} from '../api/tauriWindowChrome'
import { snapshotGet } from '../tauriTransport'

const mockedSnapshotGet = snapshotGet as jest.MockedFunction<typeof snapshotGet>

// The preload jest project's testEnvironment is 'node' (jest-environment-jsdom is not
// installed -- see src/frontend/jest.config.js's own documented constraint). This
// module reads `window.screen.availWidth` and `window.isSteamDeckGameMode` inside
// function bodies only (never at import time), so a minimal manual stub -- mirroring
// tauriAttach.test.ts's own `installWindowStub()` pattern -- is sufficient.
;(
  globalThis as unknown as {
    window: { screen: { availWidth: number }; isSteamDeckGameMode?: boolean }
  }
).window = { screen: { availWidth: 1024 } }

describe('tauriWindowChrome (REQ-34.1-01)', () => {
  beforeEach(() => {
    getCurrentWindow.mockReturnValue(mockWindow)
    getCurrentWebview.mockReturnValue(mockWebview)
    mockWindow.minimize.mockResolvedValue(undefined)
    mockWindow.maximize.mockResolvedValue(undefined)
    mockWindow.unmaximize.mockResolvedValue(undefined)
    mockWindow.close.mockResolvedValue(undefined)
    mockWindow.isMaximized.mockResolvedValue(false)
    mockWindow.isMinimized.mockResolvedValue(false)
    mockWindow.setFullscreen.mockResolvedValue(undefined)
    mockWindow.setDecorations.mockResolvedValue(undefined)
    mockWindow.startDragging.mockResolvedValue(undefined)
    mockWindow.toggleMaximize.mockResolvedValue(undefined)
    mockWebview.setZoom.mockResolvedValue(undefined)
    mockedSnapshotGet.mockReturnValue(undefined)
    delete (window as { isSteamDeckGameMode?: boolean }).isSteamDeckGameMode
  })

  it('REQ-34.1-01: tauriMinimizeWindow calls Window.minimize exactly once with no arguments', () => {
    tauriMinimizeWindow()
    expect(mockWindow.minimize).toHaveBeenCalledTimes(1)
    expect(mockWindow.minimize).toHaveBeenCalledWith()
  })

  it('REQ-34.1-01: tauriMaximizeWindow calls Window.maximize exactly once with no arguments', () => {
    tauriMaximizeWindow()
    expect(mockWindow.maximize).toHaveBeenCalledTimes(1)
    expect(mockWindow.maximize).toHaveBeenCalledWith()
  })

  it('REQ-34.1-01: tauriUnmaximizeWindow calls Window.unmaximize exactly once with no arguments', () => {
    tauriUnmaximizeWindow()
    expect(mockWindow.unmaximize).toHaveBeenCalledTimes(1)
    expect(mockWindow.unmaximize).toHaveBeenCalledWith()
  })

  it('REQ-34.1-01: tauriCloseWindow calls Window.close exactly once with no arguments', () => {
    tauriCloseWindow()
    expect(mockWindow.close).toHaveBeenCalledTimes(1)
    expect(mockWindow.close).toHaveBeenCalledWith()
  })

  it('REQ-34.1-01: tauriSetFullscreen(true) forwards true to Window.setFullscreen', () => {
    tauriSetFullscreen(true)
    expect(mockWindow.setFullscreen).toHaveBeenCalledWith(true)
  })

  it('REQ-34.1-01: tauriSetFullscreen(false) forwards false to Window.setFullscreen', () => {
    tauriSetFullscreen(false)
    expect(mockWindow.setFullscreen).toHaveBeenCalledWith(false)
  })

  it('REQ-34.1-01: tauriIsMaximized resolves the mocked boolean', async () => {
    mockWindow.isMaximized.mockResolvedValue(true)
    await expect(tauriIsMaximized()).resolves.toBe(true)
  })

  it('REQ-34.1-01: tauriIsMinimized resolves the mocked boolean', async () => {
    mockWindow.isMinimized.mockResolvedValue(true)
    await expect(tauriIsMinimized()).resolves.toBe(true)
  })

  it('REQ-34.1-01: tauriIsFullscreen resolves false when window.isSteamDeckGameMode is false, and never calls the Window API', async () => {
    ;(window as { isSteamDeckGameMode?: boolean }).isSteamDeckGameMode = false
    await expect(tauriIsFullscreen()).resolves.toBe(false)
    expect(getCurrentWindow).not.toHaveBeenCalled()
  })

  it('REQ-34.1-01: tauriIsFullscreen resolves true when window.isSteamDeckGameMode is true, and never calls the Window API', async () => {
    ;(window as { isSteamDeckGameMode?: boolean }).isSteamDeckGameMode = true
    await expect(tauriIsFullscreen()).resolves.toBe(true)
    expect(getCurrentWindow).not.toHaveBeenCalled()
  })

  it('REQ-34.1-01: tauriIsFrameless resolves false when the settings snapshot has no framelessWindow, and never calls the Window API', async () => {
    mockedSnapshotGet.mockReturnValue(undefined)
    await expect(tauriIsFrameless()).resolves.toBe(false)
    expect(getCurrentWindow).not.toHaveBeenCalled()
  })

  it('REQ-34.1-01: tauriIsFrameless resolves true when the settings snapshot has framelessWindow true, and never calls the Window API', async () => {
    mockedSnapshotGet.mockReturnValue({ framelessWindow: true })
    await expect(tauriIsFrameless()).resolves.toBe(true)
    expect(getCurrentWindow).not.toHaveBeenCalled()
  })

  it('REQ-34.1-01: tauriSetZoomFactor("1") at availWidth=1920 calls setZoom with a value within 1e-9 of 1', () => {
    Object.defineProperty(window.screen, 'availWidth', {
      value: 1920,
      configurable: true
    })
    tauriSetZoomFactor('1')
    const [value] = mockWebview.setZoom.mock.calls[0]
    expect(Math.abs(value - 1)).toBeLessThan(1e-9)
  })

  it('REQ-34.1-01: tauriSetZoomFactor("1.5") at availWidth=1920 calls setZoom with Math.pow(1.2, 2.5)', () => {
    Object.defineProperty(window.screen, 'availWidth', {
      value: 1920,
      configurable: true
    })
    tauriSetZoomFactor('1.5')
    const [value] = mockWebview.setZoom.mock.calls[0]
    expect(value).toBeCloseTo(Math.pow(1.2, 2.5), 9)
  })

  it('REQ-34.1-01: tauriSetZoomFactor("1") at availWidth=900 calls setZoom with Math.pow(1.2, (900/1200 - 1) / 0.2)', () => {
    Object.defineProperty(window.screen, 'availWidth', {
      value: 900,
      configurable: true
    })
    tauriSetZoomFactor('1')
    const [value] = mockWebview.setZoom.mock.calls[0]
    expect(value).toBeCloseTo(Math.pow(1.2, (900 / 1200 - 1) / 0.2), 9)
  })

  it('REQ-34.1-01: tauriSetZoomFactor("nonsense") falls back to the f=1 result and does not call setZoom with NaN', () => {
    Object.defineProperty(window.screen, 'availWidth', {
      value: 1920,
      configurable: true
    })
    tauriSetZoomFactor('nonsense')
    const [value] = mockWebview.setZoom.mock.calls[0]
    expect(Number.isNaN(value)).toBe(false)
    expect(Math.abs(value - 1)).toBeLessThan(1e-9)
  })

  it('REQ-34.1-01: getCurrentWindow is never called by tauriSetZoomFactor', () => {
    tauriSetZoomFactor('1')
    expect(getCurrentWindow).not.toHaveBeenCalled()
  })

  it('REQ-34.1-01: getCurrentWebview is never called by any of the other nine window-only exports', async () => {
    tauriMinimizeWindow()
    tauriMaximizeWindow()
    tauriUnmaximizeWindow()
    tauriCloseWindow()
    tauriSetFullscreen(true)
    await tauriIsMaximized()
    await tauriIsMinimized()
    await tauriIsFullscreen()
    await tauriIsFrameless()
    expect(getCurrentWebview).not.toHaveBeenCalled()
  })
})

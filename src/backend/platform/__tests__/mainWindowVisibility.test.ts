/**
 * app.hideMainWindow / raiseMainWindowIfHiddenByGameLib (quick 261108-kpc). The real platform
 * module runs; only the Rust transport (`requestRustInvoke`) is faked.
 */
jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(actual.tmpdir(), `gamelib-mainwindowvis-home-${process.pid}`)
  }
})

jest.mock('backend/store_backend', () => ({
  __esModule: true,
  default: jest.requireActual('../../sidecar/fileStore').default
}))

jest.mock('../../sidecar/sidecarRpc', () => ({
  requestRustInvoke: jest.fn()
}))

import { app, dialog } from '../../platform'
import { requestRustInvoke } from '../../sidecar/sidecarRpc'
import {
  RUST_MAIN_WINDOW_HIDE,
  RUST_MAIN_WINDOW_RAISE,
  RUST_INVOKE_CHANNELS
} from 'common/types/sidecarTransport'

const invoke = requestRustInvoke as jest.Mock
let warnSpy: jest.SpyInstance

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const channels = () => invoke.mock.calls.map((call) => call[0])

beforeEach(() => {
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  invoke.mockImplementation(() => Promise.resolve(null))
  // Clear the module-level flag left by a previous test.
  app.raiseMainWindow()
  invoke.mockClear()
})

describe('app main-window visibility helpers', () => {
  it('hideMainWindow invokes RUST_MAIN_WINDOW_HIDE once with no args', async () => {
    app.hideMainWindow()
    await flush()
    expect(invoke.mock.calls).toEqual([[RUST_MAIN_WINDOW_HIDE, []]])
  })

  it('RUST_MAIN_WINDOW_HIDE is on the invoke allowlist', () => {
    expect(
      (RUST_INVOKE_CHANNELS as readonly string[]).includes(
        RUST_MAIN_WINDOW_HIDE
      )
    ).toBe(true)
  })

  it('a rejected hide only warns and never throws', async () => {
    invoke.mockImplementation(() => Promise.reject(new Error('boom')))
    expect(() => app.hideMainWindow()).not.toThrow()
    await flush()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain(RUST_MAIN_WINDOW_HIDE)
  })

  it('raiseMainWindowIfHiddenByGameLib is a no-op when GameLib did not hide', async () => {
    app.raiseMainWindowIfHiddenByGameLib()
    await flush()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('raises once after a hide, then is a no-op', async () => {
    app.hideMainWindow()
    invoke.mockClear()
    app.raiseMainWindowIfHiddenByGameLib()
    app.raiseMainWindowIfHiddenByGameLib()
    await flush()
    expect(channels()).toEqual([RUST_MAIN_WINDOW_RAISE])
  })

  it('raiseMainWindowForInAppDialog counts only a raise of a GameLib-hidden window', async () => {
    const before = app.inAppDialogRaiseCount()
    app.raiseMainWindowForInAppDialog()
    expect(app.inAppDialogRaiseCount()).toBe(before)
    app.hideMainWindow()
    app.raiseMainWindowForInAppDialog()
    app.raiseMainWindowForInAppDialog()
    await flush()
    expect(app.inAppDialogRaiseCount()).toBe(before + 1)
  })

  it('an explicit raiseMainWindow clears the flag', async () => {
    app.hideMainWindow()
    app.raiseMainWindow()
    invoke.mockClear()
    app.raiseMainWindowIfHiddenByGameLib()
    await flush()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('dialog.showMessageBox and showErrorBox raise a GameLib-hidden window first', async () => {
    app.hideMainWindow()
    invoke.mockClear()
    await dialog.showMessageBox({ message: 'm', buttons: ['a', 'b'] })
    expect(channels()[0]).toBe(RUST_MAIN_WINDOW_RAISE)

    app.hideMainWindow()
    invoke.mockClear()
    await dialog.showErrorBox('t', 'c')
    expect(channels()[0]).toBe(RUST_MAIN_WINDOW_RAISE)
  })
})

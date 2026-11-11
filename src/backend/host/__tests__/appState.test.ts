import { createAppState } from '../appState'
import type { RequestRustInvoke } from '../index'
import {
  RUST_APP_EXIT,
  RUST_APP_RELAUNCH,
  RUST_CLIPBOARD_WRITE_TEXT,
  RUST_INVOKE_CHANNELS,
  RUST_MAIN_WINDOW_HIDE,
  RUST_MAIN_WINDOW_RAISE,
  RUST_WAKE_LOCK_START,
  RUST_WAKE_LOCK_STOP
} from 'common/types/sidecarTransport'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
let warn: jest.SpyInstance
beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => warn.mockRestore())

function build(
  impl: (channel: string) => Promise<unknown> = () => Promise.resolve(null)
) {
  const invoke = jest.fn((channel: string, _args: unknown[]) => impl(channel))
  const state = createAppState({
    requestRustInvoke: invoke as unknown as RequestRustInvoke
  })
  return { invoke, state, channels: () => invoke.mock.calls.map((c) => c[0]) }
}

describe('main-window visibility', () => {
  it('hideMainWindow invokes RUST_MAIN_WINDOW_HIDE once with no args', async () => {
    const t = build()
    t.state.hideMainWindow()
    await flush()
    expect(t.invoke.mock.calls).toEqual([[RUST_MAIN_WINDOW_HIDE, []]])
  })

  it('RUST_MAIN_WINDOW_HIDE is on the invoke allowlist', () => {
    expect(
      (RUST_INVOKE_CHANNELS as readonly string[]).includes(
        RUST_MAIN_WINDOW_HIDE
      )
    ).toBe(true)
  })

  it('a rejected hide only warns and never throws', async () => {
    const t = build(() => Promise.reject(new Error('boom')))
    expect(() => t.state.hideMainWindow()).not.toThrow()
    await flush()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain(RUST_MAIN_WINDOW_HIDE)
  })

  it('raiseMainWindowIfHiddenByGameLib is a no-op when GameLib did not hide', async () => {
    const t = build()
    t.state.raiseMainWindowIfHiddenByGameLib()
    await flush()
    expect(t.invoke).not.toHaveBeenCalled()
  })

  it('raises once after a hide, then is a no-op', async () => {
    const t = build()
    t.state.hideMainWindow()
    t.invoke.mockClear()
    t.state.raiseMainWindowIfHiddenByGameLib()
    t.state.raiseMainWindowIfHiddenByGameLib()
    await flush()
    expect(t.channels()).toEqual([RUST_MAIN_WINDOW_RAISE])
  })

  it('raiseMainWindowForInAppDialog counts only a raise of a GameLib-hidden window', async () => {
    const t = build()
    t.state.raiseMainWindowForInAppDialog()
    expect(t.state.inAppDialogRaiseCount()).toBe(0)
    t.state.hideMainWindow()
    t.state.raiseMainWindowForInAppDialog()
    t.state.raiseMainWindowForInAppDialog()
    await flush()
    expect(t.state.inAppDialogRaiseCount()).toBe(1)
  })

  it('an explicit raiseMainWindow clears the mark', async () => {
    const t = build()
    t.state.hideMainWindow()
    t.state.raiseMainWindow()
    t.invoke.mockClear()
    t.state.raiseMainWindowIfHiddenByGameLib()
    await flush()
    expect(t.invoke).not.toHaveBeenCalled()
  })

  it('two instances never share state', async () => {
    const a = build()
    const b = build()
    a.state.hideMainWindow()
    b.state.raiseMainWindowIfHiddenByGameLib()
    await flush()
    expect(b.invoke).not.toHaveBeenCalled()
  })
})

describe('relaunch single-flight', () => {
  it('suppresses quit and exit while a relaunch is in flight', async () => {
    const t = build(() => new Promise(() => {}))
    t.state.relaunch()
    t.state.quit()
    t.state.exit()
    await flush()
    expect(t.channels()).toEqual([RUST_APP_RELAUNCH])
  })

  it('a second relaunch is still forwarded but quit stays suppressed', async () => {
    const t = build(() => new Promise(() => {}))
    t.state.relaunch()
    t.state.relaunch()
    t.state.quit()
    expect(t.channels()).not.toContain(RUST_APP_EXIT)
  })

  it('clears the latch when the relaunch rejects', async () => {
    const t = build((channel) =>
      channel === RUST_APP_RELAUNCH
        ? Promise.reject(new Error('fail'))
        : Promise.resolve(null)
    )
    t.state.relaunch()
    await flush()
    t.state.quit()
    await flush()
    expect(t.channels()).toContain(RUST_APP_EXIT)
  })

  it('quit forwards RUST_APP_EXIT without a relaunch', async () => {
    const t = build()
    t.state.quit()
    await flush()
    expect(t.channels()).toEqual([RUST_APP_EXIT])
  })
})

describe('wakeLock', () => {
  it('start returns increasing ids from 1 and isStarted reflects the map', async () => {
    const t = build(() => Promise.resolve(41))
    expect(t.state.wakeLock.isStarted()).toBe(false)
    const first = t.state.wakeLock.start('prevent-display-sleep')
    const second = t.state.wakeLock.start('prevent-app-suspension')
    expect(first).toBe(1)
    expect(second).toBe(2)
    expect(t.state.wakeLock.isStarted()).toBe(true)
    await flush()
    t.state.wakeLock.stop(first)
    t.state.wakeLock.stop(second)
    expect(t.state.wakeLock.isStarted()).toBe(false)
    expect(t.channels().filter((c) => c === RUST_WAKE_LOCK_STOP)).toHaveLength(
      2
    )
  })

  it('stop on a missing id is a no-op', () => {
    const t = build()
    t.state.wakeLock.stop(99)
    expect(t.invoke).not.toHaveBeenCalled()
  })

  it('a rejected start deletes its entry', async () => {
    const t = build(() => Promise.reject(new Error('no')))
    const id = t.state.wakeLock.start('prevent-display-sleep')
    await flush()
    expect(t.state.wakeLock.isStarted()).toBe(false)
    t.state.wakeLock.stop(id)
    expect(t.channels()).toEqual([RUST_WAKE_LOCK_START])
  })

  it('a stop that lands before start resolves releases the assertion', async () => {
    let resolveStart: (v: unknown) => void = () => {}
    const t = build((channel) =>
      channel === RUST_WAKE_LOCK_START
        ? new Promise((resolve) => {
            resolveStart = resolve
          })
        : Promise.resolve(null)
    )
    const id = t.state.wakeLock.start('prevent-display-sleep')
    t.state.wakeLock.stop(id)
    resolveStart(7)
    await flush()
    expect(t.invoke).toHaveBeenCalledWith(RUST_WAKE_LOCK_STOP, [7])
  })
})

describe('clipboard and bridge picker', () => {
  it('writeClipboardText forwards and swallows a rejection', async () => {
    const t = build(() => Promise.reject(new Error('x')))
    expect(() => t.state.writeClipboardText('hi')).not.toThrow()
    await flush()
    expect(t.invoke).toHaveBeenCalledWith(RUST_CLIPBOARD_WRITE_TEXT, ['hi'])
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('openBridgeInvitePicker resolves true, or false after a warn', async () => {
    await expect(
      build().state.openBridgeInvitePicker({ appId: '1', ackId: 'a' })
    ).resolves.toBe(true)
    await expect(
      build(() => Promise.reject(new Error('x'))).state.openBridgeInvitePicker({
        appId: '1',
        ackId: 'a'
      })
    ).resolves.toBe(false)
  })
})

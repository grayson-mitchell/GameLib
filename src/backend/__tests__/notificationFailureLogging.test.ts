/**
 * Quick task 261023-vkv: a rejected `notification_show` rustInvoke must reach `logWarning`
 * (via the stub Notification's Electron-shaped 'failed' event, consumed by dialog.ts notify()),
 * and an authorization denial is logged once per process.
 */
const mockRequestRustInvoke = jest.fn()
const mockLogWarning = jest.fn()

jest.mock('../sidecar/sidecarRpc', () => ({
  requestRustInvoke: (...args: unknown[]) => mockRequestRustInvoke(...args)
}))
jest.mock('backend/logger', () => ({
  LogPrefix: { Backend: 'Backend' },
  logInfo: jest.fn(),
  logWarning: (...args: unknown[]) => mockLogWarning(...args)
}))
jest.mock('backend/constants/environment', () => ({
  isSteamDeckGameMode: false
}))
jest.mock('../main_window', () => ({ getMainWindow: () => undefined }))
jest.mock('../ipc', () => ({ sendFrontendMessage: jest.fn() }))

type Notify = (n: { title: string; body: string }) => void

/* eslint-disable @typescript-eslint/no-require-imports -- jest.isolateModules needs sync require */
function loadNotify(): { notify: Notify; Notification: any } {
  let loaded: any
  jest.isolateModules(() => {
    loaded = {
      notify: require('../dialog/dialog').notify,
      Notification: require('backend/platform').Notification
    }
  })
  return loaded
}

/* eslint-enable @typescript-eslint/no-require-imports */

const flush = () => new Promise((resolve) => setImmediate(resolve))

describe('notification failure logging', () => {
  beforeEach(() => {
    mockRequestRustInvoke.mockReset()
    mockLogWarning.mockReset()
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  })
  afterEach(() => jest.restoreAllMocks())

  it("stub on('failed') receives (event, message), never throws, still warns", async () => {
    const { Notification } = loadNotify()
    mockRequestRustInvoke.mockRejectedValue(
      new Error('notification:delivery-failed: x')
    )
    const listener = jest.fn()
    const n = new Notification({ title: 't', body: 'b' })
    expect(n.on('failed', listener)).toBe(n)
    expect(n.on('click', () => undefined)).toBe(n)
    n.show()
    await flush()
    expect(listener).toHaveBeenCalledWith(
      expect.anything(),
      'notification:delivery-failed: x'
    )
    expect(console.warn).toHaveBeenCalled()
  })

  it('a throwing failed listener does not escape', async () => {
    const { Notification } = loadNotify()
    mockRequestRustInvoke.mockRejectedValue(new Error('e'))
    const n = new Notification({})
    n.on('failed', () => {
      throw new Error('boom')
    })
    n.show()
    await flush()
  })

  it('delivery-failed is logged via logWarning every time', async () => {
    const { notify } = loadNotify()
    mockRequestRustInvoke.mockRejectedValue(
      new Error('notification:delivery-failed: x')
    )
    notify({ title: 'Game', body: 'b' })
    notify({ title: 'Game', body: 'b' })
    await flush()
    expect(mockLogWarning).toHaveBeenCalledTimes(2)
    expect(mockLogWarning.mock.calls[0][0]).toContain('"Game"')
    expect(mockLogWarning.mock.calls[0][0]).toContain(
      'notification:delivery-failed: x'
    )
    expect(mockLogWarning.mock.calls[0][1]).toBe('Backend')
  })

  it('authorization-denied is logged only once', async () => {
    const { notify } = loadNotify()
    mockRequestRustInvoke.mockRejectedValue(
      new Error('notification:authorization-denied')
    )
    notify({ title: 'A', body: 'b' })
    await flush()
    notify({ title: 'B', body: 'b' })
    await flush()
    expect(mockLogWarning).toHaveBeenCalledTimes(1)
    expect(mockLogWarning.mock.calls[0][0]).toContain('System Settings')
  })

  it('success calls no listener and logs nothing', async () => {
    const { notify } = loadNotify()
    mockRequestRustInvoke.mockResolvedValue(null)
    notify({ title: 'A', body: 'b' })
    await flush()
    expect(mockLogWarning).not.toHaveBeenCalled()
  })
})

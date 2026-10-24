/**
 * Quick task 261023-vkv: a rejected `notification_show` rustInvoke must reach `logWarning`
 * (via the stub Notification's Electron-shaped 'failed' event, consumed by dialog.ts notify()),
 * and an authorization denial is logged once per process.
 */
const mockRequestRustInvoke = jest.fn()
const mockLogWarning = jest.fn()
const mockLogInfo = jest.fn()

jest.mock('../sidecar/sidecarRpc', () => ({
  requestRustInvoke: (...args: unknown[]) => mockRequestRustInvoke(...args)
}))
jest.mock('backend/logger', () => ({
  LogPrefix: { Backend: 'Backend' },
  logInfo: (...args: unknown[]) => mockLogInfo(...args),
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
    mockLogInfo.mockReset()
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

  it("stub on('show') receives (event, backend label) on success", async () => {
    const { Notification } = loadNotify()
    mockRequestRustInvoke.mockResolvedValue('user-notifications')
    const show = jest.fn()
    const failed = jest.fn()
    const n = new Notification({ title: 't', body: 'b' })
    n.on('show', show)
    n.on('failed', failed)
    n.show()
    await flush()
    expect(show).toHaveBeenCalledWith(expect.anything(), 'user-notifications')
    expect(failed).not.toHaveBeenCalled()
  })

  it("stub on('show') gets undefined when the shell resolves null", async () => {
    const { Notification } = loadNotify()
    mockRequestRustInvoke.mockResolvedValue(null)
    const show = jest.fn()
    const n = new Notification({})
    n.on('show', show)
    n.show()
    await flush()
    expect(show).toHaveBeenCalledWith(expect.anything(), undefined)
  })

  it('a throwing show listener does not escape', async () => {
    const { Notification } = loadNotify()
    mockRequestRustInvoke.mockResolvedValue('plugin')
    const n = new Notification({})
    n.on('show', () => {
      throw new Error('boom')
    })
    n.show()
    await flush()
  })

  it('user-notifications success logs "accepted by UserNotifications"', async () => {
    const { notify } = loadNotify()
    mockRequestRustInvoke.mockResolvedValue('user-notifications')
    notify({ title: 'A', body: 'secret-body' })
    await flush()
    expect(mockLogInfo).toHaveBeenCalledWith(
      'notify(): "A" accepted by UserNotifications',
      'Backend'
    )
    expect(mockLogWarning).not.toHaveBeenCalled()
    expect(JSON.stringify(mockLogInfo.mock.calls)).not.toContain('secret-body')
  })

  it('plugin success logs the not-confirmable hand-off', async () => {
    const { notify } = loadNotify()
    mockRequestRustInvoke.mockResolvedValue('plugin')
    notify({ title: 'A', body: 'b' })
    await flush()
    expect(mockLogInfo).toHaveBeenCalledWith(
      'notify(): "A" handed to tauri-plugin-notification (delivery not confirmable)',
      'Backend'
    )
    expect(mockLogWarning).not.toHaveBeenCalled()
  })

  it('a null resolve logs a generic not-confirmable hand-off', async () => {
    const { notify } = loadNotify()
    mockRequestRustInvoke.mockResolvedValue(null)
    notify({ title: 'A', body: 'b' })
    await flush()
    expect(mockLogInfo).toHaveBeenCalledWith(
      'notify(): "A" handed off (delivery not confirmable)',
      'Backend'
    )
    expect(mockLogWarning).not.toHaveBeenCalled()
  })
})

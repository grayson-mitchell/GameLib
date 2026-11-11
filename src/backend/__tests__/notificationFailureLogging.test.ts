/**
 * Quick task 261023-vkv: a rejected `notification_show` rustInvoke must reach `logWarning`
 * (via the host notifications service's `onFailed` callback, consumed by dialog.ts notify()),
 * and an authorization denial is logged once per process.
 */
import { createTestHostServices } from '../testUtils/testHostServices'

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
jest.mock('../ipc', () => ({ sendFrontendMessage: jest.fn() }))

type Notify = (n: { title: string; body: string }) => void

/* eslint-disable @typescript-eslint/no-require-imports -- jest.isolateModules needs sync require */
function loadNotify(): { notify: Notify } {
  let loaded: any
  jest.isolateModules(() => {
    const host = createTestHostServices({
      rustInvoke: (channel, args) =>
        mockRequestRustInvoke(channel, args) as Promise<unknown>
    })
    const realNotify = require('../dialog/dialog').notify
    loaded = {
      notify: (n: Parameters<Notify>[0]) =>
        realNotify({ notifications: host.notifications }, n)
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

  it('a bare user-notifications label (older shell) logs "accepted by UserNotifications" without settings', async () => {
    const { notify } = loadNotify()
    mockRequestRustInvoke.mockResolvedValue('user-notifications')
    notify({ title: 'A', body: 'secret-body' })
    await flush()
    expect(mockLogInfo).toHaveBeenCalledWith(
      'notify(): "A" accepted by UserNotifications (presentation settings not reported; display not confirmable)',
      'Backend'
    )
    expect(mockLogWarning).not.toHaveBeenCalled()
    expect(JSON.stringify(mockLogInfo.mock.calls)).not.toContain('secret-body')
  })

  // 52-REVIEW WR-01: acceptance must not read as proof of a banner.
  it('an authorized, alert-enabled acceptance logs its settings as banner-eligible, not confirmed', async () => {
    const { notify } = loadNotify()
    mockRequestRustInvoke.mockResolvedValue(
      'user-notifications;auth=authorized;alert=enabled;style=banner'
    )
    notify({ title: 'A', body: 'secret-body' })
    await flush()
    expect(mockLogInfo).toHaveBeenCalledTimes(1)
    const line = mockLogInfo.mock.calls[0][0] as string
    expect(line).toContain('notify(): "A" accepted by UserNotifications')
    expect(line).toContain('(auth=authorized, alert=enabled, style=banner)')
    expect(line).toContain('display not confirmed')
    expect(mockLogWarning).not.toHaveBeenCalled()
    expect(JSON.stringify(mockLogInfo.mock.calls)).not.toContain('secret-body')
  })

  it.each([
    ['auth=provisional;alert=enabled;style=banner', 'auth=provisional'],
    ['auth=ephemeral;alert=enabled;style=banner', 'auth=ephemeral'],
    ['auth=authorized;alert=disabled;style=banner', 'alert=disabled'],
    ['auth=authorized;alert=enabled;style=none', 'style=none']
  ])(
    'a quiet acceptance (%s) is a warning that no banner is expected',
    async (fields, marker) => {
      const { notify } = loadNotify()
      mockRequestRustInvoke.mockResolvedValue(`user-notifications;${fields}`)
      notify({ title: 'A', body: 'secret-body' })
      await flush()
      expect(mockLogInfo).not.toHaveBeenCalled()
      expect(mockLogWarning).toHaveBeenCalledTimes(1)
      const line = mockLogWarning.mock.calls[0][0] as string
      expect(line).toContain('notify(): "A" accepted by UserNotifications')
      expect(line).toContain(marker)
      expect(line).toContain('will not show a banner')
      expect(mockLogWarning.mock.calls[0][1]).toBe('Backend')
      expect(JSON.stringify(mockLogWarning.mock.calls)).not.toContain(
        'secret-body'
      )
    }
  )

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

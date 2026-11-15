/**
 * Phase 79 (D-04, D-18): the anonymous client is Rust-only. Reads go to steamcm_anon_product_info,
 * close goes to steamcm_anon_close, shutdown issues no IPC and no timer.
 */
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))

import { createAnonymousClient, isPublicOnlyEntry } from '../anonymousClient'
import { createFakeClock } from 'backend/testUtils/fakeClock'

describe('anonymousClient', () => {
  function build() {
    const clock = createFakeClock()
    const requestRustInvoke = jest
      .fn()
      .mockResolvedValue({ ok: true, result: { apps: {} } })
    const anon = createAnonymousClient({ requestRustInvoke })
    return { clock, requestRustInvoke, anon }
  }

  it('get returns a Rust client whose getProductInfo invokes steamcm_anon_product_info', async () => {
    const { anon, requestRustInvoke } = build()
    const c = await anon.get('platform-capture')
    expect(c).not.toBeNull()
    await c?.getProductInfo([1], [], false)
    expect(requestRustInvoke).toHaveBeenCalledWith(
      'steamcm_anon_product_info',
      [{ apps: [1], packages: [], inclTokens: false }]
    )
  })

  it('close invokes steamcm_anon_close with the reason', () => {
    const { anon, requestRustInvoke } = build()
    anon.close('logout')
    expect(requestRustInvoke).toHaveBeenCalledWith('steamcm_anon_close', [
      { reason: 'logout' }
    ])
  })

  it('releaseForShutdown issues no IPC and arms no timer', async () => {
    const { anon, requestRustInvoke, clock } = build()
    await anon.get('x')
    anon.releaseForShutdown()
    expect(requestRustInvoke).not.toHaveBeenCalled()
    clock.assertNoKeepAlive()
    expect(clock.pendingCount()).toBe(0)
  })
})

describe('isPublicOnlyEntry', () => {
  it('detects missingToken and public_only entries only', () => {
    expect(isPublicOnlyEntry({ missingToken: true })).toBe(true)
    expect(isPublicOnlyEntry({ appinfo: { public_only: '1' } })).toBe(true)
    expect(isPublicOnlyEntry({ appinfo: { common: {}, config: {} } })).toBe(
      false
    )
    expect(isPublicOnlyEntry(undefined)).toBe(false)
  })
})

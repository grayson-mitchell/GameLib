/**
 * Phase 79 (D-04, D-18): the anonymous client on the Rust engine. cm=rust never builds a steam-user
 * client; close goes to steamcm_anon_close; shutdown issues no IPC.
 */
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))

import { createAnonymousClient } from '../anonymousClient'
import { createFakeClock } from 'backend/testUtils/fakeClock'

describe('anonymousClient on the rust engine', () => {
  const prev = process.env.GAMELIB_STEAMCM_CM
  beforeEach(() => {
    process.env.GAMELIB_STEAMCM_CM = 'rust'
  })
  afterEach(() => {
    if (prev === undefined) delete process.env.GAMELIB_STEAMCM_CM
    else process.env.GAMELIB_STEAMCM_CM = prev
  })

  function build() {
    const clock = createFakeClock()
    const createClient = jest.fn()
    const requestRustInvoke = jest
      .fn()
      .mockResolvedValue({ ok: true, result: { apps: {} } })
    const anon = createAnonymousClient({
      clock,
      createClient,
      requestRustInvoke
    } as never)
    return { clock, createClient, requestRustInvoke, anon }
  }

  it('get returns a Rust client whose getProductInfo invokes steamcm_anon_product_info', async () => {
    const { anon, createClient, requestRustInvoke } = build()
    const c = await anon.get('platform-capture')
    expect(c).not.toBeNull()
    await c?.getProductInfo([1], [], false)
    expect(requestRustInvoke).toHaveBeenCalledWith(
      'steamcm_anon_product_info',
      [{ apps: [1], packages: [], inclTokens: false }]
    )
    expect(createClient).not.toHaveBeenCalled()
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

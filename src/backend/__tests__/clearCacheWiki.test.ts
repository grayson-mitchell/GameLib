/**
 * 86-23 (D-05): `clearCache` empties the wiki cache through `clearWikiGameInfoCache`, one Rust call,
 * and stays synchronous: its callers (the renderer's `clearCache` send, the GOG, Nile and Legendary
 * sign-outs) do not await it, so a rejection is logged rather than thrown.
 */
import * as logger from 'backend/logger'
import { clearCache } from 'backend/utils'
import type { ClearCacheDeps } from 'backend/utils'
import type { LegendaryUserDeps } from 'backend/storeManagers/legendary/user'
import { RUST_INFO_WIKI_CACHE_CLEAR } from 'common/types/sidecarTransport'

function fakeStores(): ClearCacheDeps['stores'] {
  const family = (names: string[]) =>
    Object.fromEntries(names.map((n) => [n, { clear: jest.fn() }]))
  return {
    gog: family([
      'apiInfoCache',
      'libraryStore',
      'installInfoStore',
      'achievementStore'
    ]),
    legendary: family(['installStore', 'libraryStore', 'gameInfoStore']),
    nile: family(['installStore', 'libraryStore'])
  } as unknown as ClearCacheDeps['stores']
}

function fakeDeps(
  request: (channel: string, args: unknown[]) => Promise<unknown>
) {
  const requestRustInvoke = jest.fn(request)
  const deps = {
    stores: fakeStores(),
    requestRustInvoke
  } as unknown as ClearCacheDeps
  return { deps, requestRustInvoke }
}

describe('clearCache and the wiki cache', () => {
  let warn: jest.SpyInstance
  beforeEach(() => {
    warn = jest.spyOn(logger, 'logWarning').mockImplementation(() => undefined)
  })
  afterEach(() => jest.restoreAllMocks())

  it('starts one RUST_INFO_WIKI_CACHE_CLEAR call and returns synchronously', () => {
    const { deps, requestRustInvoke } = fakeDeps(() => Promise.resolve(null))
    const result: unknown = clearCache(deps)
    expect(result).toBeUndefined()
    expect(requestRustInvoke).toHaveBeenCalledTimes(1)
    expect(requestRustInvoke).toHaveBeenCalledWith(RUST_INFO_WIKI_CACHE_CLEAR, [
      {}
    ])
  })

  it('clears the wiki cache for a per-library clear as well, as the TS did', () => {
    const { deps, requestRustInvoke } = fakeDeps(() => Promise.resolve(null))
    clearCache(deps, 'gog')
    expect(requestRustInvoke).toHaveBeenCalledTimes(1)
    expect(deps.stores.gog.libraryStore.clear).toHaveBeenCalled()
    expect(deps.stores.nile.libraryStore.clear).not.toHaveBeenCalled()
  })

  it('logs a rejected wiki clear as a warning and does not throw or leave a rejection unhandled', async () => {
    const { deps } = fakeDeps(() =>
      Promise.reject(new Error('info_wiki_cache_clear:store-write'))
    )
    expect(() => clearCache(deps)).not.toThrow()
    await new Promise((resolve) => setImmediate(resolve))
    expect(warn).toHaveBeenCalledTimes(1)
    const [parts] = warn.mock.calls[0] as [unknown[]]
    expect(String(parts[1])).toContain('store-write')
    // The rest of the clear ran: the other families are empty.
    expect(deps.stores.gog.libraryStore.clear).toHaveBeenCalled()
  })

  // WR-64: the transport is a required member. These are compile-time checks (codecheck compiles
  // test files): an `@ts-expect-error` that stops being an error fails the type check, so the
  // omission that stopped sign-outs emptying the wiki cache (86-23, fixed at one site in 86-27)
  // cannot come back without a compile error at the construction.
  it('requires requestRustInvoke on ClearCacheDeps and on the Legendary sign-out deps', () => {
    type WithoutTransport<T> = Omit<T, 'requestRustInvoke'>
    // @ts-expect-error a ClearCacheDeps without the Rust transport is not assignable
    const clearDeps: ClearCacheDeps = {} as WithoutTransport<ClearCacheDeps>
    // @ts-expect-error nor are the Epic sign-out's deps
    const legendaryDeps: LegendaryUserDeps =
      {} as WithoutTransport<LegendaryUserDeps>
    expect([clearDeps, legendaryDeps]).toHaveLength(2)
  })
})

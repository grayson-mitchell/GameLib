import { getGogDiscounts } from '../discounts'
import { RUST_INFO_GOG_DISCOUNTS } from 'common/types/sidecarTransport'
import { rustInvokeArgs } from 'common/types/ipc/rustInvoke'
import type { GOGUserDeps } from 'backend/storeManagers/gog/user'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

const LOCALE = { countryCode: 'US', locale: 'en-US', currencyCode: 'USD' }

/**
 * Deps whose GOG credential cache holds `token` (or nothing), so `GOGUser.getCredentials` runs for
 * real and no `gogdl` process is spawned. `lookups` counts how often the resolver asked for
 * credentials; `calls` records every Rust request.
 */
function fakeDeps(token: string | undefined, answer: unknown = []) {
  const calls: unknown[][] = []
  let lookups = 0
  const requestRustInvoke = ((channel: string, args: unknown[]) => {
    calls.push([channel, args])
    return answer instanceof Error
      ? Promise.reject(answer)
      : Promise.resolve(answer)
  }) as unknown as RustInvokeDeps['requestRustInvoke']
  const deps = {
    appInfo: { version: '0.11.0' },
    onlineMonitor: { isOnline: () => true },
    gogRuntime: {
      credentials: {
        getFresh: () => {
          lookups += 1
          return token === undefined
            ? undefined
            : {
                access_token: token,
                refresh_token: 'r',
                user_id: '1',
                expires_in: 3600,
                token_type: 'bearer',
                scope: '',
                session_id: '',
                loginType: 0
              }
        },
        singleFlight: () =>
          Promise.resolve({ credentials: undefined, verdict: 'unknown' })
      }
    },
    requestRustInvoke
  } as unknown as GOGUserDeps & RustInvokeDeps
  return { deps, calls, lookups: () => lookups }
}

describe('getGogDiscounts resolver', () => {
  it('sends token null with no flags and never asks for credentials', async () => {
    const { deps, calls, lookups } = fakeDeps('SHOULD-NOT-BE-READ')
    await getGogDiscounts(deps, LOCALE)
    expect(lookups()).toBe(0)
    expect(calls).toEqual([
      [
        RUST_INFO_GOG_DISCOUNTS,
        [{ locale: LOCALE, hideOwned: false, wishlistOnly: false, token: null }]
      ]
    ])
  })

  it('reads the token once when a flag is set and sends it to Rust', async () => {
    for (const [hide, wish] of [
      [true, false],
      [false, true],
      [true, true]
    ]) {
      const { deps, calls, lookups } = fakeDeps('tok-1')
      await getGogDiscounts(deps, LOCALE, hide, wish)
      expect(lookups()).toBe(1)
      expect(calls).toEqual([
        [
          RUST_INFO_GOG_DISCOUNTS,
          [
            {
              locale: LOCALE,
              hideOwned: hide,
              wishlistOnly: wish,
              token: 'tok-1'
            }
          ]
        ]
      ])
    }
  })

  it('sends token null (flags untouched) when a flag is set and nobody is signed in', async () => {
    const { deps, calls } = fakeDeps(undefined)
    await getGogDiscounts(deps, LOCALE, true, false)
    expect(calls).toEqual([
      [
        RUST_INFO_GOG_DISCOUNTS,
        [{ locale: LOCALE, hideOwned: true, wishlistOnly: false, token: null }]
      ]
    ])
  })

  it('resolves what Rust answers and carries a Rust rejection through unchanged', async () => {
    const products = [{ id: '1', title: 'A' }]
    await expect(
      getGogDiscounts(fakeDeps(undefined, products).deps, LOCALE)
    ).resolves.toEqual(products)
    await expect(
      getGogDiscounts(
        fakeDeps(undefined, new Error('Request failed with status code 500'))
          .deps,
        LOCALE
      )
    ).rejects.toThrow('Request failed with status code 500')
  })

  it('every argument it sends passes the strict rustInvoke schema', async () => {
    for (const [hide, wish, token] of [
      [false, false, undefined],
      [true, true, 'tok-2']
    ] as const) {
      const { deps, calls } = fakeDeps(token)
      await getGogDiscounts(deps, LOCALE, hide, wish)
      const [, args] = calls[0] as [string, unknown[]]
      expect(() =>
        rustInvokeArgs[RUST_INFO_GOG_DISCOUNTS].parse(args)
      ).not.toThrow()
    }
    const schema = rustInvokeArgs[RUST_INFO_GOG_DISCOUNTS]
    expect(
      schema.safeParse([
        { locale: LOCALE, hideOwned: false, wishlistOnly: false, token: 5 }
      ]).success
    ).toBe(false)
    expect(
      schema.safeParse([
        {
          locale: LOCALE,
          hideOwned: false,
          wishlistOnly: false,
          token: null,
          extra: 1
        }
      ]).success
    ).toBe(false)
  })
})

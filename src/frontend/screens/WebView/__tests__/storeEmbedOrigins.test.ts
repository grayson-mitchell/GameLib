/**
 * Adversarial unit tests for the D-31 origin table (`resolveStoreForUrl`/`isEmbeddableOrigin`).
 * Pure — no mocks needed, mirroring `loginRoutes.test.ts`'s docstring reasoning.
 *
 * A permissive matcher passes every happy-path test, so this suite is built around the two
 * boundary failures a naive matcher lets through (a longer label with the apex as a PREFIX, and
 * a longer label with the apex as a SUFFIX) plus scheme, path, and query-string traps — for every
 * configured store, not only the one named in the plan's examples.
 */
import {
  resolveStoreForUrl,
  isEmbeddableOrigin,
  listConfiguredStores,
  type StoreEmbedPlatform
} from '../storeEmbedOrigins'

/** The platform values this suite's matrix test crosses with every configured store. */
const PLATFORMS: readonly StoreEmbedPlatform[] = ['darwin', 'win32', 'linux']

interface StoreCase {
  key: string
  apex: string
  /**
   * A subdomain of the apex that the suffix rule must cover. `gog`'s is the REAL affiliate host
   * (`af.gog.com`, also the store's actual start URL); the others are synthetic but still prove
   * the same suffix mechanism against each store's own configured apex, not only gog's.
   */
  subdomain: string
  /**
   * Expected `isEmbeddableOrigin(url, 'linux')` result. `linux` is a fixed, arbitrary
   * non-`darwin` platform for this suite's host-matching assertions -- it is unaffected by
   * Phase 50 Plan 01's Epic-is-`darwin`-only carve-out (D-05's exclusion still holds on every
   * OTHER platform). The full (store x platform) matrix is Task 2's `storeEmbedOrigins.test.ts`
   * addition, pinning the `darwin` embeddable-Epic case this file deliberately does not cover.
   */
  embeddable: boolean
}

// Measured from `storeEmbedOrigins.ts`'s own table — kept here as literal data (not imported)
// so this suite fails loudly if the source table's apex hosts ever drift, rather than silently
// testing against whatever the source happens to say today.
const STORE_CASES: readonly StoreCase[] = [
  {
    key: 'epic',
    apex: 'epicgames.com',
    subdomain: 'www.epicgames.com',
    embeddable: false
  },
  { key: 'gog', apex: 'gog.com', subdomain: 'af.gog.com', embeddable: true },
  {
    key: 'amazon',
    apex: 'gaming.amazon.com',
    subdomain: 'checkout.gaming.amazon.com',
    embeddable: true
  },
  {
    key: 'steam',
    apex: 'store.steampowered.com',
    subdomain: 'cdn.store.steampowered.com',
    embeddable: true
  }
]

/** `evil-<apex>.attacker.net` — the apex as a PREFIX label run inside a longer host. */
function prefixLabelAttack(apex: string): string {
  return `evil-${apex}.attacker.net`
}

/** `evil<first-label>.<rest>` — the apex as a SUFFIX of a longer label (`evilgog.com`). */
function suffixLabelAttack(apex: string): string {
  const [firstLabel, ...rest] = apex.split('.')
  return [`evil${firstLabel}`, ...rest].join('.')
}

describe('resolveStoreForUrl / isEmbeddableOrigin — per-store adversarial matrix', () => {
  it.each(STORE_CASES)(
    '$key: the exact apex ($apex) resolves to the $key store',
    ({ key, apex }) => {
      expect(resolveStoreForUrl(`https://${apex}/`)?.key).toBe(key)
    }
  )

  it.each(STORE_CASES)(
    '$key: a subdomain of the apex ($subdomain) resolves to the $key store',
    ({ key, subdomain }) => {
      expect(resolveStoreForUrl(`https://${subdomain}/`)?.key).toBe(key)
    }
  )

  it.each(STORE_CASES)(
    '$key: prefix-label attack (evil-$apex.attacker.net) does NOT resolve to $key',
    ({ apex }) => {
      const attack = prefixLabelAttack(apex)
      expect(resolveStoreForUrl(`https://${attack}/`)?.key).not.toBe(
        STORE_CASES.find((c) => c.apex === apex)!.key
      )
    }
  )

  it.each(STORE_CASES)(
    '$key: suffix-label attack (evil<label>.<rest> of $apex) does NOT resolve to $key',
    ({ key, apex }) => {
      const attack = suffixLabelAttack(apex)
      expect(resolveStoreForUrl(`https://${attack}/`)?.key).not.toBe(key)
    }
  )

  it.each(STORE_CASES)(
    '$key: the apex appearing only in a query string (https://attacker.net/?x=$apex) does NOT resolve to $key',
    ({ key, apex }) => {
      expect(
        resolveStoreForUrl(`https://attacker.net/?x=${apex}`)?.key
      ).not.toBe(key)
    }
  )

  it.each(STORE_CASES)(
    '$key: the apex appearing only in a path (https://attacker.net/$apex) does NOT resolve to $key',
    ({ key, apex }) => {
      expect(resolveStoreForUrl(`https://attacker.net/${apex}`)?.key).not.toBe(
        key
      )
    }
  )

  it.each(STORE_CASES)(
    '$key: http (insecure scheme) does NOT resolve for $apex',
    ({ apex }) => {
      expect(resolveStoreForUrl(`http://${apex}/`)).toBeNull()
    }
  )

  it.each(STORE_CASES)(
    '$key: isEmbeddableOrigin(url, "linux") for the exact apex matches the table’s embeddable flag ($embeddable)',
    ({ apex, embeddable }) => {
      expect(isEmbeddableOrigin(`https://${apex}/`, 'linux')).toBe(embeddable)
    }
  )
})

describe('resolveStoreForUrl — named boundary cases from the plan (D-31)', () => {
  it('rejects the prefix-label attack evil-gog.com.attacker.net for gog', () => {
    expect(
      resolveStoreForUrl('https://evil-gog.com.attacker.net/')?.key
    ).not.toBe('gog')
  })

  it('rejects the suffix-label attack evilgog.com for gog', () => {
    expect(resolveStoreForUrl('https://evilgog.com/')?.key).not.toBe('gog')
  })

  it('resolves GOG’s real affiliate start-URL host (af.gog.com) to the gog key', () => {
    expect(resolveStoreForUrl('https://af.gog.com?as=1838482841')?.key).toBe(
      'gog'
    )
  })

  it('resolves an unparseable URL to null without throwing', () => {
    expect(() => resolveStoreForUrl('not a url')).not.toThrow()
    expect(resolveStoreForUrl('not a url')).toBeNull()
  })

  it('resolves the empty string to null without throwing', () => {
    expect(() => resolveStoreForUrl('')).not.toThrow()
    expect(resolveStoreForUrl('')).toBeNull()
  })

  it('keeps Epic’s entry in the table (known origin) but marks it embeddable only on darwin (D-05, Phase 50)', () => {
    const config = resolveStoreForUrl('https://www.epicgames.com/store/en-US/')
    expect(config?.key).toBe('epic')
    expect(config?.embeddableOn).toEqual(['darwin'])
    expect(
      isEmbeddableOrigin('https://www.epicgames.com/store/en-US/', 'linux')
    ).toBe(false)
    expect(
      isEmbeddableOrigin('https://www.epicgames.com/store/en-US/', 'darwin')
    ).toBe(true)
  })

  it('isEmbeddableOrigin is false for an unresolvable origin', () => {
    expect(isEmbeddableOrigin('https://attacker.net/', 'linux')).toBe(false)
  })

  it.each(PLATFORMS)(
    'isEmbeddableOrigin is false for an unresolvable origin on %s',
    (platform) => {
      expect(isEmbeddableOrigin('https://attacker.net/', platform)).toBe(false)
    }
  )
})

/**
 * Expected per-platform embeddability, by store key -- declared INDEPENDENTLY of
 * `storeEmbedOrigins.ts`'s own table rather than derived from it, so this test actually asserts
 * something: Epic's row is `['darwin']` today, so a future edit that drops `darwin` from it (or
 * that reinstates a single static per-store boolean) diverges from the `true` pinned here and
 * fails. A seventh store enumerated by `listConfiguredStores()` below with no matching entry here
 * fails the lookup itself (`expected` is `undefined`), rather than the suite silently skipping it.
 */
const EXPECTED_EMBEDDABLE: Record<
  string,
  Record<StoreEmbedPlatform, boolean>
> = {
  epic: { darwin: true, win32: false, linux: false },
  gog: { darwin: true, win32: true, linux: true },
  amazon: { darwin: true, win32: true, linux: true },
  steam: { darwin: true, win32: true, linux: true },
  humble: { darwin: true, win32: true, linux: true }
}

describe('isEmbeddableOrigin — full (store x platform) matrix (Phase 50 Plan 01)', () => {
  // Enumerated from the module's own table via `listConfiguredStores()`, not a hand-copied list
  // of stores -- this is the invariant the assumption-delta checkpoint asked for: embeddability is
  // a function of (store, platform), not a per-store boolean.
  const stores = listConfiguredStores()

  it('enumerates exactly the 5 configured stores x 3 platforms (15 pairs) -- a 6th store with no platform decision changes this count', () => {
    expect(stores.length * PLATFORMS.length).toBe(15)
  })

  it.each(
    stores.flatMap((store) =>
      PLATFORMS.map((platform) => ({
        key: store.key,
        startUrl: store.startUrl,
        platform
      }))
    )
  )(
    'isEmbeddableOrigin($startUrl, $platform) matches the declared matrix for $key',
    ({ key, startUrl, platform }) => {
      const expected = EXPECTED_EMBEDDABLE[key]?.[platform]
      expect(expected).not.toBeUndefined()
      expect(isEmbeddableOrigin(startUrl, platform)).toBe(expected)
    }
  )
})

describe('isEmbeddableOrigin — unknown platform strings deny every store (Phase 50 Plan 01)', () => {
  // Also enumerated from the module, not a hand-copied list -- an unknown platform must be denied
  // for EVERY configured store, not merely the one (Epic) the plan's own example names.
  const stores = listConfiguredStores()

  it.each(['freebsd', 'unknown', ''])(
    '"%s" is embeddable for no configured store (allow-list, not deny-list)',
    (unknownPlatform) => {
      for (const store of stores) {
        expect(isEmbeddableOrigin(store.startUrl, unknownPlatform)).toBe(false)
      }
    }
  )
})

/**
 * Adversarial unit tests for the D-31 origin table (`resolveStoreForUrl`/`isEmbeddableOrigin`).
 * Pure — no mocks needed, mirroring `loginRoutes.test.ts`'s docstring reasoning.
 *
 * A permissive matcher passes every happy-path test, so this suite is built around the two
 * boundary failures a naive matcher lets through (a longer label with the apex as a PREFIX, and
 * a longer label with the apex as a SUFFIX) plus scheme, path, and query-string traps — for every
 * configured store, not only the one named in the plan's examples.
 */
import { resolveStoreForUrl, isEmbeddableOrigin } from '../storeEmbedOrigins'

interface StoreCase {
  key: string
  apex: string
  /**
   * A subdomain of the apex that the suffix rule must cover. `gog`'s is the REAL affiliate host
   * (`af.gog.com`, also the store's actual start URL); the others are synthetic but still prove
   * the same suffix mechanism against each store's own configured apex, not only gog's.
   */
  subdomain: string
  embeddable: boolean
}

// Measured from `storeEmbedOrigins.ts`'s own table — kept here as literal data (not imported)
// so this suite fails loudly if the source table's apex hosts ever drift, rather than silently
// testing against whatever the source happens to say today.
const STORE_CASES: readonly StoreCase[] = [
  { key: 'epic', apex: 'epicgames.com', subdomain: 'www.epicgames.com', embeddable: false },
  { key: 'gog', apex: 'gog.com', subdomain: 'af.gog.com', embeddable: true },
  {
    key: 'amazon',
    apex: 'gaming.amazon.com',
    subdomain: 'checkout.gaming.amazon.com',
    embeddable: true
  },
  {
    key: 'zoom',
    apex: 'zoom-platform.com',
    subdomain: 'www.zoom-platform.com',
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
      expect(resolveStoreForUrl(`https://attacker.net/?x=${apex}`)?.key).not.toBe(key)
    }
  )

  it.each(STORE_CASES)(
    '$key: the apex appearing only in a path (https://attacker.net/$apex) does NOT resolve to $key',
    ({ key, apex }) => {
      expect(resolveStoreForUrl(`https://attacker.net/${apex}`)?.key).not.toBe(key)
    }
  )

  it.each(STORE_CASES)('$key: http (insecure scheme) does NOT resolve for $apex', ({ apex }) => {
    expect(resolveStoreForUrl(`http://${apex}/`)).toBeNull()
  })

  it.each(STORE_CASES)(
    '$key: isEmbeddableOrigin for the exact apex matches the table’s embeddable flag ($embeddable)',
    ({ apex, embeddable }) => {
      expect(isEmbeddableOrigin(`https://${apex}/`)).toBe(embeddable)
    }
  )
})

describe('resolveStoreForUrl — named boundary cases from the plan (D-31)', () => {
  it('rejects the prefix-label attack evil-gog.com.attacker.net for gog', () => {
    expect(resolveStoreForUrl('https://evil-gog.com.attacker.net/')?.key).not.toBe('gog')
  })

  it('rejects the suffix-label attack evilgog.com for gog', () => {
    expect(resolveStoreForUrl('https://evilgog.com/')?.key).not.toBe('gog')
  })

  it('resolves GOG’s real affiliate start-URL host (af.gog.com) to the gog key', () => {
    expect(resolveStoreForUrl('https://af.gog.com?as=1838482841')?.key).toBe('gog')
  })

  it('resolves an unparseable URL to null without throwing', () => {
    expect(() => resolveStoreForUrl('not a url')).not.toThrow()
    expect(resolveStoreForUrl('not a url')).toBeNull()
  })

  it('resolves the empty string to null without throwing', () => {
    expect(() => resolveStoreForUrl('')).not.toThrow()
    expect(resolveStoreForUrl('')).toBeNull()
  })

  it('keeps Epic’s entry in the table (known origin) but marks it not embeddable (D-05)', () => {
    const config = resolveStoreForUrl('https://www.epicgames.com/store/en-US/')
    expect(config?.key).toBe('epic')
    expect(config?.embeddable).toBe(false)
    expect(isEmbeddableOrigin('https://www.epicgames.com/store/en-US/')).toBe(false)
  })

  it('isEmbeddableOrigin is false for an unresolvable origin', () => {
    expect(isEmbeddableOrigin('https://attacker.net/')).toBe(false)
  })
})

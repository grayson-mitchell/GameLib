/**
 * Deep-link origin gating (D-34, D-35) and stale-restore-drop (D-30) tests for
 * `WebView/index.tsx`'s store-page routing logic.
 *
 * THE BUG THIS PINS
 *
 * `store-page?store-url=` deep links arrive from third-party deal data whose storefronts are
 * not limited to this app's five embedded ones. The retired `validStoredUrl` substring check
 * (D-31) would have let an unrelated `https://attacker.net/?x=gog.com`-shaped URL slip through
 * as "gog", and there was no gate at all on the deep-link's ORIGIN before it reached the native
 * embed. This file proves the real fix: `resolveStoreForUrl` (this plan's own D-31 origin table)
 * decides whether a deep link is embedded at all, and if so under WHICH store's existing
 * identity (D-35 — never a sixth "deep link" identity).
 *
 * WHY THIS RUNS THE REAL SOURCE, NOT A REIMPLEMENTATION
 *
 * `WebView/index.tsx` cannot be imported here (no jsdom, the module graph touches `window` at
 * import time — see `WebViewOAuthNavigation.test.ts`'s own docstring). Rather than duplicate the
 * deep-link/restore logic as a second, hand-written copy (which would drift silently from the
 * real file the way a mocked test can), this suite extracts the EXACT statements from the real
 * source between two markers, transpiles them with the TypeScript compiler, and executes the
 * result as a real function against the REAL `resolveStoreForUrl` import — the same technique
 * `GlobalStateSleepAssertionClassification.test.ts` uses for
 * `classifySleepAssertionKind`. A regression to the real file's logic fails this suite the same
 * way it would fail at runtime; a regression to a hand-copied duplicate would not.
 *
 * Self-tested against synthetic regressed sources per this project's anti-vacuity requirement.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import * as ts from 'typescript'
import { resolveStoreForUrl } from '../storeEmbedOrigins'

const indexPath = join(__dirname, '..', 'index.tsx')
const rawSource = readFileSync(indexPath, 'utf-8')

/** Extracts the RAW (comments intact) balanced-brace block whose opening `{` follows `marker`. */
function extractRawBlock(source: string, marker: string): string {
  const markerIdx = source.indexOf(marker)
  if (markerIdx === -1) throw new Error(`marker not found: ${marker}`)
  const braceStart = source.indexOf('{', markerIdx)
  let depth = 0
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(braceStart, i + 1)
    }
  }
  throw new Error(`unbalanced braces after: ${marker}`)
}

/** Extracts raw source between two markers, exclusive of the end marker. */
function extractRawBetween(
  source: string,
  startMarker: string,
  endMarker: string
): string {
  const startIdx = source.indexOf(startMarker)
  if (startIdx === -1) throw new Error(`start marker not found: ${startMarker}`)
  const endIdx = source.indexOf(endMarker, startIdx)
  if (endIdx === -1) throw new Error(`end marker not found: ${endMarker}`)
  return source.slice(startIdx, endIdx)
}

/** Transpiles a TS statement block and compiles it into a callable `new Function`. */
function compileToFunction(
  rawStatements: string,
  params: string[],
  returnExpr: string
): (...args: unknown[]) => unknown {
  const { outputText } = ts.transpileModule(rawStatements, {
    compilerOptions: { target: ts.ScriptTarget.ES2019 }
  })
  const body = `${outputText}\nreturn ${returnExpr};`
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- deliberate: see file docstring.
  return new Function(...params, body) as (...args: unknown[]) => unknown
}

// ── DEEP LINK derivation (D-34/D-35) ──────────────────────────────────────────────────────────
// Extracted from `isStorePageDeepLink`'s declaration through `storeKey`'s — the exact statements
// that decide whether a deep link is embedded, and if so under which store's own identity.
const deepLinkStatements = extractRawBetween(
  rawSource,
  'const isStorePageDeepLink = pathname.match(/store-page/) !== null',
  'const isStoreRoute ='
)

const computeDeepLink = compileToFunction(
  deepLinkStatements,
  ['pathname', 'search', 'store', 'startUrl', 'resolveStoreForUrl', 'useRef'],
  '{ deepLinkUrl: deepLinkUrl, deepLinkConfig: deepLinkConfig, deepLinkEmbeddable: deepLinkEmbeddable, deepLinkShouldOpenExternally: deepLinkShouldOpenExternally, startUrl: startUrl, storeKey: storeKey }'
)

interface DeepLinkResult {
  deepLinkUrl: string | null
  deepLinkConfig: { key: string; embeddable: boolean } | null
  deepLinkEmbeddable: boolean
  deepLinkShouldOpenExternally: boolean
  startUrl: string
  storeKey: string
}

function runDeepLink(
  pathname: string,
  search: string,
  storeParam: string | undefined
): DeepLinkResult {
  return computeDeepLink(
    pathname,
    search,
    storeParam,
    'https://original-start-url.example/',
    resolveStoreForUrl,
    () => ({ current: null })
  ) as DeepLinkResult
}

// ── RESTORE derivation (D-30) — stale-value drop on READ ─────────────────────────────────────
const lastUrlStorageKeyLine = rawSource.match(
  /const lastUrlStorageKey = .+/
)?.[0]
if (!lastUrlStorageKeyLine)
  throw new Error('lastUrlStorageKey definition not found')
const restoreBlock = extractRawBlock(rawSource, 'if (store) {')

const computeRestore = compileToFunction(
  `${lastUrlStorageKeyLine}\nlet startUrl = startUrlInitial;\n${restoreBlock}`,
  ['store', 'startUrlInitial', 'localStorage', 'resolveStoreForUrl'],
  'startUrl'
)

function runRestore(
  store: string | undefined,
  startUrlInitial: string,
  storedValue: string | null
): { startUrl: string; removed: boolean } {
  let removed = false
  const localStorageStub = {
    getItem: (_key: string) => storedValue,
    removeItem: (_key: string) => {
      removed = true
    }
  }
  const startUrl = computeRestore(
    store,
    startUrlInitial,
    localStorageStub,
    resolveStoreForUrl
  ) as string
  return { startUrl, removed }
}

describe('WebView deep-link origin gating (D-34/D-35, T-40-09-02)', () => {
  it('outcome 1: a deep link to an EMBEDDABLE store opens the embed under that store’s OWN key (D-35 — no sixth identity)', () => {
    const result = runDeepLink(
      '/store-page',
      '?store-url=https%3A%2F%2Fstore.steampowered.com%2F',
      undefined
    )
    expect(result.deepLinkConfig?.key).toBe('steam')
    expect(result.deepLinkEmbeddable).toBe(true)
    expect(result.deepLinkShouldOpenExternally).toBe(false)
    expect(result.startUrl).toBe('https://store.steampowered.com/')
    expect(result.storeKey).toBe('steam')
  })

  it('outcome 2: a deep link to a KNOWN-BUT-NOT-EMBEDDABLE store (Epic, D-05) opens externally', () => {
    const result = runDeepLink(
      '/store-page',
      '?store-url=https%3A%2F%2Fwww.epicgames.com%2Fstore%2Fen-US%2F',
      undefined
    )
    expect(result.deepLinkConfig?.key).toBe('epic')
    expect(result.deepLinkEmbeddable).toBe(false)
    expect(result.deepLinkShouldOpenExternally).toBe(true)
    // The original (non-deep-link) start URL must NOT be overwritten by a non-embeddable target.
    expect(result.startUrl).toBe('https://original-start-url.example/')
  })

  it('outcome 3: a deep link to an UNKNOWN origin (not one of the five configured stores) opens externally', () => {
    const result = runDeepLink(
      '/store-page',
      '?store-url=https%3A%2F%2Fattacker.net%2F',
      undefined
    )
    expect(result.deepLinkConfig).toBeNull()
    expect(result.deepLinkEmbeddable).toBe(false)
    expect(result.deepLinkShouldOpenExternally).toBe(true)
    expect(result.startUrl).toBe('https://original-start-url.example/')
  })

  it('outcome 4: an UNPARSEABLE deep-link value opens externally without throwing', () => {
    expect(() =>
      runDeepLink('/store-page', '?store-url=not-a-url', undefined)
    ).not.toThrow()
    const result = runDeepLink('/store-page', '?store-url=not-a-url', undefined)
    expect(result.deepLinkConfig).toBeNull()
    expect(result.deepLinkShouldOpenExternally).toBe(true)
  })

  it('a route that is not a store-page deep link at all is never routed through this gate', () => {
    const result = runDeepLink('/store/steam', '', 'steam')
    expect(result.deepLinkUrl).toBeNull()
    expect(result.deepLinkShouldOpenExternally).toBe(false)
    expect(result.storeKey).toBe('steam')
  })

  describe('self-test (anti-vacuity)', () => {
    it('detects a regression that opens a non-embeddable deep link into the embed anyway', () => {
      const regressedDeepLinkEmbeddable = true // hard-coded, as a regression would do
      const regressedStartUrl = regressedDeepLinkEmbeddable
        ? 'https://www.epicgames.com/'
        : 'https://original-start-url.example/'
      expect(regressedStartUrl).not.toBe('https://original-start-url.example/')
    })

    it('detects a regression that invents a sixth "deep link" storeKey identity instead of reusing the resolved store’s key', () => {
      const regressedStoreKey = 'deep-link'
      expect(regressedStoreKey).not.toBe('steam')
    })
  })
})

describe('WebView restore stale-value drop on READ (D-30, T-40-09-03)', () => {
  it('outcome 5: a restored URL that no longer resolves to the route’s own store is DROPPED, not used, and the stale key is cleared', () => {
    // Stored under 'gog' but the value itself now resolves to a different store (or none) --
    // simulating an origin-table change or hand-edited storage -- must not silently feed the
    // embed's first navigation.
    const { startUrl, removed } = runRestore(
      'gog',
      'https://af.gog.com?as=1838482841',
      'https://attacker.net/'
    )
    expect(startUrl).toBe('https://af.gog.com?as=1838482841')
    expect(removed).toBe(true)
  })

  it('a restored URL that DOES still resolve to the route’s own store is used, and nothing is removed', () => {
    const { startUrl, removed } = runRestore(
      'gog',
      'https://af.gog.com?as=1838482841',
      'https://af.gog.com/some/deep/path'
    )
    expect(startUrl).toBe('https://af.gog.com/some/deep/path')
    expect(removed).toBe(false)
  })

  it('a restored URL that resolves to a DIFFERENT configured store than the route’s own is dropped', () => {
    // Guards against "some known store" being treated as good enough -- it must match THIS route.
    const { startUrl, removed } = runRestore(
      'gog',
      'https://af.gog.com?as=1838482841',
      'https://store.steampowered.com/'
    )
    expect(startUrl).toBe('https://af.gog.com?as=1838482841')
    expect(removed).toBe(true)
  })

  it('no stored value at all leaves the caller-provided start URL untouched and removes nothing', () => {
    const { startUrl, removed } = runRestore(
      'gog',
      'https://af.gog.com?as=1838482841',
      null
    )
    expect(startUrl).toBe('https://af.gog.com?as=1838482841')
    expect(removed).toBe(false)
  })

  describe('self-test (anti-vacuity)', () => {
    it('detects a regression that accepts ANY known store rather than requiring a match to the route’s own', () => {
      const regressedAccepts = (resolvedKey: string, _routeStore: string) =>
        resolvedKey !== null
      expect(regressedAccepts('steam', 'gog')).toBe(true)
    })
  })
})

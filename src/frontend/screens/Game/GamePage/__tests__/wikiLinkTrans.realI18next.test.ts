/**
 * Quick task 260921-k2d: `GamePage`'s wikiLink `<Trans>` was written with
 * React's reserved `key` prop instead of `i18nKey`, so it never had a lookup
 * key to resolve and fell through to its inline English children in every
 * locale -- silently orphaning 31 non-English human translations of
 * `wikiLink` in `gamepage.json`. A diff review cannot catch this:
 * `ns="gamelib"` and `ns="gamepage"` produce byte-identical-looking diffs and
 * the wrong one still renders English with no error, no warning, and no type
 * failure (see the plan's "Why a diff review is not sufficient
 * verification").
 *
 * This file also has a FOURTH assertion (A4) the sibling
 * (`anticheatWarningTrans.realI18next.test.ts`) did not need: the catalog
 * value for this key contains a literal `&nbsp;` entity. Adding `i18nKey`
 * and `ns` alone renders that entity escaped -- the user visibly sees the
 * text `&nbsp;`. `shouldUnescape` is required to decode it, and decoding it
 * is a deliberate, stated trade: it turns the entity into an ordinary space
 * (U+0020), not a true non-breaking space (U+00A0). This test pins that
 * decoding as a rendered consequence (A4), not as a source-level token check
 * -- a gate satisfied by the mere presence of `shouldUnescape` in source text
 * would be the "prose satisfies the gate" anti-pattern this repo keeps
 * stamping out.
 *
 * WIDENED (quick task 260921-rmj): A4 originally asserted
 * `not.toContain('&amp;nbsp;')` against German only. That exact string never
 * matches the French catalog's malformed variant, which carries
 * `&nbsp` + U+202F (narrow no-break space) + `;` instead of a well-formed
 * `&nbsp;` -- so the exact-string form PASSED against a value the user still
 * saw rendered as `&amp;nbsp ;`. A4 now matches the malformed FAMILY (any
 * markup containing `&amp;nbsp`, with or without a trailing `;`, with or
 * without an intervening codepoint) and runs over a named locale set,
 * `['de', 'fr']`, because the German-only form could never have seen a
 * French-only defect. A1/A2/A2b/A3 stay German-only: their helpers
 * (`readGermanCatalogValue()`, A2's `&nbsp;`-based split) are German-shaped
 * and are not being generalised here.
 *
 * LIMITATION, stated honestly: the element rendered below is a
 * *reconstructed* element -- built from the `i18nKey`/`ns`/`shouldUnescape`
 * attributes read out of the production source, with sentinel/placeholder
 * children substituted for the real English fallback and a plain `<a>`
 * standing in for the real react-router `<Link>` (which would need a Router
 * context this DOM-free project cannot supply) -- not the production
 * element itself. It pins the `(i18nKey, ns, shouldUnescape)` triple as
 * written in source, proves that triple resolves to real non-English
 * catalog text through the real engine, maps the catalog's `<1>` marker onto
 * the element at child index 1, and proves the entity decodes. It does NOT,
 * and CANNOT, prove a full component render: the Frontend jest project
 * (`src/frontend/jest.config.js`) has no DOM renderer -- `jest-environment-
 * jsdom` and `react-test-renderer` are not installed. Do not mistake this
 * for a full component render.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createInstance, type i18n as I18nInstance } from 'i18next'
import Backend from 'i18next-fs-backend'
import { Trans } from 'react-i18next'

// Six levels up from .../Game/GamePage/__tests__/ is the repository root
// (__tests__ -> GamePage -> Game -> screens -> frontend -> src -> root) --
// two fewer than the DownloadDialog sibling's eight, which sits two
// directories deeper (InstallModal/DownloadDialog vs. Game/GamePage). Do
// not copy that chain.
const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..')
const LOCALES_DIR = join(REPO_ROOT, 'public', 'locales')
const SOURCE_PATH = join(__dirname, '..', 'index.tsx')

// Fail loudly, before any test runs, if either path assumption is wrong --
// a wrong REPO_ROOT depth would otherwise hand i18next-fs-backend a loadPath
// with nothing at it, and a wrong SOURCE_PATH would make the extractor
// below report "0 tags matched". Both look like a real catch but are
// actually a path bug, and this repo has a recorded lesson about exactly
// that kind of confusion.
if (!existsSync(join(LOCALES_DIR, 'en', 'gamepage.json'))) {
  throw new Error(
    'wikiLinkTrans.realI18next.test.ts: expected to find ' +
      `${join(LOCALES_DIR, 'en', 'gamepage.json')} -- REPO_ROOT depth is ` +
      'wrong, fix the join(__dirname, ...) chain above.'
  )
}
if (!existsSync(SOURCE_PATH)) {
  throw new Error(
    `wikiLinkTrans.realI18next.test.ts: expected to find ${SOURCE_PATH} ` +
      '-- the relative path from __tests__ to GamePage/index.tsx is wrong.'
  )
}

const TARGET_KEY_SUBSTRING = 'wikiLink'
const TEXT_SENTINEL = '__K2D_ENGLISH_TEXT_MUST_NOT_RENDER__'
const LINK_SENTINEL = '__K2D_ENGLISH_LINK_MUST_NOT_RENDER__'

function stripJsxComments(source: string): string {
  return source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
}

interface ExtractedTransAttributes {
  i18nKey: string
  ns: string
  shouldUnescape: boolean
}

// A1 -- read the source, strip comments, and find the SINGLE <Trans> tag
// that references the target key. Extracted here, at module scope, so a
// failure aborts the whole file with a clear message instead of letting A2,
// A2b, A3 or A4 run against attributes that were never actually found
// (which is how a broken extractor could pass by accident).
function extractTransAttributes(): ExtractedTransAttributes {
  const source = readFileSync(SOURCE_PATH, 'utf-8')
  const stripped = stripJsxComments(source)
  const openingTags = stripped.match(/<Trans\b[\s\S]*?>/g) ?? []
  const matching = openingTags.filter((tag) =>
    tag.includes(TARGET_KEY_SUBSTRING)
  )

  if (matching.length !== 1) {
    throw new Error(
      'extractTransAttributes: expected exactly ONE <Trans> opening tag ' +
        `referencing "${TARGET_KEY_SUBSTRING}", found ${matching.length}. A ` +
        'count of 0 or 2+ means the extractor itself is broken -- fix the ' +
        'regex, do not treat this as a pass or a fail of the production code.'
    )
  }

  const tag = matching[0]
  const i18nKeyMatch = /\bi18nKey="([^"]*)"/.exec(tag)
  const nsMatch = /\bns="([^"]*)"/.exec(tag)
  const shouldUnescape = /\bshouldUnescape\b/.test(tag)

  if (!i18nKeyMatch) {
    throw new Error(
      'extractTransAttributes: no i18nKey attribute found on the Trans tag -- ' +
        'the source is still writing React\'s reserved "key" prop (or some ' +
        'other attribute) instead of "i18nKey", so Trans has nothing to ' +
        'resolve and falls through to its English children.'
    )
  }
  if (!nsMatch) {
    throw new Error(
      'extractTransAttributes: no ns attribute found on the Trans tag -- ' +
        'i18next\'s defaultNS is "translation", not "gamepage", so an ' +
        'omitted ns silently mis-resolves the key to the wrong namespace.'
    )
  }

  return { i18nKey: i18nKeyMatch[1], ns: nsMatch[1], shouldUnescape }
}

const EXTRACTED = extractTransAttributes()

function getNestedCatalogValue(
  catalog: Record<string, unknown>,
  dottedKey: string,
  ns: string
): string {
  const segments = dottedKey.split('.')
  let current: unknown = catalog
  for (const segment of segments) {
    if (typeof current !== 'object' || current === null) {
      throw new Error(
        `getNestedCatalogValue: path "${dottedKey}" does not resolve inside ` +
          `${ns}.json (stopped at segment "${segment}"). If this happened ` +
          'while running the wrong-ns negative control, this is expected -- ' +
          "read the A3 (sentinel) assertion's failure instead, not this one."
      )
    }
    current = (current as Record<string, unknown>)[segment]
  }
  if (typeof current !== 'string') {
    throw new Error(
      `getNestedCatalogValue: path "${dottedKey}" did not resolve to a ` +
        `string inside ${ns}.json. If this happened while running the ` +
        'wrong-ns negative control, this is expected -- read the A3 ' +
        "(sentinel) assertion's failure instead, not this one."
    )
  }
  return current
}

// React-DOM's own escapeHtml escapes exactly these five characters. Kept
// generic on purpose (mirrors the sibling) even though the leading segment
// under test here needs none of it.
function escapeLikeReact(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

async function createRealInstance(lng: string): Promise<I18nInstance> {
  const instance = createInstance()
  await instance.use(Backend).init({
    backend: {
      loadPath: join(LOCALES_DIR, '{{lng}}', '{{ns}}.json')
    },
    lng,
    fallbackLng: 'en',
    ns: ['translation', 'gamepage', 'gamelib'],
    defaultNS: 'translation',
    returnEmptyString: false,
    returnNull: false,
    initImmediate: false,
    interpolation: {
      escapeValue: false
    }
  })
  return instance
}

function renderReconstructed(instance: I18nInstance): string {
  const element = createElement(
    Trans,
    {
      i18nKey: EXTRACTED.i18nKey,
      ns: EXTRACTED.ns,
      shouldUnescape: EXTRACTED.shouldUnescape,
      i18n: instance
    },
    TEXT_SENTINEL,
    createElement('a', { href: 'https://example.invalid' }, LINK_SENTINEL)
  )
  return renderToStaticMarkup(element)
}

function readGermanCatalogValue(): string {
  const catalogPath = join(LOCALES_DIR, 'de', `${EXTRACTED.ns}.json`)
  if (!existsSync(catalogPath)) {
    throw new Error(
      `readGermanCatalogValue: ${catalogPath} does not exist. If this ` +
        'happened while running the wrong-ns negative control, this is ' +
        "expected -- read the A3 assertion's failure instead, not this one."
    )
  }
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8')) as Record<
    string,
    unknown
  >
  return getNestedCatalogValue(catalog, EXTRACTED.i18nKey, EXTRACTED.ns)
}

describe('GamePage wikiLink <Trans> against a REAL i18next instance (260921-k2d)', () => {
  it('A1: the source writes exactly one Trans tag with i18nKey and ns (shouldUnescape extracted, not asserted here)', () => {
    expect(EXTRACTED.i18nKey).toBe(TARGET_KEY_SUBSTRING)
    expect(EXTRACTED.ns.length).toBeGreaterThan(0)
  })

  it('A2: that (i18nKey, ns) pair resolves to the real German catalog text', async () => {
    const instance = await createRealInstance('de')
    const markup = renderReconstructed(instance)

    const fullValue = readGermanCatalogValue()
    // The leading segment up to the entity is free of both tags and
    // entities, which is why this split is used rather than a `<1>` split.
    const leadingSegment = escapeLikeReact(fullValue.split('&nbsp;')[0].trim())

    expect(markup).toContain(leadingSegment)
  })

  it("A2b: the catalog's <1> child maps onto the element at index 1 (the link)", async () => {
    const instance = await createRealInstance('de')
    const markup = renderReconstructed(instance)

    const fullValue = readGermanCatalogValue()
    const linkTextMatch = /<1>([^<]*)<\/1>/.exec(fullValue)
    if (!linkTextMatch) {
      throw new Error(
        'A2b: could not find a <1>...</1> segment in the German catalog ' +
          'value -- the catalog shape changed, or ns/i18nKey resolved to ' +
          'the wrong entry.'
      )
    }
    const germanLinkText = escapeLikeReact(linkTextMatch[1])

    expect(markup).toContain(germanLinkText)
  })

  it('A3: the reconstructed element does NOT fall back to its English sentinel children', async () => {
    const instance = await createRealInstance('de')
    const markup = renderReconstructed(instance)

    expect(markup).not.toContain(TEXT_SENTINEL)
    expect(markup).not.toContain(LINK_SENTINEL)
  })

  // A4 runs over a named, explicit locale set -- 'de' and 'fr' -- because the
  // malformed-entity defect this assertion exists to catch was, historically,
  // French-only and a German-only run could never have seen it (see the file
  // header's "WIDENED" note). Do not widen this to all 49 locale dirs: 15
  // carry an empty wikiLink value and 2 have no gamepage.json at all, so a
  // 49-locale run would be green for reasons unrelated to this assertion.
  it.each(['de', 'fr'])(
    'A4: the rendered markup contains no &amp;nbsp mojibake (locale: %s)',
    async (lng) => {
      const instance = await createRealInstance(lng)
      const markup = renderReconstructed(instance)

      expect(markup).not.toMatch(/&amp;nbsp/)
    }
  )
})

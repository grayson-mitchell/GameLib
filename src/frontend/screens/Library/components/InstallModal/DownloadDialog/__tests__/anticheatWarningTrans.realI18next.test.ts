/**
 * Quick task 260921-jfk: `DownloadDialog`'s anticheat-warning `<Trans>` was
 * written with React's reserved `key` prop instead of `i18nKey`, so it never
 * had a lookup key to resolve and fell through to its inline English
 * children in every locale -- silently orphaning 35 non-English human
 * translations of `install.anticheat-warning.disabled_installation` in
 * `gamepage.json`. A diff review cannot catch this: `ns="gamelib"` and
 * `ns="gamepage"` produce byte-identical-looking diffs and the wrong one
 * still renders English with no error, no warning, and no type failure (see
 * the plan's "Why a diff review is not sufficient verification"). This file
 * proves the fix against a REAL i18next engine and the REAL
 * `public/locales` catalog, mirroring `chipLabels.realI18next.test.ts` --
 * a fresh `createInstance()` per test, never the process-wide singleton.
 *
 * LIMITATION, stated honestly: the element rendered below is a
 * *reconstructed* element -- built from the `i18nKey`/`ns` attributes read
 * out of the production source, with sentinel children substituted for the
 * real English fallback -- not the production element itself. It pins the
 * `(i18nKey, ns)` pair as written in source and proves that pair resolves to
 * real non-English catalog text through the real engine. It does NOT pin
 * child-index parity between the reconstructed sentinel and the production
 * `<br />` pairs (safe here: the catalog value is a single literal string
 * with two `<br />` separators and no numbered `<0/>` tags, so there is
 * nothing for child-index to disturb), and it CANNOT, because the Frontend
 * jest project (`src/frontend/jest.config.js`) has no DOM renderer --
 * `jest-environment-jsdom` and `react-test-renderer` are not installed. Do
 * not mistake this for a full component render.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createInstance, type i18n as I18nInstance } from 'i18next'
import Backend from 'i18next-fs-backend'
import { Trans } from 'react-i18next'

// Eight levels up from
// .../InstallModal/DownloadDialog/__tests__/ is the repository root
// (__tests__ -> DownloadDialog -> InstallModal -> components -> Library ->
// screens -> frontend -> src -> root), one level deeper than the
// chipLabels.realI18next.test.ts precedent (which starts inside
// FilterChipRow, not DownloadDialog).
const REPO_ROOT = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  '..'
)
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
    'anticheatWarningTrans.realI18next.test.ts: expected to find ' +
      `${join(LOCALES_DIR, 'en', 'gamepage.json')} -- REPO_ROOT depth is ` +
      'wrong, fix the join(__dirname, ...) chain above.'
  )
}
if (!existsSync(SOURCE_PATH)) {
  throw new Error(
    `anticheatWarningTrans.realI18next.test.ts: expected to find ${SOURCE_PATH} ` +
      '-- the relative path from __tests__ to DownloadDialog/index.tsx is wrong.'
  )
}

const TARGET_KEY_SUBSTRING = 'install.anticheat-warning.disabled_installation'
const SENTINEL = '__JFK_ENGLISH_CHILDREN_MUST_NOT_RENDER__'

function stripJsxComments(source: string): string {
  return source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
}

interface ExtractedTransAttributes {
  i18nKey: string
  ns: string
}

// A1 -- read the source, strip comments, and find the SINGLE <Trans> tag
// that references the target key. Extracted here, at module scope, so a
// failure aborts the whole file with a clear message instead of letting A2
// or A3 run against attributes that were never actually found (which is how
// a broken extractor could pass by accident).
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

  if (!i18nKeyMatch) {
    throw new Error(
      'extractTransAttributes: no i18nKey attribute found on the Trans tag -- ' +
        "the source is still writing React's reserved \"key\" prop (or some " +
        'other attribute) instead of "i18nKey", so Trans has nothing to ' +
        'resolve and falls through to its English children.'
    )
  }
  if (!nsMatch) {
    throw new Error(
      'extractTransAttributes: no ns attribute found on the Trans tag -- ' +
        "i18next's defaultNS is \"translation\", not \"gamepage\", so an " +
        'omitted ns silently mis-resolves the key to the wrong namespace.'
    )
  }

  return { i18nKey: i18nKeyMatch[1], ns: nsMatch[1] }
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

// React-DOM's own escapeHtml escapes exactly these five characters. The
// catalog segment under test contains none of them (verified at authoring
// time), but this stays generic on purpose so it does not go silently wrong
// for a different locale/segment later.
function escapeLikeReact(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

async function createRealInstance(): Promise<I18nInstance> {
  const instance = createInstance()
  await instance.use(Backend).init({
    backend: {
      loadPath: join(LOCALES_DIR, '{{lng}}', '{{ns}}.json')
    },
    lng: 'de',
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

describe('DownloadDialog anticheat-warning <Trans> against a REAL i18next instance (260921-jfk)', () => {
  it('A1: the source writes exactly one Trans tag with both i18nKey and ns', () => {
    expect(EXTRACTED.i18nKey).toBe(TARGET_KEY_SUBSTRING)
    expect(EXTRACTED.ns.length).toBeGreaterThan(0)
  })

  it('A2: that (key, ns) pair resolves to the real German catalog text', async () => {
    const instance = await createRealInstance()
    const element = createElement(
      Trans,
      { i18nKey: EXTRACTED.i18nKey, ns: EXTRACTED.ns, i18n: instance },
      SENTINEL
    )
    const markup = renderToStaticMarkup(element)

    const catalogPath = join(LOCALES_DIR, 'de', `${EXTRACTED.ns}.json`)
    if (!existsSync(catalogPath)) {
      throw new Error(
        `A2: ${catalogPath} does not exist. If this happened while running ` +
          'the wrong-ns negative control, this is expected -- read the A3 ' +
          "assertion's failure instead, not this one."
      )
    }
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8')) as Record<
      string,
      unknown
    >
    const fullValue = getNestedCatalogValue(
      catalog,
      EXTRACTED.i18nKey,
      EXTRACTED.ns
    )
    const firstSegment = escapeLikeReact(fullValue.split('<br />')[0].trim())

    expect(markup).toContain(firstSegment)
  })

  it('A3: the reconstructed element does NOT fall back to its English sentinel children', async () => {
    const instance = await createRealInstance()
    const element = createElement(
      Trans,
      { i18nKey: EXTRACTED.i18nKey, ns: EXTRACTED.ns, i18n: instance },
      SENTINEL
    )
    const markup = renderToStaticMarkup(element)

    expect(markup).not.toContain(SENTINEL)
  })
})

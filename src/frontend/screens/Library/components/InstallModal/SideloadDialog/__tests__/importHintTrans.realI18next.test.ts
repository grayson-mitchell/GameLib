/**
 * The sideload dialog's import hint `<Trans i18nKey="sideload.import-hint.content"
 * ns="gamelib">` against a REAL i18next instance and the real catalogues
 * (todo 2026-10-05-login-and-i18n-minor-defects-from-phase-36-and-34-8-review,
 * item 2).
 *
 * THE DEFECT: the catalogue value carries `&quot;{{doorLabel}}&quot;` (en, and
 * 44 machine-filled locales copied the entity verbatim). Without
 * `shouldUnescape`, `Trans` hands that entity to React as TEXT, React escapes
 * the `&`, and the user reads `&quot;Locate existing installation…&quot;`.
 * `GamePage/__tests__/wikiLinkTrans.realI18next.test.ts` measured the same
 * mechanism for `&nbsp;`; this follows its method.
 *
 * LIMITATION, the same one that file states: the element rendered here is
 * RECONSTRUCTED from the `i18nKey`/`ns`/`shouldUnescape` attributes read out
 * of the production source, with a plain `<a>` standing in for react-router's
 * `NavLink` (no Router context in this DOM-free project). It proves the
 * triple as written in source resolves and decodes through the real engine;
 * it is not a full component render.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createInstance, type i18n as I18nInstance } from 'i18next'
import Backend from 'i18next-fs-backend'
import { Trans } from 'react-i18next'

// __tests__ -> SideloadDialog -> InstallModal -> components -> Library ->
// screens -> frontend -> src -> root: eight levels.
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

if (!existsSync(join(LOCALES_DIR, 'en', 'gamelib.json'))) {
  throw new Error(
    `importHintTrans.realI18next.test.ts: no ${join(LOCALES_DIR, 'en', 'gamelib.json')} ` +
      '-- REPO_ROOT depth is wrong, fix the join(__dirname, ...) chain.'
  )
}

const TARGET_KEY = 'sideload.import-hint.content'

// Pinned so a glob that matches nothing cannot make `it.each` contribute
// zero tests and pass while asserting nothing.
const EXPECTED_GAMELIB_LOCALES = 49
const ALL_GAMELIB_LOCALES = readdirSync(LOCALES_DIR)
  .filter((entry) => existsSync(join(LOCALES_DIR, entry, 'gamelib.json')))
  .sort()
if (ALL_GAMELIB_LOCALES.length !== EXPECTED_GAMELIB_LOCALES) {
  throw new Error(
    `importHintTrans.realI18next.test.ts: found ${ALL_GAMELIB_LOCALES.length} ` +
      `locales with a gamelib.json, expected ${EXPECTED_GAMELIB_LOCALES}.`
  )
}

function extractTransAttributes(): {
  i18nKey: string
  ns: string
  shouldUnescape: boolean
} {
  const stripped = readFileSync(SOURCE_PATH, 'utf-8').replace(
    /\{\/\*[\s\S]*?\*\/\}/g,
    ''
  )
  const matching = (stripped.match(/<Trans\b[\s\S]*?>/g) ?? []).filter((tag) =>
    tag.includes(TARGET_KEY)
  )
  if (matching.length !== 1) {
    throw new Error(
      `extractTransAttributes: expected exactly ONE <Trans> tag referencing ` +
        `"${TARGET_KEY}", found ${matching.length} -- the extractor is broken.`
    )
  }
  const tag = matching[0]
  const i18nKey = /\bi18nKey="([^"]*)"/.exec(tag)?.[1]
  const ns = /\bns="([^"]*)"/.exec(tag)?.[1]
  if (!i18nKey || !ns) {
    throw new Error('extractTransAttributes: i18nKey or ns attribute missing')
  }
  return { i18nKey, ns, shouldUnescape: /\bshouldUnescape\b/.test(tag) }
}

const EXTRACTED = extractTransAttributes()

async function createRealInstance(lng: string): Promise<I18nInstance> {
  const instance = createInstance()
  await instance.use(Backend).init({
    backend: { loadPath: join(LOCALES_DIR, '{{lng}}', '{{ns}}.json') },
    lng,
    fallbackLng: 'en',
    ns: ['translation', 'gamelib'],
    defaultNS: 'translation',
    returnEmptyString: false,
    returnNull: false,
    initImmediate: false,
    // Same as the app's own init (src/frontend/index.tsx).
    interpolation: { escapeValue: false }
  })
  return instance
}

async function renderHint(lng: string): Promise<string> {
  const instance = await createRealInstance(lng)
  const doorLabel = instance.t('gamelib:installFlows.importDoorLabel')
  return renderToStaticMarkup(
    createElement(
      Trans,
      {
        i18n: instance,
        i18nKey: EXTRACTED.i18nKey,
        ns: EXTRACTED.ns,
        shouldUnescape: EXTRACTED.shouldUnescape,
        values: { doorLabel }
      },
      'Do NOT use this feature for that.',
      createElement('br'),
      'Instead, ',
      createElement('a', { href: '#/login' }, 'log into'),
      ' the store…'
    )
  )
}

describe('SideloadDialog import hint <Trans> against a REAL i18next instance', () => {
  it('resolves to the real catalogue text (not the inline English children) in de', async () => {
    const markup = await renderHint('de')
    expect(markup).toContain('Verwende diese Funktion NICHT dafür.')
  })

  it('en renders real quotation marks around the door label, never a visible &quot; entity', async () => {
    const markup = await renderHint('en')
    // React's own escaping prints a real `"` as `&quot;` in markup; a
    // VISIBLE entity is the double-escaped `&amp;quot;`.
    expect(markup).toContain(
      'click the &quot;Locate existing installation…&quot; button'
    )
    expect(markup).not.toContain('&amp;quot;')
  })

  it.each(ALL_GAMELIB_LOCALES)(
    '%s: no HTML entity reaches the user as visible text',
    async (lng) => {
      const markup = await renderHint(lng)
      expect(markup).not.toMatch(/&amp;(quot|amp|lt|gt|#\d+|nbsp);/)
    }
  )
})

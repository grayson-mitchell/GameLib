/**
 * WR-16: the i18n-critical claims about `chipLabelSpec`/`resolveLabel` proved
 * against a REAL `i18next.createInstance()` reading the real
 * `public/locales` catalog, not against `index.test.tsx`'s hand-written
 * `jest.mock('react-i18next', ...)`.
 *
 * The mock in `index.test.tsx` is `(key, defaultValue) => defaultValue` (or
 * equivalent) -- it returns the SAME inline default text regardless of
 * whether the real catalog key exists, is namespaced correctly, or is
 * pluralised. Every assertion built on that mock is therefore structurally
 * incapable of observing a missing key, a renamed key, or a plural-variant
 * key silently discarding its translation -- exactly the defect shapes this
 * file exists to catch. `index.test.tsx` keeps its mock and keeps asserting
 * React element-graph shape (chip ordering, per-chip `aria-label`s,
 * clear-all wiring); THIS file owns every claim that depends on what the
 * real i18next engine actually does with a real key against a real catalog.
 *
 * `chipLabels.ts` is React-free by construction (see its own header
 * comment) -- this file imports no `react` and no `react-i18next` mock.
 * Every instance below is a fresh `i18next.createInstance()`, never the
 * process-wide singleton, following the precedent in
 * `src/backend/sidecar/__tests__/gamelibNamespaceLoad.test.ts`. The
 * Frontend jest project (`src/frontend/jest.config.js`) has no
 * `__mocks__/i18next.ts` shadowing the real package (unlike the backend
 * project), so no `jest.unmock('i18next')` call is needed here.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInstance } from 'i18next'
import Backend from 'i18next-fs-backend'
import {
  chipLabelSpec,
  resolveLabel,
  type TFunc
} from '../chipLabels'
import { PRESET_UNCATEGORIZED } from '../../../filterEngine'
import type { ActiveFilterDescriptor } from 'frontend/types'

// Seven levels up from
// src/frontend/screens/Library/components/FilterChipRow/__tests__/ is the
// repository root (__tests__ -> FilterChipRow -> components -> Library ->
// screens -> frontend -> src -> root), matching the depth-4 precedent in
// gamelibNamespaceLoad.test.ts (which starts three directories shallower).
const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..', '..')
const LOCALES_DIR = join(REPO_ROOT, 'public', 'locales')
const GAMELIB_CATALOG_PATH = join(LOCALES_DIR, 'en', 'gamelib.json')

// Fail loudly, before any test runs, if the depth above is wrong -- a wrong
// depth would otherwise silently hand i18next-fs-backend a loadPath with
// nothing at it, and every assertion below would fail with a confusing
// "bare key" result that looks like a real WR-16 catch but is actually a
// path bug.
if (!existsSync(GAMELIB_CATALOG_PATH)) {
  throw new Error(
    `chipLabels.realI18next.test.ts: expected to find ${GAMELIB_CATALOG_PATH} -- ` +
      'REPO_ROOT depth is wrong, fix the join(__dirname, ...) chain above.'
  )
}

const GAMELIB_CATALOG = JSON.parse(
  readFileSync(GAMELIB_CATALOG_PATH, 'utf-8')
) as { library: { filterPanel: Record<string, string> } }

async function initInstance(
  ns: string[],
  overrides: { loadPath?: string; skipOnVariables?: boolean } = {}
) {
  const instance = createInstance()
  await instance.use(Backend).init({
    backend: {
      loadPath: overrides.loadPath ?? join(LOCALES_DIR, '{{lng}}', '{{ns}}.json')
    },
    lng: 'en',
    fallbackLng: 'en',
    ns,
    defaultNS: 'translation',
    returnEmptyString: false,
    returnNull: false,
    initImmediate: false,
    interpolation: {
      skipOnVariables: overrides.skipOnVariables ?? true
    }
  })
  return instance
}

// The sentinel `resolveLabel`'s `t`/`tGamelib` adapters substitute for
// whatever inline default `chipLabelSpec` supplied. i18next only ever
// falls back to the DEFAULT it is given on a missing/mis-namespaced/
// plural-only key (verified facts 7/8) -- so if a key is absent, this
// sentinel is what comes back, not a default that happens to already read
// like the correct English text.
const SENTINEL_DEFAULT = '__WR16_DEFAULT_SHOULD_NEVER_WIN__'

// A resolved label that is actually still a raw i18next key looks like
// `library.filterPanel.viewInstalled` (dotted, lowercase-first, no space)
// or `gamelib:library.filterPanel.viewInstalled` (same, with the namespace
// prefix i18next strips only when the namespace DID resolve).
const BARE_KEY_RE = /^(gamelib:)?[a-z][\w.]*$/

function makeSentinelT(instance: ReturnType<typeof createInstance>): TFunc {
  return (key, _defaultValue, options) =>
    instance.t(key, SENTINEL_DEFAULT, options)
}

// One `ActiveFilterDescriptor` per member of the eleven-kind union.
// `collection` uses `PRESET_UNCATEGORIZED` and `store` uses `'sideload'`
// deliberately (not an arbitrary collection name / runner id): those are
// the ONLY values of their kind that `chipLabelSpec` routes through a real
// i18next key lookup rather than returning a bare literal untouched by
// this file's assertions. Using any other value for those two kinds would
// make 2 of the 11 branches below a no-op against the mocked-vs-real
// distinction this file exists to draw -- reproducing WR-16's own disease
// inside WR-16's fix.
const ALL_KIND_DESCRIPTORS: ActiveFilterDescriptor[] = [
  { id: 'view:installed', kind: 'view', value: 'installed' },
  {
    id: 'collection:preset_uncategorized',
    kind: 'collection',
    value: PRESET_UNCATEGORIZED
  },
  { id: 'store:sideload', kind: 'store', value: 'sideload' },
  { id: 'runnability:native', kind: 'runnability', value: 'native' },
  { id: 'search', kind: 'search', value: 'witcher' },
  { id: 'showHidden:only', kind: 'showHidden', value: 'only' },
  { id: 'showNonAvailable:only', kind: 'showNonAvailable', value: 'only' },
  { id: 'noStorePage:only', kind: 'noStorePage', value: 'only' },
  {
    id: 'showSupportOfflineOnly',
    kind: 'showSupportOfflineOnly',
    value: 'true'
  },
  {
    id: 'showThirdPartyManagedOnly',
    kind: 'showThirdPartyManagedOnly',
    value: 'true'
  },
  { id: 'showUpdatesOnly', kind: 'showUpdatesOnly', value: 'true' }
]

describe('chipLabelSpec / resolveLabel against a REAL i18next instance (WR-16)', () => {
  it('every key chipLabelSpec can emit resolves to the REAL catalog, not to its inline default', async () => {
    const instance = await initInstance(['translation', 'gamelib'])
    const sentinelT = makeSentinelT(instance)

    for (const descriptor of ALL_KIND_DESCRIPTORS) {
      const spec = chipLabelSpec(descriptor)
      expect(spec).not.toBeNull()

      const label = resolveLabel(spec!, sentinelT, sentinelT)

      expect(label).not.toBe(SENTINEL_DEFAULT)
      expect(label).not.toMatch(BARE_KEY_RE)
    }
  })

  describe('injection safety -- $t() nesting', () => {
    it('a filter value containing $t(...) renders literally, not re-interpolated (fact 2)', async () => {
      const instance = await initInstance(['translation', 'gamelib'])

      const resolved = instance.t('gamelib:library.filterPanel.emptyBody', {
        filters: 'Backlog $t(header.uncategorized)'
      })

      expect(resolved).toBe('No games match Backlog $t(header.uncategorized).')

      // Sibling assertions on the SAME instance -- guards against "renders
      // literally" being an artefact of an unloaded namespace rather than
      // proof of injection safety: the namespace DID load (this key would
      // otherwise be a bare key per fact 6/BARE_KEY_RE), and the safety
      // setting this depends on is the one actually in effect.
      expect(instance.t('header.uncategorized')).toBe('Uncategorized')
      expect(instance.options.interpolation?.skipOnVariables).toBe(true)
    })
  })

  describe('injection safety -- literal {{token}}', () => {
    it('a filter value containing a literal {{token}} is not re-interpolated (fact 4)', async () => {
      const instance = await initInstance(['translation', 'gamelib'])

      const resolved = instance.t('gamelib:library.filterPanel.removeFilter', {
        filterLabel: 'Backlog {{filters}}'
      })

      expect(resolved).toBe('Remove Backlog {{filters}} filter')
    })
  })

  describe('interpolation-name integrity', () => {
    it('no filterPanel key is pluralised or uses the reserved {{count}} name', () => {
      const filterPanel = GAMELIB_CATALOG.library.filterPanel

      for (const [key, value] of Object.entries(filterPanel)) {
        expect(value).not.toMatch(/\{\{count\}\}/)
        expect(key).not.toMatch(/_(zero|one|two|few|many|other)$/)
      }
    })

    it('a plural-variant-only key silently discards its catalog value through resolveLabel\'s two-argument shape (the failure this gate prevents)', async () => {
      const instance = await initInstance(['translation', 'gamelib'])
      instance.addResource('en', 'gamelib', '__wr16spec.plural_one', 'ONE variant text')
      instance.addResource(
        'en',
        'gamelib',
        '__wr16spec.plural_other',
        'OTHER variant text'
      )

      const DEFAULT_THAT_MUST_NOT_WIN = 'A DEFAULT THAT MUST NOT WIN'
      // resolveLabel's exact two-argument t(key, defaultText) call shape --
      // no `count` passed, so i18next has no plural rule to select a
      // variant with, and (per the corrected fact in the plan) falls back
      // to the inline default instead of either variant's catalog text.
      const resolved = instance.t('gamelib:__wr16spec.plural', DEFAULT_THAT_MUST_NOT_WIN)

      expect(resolved).toBe(DEFAULT_THAT_MUST_NOT_WIN)
    })
  })

  describe('broken-interpolation specimen', () => {
    it('a typo\'d interpolation token is observable through this harness, not silently swallowed', async () => {
      const instance = await initInstance(['translation', 'gamelib'])
      instance.addResource(
        'en',
        'gamelib',
        '__wr16spec.typo',
        'No games match {{filter}}.'
      )

      const resolved = instance.t('gamelib:__wr16spec.typo', {
        filters: 'Installed'
      })

      expect(resolved).toContain('{{filter}}')
    })
  })

  // Kept permanently per the plan: the strongest single answer to WR-16 is
  // showing the SAME hostile input resolve two different ways depending on
  // one real i18next setting -- proving the literal-render assertion above
  // actually distinguishes the safe configuration from the injecting one,
  // rather than passing unconditionally for any configuration.
  it('skipOnVariables=false would inject -- this is what the assertion above rules out (fact 3)', async () => {
    const instance = await initInstance(['translation', 'gamelib'], {
      skipOnVariables: false
    })

    const resolved = instance.t('gamelib:library.filterPanel.emptyBody', {
      filters: 'Backlog $t(header.uncategorized)'
    })

    expect(resolved).toBe('No games match Backlog Uncategorized.')
  })
})

/**
 * Gate for the catalog rebrand (todo `2026-09-01-non-english-catalogs-are-unrebranded`).
 *
 * The defect this guards against is not a code regression -- it is an INPUT
 * regression. Every upstream i18n catalog refresh copies Weblate content
 * wholesale, and that content calls the product "Heroic". Without a gate, the
 * next refresh silently re-imports upstream branding into 46 languages and the
 * rebrand rots. The `live tree` block below is the part that makes CI notice.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  deriveRenameSet,
  rebrandValue,
  scanResidue,
  flatten,
  INFLECTION_RULES
} from '../rebrandUpstreamCatalogs'

const LOCALES_DIR = join(process.cwd(), 'public', 'locales')

describe('flatten', () => {
  it('produces dotted keys for nested string values', () => {
    expect(flatten({ a: { b: 'x' }, c: 'y' })).toEqual([
      { key: 'a.b', value: 'x' },
      { key: 'c', value: 'y' }
    ])
  })

  it('ignores non-string leaves', () => {
    expect(flatten({ a: 1, b: null, c: 'keep' })).toEqual([
      { key: 'c', value: 'keep' }
    ])
  })
})

describe('rebrandValue -- generic swap', () => {
  it('renames the product in a locale with no overrides', () => {
    expect(rebrandValue('Heroic Games Launcher', 'de')).toBe(
      'GameLib Games Launcher'
    )
  })

  it('is CASE-SENSITIVE, which is what protects schemes and placeholders', () => {
    // `heroic://` is the deep-link scheme and `{{heroicVersion}}` is an i18next
    // interpolation name. Both are lowercase; rewriting either would break a
    // link or an interpolation in 46 languages at once.
    expect(rebrandValue('Launch via heroic:// links', 'de')).toBe(
      'Launch via heroic:// links'
    )
    expect(rebrandValue('Heroic: {{heroicVersion}}', 'de')).toBe(
      'GameLib: {{heroicVersion}}'
    )
  })
})

describe('rebrandValue -- inflection overrides', () => {
  // Each case asserts BOTH the corrected output and that a naive token swap
  // would have produced something different -- otherwise the override could be
  // deleted with the suite still green.
  const cases: [string, string, string][] = [
    // locale, input, expected
    [
      'ca',
      "S'ha buidat la memòria cau de l'Heroic.",
      "S'ha buidat la memòria cau del GameLib."
    ],
    ['ca', "Vols reiniciar l'Heroic ara?", 'Vols reiniciar el GameLib ara?'],
    ['ca', "L'Heroic no pot trobar-lo.", 'El GameLib no pot trobar-lo.'],
    [
      'fr',
      "Le cache d'Heroic a été supprimé.",
      'Le cache de GameLib a été supprimé.'
    ],
    ['fr', "Afin qu'Heroic fonctionne", 'Afin que GameLib fonctionne'],
    ['et', 'Heroicu vahemälu puhastati.', 'GameLibi vahemälu puhastati.'],
    ['et', 'Logige Heroicusse sisse', 'Logige GameLibisse sisse'],
    ['hu', 'Újraindítod most a Heroicot?', 'Újraindítod most a GameLibet?'],
    ['hu', 'a Heroicban', 'a GameLibben'],
    ['sv', 'Heroicversion', 'GameLib-version']
  ]

  it.each(cases)('[%s] %s', (locale, input, expected) => {
    expect(rebrandValue(input, locale)).toBe(expected)
  })

  it.each(cases)(
    '[%s] the override is load-bearing -- a naive swap differs',
    (locale, input, expected) => {
      const naive = input.split('Heroic').join('GameLib')
      expect(naive).not.toBe(expected)
    }
  )

  it('applies no override to locales that are correct under a plain swap', () => {
    // Finnish genitive, Czech locative and Scandinavian genitive all survive the
    // token swap unchanged; adding rules for them would be noise.
    for (const locale of ['fi', 'cs', 'da', 'nb_NO', 'hr', 'bs']) {
      expect(INFLECTION_RULES[locale]).toBeUndefined()
    }
    expect(rebrandValue('Heroicin', 'fi')).toBe('GameLibin')
    expect(rebrandValue('Heroicu', 'cs')).toBe('GameLibu')
    expect(rebrandValue('Heroics', 'sv')).toBe('GameLibs')
  })
})

describe('deriveRenameSet -- the partition', () => {
  const set = deriveRenameSet(LOCALES_DIR)

  it('includes a key whose English value names the product', () => {
    expect(set.has('translation:box.info.update.title')).toBe(true)
  })

  it('includes a key whose English names NO product', () => {
    // The case a "English says GameLib" rule is blind to: English is "About",
    // translators wrote "Ueber Heroic".
    expect(set.has('translation:tray.about')).toBe(true)
  })

  it('EXCLUDES keys absent from English', () => {
    // Orphaned upstream residue. This exclusion is what keeps the only
    // github.com/Heroic-Games-Launcher URL in the tree out of the rename set.
    expect(set.has('translation:box.error.ubisoft-connect.message')).toBe(false)
  })

  it('EXCLUDES any key whose English value itself says Heroic', () => {
    const en = flatten(
      JSON.parse(
        readFileSync(join(LOCALES_DIR, 'en', 'translation.json'), 'utf-8')
      )
    )
    for (const { key, value } of en) {
      if (value.includes('Heroic')) {
        expect(set.has(`translation:${key}`)).toBe(false)
      }
    }
  })
})

describe('live tree', () => {
  // The anti-rot assertion. It passes trivially today and bites the moment an
  // upstream catalog refresh re-imports Heroic branding into a key whose
  // English value does not carry it.
  it('no translated string names the old product for a self-reference key', () => {
    const residue = scanResidue(LOCALES_DIR)
    expect(residue.map((r) => `${r.locale} ${r.namespace}:${r.key}`)).toEqual(
      []
    )
  })
})

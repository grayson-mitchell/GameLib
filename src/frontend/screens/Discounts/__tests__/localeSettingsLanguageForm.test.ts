/**
 * quick-260925-bq4: guards the SECOND half of the underscore-locale fix.
 *
 * `i18n.language` is now the BCP-47 tag (`pt-BR`), because i18next cannot
 * resolve plural rules for a directory name (`pt_BR`) -- see
 * `src/common/languages.ts`. But `COUNTRY_CURRENCY_MAP` in `../helpers` is keyed
 * by the SHIPPED code, and its lookup is exact-then-bare-language-part:
 *
 *     COUNTRY_CURRENCY_MAP[language] ?? COUNTRY_CURRENCY_MAP[baseLang] ?? DEFAULT
 *
 * So handing it the tag does not fail loudly -- it silently misses the exact key
 * and lands on the bare language part, flipping Brazil from BR/BRL to PT/EUR and
 * Norway from NO/NOK to the US/USD default. Wrong prices, no error.
 *
 * `Discounts/index.tsx` therefore converts back with `toShippedLanguage` before
 * calling `getLocaleSettings`. These tests pin both directions so that
 * conversion cannot be dropped as "redundant".
 */

import { getLocaleSettings } from '../helpers'
import { toI18nextCode, toShippedLanguage } from 'common/languages'

// The four whose shipped code is not a valid language tag, with the region and
// currency each MUST keep.
const EXPECTED: Record<string, { countryCode: string; currencyCode: string }> =
  {
    pt_BR: { countryCode: 'BR', currencyCode: 'BRL' },
    nb_NO: { countryCode: 'NO', currencyCode: 'NOK' },
    zh_Hans: { countryCode: 'CN', currencyCode: 'CNY' },
    zh_Hant: { countryCode: 'TW', currencyCode: 'USD' }
  }

describe('getLocaleSettings against the underscore-named locales (quick-260925-bq4)', () => {
  it.each(Object.keys(EXPECTED))(
    '%s keeps its own region/currency when the tag is converted back first',
    (shipped) => {
      const viaTag = getLocaleSettings(
        toShippedLanguage(toI18nextCode(shipped))
      )

      expect(viaTag).toMatchObject(EXPECTED[shipped])
    }
  )

  // The negative control, kept permanently: this is what passing `i18n.language`
  // through unconverted would do. It proves the assertions above distinguish the
  // two forms rather than passing for any input.
  it.each(Object.keys(EXPECTED))(
    '%s would silently degrade if the raw BCP-47 tag were passed instead',
    (shipped) => {
      const viaRawTag = getLocaleSettings(toI18nextCode(shipped))

      expect(viaRawTag).not.toMatchObject(EXPECTED[shipped])
    }
  )

  it('a region override still wins over the language entirely', () => {
    // Guards against the conversion above being read as the only input that
    // matters -- the override path short-circuits before the map lookup.
    expect(getLocaleSettings(toShippedLanguage('pt-BR'), 'DE')).toMatchObject({
      countryCode: 'DE'
    })
  })
})

/**
 * `formatSyncAge` returns the bare duration phrase that is interpolated into
 * the translated `humbleKeys.lastSynced` / `humbleKeys.syncError` strings
 * ("Letzte Synchronisierung vor {{time}}"). Every bucket must therefore come
 * out in the UI language — an English unit word inside a German sentence
 * ("vor 5 minutes") is the defect this pins.
 */
import { TFunction } from 'i18next'

import { formatSyncAge } from '../syncAge'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const echoT = ((_key: string, defaultValue: string) =>
  defaultValue) as unknown as TFunction

// ICU may separate number and unit with a no-break space (fr); compare words.
function age(ms: number, language: string): string {
  return formatSyncAge(ms, echoT, language).replace(/\s/g, ' ')
}

describe('formatSyncAge', () => {
  it('keeps the English copy under en (singular and plural)', () => {
    expect(age(30_000, 'en')).toBe('less than a minute')
    expect(age(1 * MINUTE, 'en')).toBe('1 minute')
    expect(age(5 * MINUTE, 'en')).toBe('5 minutes')
    expect(age(1 * HOUR, 'en')).toBe('1 hour')
    expect(age(3 * HOUR, 'en')).toBe('3 hours')
    expect(age(1 * DAY, 'en')).toBe('1 day')
    expect(age(4 * DAY, 'en')).toBe('4 days')
  })

  it('renders minute/hour/day units in the UI language, not English', () => {
    expect(age(5 * MINUTE, 'de')).toBe('5 Minuten')
    expect(age(1 * HOUR, 'de')).toBe('1 Stunde')
    expect(age(4 * DAY, 'de')).toBe('4 Tage')
    expect(age(3 * HOUR, 'fr')).toBe('3 heures')
    expect(age(4 * DAY, 'fr')).toBe('4 jours')
  })

  it('accepts the underscore-named shipped codes (pt_BR, zh_Hant) without throwing', () => {
    expect(age(4 * DAY, 'pt_BR')).toBe('4 dias')
    expect(age(4 * DAY, 'zh_Hant')).not.toMatch(/days/)
  })

  it('falls back to English rather than throwing on an unusable language tag', () => {
    expect(age(5 * MINUTE, '')).toBe('5 minutes')
    expect(age(5 * MINUTE, 'not a tag!')).toBe('5 minutes')
  })
})

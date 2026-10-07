import { TFunction } from 'i18next'

import { toI18nextCode } from 'common/languages'

/**
 * The bare duration phrase ("5 minutes", "5 Minuten") interpolated as
 * `{{time}}` into the translated `humbleKeys.lastSynced` / `syncError`
 * strings — the "ago"/"showing data from" wrapper lives in the caller's i18n
 * string. 4 buckets: <1 minute / minutes / hours / days.
 *
 * The unit word comes from `Intl.NumberFormat`'s `unit` style in the UI
 * language, NOT from English literals: a hand-built "5 minutes" lands inside
 * a German sentence as "vor 5 minutes". `Intl.RelativeTimeFormat` does not
 * fit here — it emits its own "ago"/"vor"/"il y a" wrapper, which every
 * catalogue already supplies around `{{time}}`.
 */
export function formatSyncAge(
  ms: number,
  t: TFunction,
  language: string
): string {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) {
    return t('gamelib:humble.lessThanAMinute', 'less than a minute')
  }
  if (minutes < 60) {
    return formatUnit(minutes, 'minute', language)
  }
  const hours = Math.floor(ms / 3600000)
  if (hours < 24) {
    return formatUnit(hours, 'hour', language)
  }
  const days = Math.floor(ms / 86400000)
  return formatUnit(days, 'day', language)
}

function formatUnit(
  value: number,
  unit: 'minute' | 'hour' | 'day',
  language: string
): string {
  const options: Intl.NumberFormatOptions = {
    style: 'unit',
    unit,
    unitDisplay: 'long'
  }
  try {
    // `i18n.language` is a shipped DIRECTORY code (`pt_BR`, `zh_Hant`), not
    // a BCP-47 tag — see `toI18nextCode`'s own docblock.
    return new Intl.NumberFormat(toI18nextCode(language), options).format(value)
  } catch {
    // An unusable tag throws a RangeError; English beats a blank indicator.
    return new Intl.NumberFormat('en', options).format(value)
  }
}

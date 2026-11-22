/**
 * The price region is ONE renderer-side localStorage value shared by the
 * Deals screen and Store Search (G-47-8). Each screen validates the stored
 * code against its OWN list: Deals against REGION_OPTIONS (GOG needs a
 * currency per country), Store Search against STORE_SEARCH_REGION_CODES
 * (the countries IsThereAnyDeal prices; operator decision "itad-list",
 * plan 47-16 Task 1). A code outside a screen's list reads as Auto there.
 */
import type { CatalogLocaleSettings } from 'common/types/discounts'
import { ITAD_PRICED_COUNTRIES } from 'common/itadCoverage'

// Only country and currency vary by language. GOG's catalog API rejects
// most locale values, so we always send en-US — the locale doesn't affect
// the discount listings, only the storeLink language path.
// GOG supports: AUD, BRL, CAD, CHF, CNY, DKK, EUR, GBP, NOK, PLN, SEK (in
// their respective regions) and USD everywhere. Unsupported native
// currencies fall back to USD.
const COUNTRY_CURRENCY_MAP: Record<
  string,
  { countryCode: string; currencyCode: string }
> = {
  en: { countryCode: 'US', currencyCode: 'USD' },
  pt_BR: { countryCode: 'BR', currencyCode: 'BRL' },
  pt: { countryCode: 'PT', currencyCode: 'EUR' },
  de: { countryCode: 'DE', currencyCode: 'EUR' },
  es: { countryCode: 'ES', currencyCode: 'EUR' },
  fr: { countryCode: 'FR', currencyCode: 'EUR' },
  it: { countryCode: 'IT', currencyCode: 'EUR' },
  nl: { countryCode: 'NL', currencyCode: 'EUR' },
  pl: { countryCode: 'PL', currencyCode: 'PLN' },
  ru: { countryCode: 'RU', currencyCode: 'USD' },
  uk: { countryCode: 'UA', currencyCode: 'USD' },
  ja: { countryCode: 'JP', currencyCode: 'USD' },
  ko: { countryCode: 'KR', currencyCode: 'USD' },
  zh_Hans: { countryCode: 'CN', currencyCode: 'CNY' },
  zh_Hant: { countryCode: 'TW', currencyCode: 'USD' },
  tr: { countryCode: 'TR', currencyCode: 'USD' },
  cs: { countryCode: 'CZ', currencyCode: 'USD' },
  hu: { countryCode: 'HU', currencyCode: 'USD' },
  sv: { countryCode: 'SE', currencyCode: 'SEK' },
  da: { countryCode: 'DK', currencyCode: 'DKK' },
  nb_NO: { countryCode: 'NO', currencyCode: 'NOK' },
  fi: { countryCode: 'FI', currencyCode: 'EUR' },
  el: { countryCode: 'GR', currencyCode: 'EUR' },
  ro: { countryCode: 'RO', currencyCode: 'USD' },
  ar: { countryCode: 'SA', currencyCode: 'USD' },
  he: { countryCode: 'IL', currencyCode: 'USD' }
}

const DEFAULT_COUNTRY_CURRENCY = { countryCode: 'US', currencyCode: 'USD' }

export interface RegionOption {
  countryCode: string
  currencyCode: string
  label: string
}

// Deduplicated (countryCode+currencyCode) list for the Store override picker.
// Currencies are restricted to those GOG supports (AUD, BRL, CAD, CHF, CNY,
// DKK, EUR, GBP, NOK, PLN, SEK, USD); regions without a supported native
// currency use USD, which GOG accepts everywhere.
// Translation keys below are referenced via template literals, so list them
// here explicitly for i18next-parser to extract.
// t('discounts.region.countries.AU', 'Australia')
// t('discounts.region.countries.BR', 'Brazil')
// t('discounts.region.countries.CA', 'Canada')
// t('discounts.region.countries.CH', 'Switzerland')
// t('discounts.region.countries.CN', 'China')
// t('discounts.region.countries.CZ', 'Czechia')
// t('discounts.region.countries.DE', 'Germany')
// t('discounts.region.countries.DK', 'Denmark')
// t('discounts.region.countries.ES', 'Spain')
// t('discounts.region.countries.FI', 'Finland')
// t('discounts.region.countries.FR', 'France')
// t('discounts.region.countries.GB', 'United Kingdom')
// t('discounts.region.countries.GR', 'Greece')
// t('discounts.region.countries.HU', 'Hungary')
// t('discounts.region.countries.IL', 'Israel')
// t('discounts.region.countries.IT', 'Italy')
// t('discounts.region.countries.JP', 'Japan')
// t('discounts.region.countries.KR', 'South Korea')
// t('discounts.region.countries.NL', 'Netherlands')
// t('discounts.region.countries.NO', 'Norway')
// t('discounts.region.countries.PL', 'Poland')
// t('discounts.region.countries.PT', 'Portugal')
// t('discounts.region.countries.RO', 'Romania')
// t('discounts.region.countries.RU', 'Russia')
// t('discounts.region.countries.SE', 'Sweden')
// t('discounts.region.countries.TR', 'Turkey')
// t('discounts.region.countries.TW', 'Taiwan')
// t('discounts.region.countries.UA', 'Ukraine')
// t('discounts.region.countries.US', 'United States')
export const REGION_OPTIONS: RegionOption[] = [
  { countryCode: 'US', currencyCode: 'USD', label: 'United States' },
  { countryCode: 'AU', currencyCode: 'AUD', label: 'Australia' },
  { countryCode: 'BR', currencyCode: 'BRL', label: 'Brazil' },
  { countryCode: 'CA', currencyCode: 'CAD', label: 'Canada' },
  { countryCode: 'CN', currencyCode: 'CNY', label: 'China' },
  { countryCode: 'CZ', currencyCode: 'USD', label: 'Czechia' },
  { countryCode: 'DK', currencyCode: 'DKK', label: 'Denmark' },
  { countryCode: 'FI', currencyCode: 'EUR', label: 'Finland' },
  { countryCode: 'FR', currencyCode: 'EUR', label: 'France' },
  { countryCode: 'DE', currencyCode: 'EUR', label: 'Germany' },
  { countryCode: 'GR', currencyCode: 'EUR', label: 'Greece' },
  { countryCode: 'HU', currencyCode: 'USD', label: 'Hungary' },
  { countryCode: 'IL', currencyCode: 'USD', label: 'Israel' },
  { countryCode: 'IT', currencyCode: 'EUR', label: 'Italy' },
  { countryCode: 'JP', currencyCode: 'USD', label: 'Japan' },
  { countryCode: 'NL', currencyCode: 'EUR', label: 'Netherlands' },
  { countryCode: 'NO', currencyCode: 'NOK', label: 'Norway' },
  { countryCode: 'PL', currencyCode: 'PLN', label: 'Poland' },
  { countryCode: 'PT', currencyCode: 'EUR', label: 'Portugal' },
  { countryCode: 'RO', currencyCode: 'USD', label: 'Romania' },
  { countryCode: 'RU', currencyCode: 'USD', label: 'Russia' },
  { countryCode: 'KR', currencyCode: 'USD', label: 'South Korea' },
  { countryCode: 'ES', currencyCode: 'EUR', label: 'Spain' },
  { countryCode: 'SE', currencyCode: 'SEK', label: 'Sweden' },
  { countryCode: 'CH', currencyCode: 'CHF', label: 'Switzerland' },
  { countryCode: 'TW', currencyCode: 'USD', label: 'Taiwan' },
  { countryCode: 'TR', currencyCode: 'USD', label: 'Turkey' },
  { countryCode: 'UA', currencyCode: 'USD', label: 'Ukraine' },
  { countryCode: 'GB', currencyCode: 'GBP', label: 'United Kingdom' }
]

const LOCALE_OVERRIDE_KEY = 'discounts.regionOverride'

/**
 * The stored region code, only if it is in `allowed` (T-47-53). Anything
 * else — absent, unreadable storage, or a code this screen does not offer —
 * is null, i.e. Auto.
 */
export const getStoredRegionFor = (
  allowed: readonly string[]
): string | null => {
  try {
    const stored = localStorage.getItem(LOCALE_OVERRIDE_KEY)
    if (!stored) return null
    return allowed.includes(stored) ? stored : null
  } catch {
    return null
  }
}

export const getStoredRegionOverride = (): string | null =>
  getStoredRegionFor(REGION_OPTIONS.map((r) => r.countryCode))

export const setStoredRegionOverride = (countryCode: string | null) => {
  try {
    if (countryCode) {
      localStorage.setItem(LOCALE_OVERRIDE_KEY, countryCode)
    } else {
      localStorage.removeItem(LOCALE_OVERRIDE_KEY)
    }
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }
}

export const getLocaleSettings = (
  language: string,
  regionOverride?: string | null
): CatalogLocaleSettings => {
  if (regionOverride) {
    const match = REGION_OPTIONS.find((r) => r.countryCode === regionOverride)
    if (match) {
      return {
        countryCode: match.countryCode,
        currencyCode: match.currencyCode,
        locale: 'en-US'
      }
    }
  }

  const baseLang = language.split(/[-_]/)[0] ?? language
  const { countryCode, currencyCode } =
    COUNTRY_CURRENCY_MAP[language] ??
    COUNTRY_CURRENCY_MAP[baseLang] ??
    DEFAULT_COUNTRY_CURRENCY

  return { countryCode, currencyCode, locale: 'en-US' }
}

/**
 * The countries Store Search offers: every country ITAD prices in its own
 * currency (32, measured in the Phase 47 Wave 0 sweep). An array, not a Set
 * (module-state census).
 */
export const STORE_SEARCH_REGION_CODES: readonly string[] =
  ITAD_PRICED_COUNTRIES

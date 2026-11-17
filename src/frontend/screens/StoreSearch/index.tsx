import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCircleInfo,
  faMagnifyingGlassDollar
} from '@fortawesome/free-solid-svg-icons'

import SearchBar from 'frontend/components/UI/SearchBar'
import {
  useAmazonAccount,
  useEpicAccount,
  useGogAccount,
  useHumbleAccount,
  useSteamAccount
} from 'frontend/state/accountHooks'
import { selectKeysWaiting } from 'common/humble/viewFilters'
import { toShippedLanguage } from 'common/languages'
import {
  resolveStoreSearchBadges,
  type StoreOwnershipMatch
} from 'common/discounts/badges'
import {
  getLocaleSettings,
  getStoredRegionOverride
} from 'frontend/screens/Discounts/helpers'
import { useDebouncedStoreSearch } from './hooks/useDebouncedStoreSearch'
import { useOwnedSteamGids } from './hooks/useOwnedSteamGids'
import { formatCountryName } from './helpers'
import StoreSearchRow from './components/StoreSearchRow'
import './index.css'

/**
 * Store-search screen container (STORESEARCH-01/02/05/06/08). Wires the
 * debounce hook (Plan 06 Task 1), resolves ownership badges ONCE per
 * results array (RESEARCH Pattern 2 — `StoreSearchRow` never recomputes),
 * and renders the three visually-distinct fail-soft states from the
 * 20-UI-SPEC Three-State Contract.
 *
 * D-05: reads exactly steam.library, gog.library, epic.library,
 * amazon.library + humble keys — `sideloadedLibrary` is
 * DELIBERATELY never destructured from the context value here (highest
 * fuzzy-false-positive risk source).
 */
export default function StoreSearch() {
  const { t, i18n } = useTranslation()
  // PRICE-01 / D3: the same country derivation the Deals screen uses (its
  // stored region override wins, else the language-derived country).
  // `toShippedLanguage` because i18n.language is a BCP-47 tag while
  // COUNTRY_CURRENCY_MAP is keyed by the shipped code (see Discounts/index.tsx).
  const countryCode = useMemo(
    () =>
      getLocaleSettings(
        toShippedLanguage(i18n.language),
        getStoredRegionOverride()
      ).countryCode,
    [i18n.language]
  )
  const epic = useEpicAccount()
  const gog = useGogAccount()
  const amazon = useAmazonAccount()
  const steam = useSteamAccount()
  const humble = useHumbleAccount()
  const {
    query,
    setQuery,
    results,
    status,
    loading,
    retry,
    pricedCountry,
    errorCode
  } = useDebouncedStoreSearch(countryCode)

  // Same waiting-key derivation Discounts/index.tsx uses before calling its
  // sibling resolver — a redeemed/expired key must not present as
  // 'key-available' here either.
  const keysWaiting = useMemo(
    () => selectKeysWaiting(humble.keys ?? []),
    [humble.keys]
  )

  // PRICE-02: ITAD result ids are gids; this maps them back to the user's
  // Steam appids so the resolver's exact-appid arm still fires. Empty on
  // lookup failure (no Steam badge is ever shown wrongly).
  const gidToAppId = useOwnedSteamGids(steam.library, keysWaiting)

  // D-05/STORESEARCH-05/06: resolved ONCE per results array via useMemo —
  // StoreSearchRow only ever renders the resolved literal (T-20-03).
  const badgesByGameId = useMemo(() => {
    const map = new Map<
      string,
      { owned: StoreOwnershipMatch[]; keyAvailable: boolean }
    >()
    for (const result of results) {
      map.set(
        result.gameId,
        resolveStoreSearchBadges(
          { ...result, steamAppId: gidToAppId.get(result.gameId) },
          {
            steam: steam.library,
            gog: gog.library,
            epic: epic.library,
            amazon: amazon.library
          },
          keysWaiting
        )
      )
    }
    return map
  }, [
    results,
    steam.library,
    gog.library,
    epic.library,
    amazon.library,
    keysWaiting,
    gidToAppId
  ])

  return (
    <div className="storeSearchScreen">
      <h2 className="storeSearchScreen__header">
        {t('storeSearch.title', 'Store Search')}
      </h2>

      <div className="storeSearchScreen__searchWrapper">
        <SearchBar
          value={query}
          onInputChanged={setQuery}
          placeholder={t('storeSearch.placeholder', 'Search for a game title…')}
          loading={loading}
        />
      </div>

      <p className="storeSearchScreen__region">
        {t('storeSearch.region', 'Showing prices for {{country}}.', {
          country: formatCountryName(countryCode, i18n.language)
        })}
      </p>

      {status === 'results' &&
        pricedCountry &&
        pricedCountry !== countryCode && (
          <div className="storeSearchScreen__regionNote" role="note">
            <FontAwesomeIcon icon={faCircleInfo} aria-hidden />
            <span>
              {t(
                'storeSearch.regionFallback',
                "Prices aren't available for {{country}} yet, so these are shown for {{pricedCountry}}.",
                {
                  country: formatCountryName(countryCode, i18n.language),
                  pricedCountry: formatCountryName(pricedCountry, i18n.language)
                }
              )}
            </span>
          </div>
        )}

      {status === 'error' && (
        <div className="storeSearchScreen__errorBanner" role="alert">
          <span className="storeSearchScreen__errorMessage">
            {errorCode === 'rateLimited'
              ? t(
                  'storeSearch.error.rateLimited',
                  'Price lookups are busy right now. Try again in a minute.'
                )
              : errorCode === 'notConfigured'
                ? t(
                    'storeSearch.error.notConfigured',
                    "Price lookups aren't set up in this build. Add an IsThereAnyDeal API key in Settings > Advanced."
                  )
                : t(
                    'storeSearch.error.provider',
                    "Couldn't reach the price provider."
                  )}
          </span>
          {errorCode !== 'notConfigured' && (
            <button
              type="button"
              className="storeSearchScreen__retryButton"
              onClick={retry}
            >
              {t('storeSearch.error.retry', 'Retry search')}
            </button>
          )}
        </div>
      )}

      {status === 'prompt' && (
        <div className="storeSearchScreen__message storeSearchScreen__message--prompt">
          <FontAwesomeIcon
            className="storeSearchScreen__promptIcon"
            icon={faMagnifyingGlassDollar}
          />
          <p>
            {t(
              'storeSearch.prompt',
              'Search a title to compare prices across every store — GameLib will tell you if you already own it.'
            )}
          </p>
        </div>
      )}

      {status === 'empty' && (
        <p className="storeSearchScreen__message">
          {t(
            'storeSearch.noResults',
            'No results for "{{query}}". Try a different spelling or a shorter title.',
            { query }
          )}
        </p>
      )}

      {status === 'results' && (
        <div className="storeSearchScreen__results">
          {results.map((result) => (
            <StoreSearchRow
              key={result.gameId}
              result={result}
              badges={
                badgesByGameId.get(result.gameId) ?? {
                  owned: [],
                  keyAvailable: false
                }
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

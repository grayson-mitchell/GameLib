import { useContext, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMagnifyingGlassDollar } from '@fortawesome/free-solid-svg-icons'

import SearchBar from 'frontend/components/UI/SearchBar'
import ContextProvider from 'frontend/state/ContextProvider'
import { selectKeysWaiting } from 'common/humble/viewFilters'
import {
  resolveStoreSearchBadges,
  type StoreOwnershipMatch
} from 'common/discounts/badges'
import { useDebouncedStoreSearch } from './hooks/useDebouncedStoreSearch'
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
 * amazon.library + humble keys — `sideloadedLibrary` and `zoom` are
 * DELIBERATELY never destructured from ContextProvider here (highest
 * fuzzy-false-positive risk source).
 */
export default function StoreSearch() {
  const { t } = useTranslation()
  const { epic, gog, amazon, steam, humble } = useContext(ContextProvider)
  const { query, setQuery, results, status, loading, retry } =
    useDebouncedStoreSearch()

  // Same waiting-key derivation Discounts/index.tsx uses before calling its
  // sibling resolver — a redeemed/expired key must not present as
  // 'key-available' here either.
  const keysWaiting = useMemo(
    () => selectKeysWaiting(humble.keys ?? []),
    [humble.keys]
  )

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
          result,
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
    keysWaiting
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

      {status === 'error' && (
        <div className="storeSearchScreen__errorBanner">
          <span className="storeSearchScreen__errorMessage">
            {t(
              'storeSearch.error.provider',
              "Couldn't reach the price provider."
            )}
          </span>
          <button
            type="button"
            className="storeSearchScreen__retryButton"
            onClick={retry}
          >
            {t('storeSearch.error.retry', 'Retry search')}
          </button>
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

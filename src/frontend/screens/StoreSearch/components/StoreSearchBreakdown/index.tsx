import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSpinner } from '@fortawesome/free-solid-svg-icons'

import StoreLogos from 'frontend/components/UI/StoreLogos'
import type { StoreSearchDeal } from 'common/types/storeSearch'
import { formatUsdPrice } from '../../helpers'
import '../../index.css'

interface Props {
  gameId: string
  title: string
  /** Collapses the parent row so a later click retries the fetch (RESEARCH
   * Open Question 2) — no per-row persisted error UI. */
  onFetchFailed: () => void
}

/**
 * Lazy per-store breakdown panel (D-08/D-09/D-12). Mounted only while its
 * parent `StoreSearchRow` is expanded — mounting IS the "on expand" trigger,
 * and unmounting on collapse is what makes a later expand a fresh retry
 * after a failure, with no persisted per-row error state.
 */
const StoreSearchBreakdown = ({ gameId, title, onFetchFailed }: Props) => {
  const { t } = useTranslation()
  const [deals, setDeals] = useState<StoreSearchDeal[] | null>(null)

  useEffect(() => {
    let cancelled = false

    window.api
      .getStoreSearchDeals(gameId)
      .then((result) => {
        if (!cancelled) {
          setDeals(result)
        }
      })
      .catch((error) => {
        window.api.logError(
          `StoreSearchBreakdown: failed to fetch deals for gameId=${gameId}: ${error}`
        )
        if (!cancelled) {
          onFetchFailed()
        }
      })

    return () => {
      cancelled = true
    }
    // onFetchFailed is a parent-owned setter recreated each render;
    // re-running the fetch on its identity change would refire the request
    // outside a real re-expand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId])

  if (deals === null) {
    return (
      <div className="storeSearchRow__breakdown">
        <div className="storeSearchRow__loading">
          <FontAwesomeIcon className="fa-spin-pulse" icon={faSpinner} />
          <span>{t('storeSearch.loadingStores', 'Loading store prices…')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="storeSearchRow__breakdown">
      {deals.map((deal) => (
        <div
          key={deal.storeId}
          className="storeSearchRow__breakdownItem"
          role="button"
          tabIndex={0}
          onClick={() => window.api.openExternalUrl(deal.buyUrl)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              window.api.openExternalUrl(deal.buyUrl)
            }
          }}
          aria-label={t(
            'storeSearch.aria.viewDeal',
            'View deal for {{title}} on {{store}}',
            { title, store: deal.storeName }
          )}
        >
          {deal.runner && (
            <StoreLogos
              runner={deal.runner}
              className="storeSearchRow__breakdownLogo"
            />
          )}
          <span className="storeSearchRow__breakdownStore">
            {deal.storeName}
          </span>
          <span className="storeSearchRow__breakdownPrice">
            {formatUsdPrice(deal.price, deal.currencyCode)}
          </span>
        </div>
      ))}
    </div>
  )
}

export default StoreSearchBreakdown

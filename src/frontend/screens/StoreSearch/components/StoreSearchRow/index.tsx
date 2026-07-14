import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown } from '@fortawesome/free-solid-svg-icons'
import classNames from 'classnames'

import { CachedImage } from 'frontend/components/UI'
import fallBackImage from 'frontend/assets/gamelib_card.svg?url'
import type { StoreSearchResult } from 'common/types/storeSearch'
import type { StoreOwnershipMatch } from 'common/discounts/badges'
import { buildOwnedBadgeLabel, formatUsdPrice } from '../../helpers'
import StoreSearchBreakdown from '../StoreSearchBreakdown'
import '../../index.css'

interface Props {
  result: StoreSearchResult
  /** Already-resolved by the Plan 06 container (resolveStoreSearchBadges) —
   * this row never recomputes ownership (T-20-03). */
  badges: { owned: StoreOwnershipMatch[]; keyAvailable: boolean }
}

/**
 * Collapsed result row (STORESEARCH-03, D-12): thumb, title, store-attributed
 * badge stack, cheapest price, and an expand chevron that lazily mounts
 * `StoreSearchBreakdown`. D-07: `owned` and `keyAvailable` are independent
 * signals that can both render — unlike `DiscountCard`'s owned-XOR-key
 * precedence, this screen shows both pills side by side.
 */
const StoreSearchRow = ({ result, badges }: Props) => {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const ownedLabel = buildOwnedBadgeLabel(badges.owned)

  return (
    <>
      <div className="storeSearchRow">
        <CachedImage
          className="storeSearchRow__thumb"
          src={result.thumb}
          fallback={fallBackImage}
          alt={result.title}
        />
        <span className="storeSearchRow__title">{result.title}</span>
        <div className="storeSearchRow__badges">
          {ownedLabel && (
            <span className="discountCard__badge--owned">
              {t(ownedLabel.key, ownedLabel.defaultValue, ownedLabel.values)}
            </span>
          )}
          {badges.keyAvailable && (
            <span className="discountCard__badge--keyAvailable">
              {t('storeSearch.badge.keyAvailable', 'Key available')}
            </span>
          )}
        </div>
        <span className="storeSearchRow__price">
          {formatUsdPrice(result.cheapestPrice, result.currencyCode)}
        </span>
        <button
          type="button"
          className="storeSearchRow__expandButton"
          aria-expanded={expanded}
          aria-label={t(
            'storeSearch.aria.expand',
            'Show store breakdown for {{title}}',
            { title: result.title }
          )}
          onClick={() => setExpanded((value) => !value)}
        >
          <FontAwesomeIcon
            icon={faChevronDown}
            className={classNames('discountFilters__toggleIcon', {
              'discountFilters__toggleIcon--open': expanded
            })}
          />
        </button>
      </div>
      {expanded && (
        <StoreSearchBreakdown
          gameId={result.gameId}
          title={result.title}
          onFetchFailed={() => setExpanded(false)}
        />
      )}
    </>
  )
}

export default StoreSearchRow

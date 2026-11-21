import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'
import { hasCapability } from 'common/storeCapabilities'
import type { Runner } from 'common/types'
import StoreLogos from 'frontend/components/UI/StoreLogos'
import { getStoreDisplayName } from 'frontend/helpers/storeDisplayName'
import './index.css'

interface Props {
  runner: Runner
  storeUrl: string
}

/**
 * Phase 100 (D-01): the store badge in the meta row, as an in-app link to the
 * store page when the game has a store URL. A sideloaded game, or one with no
 * URL, keeps the plain badge. In-app NavLink only: no window.open and no
 * external launch (T-100-08).
 */
const StoreBadgeLink = ({ runner, storeUrl }: Props) => {
  const { t } = useTranslation()

  if (!hasCapability(runner, 'hasStoreCatalog') || !storeUrl) {
    return (
      <div className="store-icon">
        <StoreLogos runner={runner} />
      </div>
    )
  }

  const store = getStoreDisplayName(runner, '')
  return (
    <NavLink
      className="storeBadgeLink"
      to={`/store-page?store-url=${storeUrl}`}
      aria-label={t(
        'gamelib:gamepage.leftCard.openStorePage',
        'Open the {{store}} store page',
        { store }
      )}
    >
      <StoreLogos runner={runner} />
      {store}
      <span aria-hidden="true">↗</span>
    </NavLink>
  )
}

export default StoreBadgeLink

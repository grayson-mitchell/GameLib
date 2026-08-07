import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import {
  faTags,
  faKey,
  faMagnifyingGlassDollar
} from '@fortawesome/free-solid-svg-icons'

import ContextProvider from 'frontend/state/ContextProvider'
import NavItem from '../NavItem'

/**
 * Stores tier-2 nav list (34.10-05 Task 1). Carries every store-related
 * destination the retired left navigation's row list held
 * (its store submenu, Deals, Store Search, Humble Keys, and the Redeem-a-
 * Steam-key action), unconditionally -- the submenu concept it used to gate
 * the four store rows behind (`inWebviewScreen`) does not exist in the
 * two-tier shell, so those four rows are now plain, always-present members
 * of this panel.
 *
 * The two guard expressions below (Humble Keys' login check and the Redeem
 * row's session check) are copied verbatim from the source they were ported
 * from, not reinterpreted.
 *
 * There is deliberately no third-party storefront row referenced in a
 * standing project decision to drop it: the ported source still renders one
 * conditionally, but it is intentionally absent from this settled list, not
 * an oversight.
 */
export default function StoresPanel() {
  const { t } = useTranslation()
  const { humble, steam, handleRedeemKeyDialog } = useContext(ContextProvider)

  return (
    <div className="NavShell__tier2List">
      <NavItem url="/store/gog" label={t('gog-store', 'GOG Store')} />
      <NavItem url="/store/steam" label={t('steam-store', 'Steam Store')} />
      <NavItem url="/store/epic" label={t('store', 'Epic Store')} />
      <NavItem url="/store/amazon" label={t('amazon-luna', 'Amazon Luna')} />
      <NavItem
        url="/discounts"
        icon={faTags}
        label={t('discounts.sidebar', 'Deals')}
      />
      <NavItem
        url="/store-search"
        icon={faMagnifyingGlassDollar}
        label={t('storeSearch.sidebar', 'Store Search')}
      />
      {humble?.isLoggedIn && (
        <NavItem
          url="/humble-keys"
          icon={faKey}
          label={t('sidebar.humbleKeys', 'Humble Keys')}
        />
      )}
      {steam.username && (
        <NavItem
          elementType="button"
          onClick={() => handleRedeemKeyDialog(true)}
          icon={faKey}
          label={t('sidebar.redeemSteamKey', 'Redeem a Steam key')}
        />
      )}
    </div>
  )
}

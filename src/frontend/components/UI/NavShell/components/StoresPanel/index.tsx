import { useTranslation } from 'react-i18next'
import {
  faTags,
  faKey,
  faMagnifyingGlassDollar,
  faTicket
} from '@fortawesome/free-solid-svg-icons'

import { isStore } from 'common/storeCapabilities'
import useAuthState from 'frontend/state/authState'
import useUiState from 'frontend/state/uiState'
import StoreLogos from 'frontend/components/UI/StoreLogos'
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
 *
 * Deep-link routes (`/store-page`) highlight the owning store's row via
 * `resolveActiveStore` (G-47-6), passed in as `activeStore`.
 */
export default function StoresPanel({
  activeStore = null
}: { activeStore?: string | null } = {}) {
  const { t } = useTranslation()
  const { t: tGamelib } = useTranslation('gamelib')
  const humble = useAuthState((s) => s.humble)
  const steamUsername = useAuthState((s) => s.steamUsername)
  const handleRedeemKeyDialog = useUiState((s) => s.handleRedeemKeyDialog)

  return (
    <div className="NavShell__tier2List">
      <NavItem
        url="/store-search"
        icon={faMagnifyingGlassDollar}
        label={t('storeSearch.sidebar', 'Store Search')}
      />
      <NavItem
        url="/store/amazon"
        isActiveFallback={activeStore === 'amazon'}
        iconElement={
          <StoreLogos runner="nile" className="NavItem__storeLogo" />
        }
        label={t('amazon-luna', 'Amazon Luna')}
      />
      <NavItem
        url="/store/epic"
        isActiveFallback={activeStore === 'epic'}
        iconElement={
          <StoreLogos runner="legendary" className="NavItem__storeLogo" />
        }
        label={t('store', 'Epic Store')}
      />
      <NavItem
        url="/store/gog"
        isActiveFallback={isStore(activeStore, 'gog')}
        iconElement={<StoreLogos runner="gog" className="NavItem__storeLogo" />}
        label={t('gog-store', 'GOG Store')}
      />
      <NavItem
        url="/store/steam"
        isActiveFallback={isStore(activeStore, 'steam')}
        iconElement={
          <StoreLogos runner="steam" className="NavItem__storeLogo" />
        }
        label={t('steam-store', 'Steam Store')}
      />
      <NavItem
        url="/discounts"
        icon={faTags}
        label={t('discounts.sidebar', 'Deals')}
      />
      {humble?.isLoggedIn && (
        <NavItem
          url="/humble-keys"
          isActiveFallback={isStore(activeStore, 'humble')}
          icon={faKey}
          label={t('sidebar.humbleKeys', 'Humble Keys')}
        />
      )}
      {steamUsername && (
        <NavItem
          elementType="button"
          onClick={() => handleRedeemKeyDialog(true)}
          icon={faTicket}
          label={tGamelib('sidebar.redeemSteamKey', 'Redeem a Steam key')}
        />
      )}
    </div>
  )
}

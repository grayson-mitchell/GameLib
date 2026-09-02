import { useContext } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Tab, Tabs } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faGamepad,
  faSlidersH,
  faStore,
  faUserAlt
} from '@fortawesome/free-solid-svg-icons'

import ContextProvider from 'frontend/state/ContextProvider'
import {
  NAV_TAB_INDEX,
  resolveActiveTab,
  resolveDefaultStore
} from '../../navTabs'
import './index.scss'

/**
 * Tier-1 route-driven tab strip (34.10-04, REQ-34.10-02/06/11/14).
 *
 * Promotes four destinations off the retired `SidebarLinks`
 * (`Sidebar/components/SidebarLinks/index.tsx`) -- the GameLib library item,
 * the Stores item (with its default-store cascade), the Settings item, and
 * the separate Manage Accounts item -- onto a reskinned MUI `<Tabs>`.
 *
 * Quick task 260815-lta: the strip now reads ACCOUNTS / LIBRARY / STORES /
 * SETTINGS. The first two labels are re-keyed content (`nav.tabs.accounts`,
 * `nav.tabs.library`); the all-caps presentation is applied by the colocated
 * stylesheet's `text-transform: uppercase`, not by any string here.
 *
 * MUI is used **only** as the accessibility primitive here: roving
 * `tabIndex`, arrow-key navigation, `role="tablist"`/`role="tab"`,
 * `aria-selected`. `<Tabs>` here carries no controlled-selection handler --
 * `value` is derived purely from `resolveActiveTab(location.pathname)`, so
 * the strip is route-driven, not state-driven. When the route has no owning
 * tab (currently only
 * `/download-manager`), `resolveActiveTab` returns `null`, which is coerced
 * to MUI's `false` no-selection sentinel -- the Downloads ring carries the
 * active signal there instead (navigation-shell.md §6).
 *
 * No redundant `aria-label` is set on `<Tabs>` -- each `<Tab>` already
 * carries its own accessible name via `label`, so inventing a fifth
 * translatable string here would be redundant with the four that already
 * exist.
 */
export default function NavTabs() {
  const { t } = useTranslation()
  const location = useLocation() as { pathname: string }
  const { epic, gog, amazon, steam, zoom, refreshLibrary } =
    useContext(ContextProvider)

  const activeTab = resolveActiveTab(location.pathname)
  const defaultStore = resolveDefaultStore({
    epic,
    gog,
    amazon,
    // ContextType's `steam.username` is `string | null | undefined`
    // (`frontend/types.ts:114`) while `NavStoreSessions.steam.username` is
    // `string | undefined` -- coerce the `null` case here rather than
    // widening plan 01's shared contract type for one caller.
    steam: { username: steam.username ?? undefined },
    zoom
  })

  // Ported verbatim from the retired GameLib sidebar item's onClick
  // (`Sidebar/components/SidebarLinks/index.tsx:52-64`). Dropping this would
  // silently stop the library from self-healing after a failed first sync.
  async function handleRefresh() {
    localStorage.setItem('scrollPosition', '0')

    const shouldRefresh =
      (epic.username && !epic.library.length) ||
      (gog.username && !gog.library.length) ||
      (amazon.user_id && !amazon.library.length) ||
      (zoom.username && !zoom.library.length)
    if (shouldRefresh) {
      return refreshLibrary({
        runInBackground: true,
        origin: 'nav-tabs-games-tab'
      })
    }
    return
  }

  return (
    <Tabs className="NavTabs" value={activeTab ?? false} data-tour="nav-menu">
      <Tab
        component={NavLink}
        to="/login"
        value="accounts"
        id={`tab-${NAV_TAB_INDEX.accounts}`}
        label={t('nav.tabs.accounts', 'Accounts')}
        icon={<FontAwesomeIcon icon={faUserAlt} />}
        iconPosition="start"
        disableRipple
        data-tour="nav-manage-accounts"
      />
      <Tab
        component={NavLink}
        to="/"
        value="games"
        id={`tab-${NAV_TAB_INDEX.games}`}
        label={t('nav.tabs.library', 'Library')}
        icon={<FontAwesomeIcon icon={faGamepad} />}
        iconPosition="start"
        disableRipple
        onClick={async () => handleRefresh()}
        data-tour="nav-library"
      />
      <Tab
        component={NavLink}
        to={`/store/${defaultStore}`}
        value="stores"
        id={`tab-${NAV_TAB_INDEX.stores}`}
        label={t('stores', 'Stores')}
        icon={<FontAwesomeIcon icon={faStore} />}
        iconPosition="start"
        disableRipple
        data-tour="nav-stores"
      />
      <Tab
        component={NavLink}
        to="/settings/general"
        value="settings"
        id={`tab-${NAV_TAB_INDEX.settings}`}
        label={t('Settings', 'Settings')}
        icon={<FontAwesomeIcon icon={faSlidersH} />}
        iconPosition="start"
        disableRipple
        data-tour="nav-settings"
      />
    </Tabs>
  )
}

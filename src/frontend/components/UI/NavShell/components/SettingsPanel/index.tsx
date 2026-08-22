import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import {
  faBookOpen,
  faCircleQuestion,
  faCoffee,
  faUniversalAccess,
  faWineGlass,
  faTv
} from '@fortawesome/free-solid-svg-icons'

import ContextProvider from 'frontend/state/ContextProvider'
import { SHOW_EXTERNAL_LINK_DIALOG_STORAGE_KEY } from 'frontend/components/UI/ExternalLinkDialog'
import { useTour } from 'frontend/state/TourContext'
import NavItem from '../NavItem'
import QuitButton from '../QuitButton'
import { NAV_TOUR_ID } from '../NavShellTour'

/**
 * Settings tier-2 nav list (34.10-05 Task 2). Carries every Settings-related
 * destination the retired left navigation held, in the settled order, plus
 * the relocated quit action last.
 *
 * Three of these rows are reparented rather than relocated: Wine Manager,
 * Accessibility and Console Mode used to be structural siblings of the
 * Settings item rather than members of its submenu -- each keeps the exact
 * guard (or lack of one) it carried at its old position.
 *
 * The bare "Ko-fi" label is an exact do-not-translate glossary term (a
 * brand name), so it is deliberately not passed through the translation
 * function -- doing so would mint a fake translation key for a proper noun.
 * Its click handler ports the retired external-link confirmation gate
 * verbatim: read the stored dialog preference and either ask first or open
 * directly.
 *
 * The "App Tour" row (D-01, 34.12-05 Task 2) is the shell tour's only
 * launcher -- without it the rebuilt tour is unreachable. It is a plain
 * `NavItem` button row, not an icon-button affordance, so it does not stand
 * out from its neighbours. Its `data-tour="nav-launcher"` value is
 * deliberately a THIRTEENTH anchor with no corresponding tour step -- it
 * exists so the row itself is addressable, not as a dead selector. Its
 * click handler restarts the tour from scratch when it was already
 * completed (reset-then-start), so a finished tour can be re-run.
 */
export default function SettingsPanel() {
  const { t } = useTranslation()
  const { platform, handleExternalLinkDialog } = useContext(ContextProvider)
  const { startTour, resetTour, hasTourCompleted } = useTour()
  const isWin = platform === 'win32'

  function handleStartTour() {
    if (hasTourCompleted(NAV_TOUR_ID)) {
      resetTour(NAV_TOUR_ID)
    }
    startTour(NAV_TOUR_ID)
  }

  function handleKofiClick() {
    const showDialogSetting = localStorage.getItem(
      SHOW_EXTERNAL_LINK_DIALOG_STORAGE_KEY
    )
    const showExternalLinkDialog = showDialogSetting
      ? (JSON.parse(showDialogSetting) as boolean)
      : true

    if (showExternalLinkDialog) {
      handleExternalLinkDialog({
        showDialog: true,
        linkCallback: window.api.openKofiPage
      })
    } else {
      window.api.openKofiPage()
    }
  }

  return (
    <div className="NavShell__tier2List">
      <NavItem
        url="/settings/general"
        label={t('settings.navbar.general', 'General')}
      />
      {!isWin && (
        <NavItem
          url="/settings/games_settings"
          label={t('settings.navbar.games_settings_defaults', 'Game Defaults')}
        />
      )}
      <NavItem
        url="/settings/advanced"
        label={t('settings.navbar.advanced', 'Advanced')}
      />
      {!isWin && (
        <NavItem
          url="/wine-manager"
          icon={faWineGlass}
          label={t('wine.manager.link', 'Wine Manager')}
          data-tour="nav-wine"
        />
      )}
      <NavItem
        url="/accessibility"
        icon={faUniversalAccess}
        label={t('accessibility.title', 'Accessibility')}
        data-tour="nav-accessibility"
      />
      <NavItem
        url="/console"
        icon={faTv}
        label={t('sidebar.console', 'Console Mode')}
      />
      <NavItem url="/settings/log" label={t('settings.navbar.log', 'Log')} />
      <NavItem
        url="/settings/systeminfo"
        label={t('settings.navbar.systemInformation', 'System Information')}
      />
      <NavItem
        url="/wiki"
        icon={faBookOpen}
        label={t('docs', 'Documentation')}
        data-tour="nav-docs"
      />
      <NavItem
        elementType="button"
        onClick={handleKofiClick}
        icon={faCoffee}
        label="Ko-fi"
        data-tour="nav-community"
      />
      <NavItem
        elementType="button"
        onClick={handleStartTour}
        icon={faCircleQuestion}
        label={t('tour.nav.launcher', 'App Tour')}
        data-tour="nav-launcher"
      />
      <QuitButton />
    </div>
  )
}

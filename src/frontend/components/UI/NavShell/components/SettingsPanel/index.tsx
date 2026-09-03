import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import {
  faBookOpen,
  faCircleQuestion,
  faCoffee,
  faUniversalAccess,
  faWineGlass,
  faTv,
  faCircleInfo
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
 * The About row is the About window's ONLY entry point under Tauri. The
 * window itself (`tauriShowAboutWindow`) has been fully implemented since
 * 34.1 and had no caller anywhere outside `tray_icon.ts`'s Electron tray
 * menu, which Tauri does not run -- Tauri's own tray is a deliberately
 * bounded Show/Quit menu. `window.api.showAboutWindow()` resolves directly to
 * `tauriShowAboutWindow()` (`preload/api/helpers.ts:14`), so this row opens the
 * real Tauri `WebviewWindow`.
 *
 * The original 260822-tv4 comment described this as shell-agnostic by way of a
 * runtime shell-detection switch in `preload/api/helpers.ts`. That was true when
 * written on `main`; Phase 35 plan 17 has since collapsed the Electron-branch
 * fallback, the Tauri shell being the only shell, so no such switch remains.
 * Corrected when the commit was landed here (quick `260902-ucw`) rather than
 * ported verbatim -- and deliberately worded without naming the removed helper,
 * because the D-01/D-00b completeness gate in `meta/__tests__/` is a ZERO-MATCH
 * grep over all of `src/` that does not exempt comments, and matches on the bare
 * identifier (so even the gate file's own name cannot be cited here). It caught
 * the first two drafts of this very comment.
 *
 * Its label is a fork-owned `gamelib:` key rather than the already-
 * translated `tray.about`: several of that key's shipped translations
 * still carry the pre-fork brand name (de is "Uber Heroic"), which has no
 * business on a new surface.
 *
 * The donate row's label is a fork-owned `gamelib:` key. It rendered the
 * bare literal "Ko-fi" until quick `260903-vwi`, on the stated grounds that
 * the brand name was an exact do-not-translate glossary term -- a claim
 * that was simply false (`meta/i18nGlossary.json` holds 28 terms and has
 * never contained "Ko-fi"; the literal survived the gate for some other
 * reason). "Donate" is an ordinary English verb either way, so it has no
 * claim to an exemption and must be translated like any other prose.
 *
 * The key is NEW rather than a reused one on purpose. Nothing in this repo
 * detects English-side drift: `gamelibCatalogParity` walks the TRANSLATED
 * catalog and only asks whether each key exists in `en` and passes the
 * placeholder/plural/glossary rules, and the `.mt.json` provenance sidecar
 * records locale/model/filledAt plus key NAMES -- no source text, no hash,
 * nothing to compare against. A fresh key is absent from all 48 locales,
 * which the parity gate allows, so each falls back to the new English
 * instead of a translation written for the old wording.
 *
 * Only the visible word changed: the handler, the `faCoffee` icon, the
 * `nav-community` tour anchor and the ko-fi.com destination are untouched.
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
  const { t: tGamelib } = useTranslation('gamelib')
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
        onClick={() => window.api.showAboutWindow()}
        icon={faCircleInfo}
        label={tGamelib('gamelib:about.navLabel', 'About')}
      />
      <NavItem
        elementType="button"
        onClick={handleKofiClick}
        icon={faCoffee}
        label={tGamelib('gamelib:donate.navLabel', 'Donate')}
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

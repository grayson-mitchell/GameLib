import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSyncAlt } from '@fortawesome/free-solid-svg-icons'
import { useTranslation } from 'react-i18next'

/**
 * Phase 34.13, Plan 11 -- D-25's relocation of the EXISTING
 * `buttonWithIcon` + `faSyncAlt`/`fa-spin` idiom (`MainButton.tsx`,
 * `GameCard/index.tsx`) into the Steam install-options dialog. This is NOT
 * a new spinner component -- it ships no stylesheet by design (the
 * `WineSelector` zero-stylesheet precedent), and it renders in the exact
 * DOM slot the Steam `<WineSelector>` would otherwise occupy, mounted by
 * `InstallModal/index.tsx` (never by `SteamDialog` itself, because the wine
 * section arrives through `{children}`).
 *
 * VACUITY BOUNDARY: this component is proven only by direct invocation and
 * element-graph inspection (`__tests__/EligibilityLoadingRow.test.tsx`).
 * Nothing here, or in that test, proves this actually paints on screen --
 * that is 34.13-13's blocking manual gate.
 */
export default function EligibilityLoadingRow() {
  // Deliberate: the `gamelib:` prefix overrides whatever namespace the
  // surrounding `useTranslation` in `InstallModal`/`SteamDialog` is bound
  // to. The key and its English default are reused VERBATIM from their
  // origin-control home, only the render location changes (D-25).
  const { t } = useTranslation('gamelib')
  return (
    <span className="buttonWithIcon">
      <FontAwesomeIcon icon={faSyncAlt} className="fa-spin" />
      {t(
        'gamelib:status.checkingSteamInstallOptions',
        'Checking install options…'
      )}
    </span>
  )
}

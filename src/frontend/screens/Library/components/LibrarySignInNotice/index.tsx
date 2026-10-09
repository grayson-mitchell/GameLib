/**
 * The inline, non-blocking Library sign-in notice (Phase 49 D-09).
 *
 * ONE `<div className="LibrarySignInNotice">` in normal document flow: no
 * `position: absolute`, no `position: fixed`, no full-viewport container, no
 * modal surface, and no early return that replaces siblings. It returns `null`
 * when there is nothing to report and otherwise occupies its own row above the
 * grid, so it can never cover the merged library -- the same structural
 * guarantee `SteamSyncNotice` gives, which is the defect-2b lesson.
 *
 * It never gates the library: cached games keep rendering and installed games
 * stay launchable whatever a store's sign-in state is (R8).
 *
 * The state decision is NOT made here. It flows
 * `collectSignInInputs` -> `resolveSignInStates` (`common/signInState.ts`) ->
 * `resolveLibrarySignInRows`, so this component never re-inlines a flag
 * comparison (D-06). Sign in navigates to Manage Accounts with the store's
 * overlay requested through `?open=` (D-13).
 *
 * Store names enter the string only through the `{{store}}` interpolation
 * variable, never by concatenation (R9).
 */
import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { faExclamationTriangle } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

import { resolveSignInStates } from 'common/signInState'
import { collectSignInInputs } from 'frontend/helpers/signInInputs'
import ContextProvider from 'frontend/state/ContextProvider'
import { buildLoginOpenPath } from 'frontend/screens/Login/loginOpenParam'
import { RunnerToStore } from '../../facetLabels'
import { resolveLibrarySignInRows } from '../../librarySignInRows'
import './index.scss'

export default function LibrarySignInNotice() {
  const { t: tGamelib } = useTranslation('gamelib')
  const { epic, gog, amazon, humble, steam, signInProbeOutcomes } =
    useContext(ContextProvider)
  const navigate = useNavigate()

  // Row visibility is derived from context state on every render: no event
  // subscription and no local copy, so a sign-in that completed while the
  // Library was unmounted leaves no row on return (R6). `signInProbeOutcomes`
  // is this launch's pushed-and-pulled map (`{}` = every store pending).
  const states = resolveSignInStates(
    collectSignInInputs(
      {
        epicUsername: epic.username,
        gogUsername: gog.username,
        amazonUserId: amazon.user_id,
        humbleLoggedIn: humble?.isLoggedIn,
        humbleExpired: humble?.expired,
        steamUsername: steam?.username
      },
      signInProbeOutcomes
    )
  )
  const rows = resolveLibrarySignInRows({ states })

  if (rows.length === 0) {
    return null
  }

  return (
    <div className="LibrarySignInNotice">
      {rows.map((row) => (
        <div
          key={row.store}
          className="LibrarySignInNotice__row LibrarySignInNotice__row--expired"
        >
          <FontAwesomeIcon icon={faExclamationTriangle} />
          <span className="LibrarySignInNotice__text">
            {tGamelib(
              'gamelib:library.signIn.expired',
              'Your {{store}} sign-in expired',
              { store: RunnerToStore[row.store] }
            )}
          </span>
          <button
            type="button"
            className="button is-footer"
            onClick={() => navigate(buildLoginOpenPath(row.store))}
          >
            {tGamelib('gamelib:library.signIn.reconnect', 'Reconnect')}
          </button>
        </div>
      ))}
    </div>
  )
}

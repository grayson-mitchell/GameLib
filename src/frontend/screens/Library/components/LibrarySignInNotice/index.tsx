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
 * Two visual weights, ONE row element (D-11). An `expired` row is a warning
 * (triangle icon, `Reconnect`, no dismiss); a `not-connected` row is plain
 * information (the store's own logo, `Sign in`, and a dismiss control). Which
 * weight a row gets is a modifier class picked by `row.kind`, so the two can
 * never drift into separate layouts. A never-connected store is not an error
 * and is never styled or worded as one (P4).
 *
 * Dismissal state is owned by the renderer's GlobalState and persisted; this
 * component only reads it and reports clicks. The re-arm effect below hands
 * GlobalState the derived states so a store that goes connected -> expired
 * gets its dismissal cleared (D-10).
 *
 * Nothing here probes: it reads context and calls no `window.api` method, so
 * mounting the Library starts no keyring read (P3).
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
import { useContext, useEffect } from 'react'
import classNames from 'classnames'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  faExclamationTriangle,
  faXmark
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

import { SIGN_IN_STORES, resolveSignInStates } from 'common/signInState'
import type { SignInStore } from 'common/signInState'
import { collectSignInInputs } from 'frontend/helpers/signInInputs'
import ContextProvider from 'frontend/state/ContextProvider'
import { buildLoginOpenPath } from 'frontend/screens/Login/loginOpenParam'
import EpicLogo from 'frontend/assets/epic-logo.svg?react'
import GOGLogo from 'frontend/assets/gog-logo.svg?react'
import AmazonLogo from 'frontend/assets/amazon-logo.svg?react'
import SteamLogo from 'frontend/assets/steam-logo.svg?react'
import HumbleLogo from 'frontend/assets/humble-logo.svg?react'
import { RunnerToStore } from '../../facetLabels'
import { resolveLibrarySignInRows } from '../../librarySignInRows'
import './index.scss'

// The same five assets the Login screen's store tiles use.
function StoreLogo({ store }: { store: SignInStore }) {
  switch (store) {
    case 'legendary':
      return <EpicLogo />
    case 'gog':
      return <GOGLogo />
    case 'nile':
      return <AmazonLogo />
    case 'humble':
      return <HumbleLogo />
    case 'steam':
      return <SteamLogo />
  }
}

export default function LibrarySignInNotice() {
  const { t: tGamelib } = useTranslation('gamelib')
  const {
    epic,
    gog,
    amazon,
    humble,
    steam,
    signInProbeOutcomes,
    dismissedSignInNotices,
    handleDismissSignInNotice,
    handleRearmSignInDismissals
  } = useContext(ContextProvider)
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
  const rows = resolveLibrarySignInRows({
    states,
    dismissed: dismissedSignInNotices
  })

  // Re-arm (D-10): a dismissal is dropped when its store is observed
  // `expired`, so the store's next never-connected episode shows again. Keyed
  // on the five states in canonical order so unrelated renders do not re-run
  // it; the handler is idempotent and only writes when the set changes, so it
  // cannot loop.
  const statesKey = SIGN_IN_STORES.map((store) => states[store]).join(',')
  useEffect(() => {
    handleRearmSignInDismissals(states)
    // `states` and the handler are functions of `statesKey` / stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statesKey])

  if (rows.length === 0) {
    return null
  }

  return (
    <div className="LibrarySignInNotice">
      {rows.map((row) => (
        <div
          key={row.store}
          className={classNames('LibrarySignInNotice__row', {
            'LibrarySignInNotice__row--expired': row.kind === 'expired',
            'LibrarySignInNotice__row--notConnected':
              row.kind === 'not-connected'
          })}
        >
          {row.kind === 'expired' ? (
            <FontAwesomeIcon icon={faExclamationTriangle} />
          ) : (
            <span className="LibrarySignInNotice__icon">
              <StoreLogo store={row.store} />
            </span>
          )}
          <span className="LibrarySignInNotice__text">
            {row.kind === 'expired'
              ? tGamelib(
                  'gamelib:library.signIn.expired',
                  'Your {{store}} sign-in expired',
                  { store: RunnerToStore[row.store] }
                )
              : tGamelib(
                  'gamelib:library.signIn.notConnected',
                  '{{store}} is not connected',
                  { store: RunnerToStore[row.store] }
                )}
          </span>
          <div className="LibrarySignInNotice__actions">
            <button
              type="button"
              className="button is-footer"
              onClick={() => navigate(buildLoginOpenPath(row.store))}
            >
              {row.kind === 'expired'
                ? tGamelib('gamelib:library.signIn.reconnect', 'Reconnect')
                : tGamelib('gamelib:library.signIn.signIn', 'Sign in')}
            </button>
            {row.dismissible && (
              <button
                type="button"
                className="LibrarySignInNotice__dismiss"
                aria-label={tGamelib(
                  'gamelib:library.signIn.dismiss',
                  'Dismiss the {{store}} sign-in notice',
                  { store: RunnerToStore[row.store] }
                )}
                onClick={() => handleDismissSignInNotice(row.store)}
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

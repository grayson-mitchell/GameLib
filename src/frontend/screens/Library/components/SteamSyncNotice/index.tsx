/**
 * The inline, non-blocking Steam sync notice (34.15 D-08/D-10).
 *
 * ONE component, TWO modes -- never two components. Both modes render the
 * SAME `<div className="SteamSyncNotice">` in normal document flow: no
 * `position: absolute`, no `position: fixed`, no full-viewport container,
 * no early return that replaces siblings. This is the mechanical reason
 * defect 2b (6 GOG games hidden behind a centred Steam spinner) cannot
 * recur -- there is no longer anything in this component that CAN cover
 * the merged library grid. `libraryToShow` is a single grid across every
 * runner; this widget only ever occupies its own row above it.
 *
 * `'hidden'` is not a prop value here on purpose -- the CALLER
 * (`Library/index.tsx`) decides whether to mount this component at all via
 * `resolveSteamSyncIndicator`'s output, so this component's prop type never
 * has to represent "render nothing" as a state.
 *
 * `'syncing'` mirrors `UpdateComponent`'s icon choice (`faSyncAlt`) so the
 * two surfaces read as the same visual family. `'failed'` adds a
 * Steam-scoped retry that calls straight into the existing scoped
 * refresh path, runner-scoped to Steam (`GlobalState.tsx:1114-1157`), which
 * already guards double-entry via `refreshingByRunner.steam` and already
 * clears that flag on failure -- no new backend wiring is needed.
 *
 * Does NOT reuse the library's full-screen error surface (see
 * `Library/index.tsx:883-892`) -- that component's usage there is a
 * full-screen early-return replacement, and reusing that shape here would
 * recreate defect 2b, the exact defect this component exists to kill.
 */
import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  faExclamationTriangle,
  faSyncAlt
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

import ContextProvider from 'frontend/state/ContextProvider'
import './index.scss'

export interface SteamSyncNoticeProps {
  mode: 'syncing' | 'failed' | 'signedOut'
}

export default function SteamSyncNotice({ mode }: SteamSyncNoticeProps) {
  const { t: tGamelib } = useTranslation('gamelib')
  const { refreshLibrary } = useContext(ContextProvider)
  const navigate = useNavigate()

  if (mode === 'syncing') {
    return (
      <div className="SteamSyncNotice SteamSyncNotice--syncing">
        <FontAwesomeIcon icon={faSyncAlt} />
        <span className="SteamSyncNotice__text">
          {tGamelib(
            'gamelib:library.steamSync.syncing',
            'Syncing your Steam library…'
          )}
        </span>
      </div>
    )
  }

  // Same outer div, same document flow, same class shape as the other two
  // modes -- the structural contract in this file's header applies to every
  // branch, not just the two it was written for.
  if (mode === 'signedOut') {
    return (
      <div className="SteamSyncNotice SteamSyncNotice--failed">
        <FontAwesomeIcon icon={faExclamationTriangle} />
        <span className="SteamSyncNotice__text">
          <strong>
            {tGamelib(
              'gamelib:library.steamSync.signedOutTitle',
              'Your Steam sign-in expired'
            )}
          </strong>
          <span>
            {tGamelib(
              'gamelib:library.steamSync.signedOutBody',
              'Sign in again to sync your Steam library. Your other libraries are still available.'
            )}
          </span>
        </span>
        {/* Sign in, NOT retry: a refresh here re-enters the same path, hits
            the same empty credential read, and fails identically. Matches the
            install dialog's 'signIn' affordance (steam/depotErrors.ts). */}
        <button
          type="button"
          className="button is-footer"
          onClick={() => navigate('/login')}
        >
          {tGamelib(
            'gamelib:library.steamSync.signedOutAction',
            'Sign in to Steam'
          )}
        </button>
      </div>
    )
  }

  return (
    <div className="SteamSyncNotice SteamSyncNotice--failed">
      <FontAwesomeIcon icon={faExclamationTriangle} />
      <span className="SteamSyncNotice__text">
        <strong>
          {tGamelib(
            'gamelib:library.steamSync.failedTitle',
            "Couldn't sync your Steam library"
          )}
        </strong>
        <span>
          {tGamelib(
            'gamelib:library.steamSync.failedBody',
            'Your other libraries are still available. Try again, or check that Steam is reachable.'
          )}
        </span>
      </span>
      <button
        type="button"
        className="button is-footer"
        onClick={async () =>
          refreshLibrary({
            library: 'steam',
            checkForUpdates: false,
            runInBackground: true,
            origin: 'steam-sync-notice-retry'
          })
        }
      >
        {tGamelib('gamelib:library.steamSync.retry', 'Retry Steam sync')}
      </button>
    </div>
  )
}

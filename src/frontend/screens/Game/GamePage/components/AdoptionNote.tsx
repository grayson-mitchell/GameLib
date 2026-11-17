import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isStore } from 'common/storeCapabilities'
import type { GameInfo } from 'common/types'
import type { SteamAdoptionStatus } from 'common/types/steam'
import useLibraryState from 'frontend/state/libraryState'
import GameContext from '../../GameContext'
import './AdoptionNote.scss'

interface Props {
  gameInfo: GameInfo
}

/** One status read; a rejected query counts as "nothing to show" (the page never errors on it). */
const readStatus = async (
  appName: string
): Promise<SteamAdoptionStatus | null> => {
  try {
    return await window.api.steamAdoptionStatus(appName)
  } catch {
    return null
  }
}

/**
 * Phase 81 D-01: the quiet note under the game status for an installed Steam game whose install
 * Steam has not adopted yet. The frontend never derives adoption: everything shown here comes from
 * the backend's `steamAdoptionStatus` answer, read on mount, when the game's operation status
 * changes, and after an action resolves.
 *
 * The same block serves the one GameLib 1026 install still waiting for a Steam restart
 * (`steam-waiting-for-restart`, RESEARCH Open Question 1): there it is the action alone, no note,
 * because Play is not available on that path.
 *
 * Hooks run unconditionally before any early return.
 */
const AdoptionNote = ({ gameInfo }: Props) => {
  const { t } = useTranslation('gamelib')
  const { is, statusContext } = useContext(GameContext)
  const appName = gameInfo.app_name
  const steam = isStore(gameInfo, 'steam')
  const [status, setStatus] = useState<SteamAdoptionStatus | null>(null)
  // True while an action is in flight (T-81-28: no repeated clicks).
  const [busy, setBusy] = useState(false)
  // Re-read after the game's operation status changes (an install ending, a launch finishing).
  const libraryStatus = useLibraryState(
    (s) => s.libraryStatus.find((g) => g.appName === appName)?.status
  )

  useEffect(() => {
    if (!steam) {
      setStatus(null)
      return
    }
    let cancelled = false
    readStatus(appName)
      .then((result) => {
        if (!cancelled) setStatus(result)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [appName, steam, libraryStatus])

  if (!steam) return null

  const waitingForRestart =
    is.installing && statusContext === 'steam-waiting-for-restart'
  const installedPending = gameInfo.is_installed && status?.pending === true
  if (!waitingForRestart && !installedPending) return null

  const signedOut = status?.steamSignedIn === false
  const text = waitingForRestart
    ? null
    : signedOut
      ? t('steam.adoption.note.signIn', 'Sign in to Steam to finish setup')
      : t(
          'steam.adoption.note.restartOnPlay',
          'Steam will restart once when you press Play.'
        )

  // D-04: neither action asks for confirmation. A refused restart explains itself through the
  // in-app notice the backend pushes; this block only re-reads the status afterwards.
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try {
      await action()
    } catch {
      // The backend answers failures itself; the re-read below shows the true state.
    }
    setStatus(await readStatus(appName))
    setBusy(false)
  }

  return (
    <div className="steamAdoptionNote" role="status">
      {text && <span className="steamAdoptionNote__text">{text}</span>}
      <button
        type="button"
        className="button is-secondary steamAdoptionNote__action"
        disabled={busy || is.launching || is.playing}
        onClick={() =>
          run(() =>
            signedOut
              ? window.api.steamAdoptionOpenSteam(appName)
              : window.api.steamAdoptionRestartNow(appName)
          )
        }
      >
        {signedOut
          ? t('steam.adoption.action.openSteam', 'Open Steam')
          : t('steam.adoption.action.restartNow', 'Restart Steam now')}
      </button>
    </div>
  )
}

export default AdoptionNote

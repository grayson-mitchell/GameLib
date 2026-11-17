import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isStore } from 'common/storeCapabilities'
import type { GameInfo } from 'common/types'
import type { SteamAdoptionStatus } from 'common/types/steam'
import useLibraryState from 'frontend/state/libraryState'

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
 * the backend's `steamAdoptionStatus` answer, read on mount and whenever the game's operation
 * status changes.
 *
 * Hooks run unconditionally before any early return.
 */
const AdoptionNote = ({ gameInfo }: Props) => {
  const { t } = useTranslation('gamelib')
  const appName = gameInfo.app_name
  const steam = isStore(gameInfo, 'steam')
  const [status, setStatus] = useState<SteamAdoptionStatus | null>(null)
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

  if (!steam || !gameInfo.is_installed || status?.pending !== true) return null

  return (
    <div className="steamAdoptionNote" role="status">
      <span className="steamAdoptionNote__text">
        {t(
          'steam.adoption.note.restartOnPlay',
          'Steam will restart once when you press Play.'
        )}
      </span>
    </div>
  )
}

export default AdoptionNote

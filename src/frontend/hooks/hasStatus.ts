import React from 'react'
import ContextProvider from 'frontend/state/ContextProvider'
import { GameInfo, GameStatus, Status } from 'common/types'
import { hasProgress } from './hasProgress'
import { useTranslation } from 'react-i18next'
import { getStatusLabel, handleNonAvailableGames } from './constants'

/**
 * Pure precedence derivation shared by hasStatus's checkGameStatus effect and
 * hasStatus.reconcile.test.ts (GAP-17-BOTTLE-INSTALL-DONE-DESYNC). Kept
 * side-effect free (no async, no window/DOM) so it can be exercised directly
 * in a no-jsdom CI test without mounting the hook.
 *
 * Mirrors the exact branch order checkGameStatus used inline before this
 * extraction:
 *   1. an active (non-'done') libraryStatus entry always wins ('active')
 *   2. a third-party-managed, non-EA/Ubisoft app is 'notSupportedGame'
 *   3. is_installed (and not third-party-managed) is 'installed' — the
 *      caller still runs the async delisted-game check on this result
 *   4. otherwise 'notInstalled'
 */
export type DerivedStatusKind =
  | 'active'
  | 'notSupportedGame'
  | 'installed'
  | 'notInstalled'

export function deriveInstallStatusKind(params: {
  statusEntry?: Pick<GameStatus, 'status' | 'folder' | 'context'>
  is_installed: boolean
  thirdPartyManagedApp?: string
  isEAManaged?: boolean
  isUbisoftManaged?: boolean
}): DerivedStatusKind {
  const {
    statusEntry,
    is_installed,
    thirdPartyManagedApp,
    isEAManaged,
    isUbisoftManaged
  } = params

  if (statusEntry?.status && statusEntry.status !== 'done') {
    return 'active'
  }

  if (thirdPartyManagedApp && !isEAManaged && !isUbisoftManaged) {
    return 'notSupportedGame'
  }

  if (is_installed && !thirdPartyManagedApp) {
    return 'installed'
  }

  return 'notInstalled'
}

export function hasStatus(gameInfo: GameInfo, gameSize?: string) {
  const appName = gameInfo.app_name
  const { libraryStatus, epic, gog } = React.useContext(ContextProvider)
  const [progress] = hasProgress(gameInfo.app_name, gameInfo.runner)
  const [newGameInfo, setNewGameInfo] = React.useState<GameInfo | undefined>(
    gameInfo
  )
  const { t } = useTranslation('gamepage')

  const [gameStatus, setGameStatus] = React.useState<{
    status?: Status
    statusContext?: string
    folder?: string
    label: string
  }>({ label: '' })

  const {
    thirdPartyManagedApp = undefined,
    is_installed,
    runner = 'sideload',
    isEAManaged,
    isUbisoftManaged
  } = { ...newGameInfo }

  // GAP-17-BOTTLE-INSTALL-DONE-DESYNC: keep the tracked gameInfo in sync with
  // the LIVE prop instead of freezing it at mount. GamePage/GameCard refetch
  // gameInfo and pass a fresh object once the poller pushes is_installed:true
  // — without this sync, `is_installed` below stayed pinned to whatever was
  // true when this hook first mounted, so checkGameStatus never reached the
  // 'installed' branch and the button/tile stayed stuck on the last
  // 'installing' state until a nav/focus round-trip remounted the hook.
  React.useEffect(() => {
    if (gameInfo) {
      setNewGameInfo(gameInfo)
    }
  }, [gameInfo])

  React.useEffect(() => {
    if (newGameInfo) {
      return
    }
    const getGameInfo = async () => {
      const updatedInfo = await window.api.getGameInfo(
        appName,
        runner || 'sideload'
      )
      if (updatedInfo) {
        setNewGameInfo(updatedInfo)
      }
    }
    getGameInfo()
  }, [appName, gameInfo])

  React.useEffect(() => {
    const checkGameStatus = async () => {
      const statusEntry = libraryStatus.find(
        (game: GameStatus) => game.appName === appName
      )
      const { folder, context: statusContext } = statusEntry ?? {}

      const kind = deriveInstallStatusKind({
        statusEntry,
        is_installed: !!is_installed,
        thirdPartyManagedApp,
        isEAManaged,
        isUbisoftManaged
      })

      if (kind === 'active') {
        const { status } = statusEntry as GameStatus
        const label = getStatusLabel({
          status,
          t,
          runner,
          size: gameSize,
          statusContext,
          percent: progress.percent
        })
        return setGameStatus({ status, folder, label, statusContext })
      }

      if (kind === 'notSupportedGame') {
        const label = getStatusLabel({
          status: 'notSupportedGame',
          t,
          runner
        })
        return setGameStatus({
          status: 'notSupportedGame',
          label,
          statusContext
        })
      }

      if (kind === 'installed') {
        const gameAvailable = await handleNonAvailableGames(appName, runner)
        if (!gameAvailable) {
          const label = getStatusLabel({
            status: 'notAvailable',
            t,
            runner
          })
          return setGameStatus({ status: 'notAvailable', label, statusContext })
        }
        const label = getStatusLabel({
          status: 'installed',
          t,
          runner,
          size: gameSize
        })
        return setGameStatus({ status: 'installed', label, statusContext })
      }

      // D-UAT-09 (21-17): an incomplete on-disk native steam install (a
      // same-session cancel via markSteamInstallIncomplete, or a startup-
      // surfaced interrupted download — both set install.steamResumePending)
      // must read as "needs Steam to finish", never the generic not-
      // installed copy. Threaded via statusContext, the SAME mechanism
      // steam-waiting-for-restart/steam-paused already use — 'steam-
      // incomplete' is a DISTINCT value from those (this game is NOT
      // currently installing; no active poll).
      const resumeContext =
        runner === 'steam' && newGameInfo?.install?.steamResumePending
          ? 'steam-incomplete'
          : statusContext
      const label = getStatusLabel({
        status: 'notInstalled',
        t,
        runner,
        statusContext: resumeContext
      })
      return setGameStatus({
        status: 'notInstalled',
        label,
        statusContext: resumeContext
      })
    }
    checkGameStatus()
  }, [
    libraryStatus,
    appName,
    epic.library,
    gog.library,
    is_installed,
    progress.percent
  ])

  return gameStatus
}

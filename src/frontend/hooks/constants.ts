import { Runner, Status } from 'common/types'
import { TFunction } from 'i18next'

type StatusArgs = {
  status: Status
  t: TFunction<'gamepage', undefined>
  runner: Runner
  statusContext?: string
  percent?: number
  size?: string
}

export function getStatusLabel({
  status,
  statusContext,
  t,
  runner,
  size,
  percent
}: StatusArgs): string {
  const statusMap: Partial<Record<Status, string>> = {
    notSupportedGame: t('gamepage:status.notSupportedGame', 'Not Supported'),
    notAvailable: t('gamepage:status.gameNotAvailable', 'Game not available'),
    playing: t('gamepage:status.playing', 'Playing'),
    queued: `${t('gamepage:status.queued', 'Queued')}`,
    uninstalling: t('gamepage:status.uninstalling', 'Uninstalling'),
    updating: `${t('gamepage:status.updating')} ${Math.ceil(percent || 0)}%`,
    // Steam installs have no progress percentage (Steam owns the download) — D-07
    // D-UAT-04 (21-16): while GameLib's written 1026 manifest awaits Steam's
    // next full restart to adopt it, show a passive "restart to finish" hint
    // instead of an indefinite spinner. GameLib never auto-drives Steam.
    // T-AOG (quick/260719-aog): a frozen-bytes download surfaces a "Paused"
    // hint instead of a silently stalled bar — restart-hint precedence is
    // preserved (checked first, matching the backend's own precedence).
    installing:
      runner === 'steam'
        ? statusContext === 'steam-waiting-for-restart'
          ? t('gamepage:status.steamWaitingRestart', 'Restart Steam to finish')
          : statusContext === 'steam-paused'
            ? t('gamepage:status.steamPaused', 'Paused')
            : t('gamepage:status.steamInstalling', 'Installing…')
        : `${t('gamepage:status.downloading', 'Downloading')} ${Math.ceil(
            percent || 0
          )}%`,
    extracting: t('gamepage:status.extracting', 'Extracting'),
    'syncing-saves': t('gamepage:status.syncingSaves', 'Syncing Saves'),
    moving: t('gamepage:gamecard.moving', 'Moving'),
    repairing: t('gamepage:gamecard.repairing', 'Repairing'),
    installed: `${t('gamepage:status.installed')} ${
      runner === 'sideload' ? '' : size
    }`,
    // D-UAT-09 (21-17): an incomplete steam install (same-session cancel or
    // a startup-surfaced interrupted download, threaded via statusContext —
    // see hasStatus.ts's notInstalled branch) reads as a resumable install,
    // never the generic not-installed copy.
    // quick-260819-ch5: GameLib resumes this itself via
    // resumeInterruptedSteamInstall — the label no longer sends the user to
    // Steam. `gamelib:` prefix is required to cross into the fork-owned
    // namespace from this `TFunction<'gamepage'>`-typed call site.
    notInstalled:
      runner === 'steam' && statusContext === 'steam-incomplete'
        ? t('gamelib:steam.status.resumeInstall', 'Resume Install')
        : t('gamepage:status.notinstalled'),
    launching: t('gamepage:status.launching', 'Launching'),
    winetricks: t('gamepage:status.winetricks', 'Applying Winetricks fixes'),
    redist: t(
      'gamepage:status.redist',
      'Installing Redistributables ({{redist}})',
      { redist: statusContext || '' }
    )
  }

  return statusMap[status] || t('gamepage:status.notinstalled')
}

const storage = window.localStorage
const nonAvailbleGames = storage.getItem('nonAvailableGames') || '[]'
const nonAvailbleGamesArray = JSON.parse(nonAvailbleGames)

export async function handleNonAvailableGames(appName: string, runner: Runner) {
  const gameAvailable = await window.api.isGameAvailable({
    appName,
    runner
  })

  if (!gameAvailable) {
    if (!nonAvailbleGamesArray.includes(appName)) {
      nonAvailbleGamesArray.push(appName)
      storage.setItem(
        'nonAvailableGames',
        JSON.stringify(nonAvailbleGamesArray)
      )
    }
  } else {
    if (nonAvailbleGamesArray.includes(appName)) {
      nonAvailbleGamesArray.splice(nonAvailbleGamesArray.indexOf(appName), 1)
      storage.setItem(
        'nonAvailableGames',
        JSON.stringify(nonAvailbleGamesArray)
      )
    }
  }
  return gameAvailable
}

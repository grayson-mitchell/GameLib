import { GameInfo, Runner, Status } from 'common/types'
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

/**
 * Debug session steam-library-22-games-missing (2026-08-21), defect #2 of 2.
 *
 * `handleNonAvailableGames` above is the ONLY writer/remover for the
 * `nonAvailableGames` localStorage list, and its ONLY call site is inside
 * `hasStatus.ts`'s per-GameCard status effect (installed branch). That means
 * an appName pushed onto the list is re-checked (and self-healed, via the
 * `else` branch above) exactly when that game's own GameCard mounts and
 * re-runs the effect — but a game already ON the list is excluded from
 * `libraryToShow` by `filterEngine.isNonAvailableGame` (default
 * `showNonAvailable: 'off'`), so its GameCard never mounts again. Once an
 * entry lands on the list from a false-negative `isGameAvailable()` verdict
 * (defect #1, backend hydration race — see `SteamGame.getGameInfo()`'s
 * persisted-cache fallback in `steam/games.ts`), nothing in the app ever
 * calls `handleNonAvailableGames` for that appName again. The entry is stuck
 * forever, even after the backend race resolves and a real, non-stale
 * `isGameAvailable()` call would now return true.
 *
 * This function is the reconciliation loop that removes that "stuck
 * forever" property. Callers (`Library/index.tsx`) run it against the
 * unfiltered `libraryUnion` on every change -- i.e. from a component that
 * renders regardless of whether any given game is currently excluded, not
 * from the excluded card itself. For every appName currently on the
 * `nonAvailableGames` list that is ALSO present in the union (so we have a
 * `runner` to check it with), it re-runs the exact same
 * `handleNonAvailableGames` check GameCard would have run. If the game is
 * available now, the existing self-heal branch above removes it from the
 * list on this call, same as it always has for a freshly-mounted card.
 *
 * Deliberately narrow: only re-checks appNames already on the list (usually
 * a handful, never the whole library), so this cannot become a per-render
 * flood of isGameAvailable() IPC calls -- the list only shrinks from here,
 * never grows (only `handleNonAvailableGames`'s own `installed` branch adds
 * to it), so repeated invocations converge to a no-op once the race clears.
 *
 * Returns the appNames actually healed (removed from the list) by this
 * call, or `[]` if none. This is NOT just informational: the caller's
 * `engineDeps`/`libraryToShow` derivation re-reads `nonAvailableGames` from
 * localStorage fresh on every `libraryUnion` change (`buildEngineDeps` in
 * `engineWiring.ts`), but THIS render's `engineDeps` was already built from
 * the pre-heal snapshot before this async call resolves -- healing
 * localStorage alone does not, by itself, force a re-render that would
 * pick the correction up. A non-empty return tells the caller a real
 * exclusion changed, so it can force exactly one additional render (see
 * `Library/index.tsx`'s reconciliation effect) rather than waiting on an
 * unrelated future state change to surface the fix.
 */
export async function reconcileNonAvailableGames(
  libraryUnion: GameInfo[]
): Promise<string[]> {
  if (nonAvailbleGamesArray.length === 0) return []

  // Snapshot before the loop -- handleNonAvailableGames mutates
  // nonAvailbleGamesArray in place (splice) as entries self-heal.
  const candidates: string[] = [...nonAvailbleGamesArray]

  const healed = await Promise.all(
    candidates.map(async (appName: string) => {
      const game = libraryUnion.find((g) => g.app_name === appName)
      // Not (yet) in the union -- nothing to reconcile against here; leave
      // it for the next pass rather than guessing a runner.
      if (!game) return null
      const gameAvailable = await handleNonAvailableGames(
        appName,
        game.runner
      )
      return gameAvailable ? appName : null
    })
  )

  return healed.filter((appName): appName is string => appName !== null)
}

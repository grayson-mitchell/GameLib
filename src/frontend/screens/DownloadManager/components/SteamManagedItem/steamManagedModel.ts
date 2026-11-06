/**
 * Pure helpers for the Download Manager "Managed by Steam" section
 * (debug/steam-dl-missing-in-downloads). Kept free of React and `window` so
 * they are unit-testable in this no-jsdom jest project.
 *
 * A steam://install hand-off finishes its DownloadManager queue element the
 * moment the hand-off is dispatched, so the Downloads queue never sees it.
 * The ACF poller keeps the game's library status at 'installing' for the life
 * of the download and flags it `managedBySteam`; that flag is the only thing
 * that distinguishes it from a GameLib-driven install, which has a queue row.
 */
import type { GameStatus } from 'common/types'
import { hasCapability } from 'common/storeCapabilities'

/** The steam installs Steam itself is downloading, in library-status order. */
export function steamManagedRows(libraryStatus: GameStatus[]): GameStatus[] {
  return libraryStatus.filter(
    (entry) =>
      hasCapability(entry.runner, 'installManagedExternally') &&
      entry.status === 'installing' &&
      entry.managedBySteam === true
  )
}

/** Percent clamped to a whole 0..100, 0 when no progress has arrived yet. */
export function steamManagedPercent(percent: number | undefined): number {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) return 0
  return Math.min(100, Math.max(0, Math.round(percent)))
}

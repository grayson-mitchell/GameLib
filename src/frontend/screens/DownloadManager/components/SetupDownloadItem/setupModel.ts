/**
 * Pure helpers for the Download Manager "Setup" section (quick 261027-tot).
 * Kept free of React and `window` so they are unit-testable in this no-jsdom
 * jest project.
 */
import type {
  SteamSetupDownloadKind,
  SteamSetupDownloadProgress
} from 'common/types/steam'

export type SetupDownloadMap = Partial<
  Record<SteamSetupDownloadKind, SteamSetupDownloadProgress>
>

const ORDER: SteamSetupDownloadKind[] = ['steam-client', 'steam-bottle']

/**
 * Folds one push into the map. A running event replaces the kind's entry; a
 * done or error event removes it (setup work is never listed as finished).
 * Always returns a new object.
 */
export function applySetupDownloadEvent(
  map: SetupDownloadMap,
  payload: SteamSetupDownloadProgress
): SetupDownloadMap {
  const next = { ...map }
  if (payload.state === 'running') {
    next[payload.kind] = payload
  } else {
    delete next[payload.kind]
  }
  return next
}

/** Running rows only, steam-client before steam-bottle. */
export function setupRowsInOrder(
  map: SetupDownloadMap
): SteamSetupDownloadProgress[] {
  const rows: SteamSetupDownloadProgress[] = []
  for (const kind of ORDER) {
    const row = map[kind]
    if (row && row.state === 'running') rows.push(row)
  }
  return rows
}

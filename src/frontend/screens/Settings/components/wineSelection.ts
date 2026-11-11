import type { WineInstallation } from 'common/types'

/**
 * The wine selectors key their options by binary path, not by display name (66.2 WR-03).
 *
 * A stored `wineVersion` and the list entry for the same binary can carry different names:
 * the Linux factory default is resolved without spawning, so it is named after the binary
 * (`wine`), while `getAlternativeWine` names the same entry by `wine --version` (`wine-9.0`).
 * A system wine update renames the list entry the same way. The path is what identifies the
 * install, so matching by it keeps the stored selection visible.
 */
export function wineOptionValue(version: WineInstallation | undefined): string {
  return version?.bin ?? ''
}

/** The list entry an option value (a binary path) stands for, if any. */
export function findWineByOptionValue(
  list: readonly WineInstallation[],
  value: string
): WineInstallation | undefined {
  return list.find((version) => wineOptionValue(version) === value)
}

/**
 * Startup-gated releases list + current changelog handler bodies (Phase 34.1
 * Plan 02, D-07/D-08).
 *
 * Backs `main.ts`'s `getLatestReleases` / `getCurrentChangelog` `addHandler`
 * registrations (`main.ts:757-768`). The core logic already lives outside
 * `main.ts`, in `backend/utils.ts`'s own `getLatestReleases()` /
 * `getCurrentChangelog()` exports -- this module only extracts the thin
 * startup-setting gating closure that wraps them, distinctly named
 * (`getLatestReleasesForStartup` / `getCurrentChangelogEntry`) so it does not
 * shadow the `backend/utils` exports it wraps.
 *
 * MUST NOT import `electron` (or anything that transitively reaches it) --
 * the Node sidecar imports this module directly (D-09).
 */

import { Release } from 'common/types'

import { GlobalConfig } from '../config'
import { getLatestReleases, getCurrentChangelog } from '../utils'

export async function getLatestReleasesForStartup(): Promise<Release[]> {
  const { checkForUpdatesOnStartup } = GlobalConfig.get().getSettings()
  if (checkForUpdatesOnStartup) {
    return getLatestReleases()
  } else {
    return []
  }
}

export async function getCurrentChangelogEntry(): Promise<Release | null> {
  return getCurrentChangelog()
}

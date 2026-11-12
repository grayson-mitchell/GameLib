/**
 * Curated `macArch: "32"` known-fix hint for Steam titles (quick 261027-bqe,
 * spec todo 2026-10-26-known-fix-key-marks-a-mac-build-32-bit-before-install,
 * host-gate lineage 260821-le0).
 *
 * A tier-1 known-fix file may say a title's macOS build is 32-bit (i386). On
 * Apple silicon that seeds `mac_arch: '32'` / `mac_arch_source: 'known-fix'`
 * into steamMetadataStore BEFORE install routing reads it, so install() takes
 * the existing Windows (bridge/bottle) branch and never downloads the
 * unrunnable Mac build. The seed NEVER sets `mac_arch_verified`: the post-install
 * Mach-O check keeps the last word.
 *
 * MUST NOT import games.ts or library.ts (import cycle).
 */

import { readKnownFixes, type KnownFixPathsDeps } from 'backend/knownFixes'
import { isAppleSiliconMac } from 'backend/constants/environment'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { GameInfo } from 'common/types'

import type { SteamMetadataCacheEntry } from './stores'
import type { SteamLibraryStateDeps } from 'backend/services/types'
import type { SteamStoresDeps } from './library/installRoot'
import type { FrontendMessageDeps } from '../../host/frontendMessage'

/**
 * True only on confirmed Apple silicon (i386 still runs on an Intel Mac, so
 * never the retired Intel-Mac predicate negated, or a bare `isMac` -- 260821-le0), when the title is not
 * already Mach-O verified, and the known fix says macArch "32".
 */
export function knownFixSaysMac32(
  deps: KnownFixPathsDeps,
  appId: string,
  existing: SteamMetadataCacheEntry | undefined
): boolean {
  if (!isAppleSiliconMac) return false
  if (existing?.mac_arch_verified === true) return false
  try {
    return readKnownFixes(deps, appId, 'steam')?.macArch === '32'
  } catch (error) {
    logWarning(
      `Steam: could not read known fixes for appId ${appId} while checking macArch: ${String(error)}`,
      LogPrefix.Steam
    )
    return false
  }
}

function propagateToLibrary(
  deps: SteamStoresDeps & SteamLibraryStateDeps & FrontendMessageDeps,
  appId: string,
  macArch: '32' | 'unknown'
): void {
  const current = deps.steamSession.libraryState.library.get(appId)
  if (!current) return
  const updated: GameInfo = { ...current, mac_arch: macArch }
  deps.steamSession.libraryState.library.set(appId, updated)
  deps.stores.steam.steamLibraryStore.set(
    'games',
    Array.from(deps.steamSession.libraryState.library.values())
  )
  deps.sendFrontendMessage('pushGameToLibrary', updated)
}

/** Synchronous, idempotent, never throws. */
export function seedMacArchFromKnownFix(
  deps: SteamStoresDeps &
    SteamLibraryStateDeps &
    FrontendMessageDeps &
    KnownFixPathsDeps,
  appId: string
): void {
  const { steamMetadataStore } = deps.stores.steam
  try {
    const existing = steamMetadataStore.get(appId)
    const hint = knownFixSaysMac32(deps, appId, existing)

    if (hint) {
      if (
        existing?.mac_arch === '32' &&
        existing.mac_arch_source === 'known-fix'
      ) {
        return
      }
      steamMetadataStore.set(appId, {
        ...(existing ?? { art_cover: '', art_square: '', extra: { reqs: [] } }),
        mac_arch: '32',
        mac_arch_source: 'known-fix'
      })
      logInfo(
        `Steam: appId ${appId} seeded mac_arch '32' from a curated known fix (known-fix source, unverified)`,
        LogPrefix.Steam
      )
      propagateToLibrary(deps, appId, '32')
      return
    }

    if (
      isAppleSiliconMac &&
      existing?.mac_arch_verified === true &&
      existing.mac_arch !== '32' &&
      readKnownFixesSafe(deps, appId) === '32'
    ) {
      logWarning(
        `Steam: curated known fix for appId ${appId} says macArch "32" but the verified Mach-O verdict is '${existing.mac_arch}'; the entry should be corrected`,
        LogPrefix.Steam
      )
      return
    }

    // Retraction: a curated seed that no longer applies must stop routing.
    if (
      existing?.mac_arch_source === 'known-fix' &&
      existing.mac_arch_verified !== true
    ) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { mac_arch_source, ...rest } = existing
      steamMetadataStore.set(appId, { ...rest, mac_arch: 'unknown' })
      logInfo(
        `Steam: appId ${appId} known-fix macArch seed retracted (hint absent or host not Apple silicon)`,
        LogPrefix.Steam
      )
      propagateToLibrary(deps, appId, 'unknown')
    }
  } catch (error) {
    logWarning(
      `Steam: seedMacArchFromKnownFix failed for appId ${appId}: ${String(error)}`,
      LogPrefix.Steam
    )
  }
}

function readKnownFixesSafe(
  deps: KnownFixPathsDeps,
  appId: string
): string | undefined {
  try {
    return readKnownFixes(deps, appId, 'steam')?.macArch
  } catch {
    return undefined
  }
}

/** Paste-ready text for the known-fixes repo. */
export function formatMacArch32KnownFixEntry(
  appId: string,
  title: string | undefined
): string {
  return `Steam: Mach-O ground truth says appId ${appId} is 32-bit. Add to ${appId}-steam.json in the grayson-mitchell/known-fixes repo: ${JSON.stringify({ title: title ?? appId, macArch: '32' })}`
}

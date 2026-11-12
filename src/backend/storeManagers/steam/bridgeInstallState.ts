/**
 * Bridge install state lifted out of gameInstall (65-11, D-12 step 4): the DRM
 * signal / prescreen persistence and the installed/uninstalled library flips.
 * Leaf: takes `steamGame`, references SteamGame only via `import type`.
 */
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { GameInfo } from 'common/types'
import { logWarning, LogPrefix } from 'backend/logger'
import { reportDetectedFix, knownFixReportDeps } from 'backend/knownFixReport'
import * as bottle from './bottle'
import * as bridgeBottle from './bridgeBottle'
import {
  readBridgeVerdict,
  setBridgeSteamApiPrescreen,
  writeBridgeDrmVerdict
} from './bridge/bridgeVerdict'
import type SteamGame from './games'

/**
 * Quick 261024-br4: persists `placeShimForGame`'s Steam DRM signal
 * (`bridge.drm`) and decides whether it is a dead end. An absent signal
 * (not checked / PE did not parse) leaves the stored value alone; `null`
 * (parsed, not CEG) clears a stale 'ceg'. Returns the CEG markers when the
 * caller must stop, or null -- including when the user forced 'bridge'
 * (D-51-11), which is logged and honoured.
 */
export function persistBridgeDrmSignal(
  steamGame: SteamGame,
  drm: { kind: 'ceg'; markers: string[] } | null | undefined,
  caller: 'installBridgeGame' | 'launchBridgeGame'
): string[] | null {
  if (drm === undefined) return null
  writeBridgeDrmVerdict(
    steamGame.deps,
    steamGame.appId,
    drm ? 'ceg' : undefined
  )
  if (drm?.kind !== 'ceg') return null
  // Phase 57 detector 2: before the forced-bridge return so a forced title
  // still reports (Pitfall 6); covers installBridgeGame and launchBridgeGame;
  // retried naturally on the next install or launch via the client's sent
  // record (D-16/D-18). Fire-and-forget, never awaited.
  reportDetectedFix(
    {
      appId: steamGame.appId,
      key: 'drm',
      op: 'add',
      detector: 'ceg'
    },
    knownFixReportDeps(steamGame.deps)
  )
  if (
    readBridgeVerdict(steamGame.deps, steamGame.appId)?.userRoute === 'bridge'
  ) {
    logWarning(
      `SteamGame: ${caller} found Steam CEG DRM for appId ${steamGame.appId} (${drm.markers.join(', ')}) but the user forced the bridge -- continuing`,
      LogPrefix.Steam
    )
    return null
  }
  return drm.markers
}

/**
 * CR-04: reconcile the persisted steam_api prescreen with a placement
 * result. 'none' is only ever written over undefined/'none'/'unknown'
 * (never downgrading a real x86/x64/both), and a persisted 'none' is
 * upgraded to the scanned arch when the placement found a real import.
 */
export function reconcileBridgePrescreen(
  steamGame: SteamGame,
  shimResult: {
    status: string
    verdict?: { arch: 'x86' | 'x64' }
  }
): void {
  const current = readBridgeVerdict(steamGame.deps, steamGame.appId)?.steamApi
  if (shimResult.status === 'no-steam-api') {
    if (current === undefined || current === 'none' || current === 'unknown') {
      setBridgeSteamApiPrescreen(steamGame.deps, steamGame.appId, 'none')
    }
    return
  }
  if (
    (shimResult.status === 'placed' ||
      shimResult.status === 'placed-miss' ||
      shimResult.status === 'already-placed') &&
    shimResult.verdict &&
    current === 'none'
  ) {
    setBridgeSteamApiPrescreen(
      steamGame.deps,
      steamGame.appId,
      shimResult.verdict.arch
    )
  }
}

/**
 * Given a resolved bridge launch exe path (resolveBridgeLaunchExe, Task
 * 1), derives the game's own install ROOT directory —
 * `steamapps/common/<installdir>` — via resolve()+relative() containment
 * (never path.join/string-prefix — the project's own established "path.join
 * is not containment" lesson, mirrored from shimGenerate.ts's
 * isContainedWithin). Returns undefined if exePath does not resolve
 * inside the bridge bottle's `common/` dir at all — should be
 * unreachable in practice since resolveBridgeLaunchExe only ever returns
 * paths it built from that SAME root, but this is a defensive check, not
 * an assumption of trust.
 */
export function resolveBridgeGameInstallRoot(
  steamGame: SteamGame,
  exePath: string,
  bottleNameOverride?: string
): string | undefined {
  // quick/261016-u1w (D-B threading): a fresh install already knows
  // EXACTLY which bottle it just placed files into (installBridgeGame's
  // own bridgeBottleName, via bridgeBottleNameFor -- D-A) and passes it
  // straight through here, bypassing the resolver entirely so this stays
  // consistent with the install it just performed. Without an override
  // (the uninstall path), fall back to resolving THIS game's bottle via
  // getBridgeBottleSettings (per-game if ready, else the legacy shared
  // bottle if that's actually where its manifest lives).
  const bottleName =
    bottleNameOverride ??
    bridgeBottle.getBridgeBottleSettings(steamGame.deps, steamGame.appId)
      .wineCrossoverBottle
  const commonRoot = resolve(
    bottle.getBottleSteamappsDir(steamGame.deps.paths, bottleName),
    'common'
  )
  const resolvedExePath = resolve(exePath)
  const relFromCommon = relative(commonRoot, resolvedExePath)
  const installdirSegment = relFromCommon.split(sep)[0]

  if (
    !installdirSegment ||
    relFromCommon.startsWith('..') ||
    isAbsolute(relFromCommon)
  ) {
    return undefined
  }

  return join(commonRoot, installdirSegment)
}

/**
 * Directly flips is_installed:true for a completed bridge install —
 * mirrors library.ts's pollInstallOnce() 'installed'-branch shape
 * (`{ ...existing, is_installed: true, install: { install_path,
 * install_size, platform } }` + persist + pushGameToLibrary), since the
 * bridge path has no ACF poller that can observe completion (see the
 * deviation note in installBridgeGame above).
 */
export function markBridgeGameInstalled(
  steamGame: SteamGame,
  installPath: string
): void {
  const existing = steamGame.deps.steamSession.libraryState.library.get(
    steamGame.appId
  )
  if (existing) {
    const updated: GameInfo = {
      ...existing,
      is_installed: true,
      install: {
        install_path: installPath,
        install_size: '',
        platform: 'Windows'
      }
    }
    steamGame.deps.steamSession.libraryState.library.set(
      steamGame.appId,
      updated
    )
    steamGame.deps.stores.steam.steamLibraryStore.set(
      'games',
      Array.from(steamGame.deps.steamSession.libraryState.library.values())
    )
    steamGame.deps.sendFrontendMessage('pushGameToLibrary', updated)
  }
  // Quick 261029-mbi: no 'done' here. The install keeps going (shared
  // redists, DRM prefetch) and installBridgeGame sends the one final 'done';
  // an early one cleared "Finishing install…" and showed Play for a moment.
}

/**
 * Directly flips is_installed:false for a bridge uninstall — the bridge
 * bottle has no ACF poller either (uninstallBridgeGame below performs a
 * real, synchronous file removal, so this is the correct completion
 * signal, not an ACF observation). Mirrors forceUninstall()'s keep-entry
 * shape (never library.delete's the entry).
 *
 * D-UAT-24-07 fold-in: also emits a gameStatusUpdate 'done', mirroring
 * markBridgeGameInstalled() above — without it, the frontend's
 * "Uninstalling" pill never clears even though the backend uninstall
 * succeeded. Emitted OUTSIDE the `if (existing)` guard (same placement as
 * markBridgeGameInstalled's) so the pill clears regardless of whether the
 * library entry happens to be present.
 */
export function markBridgeGameUninstalled(steamGame: SteamGame): void {
  const existing = steamGame.deps.steamSession.libraryState.library.get(
    steamGame.appId
  )
  if (existing) {
    const updated: GameInfo = {
      ...existing,
      is_installed: false,
      install: {}
    }
    steamGame.deps.steamSession.libraryState.library.set(
      steamGame.appId,
      updated
    )
    steamGame.deps.stores.steam.steamLibraryStore.set(
      'games',
      Array.from(steamGame.deps.steamSession.libraryState.library.values())
    )
    steamGame.deps.sendFrontendMessage('pushGameToLibrary', updated)
  }
  steamGame.deps.sendFrontendMessage('gameStatusUpdate', {
    appName: steamGame.appId,
    runner: 'steam',
    status: 'done'
  })
}

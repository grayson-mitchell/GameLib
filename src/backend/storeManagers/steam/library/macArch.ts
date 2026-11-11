import { GameInfo, InstallArgs } from 'common/types'
import {
  machOArchsOfAsync,
  verdictFromArchs,
  locateMachOBinary as locateMachOBinaryShared,
  promptMac32WindowsReinstall
} from 'backend/utils/macArch'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { isMac } from 'backend/constants/environment'
import { formatMacArch32KnownFixEntry } from '../macArchKnownFix'
import { reportDetectedFix, knownFixReportDeps } from 'backend/knownFixReport'
import SteamGame from '../games'
import type { ManagerDeps } from 'backend/services/types'
import type { AcfSource } from './installRoot'
import { sendFrontendMessage } from '../../../ipc'

// ── macOS arch ground-truth check (MAC32-03) ─────────────────────────────────
// Post-install Mach-O binary inspection is the ONLY detector in this phase
// that may ever assert mac_arch === '32'. Steam's manual osarch metadata
// proved absent/unreliable on every macOS launch entry (18-01 finding,
// retired) and the pre-install store-API min-OS heuristic (games.ts
// macArchFromMinOS) structurally never returns '32' either — this is the
// correctness backstop that catches an i386-only mac depot Steam left
// un-tagged.

/**
 * Steam-prefixed wrapper over the shared locator (backend/utils/macArch) so the
 * containment-escape warning keeps its Steam log prefix. Exported for unit
 * testing.
 */
export function locateMachOBinary(
  installPath: string,
  launchExecutable?: string
): string | null {
  return locateMachOBinaryShared(installPath, launchExecutable, LogPrefix.Steam)
}

/**
 * Post-install ground-truth check (MAC32-03). Corrects Steam's un-tagged
 * mac_arch signal by inspecting the installed Mach-O binary — the only path
 * in this phase that may assert mac_arch === '32'.
 *
 * Skip gates, in order:
 *  - source !== 'native': a bottle install is a Windows depot — no Mach-O
 *    binary belongs to this game on that path (RESEARCH.md Anti-Patterns).
 *  - !isMac: host-gated, mirrors games.ts ensurePlatformsCaptured()'s guard.
 *  - mac_arch already '32' (from the Mach-O check; a curated 'known-fix' '32'
 *    does NOT skip, the Mach-O check keeps the last word), or mac_arch_verified
 *    already true: nothing to correct, or already resolved — never re-shells
 *    on every install/launch.
 *
 * A definitive verdict ('32' or '64') is persisted with mac_arch_source:
 * 'macho' and mac_arch_verified:true, spreading the existing cache entry so
 * art/extra/etc. are never lost. An inconclusive result (no binary located,
 * or verdictFromArchs returns null) is a no-op — logs and leaves mac_arch
 * exactly as-is (T-18-03-03).
 *
 * When the verdict is '32', triggers the user-consented recovery (CONTEXT
 * D-6 / promptI386Recovery below) as a decoupled fire-and-forget call — the
 * ground-truth check itself never awaits the dialog, so it never blocks the
 * pollInstallOnce 'installed' badge-flip UX.
 *
 * Exported for unit testing.
 */
export async function verifyMacArchGroundTruth(
  deps: ManagerDeps,
  appId: string,
  installPath: string,
  source: AcfSource
): Promise<void> {
  if (source !== 'native') return
  if (!isMac) return

  const { steamLibraryStore, steamMetadataStore } = deps.stores.steam
  const existing = steamMetadataStore.get(appId)
  if (
    existing?.mac_arch_verified === true ||
    (existing?.mac_arch === '32' && existing?.mac_arch_source !== 'known-fix')
  ) {
    return
  }
  const wasKnownFix32 =
    existing?.mac_arch_source === 'known-fix' && existing?.mac_arch === '32'

  const binaryPath = locateMachOBinary(installPath)
  if (!binaryPath) {
    logInfo(
      `Steam: verifyMacArchGroundTruth found no Mach-O binary for appId ${appId} at ${installPath} — skipping`,
      LogPrefix.Steam
    )
    return
  }

  const verdict = verdictFromArchs(await machOArchsOfAsync(deps, binaryPath))
  if (verdict === null) {
    logInfo(
      `Steam: verifyMacArchGroundTruth inconclusive for appId ${appId} — leaving mac_arch unchanged`,
      LogPrefix.Steam
    )
    return
  }

  steamMetadataStore.set(appId, {
    ...(existing ?? { art_cover: '', art_square: '', extra: { reqs: [] } }),
    mac_arch: verdict,
    mac_arch_source: 'macho',
    mac_arch_verified: true
  })
  logInfo(
    `Steam: verifyMacArchGroundTruth resolved appId ${appId} to mac_arch '${verdict}' (Mach-O ground truth)`,
    LogPrefix.Steam
  )

  // CR-01 fix: propagate the resolved verdict to the in-memory library Map
  // and push it to the frontend, mirroring the library.set + push pattern
  // used at the end of refresh()'s loop. Without this, the badge is
  // unreachable until the next app restart/resync (steamMetadataStore alone
  // is not frontend-visible). Only update when the game is already present
  // in the Map — never fabricate a GameInfo; the store write above already
  // carries the verdict for the next refresh() rebuild.
  const currentGameInfo = deps.steamSession.libraryState.library.get(appId)
  if (currentGameInfo) {
    const updatedGameInfo: GameInfo = { ...currentGameInfo, mac_arch: verdict }
    deps.steamSession.libraryState.library.set(appId, updatedGameInfo)
    // GAP-17-BOTTLE-STORE-DIVERGENCE: persist immediately, mirroring every
    // other library-mutating call site in this file — otherwise a restart
    // before the next full refresh() reads a stale mac_arch from
    // steamLibraryStore and the 32-bit badge silently reverts.
    steamLibraryStore.set(
      'games',
      Array.from(deps.steamSession.libraryState.library.values())
    )
    sendFrontendMessage('pushGameToLibrary', updatedGameInfo)
  } else {
    logInfo(
      `Steam: verifyMacArchGroundTruth resolved appId ${appId} but it is not in the in-memory library Map — skipping frontend push (will pick up mac_arch on next refresh)`,
      LogPrefix.Steam
    )
  }

  if (wasKnownFix32 && verdict === '64') {
    logWarning(
      `Steam: curated known-fixes entry ${appId}-steam.json macArch "32" is contradicted by the Mach-O ground truth ('64') and should be removed`,
      LogPrefix.Steam
    )
    // Phase 57 detector 3: fire-and-forget (void, never awaited). The client
    // gates on the setting and D-12. D-18: one-shot best effort, no retry seam.
    reportDetectedFix(
      {
        appId,
        key: 'macArch',
        op: 'remove',
        detector: 'macho'
      },
      knownFixReportDeps(deps)
    )
  }

  if (verdict === '32') {
    logInfo(
      formatMacArch32KnownFixEntry(
        appId,
        deps.steamSession.libraryState.library.get(appId)?.title
      ),
      LogPrefix.Steam
    )
    // Phase 57 detector 1: fire-and-forget (void, never awaited). The client
    // gates on the setting and D-12. D-18: one-shot best effort, no retry seam.
    reportDetectedFix(
      { appId, key: 'macArch', op: 'add', detector: 'macho' },
      knownFixReportDeps(deps)
    )
    // MAC32-03/CONTEXT D-6: decoupled — never awaited here, so this check
    // never blocks the pollInstallOnce 'installed' badge-flip UX above.
    void promptI386Recovery(deps, appId)
  }
}

/**
 * MAC32-03 / CONTEXT D-6: user-consented i386 recovery. Steam left this
 * game's mac depot un-tagged and the post-install Mach-O check proved it is
 * i386-only — unrunnable on this version of macOS (Apple removed 32-bit
 * support in Catalina, 2019).
 *
 * Presents a native confirm dialog via Electron's `dialog.showMessageBox` —
 * this codebase's established backend-AWAITED confirm primitive (see
 * legendary/eos_overlay.ts's remove()/enable()) — deliberately NOT
 * showDialogBoxModalAuto, whose `buttons[].onClick` callbacks travel over
 * IPC (webContents.send uses the structured-clone algorithm, which cannot
 * carry function values) and so can never round-trip a confirm decision back
 * into this async function; dialog.showMessageBox is a native, in-process,
 * awaitable primitive with no such limitation.
 *
 * On confirm: force-uninstalls the dead native copy, then re-installs —
 * which now routes through the bottle because isBottleEligible() honors the
 * mac_arch:'32' verdict verifyMacArchGroundTruth already persisted.
 * On cancel/dismiss: leaves the (unrunnable) native install in place; the
 * '32' verdict stays cached (persisted by verifyMacArchGroundTruth BEFORE
 * this prompt fires) so the badge and future routing reflect reality either
 * way.
 *
 * Exported for unit testing.
 */
export async function promptI386Recovery(
  deps: ManagerDeps,
  appId: string
): Promise<void> {
  const confirmed = await promptMac32WindowsReinstall(deps, 'steam')

  if (!confirmed) {
    logInfo(
      `Steam: user declined i386 recovery for appId ${appId} — native install left in place (unrunnable)`,
      LogPrefix.Steam
    )
    return
  }

  logInfo(
    `Steam: user confirmed i386 recovery for appId ${appId} — force-uninstalling the native copy and reinstalling via the bottle`,
    LogPrefix.Steam
  )
  const game = new SteamGame(appId, deps)
  await game.forceUninstall()
  await game.install({} as InstallArgs)
}

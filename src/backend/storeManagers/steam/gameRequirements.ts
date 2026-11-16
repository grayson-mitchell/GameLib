import { GameInfo } from 'common/types'
import { logWarning, LogPrefix } from 'backend/logger'
import { getFileSize } from 'backend/utils'
import { isMac, isLinux } from 'backend/constants/environment'
import { RUST_STEAMCM_STORE_APPDETAILS } from 'common/types/sidecarTransport'
import { invokeSteamCm } from './cm/rustSteamCm'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * Maps the host OS to Steam's depot `oslist` vocabulary ('windows'|'macos'|
 * 'linux') — the SAME strings depot/select.ts's DepotSelectOpts.os matches
 * PICS depot config.oslist against. NOT the InstallPlatform vocabulary
 * library.ts's hostInstallPlatform() uses ('Windows'/'Mac'/'linux') — the two
 * must not be conflated.
 */
export function hostSteamDepotOs(): string {
  if (isMac) return 'macos'
  if (isLinux) return 'linux'
  return 'windows'
}
/**
 * Returns a human-readable install size string for a Steam game.
 *
 * Fast path (no network): if the game is already installed, `install_size`
 * is already a `getFileSize`-formatted string (persisted that way by
 * library.ts) — return it directly, no parse.
 *
 * Pre-install estimate: the Rust `steamcm_store_appdetails` op reads the
 * public store appdetails storage figure, returned via getFileSize. Falls
 * back to '?? MB' when no figure is obtainable (D-03).
 *
 * `deps` comes first and is required (79-REVIEW C2/IN-02): with the axios
 * fallback gone, the Rust op is the only source of an estimate, so a caller
 * that could omit it would silently get '?? MB' for every uninstalled title.
 *
 * appId is guarded with /^\d+$/ before any network request (T-06-01).
 */
export async function getSteamInstallSize(
  deps: RustInvokeDeps,
  appId: unknown,
  gameInfo?: GameInfo
): Promise<string> {
  // Fast path: already installed — install_size is already formatted, return
  // it directly (no parse, no network needed)
  if (gameInfo?.is_installed && gameInfo?.install?.install_size) {
    return gameInfo.install.install_size
  }

  // Guard: non-numeric appId rejected before constructing any URL (T-06-01).
  //
  // 34.13 review A-18 / WR-10: takes `unknown` and carries the `typeof` check
  // itself, so BOTH runtime registrations (`main.ts` and
  // `sidecar/steamAuthFlowRegistration.ts`) can drop their `args[0] as string`
  // cast at once — the pushdown shape WR-10 established for
  // `isSteamBottleEligible`. The regex ALONE was not a guard on an untrusted
  // payload: `RegExp.prototype.test` coerces its argument, so `123` and
  // `['570']` both passed `/^\d+$/.test(...)` and reached the URL builder as
  // a non-string. Hardening only one runtime would have created a real
  // Electron/Tauri behaviour divergence, which is why this belongs here.
  //
  // The rejected value is NO LONGER interpolated into the log line: it is
  // untrusted renderer input, and naming the field is enough to diagnose.
  if (typeof appId !== 'string' || !/^\d+$/.test(appId)) {
    logWarning(
      `getSteamInstallSize: rejected an appId that is not a numeric string (T-06-01)`,
      LogPrefix.Steam
    )
    return '?? MB'
  }

  // D-12: the byte figure comes from the Rust appdetails op.
  try {
    const res = await invokeSteamCm(deps, RUST_STEAMCM_STORE_APPDETAILS, {
      appId
    })
    if (res.ok) {
      const bytes = res.result.storageBytes
      if (bytes && bytes > 0) return getFileSize(bytes)
    } else {
      logWarning(
        `getSteamInstallSize: store appdetails failed for appId ${appId}: ${res.kind}`,
        LogPrefix.Steam
      )
    }
  } catch (err) {
    logWarning(
      [`getSteamInstallSize: store appdetails failed for appId ${appId}:`, err],
      LogPrefix.Steam
    )
  }
  return '?? MB'
}

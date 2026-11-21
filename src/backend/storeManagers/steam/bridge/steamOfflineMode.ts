/**
 * Bridged launch while Mac Steam is signed out (round 3): did the user choose Steam's offline mode?
 *
 * A Steam that is not logged on but still holds the account reads the same through the Steam API
 * whether the user picked "Go Offline" or Steam was signed out by a "Logged In Elsewhere" kick
 * (measured 2026-11-21: `loggedOn=0 accountPresent=1` at the kicked sign-in screen). Steam saves
 * the offline choice as `WantsOfflineMode "1"` in `config/loginusers.vdf` (Phase 54), so that file
 * tells the two apart. The VDF is read in Rust (`steamfiles_read_loginusers_offline_mode`).
 *
 * Exit contract: no timers, no handles, no work at import.
 */
import { join } from 'node:path'
import { logWarning, LogPrefix } from 'backend/logger'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { steamRootDefault } from 'backend/config'
import { RUST_STEAMFILES_READ_LOGINUSERS_OFFLINE_MODE } from 'common/types/sidecarTransport'
import { invokeSteamFiles } from '../localFiles/rustSteamFiles'

/**
 * The most recent Steam user's `WantsOfflineMode`, or `null` when it cannot be read (no file, a
 * parse failure, no user to pick, or a rejected invoke). Never throws.
 */
export async function readSteamWantsOfflineMode(
  rust: RustInvokeDeps,
  userHome: string
): Promise<boolean | null> {
  const path = join(steamRootDefault(userHome), 'config', 'loginusers.vdf')
  try {
    const r = await invokeSteamFiles(
      rust,
      RUST_STEAMFILES_READ_LOGINUSERS_OFFLINE_MODE,
      { path }
    )
    return r.wantsOfflineMode
  } catch (error) {
    logWarning(
      ['readSteamWantsOfflineMode: loginusers.vdf read failed', error],
      LogPrefix.Steam
    )
    return null
  }
}

import { getUmuId } from 'backend/info/wiki'
import { logWarning, LogPrefix } from 'backend/logger'
import type { Runner } from 'common/types'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * The best-effort umu id lookup the GOG, Epic and Amazon `launch()` bodies call for the Linux GAMEID.
 *
 * Why: WR-41. The TS lookup never blocked a launch on a failed fetch, and the Rust round trip can now
 * reject (`:store-unavailable`, `:store-write`, `:not-ready`, or the rustInvoke timeout). A failed
 * lookup must leave the game launching without a GAMEID, so it resolves `null` and logs a warning.
 *
 * Where: D-06 keeps the `getUmuId` shim one typed call, so the failure isolation lives here, outside
 * `src/backend/info`.
 *
 * When it goes: it is deleted with the `getUmuId` schedule row (phase 92, when its callers port).
 *
 * Resolves the umu id (`string`) or `null` (a sideload, no match, or the lookup failed).
 */
export async function resolveLaunchUmuId(
  deps: RustInvokeDeps,
  appName: string,
  runner: Runner
): Promise<string | null> {
  try {
    return (await getUmuId(deps, appName, runner)) as string | null
  } catch (error) {
    logWarning(
      [`umu id lookup for ${appName} failed, launching without GAMEID:`, error],
      LogPrefix.Backend
    )
    return null
  }
}

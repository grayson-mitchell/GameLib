/**
 * Narrows Rust's answer to a known-fix launch-overrides read (Phase 88, 88-12), and settles the launcher's two
 * per-launch known-fix calls (88-13).
 *
 * `readKnownFixLaunchOverrides` (`launchrust/knownFixes.ts`) is one typed call whose answer is `unknown`,
 * because the transport is untyped. The TypeScript it replaced never threw: a missing fix, a bad file or an
 * unverifiable `exeOverride` was a log line and the launch went on with the defaults. This keeps that, so a
 * rejected call (the shell not ready, a refused argument, the timeout) or a reply of the wrong shape is a
 * warning and `{launchArgs: []}`, never a failed launch.
 */
import { logWarning, LogPrefix } from 'backend/logger'

export interface KnownFixLaunchOverrides {
  launchArgs: string[]
  exeOverride?: string
}

const NONE: KnownFixLaunchOverrides = { launchArgs: [] }

function narrow(reply: unknown): KnownFixLaunchOverrides | undefined {
  if (typeof reply !== 'object' || reply === null) return undefined
  const { launchArgs, exeOverride } = reply as Record<string, unknown>
  if (
    !Array.isArray(launchArgs) ||
    !launchArgs.every((arg) => typeof arg === 'string')
  ) {
    return undefined
  }
  if (exeOverride === undefined || exeOverride === null) {
    return { launchArgs: [...launchArgs] }
  }
  if (typeof exeOverride !== 'string' || exeOverride === '') return undefined
  return { launchArgs: [...launchArgs], exeOverride }
}

/**
 * Awaits `pending` (a `readKnownFixLaunchOverrides` call) and answers the overrides to apply: the narrowed
 * reply, or no overrides, with a warning, when the call failed or the reply was not the documented shape.
 */
export async function settleKnownFixLaunchOverrides(
  appName: string,
  pending: Promise<unknown>
): Promise<KnownFixLaunchOverrides> {
  const label = `Known fix for '${appName}'`
  try {
    const narrowed = narrow(await pending)
    if (narrowed) return narrowed
    logWarning(
      `${label}: launch overrides came back in an unexpected shape, ignoring.`,
      LogPrefix.Backend
    )
  } catch (error) {
    logWarning(
      `${label}: could not read launch overrides, ignoring.\n${String(error)}`,
      LogPrefix.Backend
    )
  }
  return { ...NONE }
}

/**
 * Awaits `pending` (an `applyKnownFixProfileRegistry` call). The TypeScript it replaced never threw (a failed
 * `reg add` was a warning and the launch went on), so a rejected call (the shell not ready, a refused argument)
 * is a warning here, never a failed launch (88-13).
 */
export async function settleKnownFixRegistry(
  label: string,
  pending: Promise<unknown>
): Promise<void> {
  try {
    await pending
  } catch (error) {
    logWarning(
      `${label}: known-fix registry step failed: ${String(error)}; launching without it`,
      LogPrefix.Backend
    )
  }
}

/**
 * Awaits `pending` (a `knownFixProfileOverlayEnv` call) and answers the env to merge: the reply's string
 * entries, or `{}`, with a warning, when the call failed or the reply was not a string map. The TypeScript it
 * replaced answered `{}` and a warning on any failure, so a launch never failed on an overlay (88-13).
 */
export async function settleKnownFixOverlayEnv(
  label: string,
  pending: Promise<unknown>
): Promise<Record<string, string>> {
  try {
    const reply = await pending
    if (
      typeof reply === 'object' &&
      reply !== null &&
      !Array.isArray(reply) &&
      Object.values(reply).every((value) => typeof value === 'string')
    ) {
      return { ...(reply as Record<string, string>) }
    }
    logWarning(
      `${label}: overlay env came back in an unexpected shape; launching without it`,
      LogPrefix.Backend
    )
  } catch (error) {
    logWarning(
      `${label}: overlay env failed: ${String(error)}; launching without it`,
      LogPrefix.Backend
    )
  }
  return {}
}

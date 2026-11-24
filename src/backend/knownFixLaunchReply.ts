/**
 * Narrows Rust's answer to a known-fix launch-overrides read (Phase 88, 88-12).
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

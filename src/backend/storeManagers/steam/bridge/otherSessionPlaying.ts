/**
 * Debug bridged-launch-kicks-other-session (2026-11-21): the pre-launch check Mac Steam's own
 * launch makes and the bridge never did.
 *
 * Mac Steam asks `IClientUser::BIsOtherSessionPlaying` before it starts a game, shows its
 * "playing on another computer" prompt and only then claims the play slot. The bridge helper's
 * `SteamAPI_InitFlat` (with the game's real AppID) registers "playing <appId>" with Mac Steam
 * directly, and Steam's CM answered by logging one whole session of the account off ("Logged In
 * Elsewhere": Mac twice, PC once, 2026-11-21). The helper's `--steam-playing-session` subcommand
 * (native/steam-bridge/helper/gamelib_playingsession.h) reads that same state without registering
 * anything; `createOtherSessionGuard` below is what `ensureBridgeHelperReady` calls before every
 * real-AppID spawn, and `gameBridgeLaunch` before the DRM-mode launch.
 *
 * Fail open. Only a positive answer from a signed-in Steam blocks a launch. A missing helper, a
 * hung or failed call, an unresolved slot or a signed-out Steam all answer `unknown`, and the
 * launch goes on exactly as it did before this check existed: a read that cannot be made must not
 * turn into a launch that cannot happen.
 *
 * The helper needs the REAL HOME to find the user's steamclient.dylib, so the default runner
 * passes no `env` (inherits). The call is bounded by a timeout, so it leaves no unbounded in-flight
 * work.
 */
import { existsSync } from 'node:fs'

import { LogPrefix, logInfo, logWarning } from 'backend/logger'
import type { AppPaths } from 'backend/process/context'

export type OtherSessionVerdict =
  /** A signed-in Mac Steam says another session of the account is playing. */
  | { kind: 'playing'; otherAppId: number | null }
  /** A signed-in Mac Steam says no other session is playing. */
  | { kind: 'clear' }
  /** No answer worth acting on (signed out, helper missing or failed, off macOS). */
  | { kind: 'unknown'; reason: string }

interface OtherSessionRunResult {
  stdout: string
  stderr: string
  code: number | null
}

export interface OtherSessionDeps {
  paths: Pick<AppPaths, 'steamBridgeHelperPath'>
  /** Default process.platform. */
  platform?: NodeJS.Platform
  /** Default process.env; only GAMELIB_STEAM_OTHER_SESSION_CHECK is read. */
  env?: NodeJS.ProcessEnv
  run: (
    file: string,
    args: string[],
    timeoutMs: number
  ) => Promise<OtherSessionRunResult>
}

/** The helper arms its own 8 s alarm; this is the outer bound with margin. */
const HELPER_TIMEOUT_MS = 10_000

/**
 * How long a freshly signed-in Steam gets to receive the CM's playing-session state before a
 * "nobody else is playing" answer is believed. UNMEASURED: it is a margin over the sub-second
 * post-logon callback burst seen in steamui_login (2026-11-21 19:59:03-04); the live gate records
 * the real figure.
 */
const SIGN_IN_SETTLE_MS = 2_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const handle = setTimeout(resolve, ms)
    // Never keep the process alive on a pending settle wait.
    handle.unref?.()
  })
}

/** The last stdout line is the helper's one result line; Steam's own noise goes to stderr. */
function parseResultLine(stdout: string): Record<string, unknown> | undefined {
  const lines = stdout.split('\n').filter((l) => l.trim() !== '')
  const last = lines[lines.length - 1]
  if (last === undefined) return undefined
  try {
    const value: unknown = JSON.parse(last)
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

/**
 * The check is ON by default. `GAMELIB_STEAM_OTHER_SESSION_CHECK=off` switches it off, which is the
 * way out if a stale "another session is playing" answer ever blocks a launch that Steam itself
 * would allow, and the way to A/B the kick it prevents.
 */
function otherSessionCheckEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.GAMELIB_STEAM_OTHER_SESSION_CHECK !== 'off'
}

/** One read of "is another session of this account playing?". Never throws. */
export async function readOtherSessionPlaying(
  deps: OtherSessionDeps
): Promise<OtherSessionVerdict> {
  if (!otherSessionCheckEnabled(deps.env)) {
    return { kind: 'unknown', reason: 'disabled' }
  }
  if ((deps.platform ?? process.platform) !== 'darwin') {
    return { kind: 'unknown', reason: 'unsupported-platform' }
  }
  const helperPath = deps.paths.steamBridgeHelperPath
  if (!existsSync(helperPath)) {
    return { kind: 'unknown', reason: 'helper-missing' }
  }

  let res: OtherSessionRunResult
  try {
    res = await deps.run(
      helperPath,
      ['--steam-playing-session'],
      HELPER_TIMEOUT_MS
    )
  } catch {
    return { kind: 'unknown', reason: 'helper-failed' }
  }
  const parsed = res.code === null ? undefined : parseResultLine(res.stdout)
  if (!parsed) {
    // Steam's own noise: a bounded tail only, never the raw stream (logSecretGate).
    const tail = res.stderr.trim().slice(-300)
    logWarning(
      `Steam other-session check: helper-failed (exit ${String(res.code)}, no result line)${tail ? ` (stderr: ${tail})` : ''}`,
      LogPrefix.Steam
    )
    return { kind: 'unknown', reason: 'helper-failed' }
  }
  if (parsed.result === 'unavailable' && typeof parsed.reason === 'string') {
    return { kind: 'unknown', reason: parsed.reason }
  }
  if (parsed.result !== 'ok') {
    return { kind: 'unknown', reason: 'helper-failed' }
  }
  if (parsed.loggedOn !== 1) {
    // The playing-session state is pushed by the CM: meaningless while signed out.
    return { kind: 'unknown', reason: 'signed-out' }
  }
  if (parsed.otherSessionPlaying === 1) {
    const app = parsed.otherAppId
    return {
      kind: 'playing',
      otherAppId: typeof app === 'number' && app > 0 ? app : null
    }
  }
  if (parsed.otherSessionPlaying === 0) return { kind: 'clear' }
  return { kind: 'unknown', reason: 'helper-failed' }
}

/**
 * The per-launch guard `ensureBridgeHelperReady` calls before each real-AppID spawn (the first
 * one, and every respawn of the Steam-state hold). It is stateful on purpose: a hold that saw
 * Steam signed out and then sees it signed in is a sign-in the CM may not have finished
 * announcing the playing-session state for, so the first "clear" after a signed-out reading is
 * checked again after `settleMs` and only the second answer counts. A launch that never saw Steam
 * signed out pays nothing.
 */
export function createOtherSessionGuard(
  deps: OtherSessionDeps & { appId: string; settleMs?: number }
): () => Promise<OtherSessionVerdict> {
  const settleMs = deps.settleMs ?? SIGN_IN_SETTLE_MS
  let sawSignedOut = false
  // The Steam-state hold asks again every few seconds; say each no-answer reason once.
  const loggedUnknown = new Set<string>()
  return async () => {
    let verdict = await readOtherSessionPlaying(deps)
    if (verdict.kind === 'unknown' && verdict.reason === 'signed-out') {
      sawSignedOut = true
    } else if (verdict.kind === 'clear' && sawSignedOut) {
      sawSignedOut = false
      if (settleMs > 0) await sleep(settleMs)
      verdict = await readOtherSessionPlaying(deps)
    }
    if (verdict.kind === 'playing') {
      logInfo(
        `SteamGame: appId ${deps.appId} not starting a bridged session: another session of this Steam account is playing${verdict.otherAppId === null ? '' : ` (app ${verdict.otherAppId})`}. Registering "playing" now would sign one of the two sessions out ("Logged In Elsewhere").`,
        LogPrefix.Steam
      )
    } else if (
      verdict.kind === 'unknown' &&
      !loggedUnknown.has(verdict.reason)
    ) {
      loggedUnknown.add(verdict.reason)
      logInfo(
        `SteamGame: appId ${deps.appId} other-session check gave no answer (${verdict.reason}); launching as before`,
        LogPrefix.Steam
      )
    }
    return verdict
  }
}

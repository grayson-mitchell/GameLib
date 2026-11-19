/**
 * quick 261120-8hb: outcome reporting for both launch-without-Steam routes
 * (Mac-native spawn and the bridge's wine launch).
 *
 * Nothing here writes, copies or emulates steam_api (DRM boundary). The module
 * creates no timers: early-exit detection compares timestamps when the process
 * ends. The frontend renders the strings from the closed notice kind (T-pvk-01),
 * so the backend sends no free text.
 */
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { SteamRequestNoticePayload } from 'common/types/steam'
import type SteamGame from '../games'
import { noticeSeq } from '../noticeSeq'
import type { DirectLaunchKind } from './directLaunchVerdict'

/**
 * A game launched without Steam whose process is gone sooner than this after it
 * started probably needs the Steam app. Both routes use this one constant.
 *
 * The operator asked for about 10 s; 15 s also covers a Unity game's
 * restart-through-Steam check after its splash screen (WazHack, Mac-native) and
 * a bridge game's own "Steam must be running (SteamAPI_Init() failed)" box that
 * is dismissed quickly (Avernum 6). It is still far below a real play session.
 * A launcher stub that starts the real game and exits inside the window would
 * also trip it, which is why the copy says "probably".
 */
export const DIRECT_LAUNCH_EARLY_EXIT_MS = 15_000

/** True when the process ended within the early-exit window; non-finite or negative input is false. */
export function isDirectLaunchEarlyExit(
  startedAt: number,
  stoppedAt: number
): boolean {
  if (!Number.isFinite(startedAt) || !Number.isFinite(stoppedAt)) return false
  const elapsed = stoppedAt - startedAt
  return elapsed >= 0 && elapsed < DIRECT_LAUNCH_EARLY_EXIT_MS
}

/** The one info line a successful start writes; names the appId, the route and the binary or exe. */
export function formatDirectLaunchStartedLine(
  appId: string,
  kind: DirectLaunchKind,
  path: string
): string {
  return `launch without Steam started for appId ${appId}: kind ${kind}, ${
    kind === 'bridge' ? 'exe' : 'binary'
  } ${path}`
}

export type DirectLaunchNoticeKind = Extract<
  SteamRequestNoticePayload['kind'],
  `direct-launch-${string}`
>

/**
 * Pushes the in-app notice (the request slot of the bottom-right notice stack).
 * Never rejects and never throws: a notice must not change a launch's result.
 */
export async function pushDirectLaunchNotice(
  steamGame: SteamGame,
  kind: DirectLaunchNoticeKind
): Promise<void> {
  try {
    const { deps, appId } = steamGame
    const title = deps.steamSession.libraryState.library.get(appId)?.title ?? ''
    const seq = await noticeSeq(steamGame)
    deps.sendFrontendMessage('steamRequestNotice', {
      appId,
      title,
      kind,
      seq
    })
    logInfo(
      `launch without Steam notice ${kind} pushed for appId ${appId} (surface=in-app)`,
      LogPrefix.Steam
    )
  } catch (error) {
    logWarning(
      `launch without Steam notice ${kind} could not be pushed: ${String(error)}`,
      LogPrefix.Steam
    )
  }
}

/** Logs the early exit and pushes the needs-Steam notice. Never rejects. */
export async function reportDirectLaunchEarlyExit(
  steamGame: SteamGame,
  kind: DirectLaunchKind,
  elapsedMs: number
): Promise<void> {
  try {
    logInfo(
      `launch without Steam: appId ${steamGame.appId} (kind ${kind}) ended ${elapsedMs} ms after start, under the ${DIRECT_LAUNCH_EARLY_EXIT_MS} ms early-exit window; it probably needs the Steam app`,
      LogPrefix.Steam
    )
    await pushDirectLaunchNotice(steamGame, 'direct-launch-needs-steam')
  } catch (error) {
    logWarning(
      `launch without Steam early-exit report failed: ${String(error)}`,
      LogPrefix.Steam
    )
  }
}

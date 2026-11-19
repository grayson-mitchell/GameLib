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

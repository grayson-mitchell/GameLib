/**
 * debug bridged-launch-steam-signed-out: the in-app "Waiting for Steam" notice for a bridged Play
 * that is holding (up to a minute) for Mac Steam to start / finish signing in.
 *
 * The hold used to announce itself through `notify()` (a macOS system notification). Nobody saw it
 * (`tauri dev` never delivers one, and a packaged build may have them off), so the operator got
 * a minute of "Launching" and nothing else. It now rides the same bottom-right notice stack as the
 * other Steam request notices (`steamRequestNotice`, rendered by SteamEngineLaunchNotice).
 *
 * Unlike those, this notice has an END: `end()` pushes `bridge-wait-end`, which the renderer
 * answers by retracting the wait notice for the same appId. The renderer draws all text from the
 * closed `kind` (T-pvk-01), so nothing here is free text.
 *
 * Creates no timer and no handle. Never rejects and never throws: a notice must not change a
 * launch's result.
 */
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { SteamRequestNoticePayload } from 'common/types/steam'
import type SteamGame from './games'
import type { InitFlatErrorCause } from './bridge/helperSpawn'
import { noticeSeq } from './noticeSeq'

type BridgeWaitNoticeKind = Extract<
  SteamRequestNoticePayload['kind'],
  `bridge-wait-${string}`
>

interface BridgeWaitNotice {
  /** The hold began. Fire-and-forget; only the first call has an effect. */
  begin(cause: InitFlatErrorCause): void
  /** The hold ended (launched, or the Steam dialog took over). A no-op when `begin` never ran. */
  end(): Promise<void>
}

export function createBridgeWaitNotice(steamGame: SteamGame): BridgeWaitNotice {
  let started: Promise<void> | null = null

  const push = async (kind: BridgeWaitNoticeKind): Promise<void> => {
    try {
      const { deps, appId } = steamGame
      const title =
        deps.steamSession.libraryState.library.get(appId)?.title ?? ''
      const seq = await noticeSeq(steamGame)
      deps.sendFrontendMessage('steamRequestNotice', {
        appId,
        title,
        kind,
        seq
      })
      logInfo(
        `bridged launch wait notice ${kind} pushed for appId ${appId} (surface=in-app)`,
        LogPrefix.Steam
      )
    } catch (error) {
      logWarning(
        `bridged launch wait notice ${kind} could not be pushed: ${String(error)}`,
        LogPrefix.Steam
      )
    }
  }

  return {
    begin(cause) {
      if (started) return
      started = push(
        cause === 'steam-not-running'
          ? 'bridge-wait-steam-not-running'
          : 'bridge-wait-steam-not-signed-in'
      )
    },
    async end() {
      if (!started) return
      const pending = started
      started = null
      // The end takes its seq only after the start was pushed, so it is always the newer one
      // (the renderer drops an older or equal seq).
      await pending
      await push('bridge-wait-end')
    }
  }
}

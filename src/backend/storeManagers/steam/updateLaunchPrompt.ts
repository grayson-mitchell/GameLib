/**
 * Phase 74 D-04..D-07: the pre-launch update check for bridge games. Play on a bridge game with a
 * pending update asks "Play anyway / Update now / Don't ask again for this build". Button 0 is Play
 * anyway so a dismissal, an OK-only fallback or any unexpected response launches the current build
 * and never queues an update. The PICS wait (connect included) is bounded (3 s) and every failure
 * path launches, so Play never hangs on the network.
 *
 * Order: ACF bit-4 check, then the in-flight/queued block (no network needed), then detection.
 * Play aborts with a notice while a bridge update is downloading or committing (nativeInstallsInFlight)
 * or while its queue element is waiting with the queue running (WR-05). A paused update keeps the old
 * build playable (D-16), so it falls through to the normal prompt.
 *
 * Steam-registered games never reach this (D-07): the caller only invokes it for bridge launches.
 * An ACF that lost the fully-installed bit (4) means an update commit was interrupted; launching
 * that tree is unsafe, so Play is refused with a pointer to Downloads (D-16).
 */
// The warning count is a lint ceiling; this file's i18next.t calls follow launchDispatch.ts.
/* eslint-disable import-x/no-named-as-default-member */
import i18next from 'i18next'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { notify } from 'backend/dialog/dialog'
import { buildUpdateQueueElement } from 'backend/downloadmanager/updateElement'
import type SteamGame from './games'
import {
  detectSteamUpdates,
  STEAM_UPDATE_PRELAUNCH_TIMEOUT_MS
} from './updateDetection'
import { readAcfUpdateState } from './library/acfUpdateState'
import { readUpdatePromptAck, recordUpdatePromptAck } from './updatePromptAck'

const STATE_FLAG_FULLY_INSTALLED = 4

export async function gateBridgeLaunchOnUpdate(
  steamGame: SteamGame
): Promise<'launch' | 'abort'> {
  try {
    const { deps, appId } = steamGame
    const title = steamGame.getGameInfo().title || appId

    const acf = await readAcfUpdateState(deps, appId, 'bridge')
    if (acf && (acf.stateFlags & STATE_FLAG_FULLY_INSTALLED) === 0) {
      notify(deps, {
        title,
        body: i18next.t(
          'gamelib:steam.update.prompt.finishFirst',
          'Finish updating {{title}} before you play. Resume it from Downloads.',
          { title }
        )
      })
      return 'abort'
    }

    const inFlight =
      deps.steamSession.gameSession.nativeInstallsInFlight.get(appId)
    if (inFlight && !inFlight.aborted) {
      notify(deps, {
        title,
        body: i18next.t(
          'gamelib:steam.update.prompt.updating',
          '{{title}} is updating. Play it when the update finishes, or pause the update in Downloads.',
          { title }
        )
      })
      return 'abort'
    }
    const queueInfo = deps.getDownloadQueue().getQueueInformation()
    const queued = queueInfo.elements.some(
      (e) => e.type === 'update' && e.params.appName === appId
    )
    if (queued && queueInfo.state === 'running') {
      notify(deps, {
        title,
        body: i18next.t(
          'gamelib:steam.update.prompt.queued',
          'An update for {{title}} is waiting in Downloads. Play after it finishes, or remove it from the queue.',
          { title }
        )
      })
      return 'abort'
    }

    const [state] = await detectSteamUpdates(deps, {
      appIds: [appId],
      force: true,
      timeoutMs: STEAM_UPDATE_PRELAUNCH_TIMEOUT_MS
    })
    if (!state || state.state !== 'stale' || !state.targetBuild) return 'launch'
    const targetBuild = state.targetBuild

    if (readUpdatePromptAck(deps, appId) === targetBuild) return 'launch'

    const { response } = await deps.dialogs.showMessageBox({
      type: 'question',
      title: i18next.t('gamelib:steam.update.prompt.title', 'Update available'),
      message: i18next.t(
        'gamelib:steam.update.prompt.message',
        '{{title}} has an update (build {{targetBuild}}). Update now, or play the build you have?',
        { title, targetBuild }
      ),
      buttons: [
        i18next.t('gamelib:steam.update.prompt.playAnyway', 'Play anyway'),
        i18next.t('gamelib:steam.update.prompt.updateNow', 'Update now'),
        i18next.t(
          'gamelib:steam.update.prompt.dontAskAgain',
          "Don't ask again for this build"
        )
      ],
      // Index 0, a dismissal (host maps null to cancelId) and an OK-only fallback all mean Play anyway.
      defaultId: 0,
      cancelId: 0
    })

    switch (response) {
      case 1:
        logInfo(
          `SteamGame: queueing update for appId ${appId} from the launch prompt`,
          LogPrefix.Steam
        )
        await deps
          .getDownloadQueue()
          .addToQueue(buildUpdateQueueElement(steamGame.getGameInfo(), appId))
        return 'abort'
      case 2:
        recordUpdatePromptAck(deps, appId, targetBuild)
        return 'launch'
      default:
        return 'launch'
    }
  } catch (error) {
    logWarning(
      `SteamGame: pre-launch update check failed, launching: ${String(error)}`,
      LogPrefix.Steam
    )
    return 'launch'
  }
}

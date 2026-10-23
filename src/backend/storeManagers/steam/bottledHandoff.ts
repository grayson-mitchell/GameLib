/**
 * quick 261024-h5y -- the `steamFinishBottledInstall` IPC body.
 *
 * A bottle-route install parked at StateFlags 1026 has no user-visible Steam
 * to restart. This is the explicit, user-clicked way forward: send
 * `steam://install/<appId>` into the GameLibSteam bottle via the existing
 * tellBottledSteamToInstall path. That either starts bottled Steam with the
 * URI or hands it to the running instance (which raises its window), so no
 * process detection is needed.
 *
 * Authorized ONLY while library.ts reports an active bottle-source handoff
 * poll at 1026; polling itself never drives Steam.
 */
import { logInfo, logWarning, logError, LogPrefix } from 'backend/logger'
import i18next from 'i18next'
import { notify } from '../../dialog/dialog'
import { tellBottledSteamToInstall } from './bottle'
import {
  isAwaitingBottledSteamAdoption,
  markBottledSteamDispatched
} from './library'
import { library } from './state'

// Local copy by this directory's convention (see removeAllCopies.ts).
const NUMERIC_APP_ID = /^\d+$/

type FinishResult = { status: 'done' | 'error'; error?: string }

/** Per-appId single-flight. Holds no timer/socket/handle (sidecar exit contract). */
const inFlight = new Map<string, Promise<FinishResult>>()

async function dispatch(appId: string): Promise<FinishResult> {
  logInfo(
    `Steam: user asked bottled Steam to finish install of ${appId}`,
    LogPrefix.Steam
  )
  const result = await tellBottledSteamToInstall(appId)
  if (result.status === 'done') {
    markBottledSteamDispatched(appId)
    return result
  }
  logError(
    `Steam: could not start bottled Steam for ${appId}: ${result.error}`,
    LogPrefix.Steam
  )
  const title = library.get(appId)?.title ?? ''
  notify({
    title,
    body: i18next.t(
      'gamelib:steam.bottle.finishInstall.startFailed',
      'Could not start Steam to finish installing {{game}}: {{error}}',
      { game: title, error: result.error ?? '' }
    )
  })
  return result
}

export async function startBottledSteamToFinishInstall(
  appId: unknown
): Promise<FinishResult> {
  if (typeof appId !== 'string' || !NUMERIC_APP_ID.test(appId)) {
    logWarning(
      'Steam: steamFinishBottledInstall rejected a non-numeric appId',
      LogPrefix.Steam
    )
    return { status: 'error', error: 'invalid-app-id' }
  }
  if (!isAwaitingBottledSteamAdoption(appId)) {
    logWarning(
      `Steam: steamFinishBottledInstall refused for ${appId} (no bottle handoff awaiting)`,
      LogPrefix.Steam
    )
    return { status: 'error', error: 'not-awaiting-bottled-steam' }
  }
  const existing = inFlight.get(appId)
  if (existing) return existing
  const p = dispatch(appId).finally(() => inFlight.delete(appId))
  inFlight.set(appId, p)
  return p
}

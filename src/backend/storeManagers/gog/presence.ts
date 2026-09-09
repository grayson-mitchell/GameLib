import { app } from 'backend/platform'
import { logError, logInfo, LogPrefix } from 'backend/logger'
import { axiosClient } from 'backend/utils'
import { GOGUser } from './user'
import { isOnline } from 'backend/online_monitor'
import { GlobalConfig } from 'backend/config'
import { backendEvents } from 'backend/backend_events'

interface PresencePayload {
  application_type: string
  force_update: boolean
  presence: 'online' | 'offline'
  version: string
  game_id?: string
}

let CURRENT_GAME = ''
let interval: NodeJS.Timeout

function setCurrentGame(game: string) {
  CURRENT_GAME = game
}

async function setPresence() {
  try {
    const { disablePlaytimeSync, disableGOGPresence } =
      GlobalConfig.get().getSettings()
    if (
      disableGOGPresence ||
      disablePlaytimeSync ||
      !GOGUser.isLoggedIn() ||
      !isOnline()
    )
      return
    const credentials = await GOGUser.getCredentials()
    if (!credentials) return

    if (!interval) {
      interval = setInterval(setPresence, 5 * 60 * 1000)
    }

    const payload: PresencePayload = {
      application_type: 'GameLib',
      force_update: false,
      presence: 'online',
      version: app.getVersion(),
      game_id: undefined
    }

    if (CURRENT_GAME !== '') {
      payload.game_id = CURRENT_GAME
    }

    const response = await axiosClient.post(
      `https://presence.gog.com/users/${credentials.user_id}/status`,
      payload,
      { headers: { Authorization: `Bearer ${credentials.access_token}` } }
    )
    if (response.status === 204) {
      logInfo('GOG presence set', LogPrefix.Gog)
    }
  } catch (e) {
    logError(['Failed to set gog presence', e], LogPrefix.Gog)
  }
}

/**
 * D-DRS-01 -- guard/teardown audit for the keep-alive interval, todo
 * 2026-09-09-deletepresence-never-resets-interval-so-the-keepalive-cannot-re-arm.md.
 *
 * A repo-wide search for `deletePresence` across `src/` (2026-09-10) turns up exactly two real
 * callers, matching the todo's own reachable-path note: `utils.ts:326`, the quit path, which
 * awaits `deletePresence()` with no `force` argument immediately before `shutdownLongLivedChildren()`
 * and `app.exit()`; and the `settingChanged` listener below, the only caller that passes
 * `force = true`, which fires whenever the user flips `disableGOGPresence` on. `bootstrap.ts`'s
 * `setGogPresenceWhenOnline()` only ever calls `setPresence()`, never `deletePresence()`, and is
 * not part of this audit.
 *
 * Guard-by-guard matrix, each checked against those two call sites:
 *  - `disablePlaytimeSync`: reachable from BOTH call sites -- neither is gated by `force`, and
 *    either can run while playtime sync is off. When true, `setPresence()`'s own early return
 *    already refuses to post, so a keep-alive left running under this guard would just call
 *    `setPresence()` every 5 minutes into that no-op gate. The keep-alive should NOT still be
 *    running.
 *  - `(!force && disableGOGPresence)`: only reachable from `utils.ts:326` -- the `settingChanged`
 *    listener always passes `force = true`, which makes `!force` false and short-circuits this
 *    guard for that caller. At the quit path, `disableGOGPresence` being true means presence is
 *    opted out; a keep-alive should NOT still be running (irrelevant to the imminent `app.exit()`,
 *    but not something to rely on).
 *  - `!GOGUser.isLoggedIn()`: reachable from BOTH call sites -- settings can change, and the app
 *    can quit, independent of login state. A keep-alive posting/deleting presence for a
 *    logged-out user is meaningless. The keep-alive should NOT still be running.
 *  - `!isOnline()`: reachable from BOTH call sites -- offline is a real runtime state either
 *    caller can observe. `setPresence()`'s own guard already refuses to post while offline, so a
 *    surviving keep-alive would again be a 5-minute no-op poll. The keep-alive should NOT still
 *    be running.
 *  - falsy `credentials` return (`await GOGUser.getCredentials()`): reachable from BOTH call
 *    sites -- a transient credentials-fetch failure is independent of `force` and of the settings
 *    read above it. There is no valid session to maintain presence for. The keep-alive should NOT
 *    still be running.
 *
 * Every guard's answer is the same: none of the five early-return paths describes a case where
 * the local 5-minute keep-alive should keep ticking. Chosen: OPTION A -- the teardown (this
 * `clearInterval(interval)` call plus resetting `interval` to `undefined`) is hoisted above the
 * settings read and every guard, so it always runs when `deletePresence()` is called, and the
 * five guards below gate only the network `axiosClient.delete` call. Unconditional local teardown
 * is safe here because `clearInterval` and the `interval` reset touch nothing but this module's
 * own timer handle -- no network call, no shared state, no observable side effect outside this
 * file -- and because no reachable call site above wants the keep-alive to outlive a
 * `deletePresence()` call: the quit path is about to exit the process anyway, and the
 * `settingChanged` listener's whole purpose when it calls `deletePresence(true)` is to turn
 * presence off. If presence is needed again afterward, `setPresence()`'s own `if (!interval)`
 * arm re-creates the timer on its next call, exactly as it does after a fresh process start.
 */
async function deletePresence(force = false) {
  try {
    const { disablePlaytimeSync, disableGOGPresence } =
      GlobalConfig.get().getSettings()
    if (
      disablePlaytimeSync ||
      (!force && disableGOGPresence) ||
      !GOGUser.isLoggedIn() ||
      !isOnline()
    )
      return
    const credentials = await GOGUser.getCredentials()
    if (!credentials) {
      return
    }
    clearInterval(interval)
    const response = await axiosClient.delete(
      `https://presence.gog.com/users/${credentials.user_id}/status`,
      { headers: { Authorization: `Bearer ${credentials.access_token}` } }
    )
    if (response.status === 204) {
      logInfo('GOG presence deleted', LogPrefix.Gog)
    }
  } catch (e) {
    logError(['Failed to delete gog presence', e], LogPrefix.Gog)
  }
}

// React immediately when the user toggles GOG presence on/off in settings
backendEvents.on('settingChanged', ({ key, newValue }) => {
  if (key === 'disableGOGPresence') {
    if (newValue) {
      void deletePresence(true)
    } else {
      void setPresence()
    }
  }
})

export default {
  setCurrentGame,
  setPresence,
  deletePresence
}

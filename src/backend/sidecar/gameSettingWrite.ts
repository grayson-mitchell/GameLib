import { GameConfig } from '../game_config'
import { logError } from '../logger'
import { sendFrontendMessage } from '../ipc'

/**
 * G17 (59-25): a per-game write that throws (a GamesConfig file read while
 * it is being rewritten parses as truncated JSON, for one) was caught by
 * `dispatchSend` and written to stderr only -- the user's change vanished with
 * no line in gamelib.log. Retry once, and log a failure where gamelib.log
 * shows it. Exported for the regression test.
 *
 * WR-04: `setSetting` rolls its in-memory value back when the flush throws, and
 * after the final failure this pushes `gameSettingWriteFailed` so an open
 * settings screen re-reads the value actually on disk.
 */
export function applyGameSetting(
  appName: string,
  key: string,
  value: unknown
): void {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      GameConfig.get(appName).setSetting(key, value)
      return
    } catch (error) {
      if (attempt === 2) {
        logError(
          `${appName}: setSetting ${key} failed after retry: ${String(error)}`
        )
        try {
          sendFrontendMessage('gameSettingWriteFailed', { appName, key })
        } catch (sendError) {
          logError(
            `${appName}: gameSettingWriteFailed push failed: ${String(sendError)}`
          )
        }
      }
    }
  }
}

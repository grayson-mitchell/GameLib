/**
 * App lifecycle, main-window visibility, wake locks and clipboard write (D-66.3-01). Every
 * former module variable of `backend/platform` (relaunch-in-flight, hidden-by-GameLib, the
 * in-app dialog raise count, the wake-lock id counter and map) is a closure field of one
 * `createAppState` instance. Every method is total (never throws; failures are logged).
 *
 * Relaunch-vs-quit race guard (Phase 34.3 Plan 05, D-06): under Tauri `app.restart()` does
 * everything, and relaunch()/quit() are two INDEPENDENT fire-and-forget frames dispatched on
 * their own worker threads, so app_exit could be processed first and quit instead of restart.
 * `relaunch()` therefore latches `relaunchInFlight`, which suppresses `quit()`/`exit()`. The
 * latch is not reset on the success path (a relaunch is terminal for this process) but IS reset
 * when the relaunch dispatch REJECTS (CR-01): the process then survives, and holding the latch
 * would leave the app unquittable.
 *
 * No stdin-EOF hook: held wake locks are Rust-side assertions, not Node handles.
 */

import {
  RUST_APP_EXIT,
  RUST_APP_HIDE,
  RUST_APP_RELAUNCH,
  RUST_BRIDGE_INVITE_PICKER_OPEN,
  RUST_CLIPBOARD_WRITE_TEXT,
  RUST_MAIN_WINDOW_HIDE,
  RUST_MAIN_WINDOW_RAISE,
  RUST_WAKE_LOCK_START,
  RUST_WAKE_LOCK_STOP
} from 'common/types/sidecarTransport'
import type { RequestRustInvoke } from './index'

export interface AppState {
  quit(): void
  exit(): void
  relaunch(): void
  /** Hides the whole app (macOS); not the launch-time main-window hide. */
  hide(): void
  /** Unminimize + show + focus the real window; clears the hidden-by-GameLib mark. */
  raiseMainWindow(): void
  /** Hides GameLib for a game launch and remembers that GameLib did it. */
  hideMainWindow(): void
  /** Re-shows the window only if GameLib itself hid it for a launch. */
  raiseMainWindowIfHiddenByGameLib(): void
  /** As above, for the in-app (renderer) dialog path; also counts the raise. */
  raiseMainWindowForInAppDialog(): void
  inAppDialogRaiseCount(): number
  /** Resolves true on success, false (after a warn) on failure. Never rejects. */
  openBridgeInvitePicker(payload: {
    appId: string
    ackId: string
  }): Promise<boolean>
  wakeLock: {
    start(type: string): number
    stop(id: number): void
    isStarted(): boolean
  }
  writeClipboardText(text: string): void
}

const reason = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export function createAppState(deps: {
  requestRustInvoke: RequestRustInvoke
}): AppState {
  const { requestRustInvoke } = deps
  let relaunchInFlight = false
  // The sidecar cannot observe real window visibility, so this is the only record.
  let mainWindowHiddenByGameLib = false
  // Times an in-app dialog re-showed a window GameLib hid for a launch. An in-app dialog stays
  // on screen, so a `--no-gui` link launch that ended with one must keep GameLib open.
  let inAppDialogRaises = 0
  // Ids start at 1, never 0: launcher.ts's re-entry guard is `if (!powerDisplayId)`.
  let nextWakeLockId = 1
  // JS id -> the Rust assertion id; `null` while start is still in flight. A rejected start
  // deletes its entry so a later stop() on that id is a no-op.
  const heldWakeLocks = new Map<number, number | null>()

  const forward = (
    method: string,
    channel: Parameters<RequestRustInvoke>[0],
    args: Parameters<RequestRustInvoke>[1]
  ): void => {
    requestRustInvoke(channel, args).catch((error) => {
      console.warn(
        `[host] appState.${method}(): ${channel} failed:`,
        reason(error)
      )
    })
  }

  const state: AppState = {
    quit() {
      // D-06: a relaunch in flight owns this process's teardown.
      if (relaunchInFlight) {
        console.warn(
          '[host] appState.quit(): suppressed -- a relaunch is already in flight'
        )
        return
      }
      forward('quit', RUST_APP_EXIT, [])
    },
    exit() {
      if (relaunchInFlight) {
        console.warn(
          '[host] appState.exit(): suppressed -- a relaunch is already in flight'
        )
        return
      }
      forward('exit', RUST_APP_EXIT, [])
    },
    relaunch() {
      relaunchInFlight = true
      requestRustInvoke(RUST_APP_RELAUNCH, []).catch((error) => {
        // CR-01: reaching this catch means the relaunch genuinely did NOT happen, so release
        // the latch or quit()/exit() would be no-ops for the rest of this process's life.
        relaunchInFlight = false
        console.warn(
          `[host] appState.relaunch(): ${RUST_APP_RELAUNCH} failed:`,
          reason(error)
        )
      })
    },
    // No relaunch suppression: hiding a window is not teardown and cannot win the race.
    hide() {
      forward('hide', RUST_APP_HIDE, [])
    },
    raiseMainWindow() {
      mainWindowHiddenByGameLib = false
      forward('raiseMainWindow', RUST_MAIN_WINDOW_RAISE, [])
    },
    hideMainWindow() {
      mainWindowHiddenByGameLib = true
      forward('hideMainWindow', RUST_MAIN_WINDOW_HIDE, [])
    },
    raiseMainWindowIfHiddenByGameLib() {
      if (!mainWindowHiddenByGameLib) return
      state.raiseMainWindow()
    },
    raiseMainWindowForInAppDialog() {
      if (mainWindowHiddenByGameLib) inAppDialogRaises++
      state.raiseMainWindowIfHiddenByGameLib()
    },
    inAppDialogRaiseCount() {
      return inAppDialogRaises
    },
    openBridgeInvitePicker(payload) {
      return requestRustInvoke(RUST_BRIDGE_INVITE_PICKER_OPEN, [payload]).then(
        () => true,
        (error) => {
          console.warn(
            `[host] appState.openBridgeInvitePicker(): ${RUST_BRIDGE_INVITE_PICKER_OPEN} failed:`,
            reason(error)
          )
          return false
        }
      )
    },
    wakeLock: {
      // Real Electron's powerSaveBlocker.start() is SYNCHRONOUS and callers store the number
      // immediately; the Tauri command is a Promise. So the id is minted here, returned in the
      // same tick, and the Rust id is resolved into the map when the round-trip lands.
      start(type) {
        const id = nextWakeLockId++
        heldWakeLocks.set(id, null)
        requestRustInvoke(RUST_WAKE_LOCK_START, [type])
          .then((rustId) => {
            // A stop() may have landed while this was in flight: release rather than record.
            if (!heldWakeLocks.has(id)) {
              if (typeof rustId === 'number') {
                requestRustInvoke(RUST_WAKE_LOCK_STOP, [rustId]).catch(() => {})
              }
              return
            }
            if (typeof rustId === 'number') {
              heldWakeLocks.set(id, rustId)
            } else {
              heldWakeLocks.delete(id)
            }
          })
          .catch((error) => {
            heldWakeLocks.delete(id)
            console.warn(
              `[host] appState.wakeLock.start(): ${RUST_WAKE_LOCK_START} failed:`,
              reason(error)
            )
          })
        return id
      },
      stop(id) {
        if (!heldWakeLocks.has(id)) return
        const rustId = heldWakeLocks.get(id)
        heldWakeLocks.delete(id)
        // `null`: start never landed; its own `.then` releases the assertion if one arrives.
        if (rustId === null || rustId === undefined) return
        requestRustInvoke(RUST_WAKE_LOCK_STOP, [rustId]).catch((error) => {
          console.warn(
            `[host] appState.wakeLock.stop(): ${RUST_WAKE_LOCK_STOP} failed:`,
            reason(error)
          )
        })
      },
      isStarted() {
        return heldWakeLocks.size > 0
      }
    },
    writeClipboardText(text) {
      forward('writeClipboardText', RUST_CLIPBOARD_WRITE_TEXT, [text])
    }
  }
  return state
}

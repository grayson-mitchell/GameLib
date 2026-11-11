/**
 * shell.openExternal / openPath / showItemInFolder replacement (D-66.3-01). Built once at boot
 * by `createHostServices`; holds no state. Every method is total (never throws or rejects).
 */

import {
  RUST_SHELL_OPEN_PATH,
  RUST_SHELL_SHOW_ITEM_IN_FOLDER
} from 'common/types/sidecarTransport'
import type { RequestRustInvoke } from './index'
import { shouldOpenInBackground } from './openInBackground'

export interface OpenExternal {
  openExternal(url: string, options?: unknown): Promise<void>
  /** Resolves '' on success or a human-readable error string; never rejects. */
  openPath(path: string): Promise<string>
  showItemInFolder(fullPath: string): void
}

export function createOpenExternal(deps: {
  platform: NodeJS.Platform
  requestOpenExternal: (url: string) => void
  openDetached: (url: string, onError?: (code: string) => void) => void
  requestRustInvoke: RequestRustInvoke
}): OpenExternal {
  return {
    // Options used to be dropped: the Rust opener is a plain /usr/bin/open, which activates the
    // target app. Callers passing { activate: false } are steam/games.ts rungameid launches,
    // bridge/helperProcess.ts steam://open/main, and macSteamOffline go-offline. On darwin those
    // (steam: scheme only) spawn a detached `open -g`; non-steam URLs still go through the Rust
    // scheme check.
    async openExternal(url, options) {
      if (shouldOpenInBackground(deps.platform, url, options)) {
        deps.openDetached(url, (code) =>
          console.warn(
            `[host] openExternal.openExternal(): background open failed (${code})`
          )
        )
        return
      }
      deps.requestOpenExternal(url)
    },
    // Fire-and-forget (mirrors Electron's void-returning API); a transport failure is logged.
    showItemInFolder(fullPath) {
      deps
        .requestRustInvoke(RUST_SHELL_SHOW_ITEM_IN_FOLDER, [fullPath])
        .catch((error) => {
          console.warn(
            `[host] openExternal.showItemInFolder(): ${RUST_SHELL_SHOW_ITEM_IN_FOLDER} failed:`,
            error instanceof Error ? error.message : String(error)
          )
        })
    },
    async openPath(path) {
      try {
        await deps.requestRustInvoke(RUST_SHELL_OPEN_PATH, [path])
        return ''
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn(
          `[host] openExternal.openPath(): ${RUST_SHELL_OPEN_PATH} failed:`,
          message
        )
        return message
      }
    }
  }
}

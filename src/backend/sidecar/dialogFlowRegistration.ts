/**
 * Curated dialog channel registration (Phase 30 Plan 03 — WR-02 gap closure).
 *
 * Plan 30-03 built the whole native-picker chain (Cargo `tauri-plugin-dialog`
 * dependency, the `dialog_open` rustInvoke channel in `src-tauri/src/main.rs`,
 * the `RUST_DIALOG_OPEN` allowlist entry, `electronStub.showOpenDialog`) but
 * never registered the IPC channel that reaches it. `dialog.showOpenDialog`
 * has exactly one backend caller repo-wide — `main.ts`'s
 * `addHandler('openDialog', ...)` — and `main.ts` is NOT in the sidecar's
 * import graph (`bootstrap.ts` imports only `./handlers`, which imports the
 * curated registration modules). So under Tauri the `openDialog` channel kept
 * rejecting with `UNPORTED_CHANNEL_MARKER` and none of that chain ever ran in
 * production; `dialogStub.test.ts` proves the stub in isolation and by
 * construction cannot catch the missing registration.
 *
 * This module closes that gap by registering `openDialog` against the SHARED
 * `openDialogCallback` (`backend/utils/openDialog.ts`) that `main.ts` now also
 * calls — the same single-implementation discipline `checkGameUpdates.ts`
 * follows, so the two builds cannot fork on picker behavior.
 *
 * `parentWindow` is `undefined` here: the sidecar has no real `BrowserWindow`,
 * and `electronStub.showOpenDialog` ignores that argument entirely, forwarding
 * to Rust's `dialog_open` channel instead.
 *
 * Uses electronStub's own `ipcMain` directly (not `backend/ipc`'s typed
 * `addHandler`) — no file under `src/backend/sidecar/` may import the real
 * `electron` module, which `backend/ipc.ts` itself does. The electron import
 * lives in `backend/utils/openDialog.ts`, outside this directory, exactly as
 * `installFlowRegistration.ts` reaches `backend/utils/uninstaller.ts`.
 */

import { ipcMain } from '../platform'
import { openDialogCallback } from '../utils/openDialog'

/**
 * Registers the `openDialog` invoke handler. Called once from `handlers.ts` —
 * this module owns no import-time side effects beyond its imports.
 *
 * `openDialogCallback`'s parameters are typed with Electron's own
 * `BrowserWindow`/`OpenDialogOptions`, which this directory may not name even
 * in a type-only position — so the call is made through a same-body, widened
 * cast, exactly as `installFlowRegistration.ts` does for
 * `uninstallGameCallback`'s Electron `Event` parameter. The function body
 * reached at runtime is entirely unmodified.
 */
export function registerDialogFlows(): void {
  ipcMain.handle(
    'openDialog',
    async (_event: unknown, ...args: unknown[]): Promise<string | false> =>
      (
        openDialogCallback as (
          parentWindow: unknown,
          options: unknown
        ) => Promise<string | false>
      )(undefined, args[0] ?? {})
  )
}

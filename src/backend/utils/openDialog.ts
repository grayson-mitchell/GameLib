/**
 * Shared `openDialog` IPC handler body (Phase 30 code review, WR-02).
 *
 * Extracted from `backend/main.ts`'s inline `addHandler('openDialog', ...)` for the same
 * reason `checkGameUpdates.ts` was extracted: the Electron build and the Tauri sidecar must
 * import ONE implementation rather than forking file-picker behavior between the two builds.
 *
 * Before this extraction, plan 30-03's picker was unreachable in the Tauri build:
 * `dialog.showOpenDialog` had exactly one backend caller (`main.ts`), and `main.ts` is not in
 * the sidecar's import graph — so `openDialog` still rejected with `UNPORTED_CHANNEL_MARKER`
 * and the whole 30-03 chain (Cargo dependency, capability grant, rustInvoke allowlist entry,
 * `electronStub.showOpenDialog`) was dead weight in production.
 *
 * `dialog` resolves to the REAL electron module under Electron and to
 * `backend/platform/index.ts` under the sidecar (bootstrap's `Module._load` hook), which
 * is what makes one body serve both builds.
 */

import { dialog } from 'electron'
import type { BrowserWindow, OpenDialogOptions } from 'electron'

/**
 * Shows a native open dialog and returns the first picked path, or `false` on cancel.
 *
 * `parentWindow` is the modal's owner. It is `undefined` in the sidecar, which has no real
 * `BrowserWindow` — `electronStub.showOpenDialog` ignores the argument entirely and forwards
 * to Rust's `dialog_open` rustInvoke channel. Under Electron the caller is responsible for
 * supplying a live window (see `main.ts`, which returns `false` when there is none).
 */
export async function openDialogCallback(
  parentWindow: BrowserWindow | undefined,
  options: OpenDialogOptions
): Promise<string | false> {
  const { filePaths, canceled } = await dialog.showOpenDialog(
    // Always the two-argument form so the single shared body works on both builds; the
    // sidecar stub ignores this parameter, and the Electron caller never passes undefined.
    parentWindow as BrowserWindow,
    options
  )
  if (!canceled) {
    return filePaths[0]
  }
  return false
}

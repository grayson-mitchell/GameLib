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
 * `platformApi.showOpenDialog`) was dead weight in production.
 *
 * The native picker comes from the injected `dialogs` host service (no parent window: the
 * Rust `dialog_open` command ignores it).
 */

import type { Dialogs } from 'backend/host/dialogs'
import type { OpenDialogOptions } from 'common/types/hostTypes'

/**
 * Shows a native open dialog and returns the first picked path, or `false` on cancel.
 */
export async function openDialogCallback(
  deps: { dialogs: Pick<Dialogs, 'showOpenDialog'> },
  options: OpenDialogOptions
): Promise<string | false> {
  const { filePaths, canceled } = await deps.dialogs.showOpenDialog(options)
  if (!canceled) {
    return filePaths[0] ?? false
  }
  return false
}

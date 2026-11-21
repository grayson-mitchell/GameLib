/**
 * The sidecar's curated logger channel registration (Phase 34.2 gap cycle 2 / Phase 34.3 plan 04).
 *
 * Phase 84 plan 84-05 (2026-11-21): the renderer's `logError` and `logInfo` sends are served by the
 * Rust native router (`nativeChannels.json`, slice `logger`): the shell validates the one argument,
 * sanitises it with the Rust renderer sanitiser (CR and LF escaped, size caps) and writes the
 * `Frontend` line itself, so a renderer log message no longer passes through the sidecar and the
 * registrations that lived here are gone. A native-owned channel is registered in exactly one place:
 * the generator refuses a channel with both a manifest entry and a sidecar schema.
 *
 * What remains here:
 *
 *   send (`deps.ipc.on`):
 *     - `showLogFileInFolder` -> `logger/ipc_handler.ts:22`
 *
 *   invoke (`deps.ipc.handle`):
 *     - `uploadLogFile` -> `logger/ipc_handler.ts:26`
 *     - `deleteUploadedLogFile` -> `logger/ipc_handler.ts:27`
 *     - `getUploadedLogFiles` -> `logger/ipc_handler.ts:30`
 *
 * A `send` channel registered with `deps.ipc.handle` (or the reverse) fails 100% SILENTLY at runtime
 * (Phase 31 Pitfall 2): each registration below was cross-checked against the Electron-only
 * handler's own `addListener` / `addHandler` call for that exact channel.
 *
 * Imports `ipcMain` from `./platformApi` (never `electron`, never `backend/ipc`) and never
 * side-effect-imports the Electron-only logger IPC-handler file (D-04, D-14): that file also
 * registers channels that are ported elsewhere, and pulls `backend/ipc` -> the real `electron`
 * module into the sidecar bundle. The helpers are imported directly from `../logger/uploader` and
 * `../logger/paths`.
 *
 * D-08 -- `deleteUploadedLogFile` is ported at parity but CANNOT ACTUALLY DELETE ANYTHING in either
 * build: `logger/uploader.ts` hardcodes `const token = '1'`, and dpaste.com does not support
 * deletion. There is no UI path to this channel in either build; the invariant is enforced by a
 * render-level reachability gate
 * (`UploadedLogFilesList/__tests__/deleteButtonReachability.test.tsx`).
 *
 * D-09 -- log redaction is OUT OF SCOPE for this module. `uploadLogFile` sends up to 10 MiB of
 * unredacted log content to a public dpaste with a 2-day expiry; it is recorded as a standing
 * security todo (T-34.3-13, `34.3-PORTED-CHANNELS.md`). By explicit user instruction, NO AUDIT of
 * whether a token or key value can reach a log line is performed by this plan or this module.
 */

import type { OpenExternal } from '../host/openExternal'
import type { IpcRegistry } from './ipcRegistry'
import { getLogFilePath } from '../logger/paths'
import { showItemInFolder } from '../utils'
import {
  uploadLogFile,
  deleteUploadedLogFile,
  getUploadedLogFiles,
  type LogUploaderDeps
} from '../logger/uploader'

/**
 * Registers the 4 logger channels still served by the sidecar (3 invoke:
 * uploadLogFile, deleteUploadedLogFile, getUploadedLogFiles; 1 send:
 * showLogFileInFolder). `logError` and `logInfo` moved to the Rust native
 * router in Phase 84 plan 84-05. Called once from `handlers.ts` --
 * this module owns no side effects at import time beyond the imports above;
 * the caller decides when registration onto the handler registry happens.
 */
export function registerLoggerFlows(
  deps: LogUploaderDeps & {
    ipc: Pick<IpcRegistry, 'handle' | 'on'>
    openExternal: Pick<OpenExternal, 'showItemInFolder'>
  }
): void {
  // Electron parity source: src/backend/logger/ipc_handler.ts:22-24
  // addListener('showLogFileInFolder', (e, args) => showItemInFolder(getLogFilePath(args)))
  //
  // args[0] is passed WHOLE to getLogFilePath -- it is a GetLogFileArgs
  // object (or undefined for the base Heroic log), not a path string.
  deps.ipc.on('showLogFileInFolder', (_event: unknown, ...args: unknown[]) => {
    try {
      showItemInFolder(
        deps,
        getLogFilePath(args[0] as Parameters<typeof getLogFilePath>[0])
      )
    } catch (error: unknown) {
      let diagnostic =
        '[loggerFlowRegistration] showLogFileInFolder call-site rejection: <unstringifiable reason>'
      try {
        diagnostic = `[loggerFlowRegistration] showLogFileInFolder call-site rejection: ${
          error instanceof Error
            ? (error.stack ?? error.message)
            : String(error)
        }`
      } catch {
        // keep the hardcoded fallback
      }
      try {
        process.stderr.write(`${diagnostic}\n`)
      } catch {
        // Nothing further we can safely do -- swallow. Never re-throw,
        // never exit, never write to stdout (RPC frame transport).
      }
    }
  })

  // Electron parity source: src/backend/logger/ipc_handler.ts:26
  // addHandler('uploadLogFile', async (e, name, args) => uploadLogFile(name, args))
  //
  // No try/catch here that would swallow the rejection: the frontend owns
  // the "upload failed" state, and LogFileUploadDialog expects the invoke
  // to reject on failure (the Phase 20 D-14 convention).
  deps.ipc.handle(
    'uploadLogFile',
    async (_event: unknown, ...args: unknown[]) =>
      uploadLogFile(
        deps,
        args[0] as string,
        args[1] as Parameters<typeof getLogFilePath>[0]
      )
  )

  // Electron parity source: src/backend/logger/ipc_handler.ts:27
  //
  // D-08 (see this module's header docstring): ported faithfully. This
  // channel cannot actually delete anything in either build --
  // logger/uploader.ts:74-77 hardcodes token = '1'. Do NOT fix, guard, or
  // work around that here.
  deps.ipc.handle(
    'deleteUploadedLogFile',
    async (_event: unknown, ...args: unknown[]) =>
      deleteUploadedLogFile(deps, args[0] as string)
  )

  // Electron parity source: src/backend/logger/ipc_handler.ts:30
  //
  // getUploadedLogFiles's expiry-pruning side effect (a read channel that
  // mutates the store) is preserved -- Electron parity, and it is what
  // frontend/state/UploadedLogFiles.ts reads at module scope.
  deps.ipc.handle('getUploadedLogFiles', async () => getUploadedLogFiles(deps))
}

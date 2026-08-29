import { BrowserWindow } from 'backend/platform'

/**
 * Phase 35 Plan 15: this module used to also export `createMainWindow` and `isFrameless`.
 * Both are gone, because plan 35-14 deleted their only caller (`src/backend/main.ts`) and
 * Tauri owns the window.
 *
 * `createMainWindow` constructed an Electron `BrowserWindow` from persisted `WindowProps`,
 * sized against `screen.getPrimaryDisplay()` and wired to `build/preload/index.js`. Under
 * Tauri none of that applies: the window is declared in `tauri.conf.json`, and the preload
 * bundle it pointed at is never loaded by the Tauri webview (35-14 commit B). Its only
 * importer was its own test.
 *
 * `isFrameless` read `windowProps`, which only `createMainWindow` ever assigned, so it could
 * only ever have returned `false` once that function was gone. The `isFrameless` CHANNEL is
 * unaffected and is served renderer-side by `tauriIsFrameless` (`preload/api/misc.ts:50`) --
 * it was one of the 16 channels 35-14 confirmed as ported behind an `isTauri()` ternary.
 *
 * What survives is `getMainWindow`, which has twelve live importers including sidecar paths.
 */

export const getMainWindow = () => BrowserWindow.getAllWindows().at(0)

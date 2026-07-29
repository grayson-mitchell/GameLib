/**
 * Curated runner-CLI-version + misc-tool + saves-sync + runtime-download channel registration for
 * the Tauri sidecar (Phase 34.5 Plans 34.5-07/34.5-12, REQ-34.5-06/REQ-34.5-07/REQ-34.5-08/
 * REQ-34.5-09).
 *
 * INTENTIONALLY EMPTY as of plan 34.5-04. This module registers nothing yet — that is correct,
 * not a bug, until plans 34.5-07 and 34.5-12 land. Do not "fix" this by adding handler bodies
 * here; this plan only stakes the seam so every later cluster plan touches exactly one module
 * file instead of contending for a shared import list in `handlers.ts`.
 *
 * Declared channel list (11 total, all invoke — verified against `main.ts`,
 * `utils/ipc_handler.ts`, `tools/ipc_handler.ts`, and `wine/runtimes/ipc_handler.ts` by
 * 34.5-RESEARCH.md and this plan's own `<interfaces>` block; no send-kind channels in this
 * cluster):
 *
 *   invoke (ipcMain.handle, 11):
 *     - `getLegendaryVersion`         -> utils/ipc_handler.ts:18
 *     - `getGogdlVersion`             -> utils/ipc_handler.ts:19
 *     - `getCometVersion`             -> utils/ipc_handler.ts:20
 *     - `getNileVersion`              -> utils/ipc_handler.ts:21
 *     - `callTool`                    -> tools/ipc_handler.ts:25
 *     - `egsSync`                     -> main.ts:1251
 *     - `getGOGLinuxInstallersLangs`  -> main.ts:840
 *     - `syncSaves`                   -> main.ts:1263
 *     - `syncGOGSaves`                -> main.ts:1255
 *     - `downloadRuntime`             -> wine/runtimes/ipc_handler.ts:4
 *     - `isRuntimeInstalled`          -> wine/runtimes/ipc_handler.ts:6
 *
 * Curated-import rule (inherited from every prior slice's D-08 -> D-09 -> D-04 -> D-14 -> D-02
 * lineage): the cluster plan that fills this module in imports the underlying logic modules
 * directly (`utils` runner-version getters, `tools/index.ts`, `wine/runtimes/runtimes.ts`, the
 * saves-sync module), and NEVER `main.ts`, `utils/ipc_handler.ts`, `tools/ipc_handler.ts`, or
 * `wine/runtimes/ipc_handler.ts` — those double-register these same channels onto Electron's real
 * `ipcMain` via `backend/ipc`'s `addHandler`/`addListener`, an Electron-only path this sidecar's
 * curated import graph must never reach. `tools/ipc_handler.ts` in particular also registers the
 * DEFERRED winetricks channels that belong to Phase 34.6, not this slice — `callTool`'s own
 * winetricks branch inside `tools/index.ts` already works with zero extra wiring and is NOT
 * gated behind that deferral.
 */

/**
 * Registers this cluster's 11 invoke-kind channels. Called once from `handlers.ts` — this module
 * owns no side effects at import time; the caller decides when registration onto the handler
 * registry happens.
 *
 * EMPTY as of plan 34.5-04 — the runner-CLI-version + "other" bodies (`getCometVersion`,
 * `getGogdlVersion`, `getLegendaryVersion`, `getNileVersion`, `callTool`, `egsSync`,
 * `getGOGLinuxInstallersLangs`) land in plan 34.5-07, the saves-sync + runtime bodies
 * (`syncSaves`, `syncGOGSaves`, `downloadRuntime`, `isRuntimeInstalled`) land in plan 34.5-12.
 */
export function registerRunnerMiscFlows(): void {}

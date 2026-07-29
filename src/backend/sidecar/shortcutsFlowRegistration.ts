/**
 * Curated non-Steam-game shortcut + "add/remove to Steam" channel registration for the Tauri
 * sidecar (Phase 34.5 Plans 34.5-08/34.5-11, REQ-34.5-05).
 *
 * INTENTIONALLY EMPTY as of plan 34.5-04. This module registers nothing yet — that is correct,
 * not a bug, until plans 34.5-08 (desktop-shortcut trio, this cluster's highest send-ratio work)
 * and 34.5-11 (add/remove/isAdded-to-Steam trio + processShortcut) land. Do not "fix" this by
 * adding handler bodies here; this plan only stakes the seam so every later cluster plan touches
 * exactly one module file instead of contending for a shared import list in `handlers.ts`.
 *
 * Declared channel list (7 total — verified against `shortcuts/ipc_handler.ts` and `main.ts` by
 * 34.5-RESEARCH.md and this plan's own `<interfaces>` block):
 *
 *   invoke (ipcMain.handle, 4):
 *     - `shortcutsExists`  -> shortcuts/ipc_handler.ts:33
 *     - `addToSteam`       -> shortcuts/ipc_handler.ts:60
 *     - `removeFromSteam`  -> shortcuts/ipc_handler.ts:65
 *     - `isAddedToSteam`   -> shortcuts/ipc_handler.ts:70
 *
 *   send (ipcMain.on, 3):
 *     - `addShortcut`     -> shortcuts/ipc_handler.ts:14 SEND
 *     - `removeShortcut`  -> shortcuts/ipc_handler.ts:41 SEND
 *     - `processShortcut` -> main.ts:1465 SEND
 *
 * A `send` channel's rejection reaches NO caller (no reject, no timeout, no console line to the
 * renderer) — `sidecar-send-channels-fail-silently` project memory. Every eventual send-kind body
 * must guard its own promise via the `void (async () => { try {...} catch {...} })()`
 * fire-and-forget shape `humbleLoginFlowRegistration.ts` uses (`ipcMain.on('humbleStopLogin', ...)`),
 * since the Electron originals above are themselves already async bodies with no wrapping
 * try/catch — Electron's own `ipcMain.on` catches handler exceptions for you; this sidecar's
 * `electronStub.ts` `ipcMain.on` recorder does not.
 *
 * Curated-import rule (inherited from every prior slice's D-08 -> D-09 -> D-04 -> D-14 -> D-02
 * lineage): the cluster plan that fills this module in imports the underlying logic modules
 * directly (`shortcuts/shortcuts/shortcuts.ts`, `shortcuts/nonesteamgame/nonesteamgame.ts`), and
 * NEVER `main.ts` or `shortcuts/ipc_handler.ts` — that file double-registers these same channels
 * onto Electron's real `ipcMain` via `backend/ipc`'s `addHandler`/`addListener`, an Electron-only
 * path this sidecar's curated import graph must never reach.
 */

/**
 * Registers this cluster's 7 channels (4 invoke + 3 send). Called once from `handlers.ts` — this
 * module owns no side effects at import time; the caller decides when registration onto the
 * handler registry happens.
 *
 * EMPTY as of plan 34.5-04 — the desktop-shortcut trio (`addShortcut`/`removeShortcut`/
 * `shortcutsExists`) lands in plan 34.5-08, the Steam-add/remove trio plus `processShortcut` lands
 * in plan 34.5-11.
 */
export function registerShortcutsFlows(): void {}

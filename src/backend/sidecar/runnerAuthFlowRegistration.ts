/**
 * Curated Epic (legendary)/GOG/Amazon (nile) auth + sign-out channel registration for the Tauri
 * sidecar (Phase 34.5 Plans 34.5-06/34.5-10, REQ-34.5-04).
 *
 * INTENTIONALLY EMPTY as of plan 34.5-04. This module registers nothing yet — that is correct,
 * not a bug, until plans 34.5-06 (login/session channels) and 34.5-10 (sign-out channels) land.
 * Do not "fix" this by adding handler bodies here; this plan only stakes the seam so every later
 * cluster plan touches exactly one module file instead of contending for a shared import list in
 * `handlers.ts`.
 *
 * Declared channel list (11 total — verified against `main.ts` by 34.5-RESEARCH.md and this
 * plan's own `<interfaces>` block):
 *
 *   invoke (ipcMain.handle, 10):
 *     - `login`                -> main.ts:877 -> `LegendaryUser.login(sid)`
 *     - `getUserInfo`          -> main.ts:868
 *     - `isLoggedIn`           -> main.ts:875 -> `LegendaryUser.isLoggedIn()`
 *     - `getEpicGamesStatus`   -> main.ts:772 -> `isEpicServiceOffline()`
 *     - `logoutLegendary`      -> main.ts:879 -> `LegendaryUser.logout()`
 *     - `authGOG`              -> main.ts:878 -> `GOGUser.login(code)`
 *     - `getAmazonLoginData`   -> main.ts:882 -> `NileUser.getLoginData()`
 *     - `authAmazon`           -> main.ts:883 -> `NileUser.login(data)`
 *     - `getAmazonUserInfo`    -> main.ts:872 -> `NileUser.getUserData()`
 *     - `logoutAmazon`         -> main.ts:884 -> `NileUser.logout()`
 *
 *   send (ipcMain.on, 1):
 *     - `logoutGOG` -> main.ts:880 SEND -> `GOGUser.logout()`. A `send` channel's rejection
 *       reaches NO caller (no reject, no timeout, no console line to the renderer) —
 *       `sidecar-send-channels-fail-silently` project memory. Its eventual body must guard its
 *       own promise (or wrap a sync throw in try/catch) rather than let a rejection/throw escape
 *       unguarded, mirroring `steamAuthFlowRegistration.ts`'s `logoutSteam` and
 *       `humbleLoginFlowRegistration.ts`'s `ipcMain.on(...)` fire-and-forget-IIFE shape.
 *
 * Curated-import rule (inherited from every prior slice's D-08 -> D-09 -> D-04 -> D-14 -> D-02
 * lineage): the cluster plan that fills this module in imports the underlying logic modules
 * directly (`storeManagers/legendary/user`, `storeManagers/gog/user`, `storeManagers/nile/user`),
 * and NEVER `main.ts` or any `ipc_handler.ts` file — those double-register these same channels onto
 * Electron's real `ipcMain` via `backend/ipc`'s `addHandler`/`addListener`, an Electron-only path
 * this sidecar's curated import graph must never reach.
 */

import { ipcMain } from './electronStub'
// Load-bearing FIRST import — force `storeManagers/index.ts` to be the INITIALIZATION ENTRY
// before a direct `storeManagers/<runner>/user` import resolves, avoiding the re-entrant "X is
// not a constructor" mid-evaluation crash `steamAuthFlowRegistration.ts`'s own docstring
// documents (`storeManagers/index.ts` imports `steam/library` at its own top, which in turn
// imports `steam/user`, and only THEN constructs its eager `libraryManagerMap` — entering through
// a direct runner `user.ts` import instead risks hitting that same class mid-definition). This
// fix is per-file, not "once is enough": each curated registration module is its own independent
// entry point into the bundle's module graph.
import '../storeManagers'

/**
 * Registers this cluster's 11 channels (10 invoke + 1 send). Called once from `handlers.ts` —
 * this module owns no side effects at import time beyond the imports above; the caller decides
 * when registration onto the handler registry happens.
 *
 * EMPTY as of plan 34.5-04 — the login/session bodies land in plan 34.5-06, the sign-out bodies
 * (including `logoutGOG`'s send-kind guard) land in plan 34.5-10.
 */
export function registerRunnerAuthFlows(): void {}

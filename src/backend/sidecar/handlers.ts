/**
 * Placeholder RPC handler registry for the sidecar (Phase 27 Plan 02 — Task 2).
 *
 * Registers exactly one `health` invoke handler against electronStub's
 * `ipcMain` recorder, proving sidecarRpc.ts's dispatch path (request ->
 * `handlerRegistry` lookup -> response) end to end under bare node. 27-04
 * expands this file with the real E2E flow channels (Steam library read +
 * steam:// launch) — importing the actual backend modules those flows need,
 * AFTER this file is required by bootstrap.ts (which installs the
 * Module._load hook first).
 *
 * Uses electronStub's own `ipcMain` directly (not `backend/ipc`'s typed
 * `addHandler`) because 'health' is a new placeholder channel, not one of
 * the existing `AsyncIPCFunctions` entries — and no file under this
 * directory may import the real electron module (Task 1 acceptance
 * criterion), which `backend/ipc.ts` itself does.
 */

import { ipcMain } from './electronStub'

ipcMain.handle('health', async () => 'ok')

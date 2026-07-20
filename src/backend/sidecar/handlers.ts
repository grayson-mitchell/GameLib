/**
 * RPC handler registry for the sidecar (Phase 27 Plan 02 placeholder,
 * expanded by Plan 04 — Task 1).
 *
 * Registers the `health` invoke handler (27-02's own dispatch-path proof,
 * kept for `bootstrap.test.ts`'s Behavior 3 assertion), the curated Steam
 * read/action flow channels (`registerSteamFlows()`, `steamFlowRegistration.ts`),
 * and the sidecar-side half of 27-03's synchronous store-snapshot bridge —
 * all against electronStub's `ipcMain` recorder, AFTER this file is required
 * by bootstrap.ts (which installs the Module._load hook first).
 *
 * Uses electronStub's own `ipcMain` directly (not `backend/ipc`'s typed
 * `addHandler`) because 'health' and 'sidecar:store-snapshot' are not
 * entries in the existing `AsyncIPCFunctions` contract — and no file under
 * this directory may import the real electron module (Task 1 acceptance
 * criterion), which `backend/ipc.ts` itself does.
 */

import { ipcMain } from './electronStub'
import { registerSteamFlows } from './steamFlowRegistration'
import { configStore as steamConfigStore } from '../storeManagers/steam/electronStores'
import { configStore } from '../constants/key_value_stores'

ipcMain.handle('health', async () => 'ok')

registerSteamFlows()

// ---- Store snapshot (27-03's synchronous renderer bridge) -----------------
//
// Channel literal mirrors src-tauri/src/main.rs's STORE_SNAPSHOT_CHANNEL
// constant ('sidecar:store-snapshot') — the internal RPC channel the Rust
// shell's `sidecar_store_snapshot` command invokes, DISTINCT from
// SIDECAR_STORE_SNAPSHOT (the renderer-facing Tauri COMMAND name,
// 'sidecar_store_snapshot', src/common/types/sidecarTransport.ts).
//
// Scope (27-CONTEXT "Claude's discretion", 27-03's documented known-stub):
// only the two stores the skeleton's synchronous read path touches —
// `configStore` (app-wide) and `steamConfigStore` (the Steam login-gate's
// userData/username, GlobalState.tsx:238). T-27-09: the refreshToken secret
// is excluded at the source here, not just deny-listed in the renderer
// (src/preload/tauriTransport.ts's SECRET_STORE_KEYS) — defense in depth.
ipcMain.handle('sidecar:store-snapshot', async () => {
  const { refreshToken: _refreshToken, ...steamConfigSnapshot } =
    steamConfigStore.raw_store as Record<string, unknown>

  return {
    configStore: { ...configStore.raw_store },
    steamConfigStore: steamConfigSnapshot
  }
})

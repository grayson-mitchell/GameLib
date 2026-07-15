// Phase 21 Plan 07 seam — Plan 10 owns the real implementation.
//
// SteamGame.install()'s native (opt-in ON, non-bottle) branch calls
// ensureSteamClientReady(appId) BEFORE resolving an install target or
// starting a depot download, so a future Plan 10 can implement whatever
// "make sure an authenticated steam-user CM connection / running Steam
// client is available" flow it needs (auto-reconnect, launch a background
// Steam process, wait for ownershipCached, etc.) WITHOUT re-touching
// games.ts — this file is the single seam Plan 07 wires against.
//
// This stub is intentionally minimal: it always reports ready, so Plan 07's
// own install()/stop() wiring can be implemented and tested end-to-end now.
// Plan 10 replaces the body (not the exported signature) with the real
// readiness flow.

export interface EnsureSteamClientReadyResult {
  ready: boolean
  error?: string
}

/**
 * Resolves once the authenticated Steam CM connection this appId's depot
 * download needs is ready. Plan 07 stub: always ready.
 */
export async function ensureSteamClientReady(
  _appId: string
): Promise<EnsureSteamClientReadyResult> {
  return { ready: true }
}

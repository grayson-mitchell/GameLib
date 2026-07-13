import type { WineInstallation } from '../types'

export interface SteamCredentials {
  refreshToken: string // encrypted via safeStorage; decrypted before use
}

export interface SteamUserData {
  username: string // persona name from steam-user after loggedOn
  steamId?: string // SteamID64 — optional, used for display
}

// Phase 17 (17-02): dedicated Steam CrossOver bottle settings, persisted in
// its own `steamBottleConfigStore` — NOT a phantom GameConfig entry (see
// RESEARCH.md "Alternatives Considered"). Shared by
// src/backend/storeManagers/steam/electronStores.ts and the StoreStructure
// map below.
// NOTE: must stay a `type` alias (not `interface`) — TypeScript only permits
// implicit index-signature assignability (required by StoreStructure's
// `Record<string, unknown>` bound) for type-literal aliases, not interfaces.
export type SteamBottleConfig = {
  bottleName: string
  wineVersion?: WineInstallation
  wineCrossoverBottle?: string
  provisioned: boolean
  // WR-02 (17-17): the former `loggedIn` field was removed — bottled-Steam auth
  // is opaque (D-04), so no backend point could ever truthfully write it; it
  // always reported false. Leaving a dead always-false signal only invited a
  // future consumer to trust it. steamBottleStatus surfaces provisioned +
  // bottleName only.
}

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
  loggedIn: boolean
}

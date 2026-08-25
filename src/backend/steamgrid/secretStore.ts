/**
 * SteamGridDbSecretStore — SteamGridDB's API-key storage seam (Phase 34.6 Plan 01,
 * `34.6-CONTEXT.md` amendment A-03, REQ-34.6-06).
 *
 * `steamgrid/secureKey.ts`'s header used to record the exact hazard: the moment any future
 * plan wires `steamgrid/ipc_handler.ts` (or any other route to `encryptApiKey`/`decryptApiKey`)
 * into a sidecar registration module, its `safeStorage` import (sourced from the `electron`
 * package) resolves to `electronStub.ts`'s deliberately-dead stub, `encryptionAvailable()`
 * catches to `false`, and `encryptApiKey()` takes its plaintext branch — so the SteamGridDB API
 * key would be persisted to `config.json` in the clear. This module is the seam that discharges
 * that hazard BEFORE the
 * SteamGridDB channels are ported (plan 34.6-09), mirroring `humble/secretStore.ts`'s
 * `HumbleSecretStore` shape exactly: `steamgrid/secretStore.ts` owns the swappable seam,
 * `steamgrid/secureKey.ts` keeps owning the `sgdb:v1:` crypto primitives the Electron
 * implementation below delegates to.
 *
 * **This plan installs ONLY the Electron implementation.** Its three private/public methods are
 * the verbatim call shape `steamgrid/ipc_handler.ts` already uses today (`GlobalConfig`
 * read/write + `secureKey.ts`'s `isEncryptedValue`/`encryptApiKey`/`decryptApiKey`) — a behavior
 * diff here is a REQ-34.6-06 failure. `getApiKey()` additionally absorbs `ipc_handler.ts`'s
 * inline `getDecryptedApiKey()` legacy-plaintext migration branch (PATTERNS.md delta 5): this is
 * the ONE surviving migration codepath on the Electron side. A future plan (34.6-02) installs the
 * sidecar's keyring-backed implementation via `setSteamGridDbSecretStore()`, parameterising the
 * generic `SidecarKeyringSlotStore` (`sidecar/keyringTokenStore.ts:162`) with the
 * `steamgrid-api-key` slot this plan added to the Rust allowlist — no bespoke third store
 * subclass is minted here or there.
 *
 * `steamgrid/ipc_handler.ts` itself is NOT touched by this plan — it is Electron-only today and
 * plan 34.6-09 owns reconciling it onto this seam.
 */

import { GlobalConfig } from 'backend/config'
import { logWarning, LogPrefix } from 'backend/logger'

import { isEncryptedValue, encryptApiKey, decryptApiKey } from './secureKey'

export interface SteamGridDbSecretStore {
  /** Whether this store's underlying encryption/secure-storage mechanism is currently usable.
   * Does NOT indicate whether a key is present. */
  isAvailable(): boolean
  /** Returns the stored API key, or `undefined` when none is stored. Total-method contract:
   * never throws, never returns a rejected promise. */
  getApiKey(): Promise<string | undefined>
  /** Persists an API key. Total-method contract: never throws, never rejects. */
  setApiKey(value: string): Promise<void>
  /** Removes the stored API key. Total-method contract: never throws, never rejects. */
  clearApiKey(): Promise<void>
}

// ── Electron implementation — byte-identical to the pre-seam behavior ───────

/**
 * The Electron build's SteamGridDbSecretStore. Wraps `GlobalConfig`'s `steamGridDbApiKey`
 * setting exactly as `steamgrid/ipc_handler.ts` does today, delegating the `sgdb:v1:` handling
 * to `secureKey.ts`'s existing crypto primitives. A behavior diff here is a REQ-34.6-06 failure.
 */
export class ElectronSteamGridDbSecretStore implements SteamGridDbSecretStore {
  isAvailable(): boolean {
    try {
      // secureKey.ts deliberately does not export its private `encryptionAvailable()` — probe
      // it indirectly via a throwaway value. `encryptApiKey()` returns a `sgdb:v1:`-prefixed
      // ciphertext only when the underlying `safeStorage` encryption is actually usable; it
      // returns the plaintext unchanged (and logs a warning) when it is not. No persistence
      // side effect: this never touches GlobalConfig.
      return isEncryptedValue(encryptApiKey('__gsd_availability_probe__'))
    } catch {
      return false
    }
  }

  async getApiKey(): Promise<string | undefined> {
    try {
      const stored = GlobalConfig.get().getSettings().steamGridDbApiKey
      if (!stored) return undefined

      // Migrate legacy plaintext values on first read — the ONE surviving migration codepath
      // (ipc_handler.ts's own inline copy is deleted by plan 34.6-09).
      if (!isEncryptedValue(stored)) {
        const reEncrypted = encryptApiKey(stored)
        if (isEncryptedValue(reEncrypted)) {
          GlobalConfig.get().setSetting('steamGridDbApiKey', reEncrypted)
        }
        return stored
      }

      const decrypted = decryptApiKey(stored)
      return decrypted || undefined
    } catch (error) {
      logWarning(
        ['Failed to read SteamGridDB API key:', error],
        LogPrefix.Backend
      )
      return undefined
    }
  }

  async setApiKey(value: string): Promise<void> {
    try {
      const trimmed = value.trim()
      const stored = trimmed ? encryptApiKey(trimmed) : ''
      GlobalConfig.get().setSetting('steamGridDbApiKey', stored)
    } catch (error) {
      logWarning(
        ['Failed to persist SteamGridDB API key:', error],
        LogPrefix.Backend
      )
    }
  }

  async clearApiKey(): Promise<void> {
    try {
      GlobalConfig.get().setSetting('steamGridDbApiKey', '')
    } catch (error) {
      logWarning(
        ['Failed to clear SteamGridDB API key:', error],
        LogPrefix.Backend
      )
    }
  }
}

// ── Registry — swappable per build, no env-var escape hatch ─────────────────

let activeSecretStore: SteamGridDbSecretStore =
  new ElectronSteamGridDbSecretStore()

/**
 * Installs a different SteamGridDbSecretStore implementation. Only ever called explicitly by a
 * build's own bootstrap path (e.g. the Tauri sidecar installing its keyring-backed implementation
 * in plan 34.6-02) — there is deliberately no env-var/config-driven auto-selection here (Phase 28
 * REQ-28-07/D-08's rule, applied here).
 */
export function setSteamGridDbSecretStore(next: SteamGridDbSecretStore): void {
  activeSecretStore = next
}

export function getSteamGridDbSecretStore(): SteamGridDbSecretStore {
  return activeSecretStore
}

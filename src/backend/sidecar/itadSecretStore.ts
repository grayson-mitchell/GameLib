/**
 * `SidecarItadKeyStore` -- the keyring-backed `ItadKeyStore` for the optional user-supplied
 * IsThereAnyDeal key (Phase 47 D-05).
 *
 * Modeled on `steamgridSecretStore.ts`: one per-instance `SidecarKeyringSlotStore` bound to
 * the `itad-api-key` slot, delegating every method to it. The slot store is already total
 * (a genuine failure logs one warning naming the failure mode, never the secret value), so
 * this class adds no behavior of its own and has no fallback of any kind.
 *
 * Import discipline: the slot name comes from `keyringTokenStore.ts` as a constant, never a
 * retyped literal, so a drift from Rust's `keyring_account()` allow-list (`src-tauri/src/main.rs`)
 * cannot hide until runtime as `keyring:unknown-slot`.
 *
 * There is no plaintext migration: the secret is new, nothing in `config.json` needs moving.
 */
import type { RequestRustInvoke } from '../host'
import type { ItadKeyStore } from '../storeSearch/itadSecrets'
import {
  SidecarKeyringSlotStore,
  KEYRING_SLOT_ITAD_API_KEY
} from './keyringTokenStore'

export class SidecarItadKeyStore implements ItadKeyStore {
  private readonly slot: SidecarKeyringSlotStore

  constructor(requestRustInvoke: RequestRustInvoke) {
    this.slot = new SidecarKeyringSlotStore(
      KEYRING_SLOT_ITAD_API_KEY,
      requestRustInvoke
    )
  }

  async getApiKey(): Promise<string | undefined> {
    return (await this.slot.getToken()) || undefined
  }

  async setApiKey(value: string): Promise<void> {
    await this.slot.setToken(value)
  }

  async clearApiKey(): Promise<void> {
    await this.slot.clearToken()
  }
}

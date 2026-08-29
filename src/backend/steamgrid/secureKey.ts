// F-1b (34.4.1-LIVE-GATE.md): this module has the SAME direct-`safeStorage`-import shape
// that produced F-1 (see 34.4.1-13-SUMMARY.md), and under the Tauri sidecar
// `import { safeStorage } from 'electron'` resolves to `electronStub.ts`'s hardcoded-dead
// stub, which would silently persist the SteamGridDB API key in PLAINTEXT.
//
// It was measured -- twice, independently, by plan 10's original sweep and plan 14's
// own re-check (34.4.1-SEAM-PARITY-SWEEP.md, "steamgrid/secureKey.ts (F-1b)
// sidecar-reachability" section) -- that this module was NOT REACHABLE from the sidecar's
// curated import graph at the time, so F-1b was DECLARED dormant, not migrated -- a
// deliberate, evidenced decision, not a silent drop. The condition that section said would
// trigger a live plaintext exposure -- a future plan wiring `steamgrid/ipc_handler.ts` (or
// any other route to this file's `encryptApiKey`/`decryptApiKey`) into a sidecar
// registration module -- is now DISCHARGED, not pending: Phase 34.6 plan 01
// (`34.6-CONTEXT.md` amendment A-03, REQ-34.6-06) is that plan, and it lands BEFORE the
// SteamGridDB channels are ported (plan 34.6-09), per A-03's exact instruction.
//
// This module's three exports below (`isEncryptedValue`/`encryptApiKey`/`decryptApiKey`)
// remain the `sgdb:v1:` crypto primitives, UNCHANGED, and are reached ONLY from
// `ElectronSteamGridDbSecretStore` in `./secretStore.ts` now -- never call `safeStorage`
// from anywhere else. The sidecar path does not use this module at all: it reads/writes
// the API key through the `steamgrid-api-key` OS Keychain slot this plan added to the Rust
// allowlist (`keyring_account()` in `src-tauri/src/main.rs`), installed by
// `setSteamGridDbSecretStore()` in a future plan (34.6-02), mirroring the shipped
// `HumbleSecretStore`/`SidecarKeyringSlotStore` precedent exactly.
import { safeStorage } from 'backend/platform'
import { logWarning, LogPrefix } from 'backend/logger'

const CIPHERTEXT_PREFIX = 'sgdb:v1:'

function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function isEncryptedValue(stored: string): boolean {
  return stored.startsWith(CIPHERTEXT_PREFIX)
}

export function encryptApiKey(plain: string): string {
  if (!plain) return ''
  if (!encryptionAvailable()) {
    logWarning(
      'safeStorage unavailable, storing SteamGridDB API key in plaintext',
      LogPrefix.Backend
    )
    return plain
  }
  const ciphertext = safeStorage.encryptString(plain).toString('base64')
  return `${CIPHERTEXT_PREFIX}${ciphertext}`
}

export function decryptApiKey(stored: string): string {
  if (!stored) return ''
  if (!isEncryptedValue(stored)) {
    // Legacy plaintext from before encryption was introduced.
    return stored
  }
  if (!encryptionAvailable()) return ''
  try {
    const buf = Buffer.from(stored.slice(CIPHERTEXT_PREFIX.length), 'base64')
    return safeStorage.decryptString(buf)
  } catch (error) {
    logWarning(
      ['Failed to decrypt SteamGridDB API key:', error],
      LogPrefix.Backend
    )
    return ''
  }
}

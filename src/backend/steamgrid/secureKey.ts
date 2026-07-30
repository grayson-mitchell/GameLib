// F-1b (34.4.1-LIVE-GATE.md): this module has the SAME direct-`safeStorage`-import shape
// that produced F-1 (see 34.4.1-13-SUMMARY.md), and under the Tauri sidecar
// `import { safeStorage } from 'electron'` resolves to `electronStub.ts`'s hardcoded-dead
// stub, which would silently persist the SteamGridDB API key in PLAINTEXT.
//
// It has been measured -- twice, independently, by plan 10's original sweep and plan 14's
// own re-check (34.4.1-SEAM-PARITY-SWEEP.md, "steamgrid/secureKey.ts (F-1b)
// sidecar-reachability" section) -- that this module is NOT REACHABLE from the sidecar's
// curated import graph today. Instruments used: (1) `electronReachLedger.test.ts`'s
// committed `BASELINE_ELECTRON_REACHING_MODULES` transitive-reach measurement contains no
// `steamgrid/*` path; (2) a direct grep of `src/backend/sidecar/handlers.ts`'s curated
// `register*Flows` import list finds no `steamgrid` entry. The only first-party importer
// of this module's exports (via `./ipc_handler`) is `src/backend/main.ts` -- Electron's own
// entry point, never on the sidecar's `bootstrap.ts` -> `handlers.ts` chain. F-1b is
// therefore DECLARED dormant, not migrated -- a deliberate, evidenced decision, not a
// silent drop.
//
// TRIGGER CONDITION: the moment any future plan wires `steamgrid/ipc_handler.ts` (or any
// other route to this file's `encryptApiKey`/`decryptApiKey`) into a sidecar registration
// module reachable from `handlers.ts`'s `register*Flows` chain, this becomes a LIVE
// plaintext exposure. That plan must migrate this file onto the same `HumbleSecretStore`-
// shaped seam plans 12/13 built for Humble, and add a `steamgrid` slot to the Rust
// allowlist (`keyring_account()` in `src-tauri/src/main.rs`) BEFORE porting the channel --
// not after.
import { safeStorage } from 'electron'
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

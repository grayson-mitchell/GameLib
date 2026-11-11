// F-1b (34.4.1-LIVE-GATE.md): this module has the SAME direct-`safeStorage`-import shape
// that produced F-1 (see 34.4.1-13-SUMMARY.md), and under the Tauri sidecar
// `import { logWarning, LogPrefix } from 'backend/logger'

import { logWarning, LogPrefix } from 'backend/logger'

const CIPHERTEXT_PREFIX = 'sgdb:v1:'

// safeStorage.isEncryptionAvailable() was false on the sidecar's stand-in (it is intentionally
// dead; the real key store is the Keychain slot behind steamgridSecretStore.ts). The branches
// that could only run with encryption available are deleted, so every path below is the old
// "unavailable" path with the same observable result: plaintext in, '' out for ciphertext.

export function isEncryptedValue(stored: string): boolean {
  return stored.startsWith(CIPHERTEXT_PREFIX)
}

export function encryptApiKey(plain: string): string {
  if (!plain) return ''
  logWarning(
    'safeStorage unavailable, storing SteamGridDB API key in plaintext',
    LogPrefix.Backend
  )
  return plain
}

export function decryptApiKey(stored: string): string {
  if (!stored) return ''
  if (!isEncryptedValue(stored)) {
    // Legacy plaintext from before encryption was introduced.
    return stored
  }
  // Ciphertext cannot be decrypted without safeStorage.
  return ''
}

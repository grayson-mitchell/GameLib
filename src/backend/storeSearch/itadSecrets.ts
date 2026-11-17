/**
 * Phase 47 D-05, D-06: owner of the OPTIONAL user-supplied IsThereAnyDeal key.
 *
 * The built-in key (`itadKey.ts`) is what PRICE-01..03 run on. This owner holds only the
 * key a user may paste in Settings. Storage is a `ItadKeyStore` slot (the OS keyring in
 * release builds, the dev vault in dev builds) -- never `config.json`.
 *
 * Contract:
 * - every method is total: a failing store is logged (operation name and error message
 *   only, never the stored value) and resolves, it never rejects to a caller;
 * - `isRejected()` is the D-06 session-only memory of "ITAD refused the user key". It is
 *   instance state (a closure variable, no module state), so a restart forgets it, and
 *   saving or clearing the key resets it;
 * - nothing in PRICE-01..03 requires this owner: when it is absent the adapter uses only
 *   the built-in key.
 */
import { logWarning, LogPrefix } from 'backend/logger'

/** The persistence slot the owner reads and writes. Implemented over the keyring or dev vault. */
export interface ItadKeyStore {
  getApiKey(): Promise<string | undefined>
  setApiKey(value: string): Promise<void>
  clearApiKey(): Promise<void>
}

export interface ItadSecrets {
  /** The stored user key, or undefined when none is set (or the store failed). */
  getApiKey(): Promise<string | undefined>
  /** Trims, then stores; an empty or whitespace-only value clears. Resets the rejected flag. */
  setApiKey(value: string): Promise<void>
  /** True when ITAD rejected the user key during this session. */
  isRejected(): boolean
  /** Records, for this session only, that ITAD rejected the user key. */
  markRejected(): void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createItadSecrets(deps: { store: ItadKeyStore }): ItadSecrets {
  const { store } = deps
  let rejected = false

  const warn = (operation: string, error: unknown): void => {
    logWarning(
      `[itad-secrets] ${operation} failed: ${errorMessage(error)}`,
      LogPrefix.Backend
    )
  }

  return {
    async getApiKey() {
      try {
        const stored = await store.getApiKey()
        return stored ? stored : undefined
      } catch (error) {
        warn('get', error)
        return undefined
      }
    },

    async setApiKey(value) {
      rejected = false
      const trimmed = typeof value === 'string' ? value.trim() : ''
      try {
        if (!trimmed) {
          await store.clearApiKey()
          return
        }
        await store.setApiKey(trimmed)
      } catch (error) {
        warn(trimmed ? 'set' : 'clear', error)
      }
    },

    isRejected() {
      return rejected
    },

    markRejected() {
      rejected = true
    }
  }
}

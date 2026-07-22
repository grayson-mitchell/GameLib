/**
 * Sidecar store WRITE handlers (Phase 29 Plan 06, D-05/D-06).
 *
 * Before this file existed, `tauriTransport.ts`'s `snapshotSet()`/`snapshotDelete()`
 * emitted `send`-kind `storeSet`/`storeDelete` frames that `dispatchSend()`
 * (`sidecarRpc.ts`) looked up in `listenerRegistry`, found an empty array for, and
 * iterated zero times. No error, no log, no rejected promise — the write vanished with
 * ZERO observable signal (29-RESEARCH Pitfall 1), worse than every other unported
 * channel (which at least rejects with `UNPORTED_CHANNEL_MARKER`). Meanwhile the
 * renderer's own optimistic snapshot update made the UI look like the write worked
 * until the next restart. This file closes that hole: a real, guarded choke point that
 * persists the write through the registry and announces it back to the renderer.
 *
 * `applyStoreWrite()` is THE single write choke point (D-06). Any future sidecar-side
 * write that bypasses this function will make the renderer's snapshot silently diverge
 * from what is actually on disk — do not add a second frontend-push call site for the
 * `STORE_CHANGED_CHANNEL` event anywhere else.
 *
 * No import of the real `electron` module — uses `./electronStub`'s `ipcMain`, same as
 * every other file under this directory.
 */

import Store from 'electron-store'

import { ipcMain } from './electronStub'
// Namespace import (not a named import) so this module's frontend-push call site is
// the ONLY line in the file naming that function — see the header comment and the D-06
// single-choke-point note above `applyStoreWrite`.
import * as sidecarRpc from './sidecarRpc'
import { getRegisteredStore } from '../electron_store'
import { TOKEN_STORE_KEY } from '../storeManagers/steam/constants'
import {
  CACHE_STORE_NAME_PATTERN,
  isAllowedStoreField,
  isSafeKeyPath,
  RECOGNIZED_CACHE_STORE_NAMES,
  STORE_UNIVERSE
} from 'common/types/storePolicy'
import {
  STORE_SET_CHANNEL,
  STORE_DELETE_CHANNEL,
  STORE_NEW_CHANNEL,
  STORE_CHANGED_CHANNEL,
  type StoreChangedPayload
} from 'common/types/sidecarTransport'

/** Minimal shape both a registered typed store and a raw cache-backed `Store` satisfy. */
interface WritableStoreBackend {
  set: (key: string, value: unknown) => void
  delete: (key: string) => void
}

/**
 * Resolves the WRITE target for a store name — the write-path mirror of `handlers.ts`'s
 * `resolveRawStore()`, but returns the live backend (so a write actually persists)
 * rather than a raw snapshot object. Callers MUST have already validated `storeName`
 * (guard (a) in `applyStoreWrite` below) — this function never reconstructs a path from
 * the name by hand (29-RESEARCH Pitfall 4) and never accepts `cwd`/`name` from the RPC
 * frame; the cache-store branch below is the ONLY construction shape it will ever use.
 */
function resolveWritableStore(storeName: string): WritableStoreBackend | undefined {
  const registered = getRegisteredStore(storeName)
  if (registered) {
    // TypeCheckedStoreBackend's generic `set<KeyType>`/`delete<KeyType>` signatures are
    // only meaningfully typed against a literal `Name`/`KeyType` pair — this dispatch is
    // deliberately name-generic (a `ValidStoreName` arriving as a runtime string), the
    // same class of cast `electron_store.ts`'s own registry already uses
    // (`instance: this as unknown as TypeCheckedStoreBackend<ValidStoreName>`).
    return registered as unknown as WritableStoreBackend
  }

  if (CACHE_STORE_NAME_PATTERN.test(storeName)) {
    return new Store({
      cwd: 'store_cache',
      name: storeName,
      clearInvalidConfig: true
    }) as unknown as WritableStoreBackend
  }

  return undefined
}

/**
 * THE single write choke point (D-06). Guards run in this fixed order; each rejection
 * logs exactly one stderr line naming the store and key — NEVER the value (T-28-04
 * convention) — and returns without writing or emitting a change event.
 */
export function applyStoreWrite(
  op: 'set' | 'delete',
  storeName: string,
  key: string,
  value?: unknown
): void {
  // Guard (a): storeName must be a declared store (STORE_UNIVERSE) or a syntactically
  // plausible dynamic cache-store name — the same acceptance test `sidecar:store-fetch`
  // (handlers.ts, T-29-13) applies on the read side.
  const isUniverseMember = (STORE_UNIVERSE as readonly string[]).includes(storeName)
  const isSyntacticallyValidCacheName = CACHE_STORE_NAME_PATTERN.test(storeName)
  if (!isUniverseMember && !isSyntacticallyValidCacheName) {
    process.stderr.write(
      `[storeWriteHandlers] rejected write — unrecognized store name '${storeName}' key '${key}'\n`
    )
    return
  }

  // Guard (b): PHASE 28 D-04 / REQ-28-02 — the Steam refresh token lives in the OS
  // Keychain via `SidecarKeyringTokenStore`, never in `steamConfigStore`'s plaintext
  // electron-store file. A plaintext write here would be Keychain-decrypt-failed by
  // Electron and would silently sign the real user out of the shipped app. Unconditional
  // — tracks the `TOKEN_STORE_KEY` constant rather than a duplicated literal, so a rename
  // of that constant can never quietly reopen this guard.
  if (storeName === 'steamConfigStore' && key.split('.')[0] === TOKEN_STORE_KEY) {
    process.stderr.write(
      `[storeWriteHandlers] rejected write — steamConfigStore.${TOKEN_STORE_KEY} is Keychain-owned (D-04/REQ-28-02), key '${key}'\n`
    )
    return
  }

  // Guard (c): D-08 WRITE-SIDE — a field the renderer may not read, it may not write.
  // One policy governs both directions (`isAllowedStoreField`), so a newly added secret
  // field is write-protected by default too, not just read-protected.
  if (!isAllowedStoreField(storeName, key)) {
    process.stderr.write(
      `[storeWriteHandlers] rejected write — field not allow-listed, store '${storeName}' key '${key}'\n`
    )
    return
  }

  // Guard (c′): CR-01 defence-in-depth — refuse prototype-chain key path segments at
  // the POLICY layer too, not only at the storage layer. `fileStore.ts` now rejects
  // these itself, but the policy layer must not depend on that: `resolveWritableStore`
  // returns a real `electron-store` under Electron, and any future storage backend
  // would otherwise inherit the hole. Mirrors `dot-prop`'s `disallowedKeys`.
  if (!isSafeKeyPath(key)) {
    process.stderr.write(
      `[storeWriteHandlers] rejected write — disallowed key path segment, store '${storeName}'\n`
    )
    return
  }

  // Guard (d): resolve the target ONLY through the registry or the fixed cache-store
  // construction shape — never a path reconstructed from the name.
  const target = resolveWritableStore(storeName)
  if (!target) {
    process.stderr.write(
      `[storeWriteHandlers] rejected write — no resolvable store instance for '${storeName}' key '${key}'\n`
    )
    return
  }

  try {
    if (op === 'set') {
      target.set(key, value)
    } else {
      target.delete(key)
    }
  } catch (error) {
    // Repudiation control (T-29-30): a write failure must never be purely silent.
    process.stderr.write(
      `[storeWriteHandlers] write threw for store '${storeName}' key '${key}': ${
        error instanceof Error ? error.message : String(error)
      }\n`
    )
    return
  }

  // D-06: the ONLY frontend-push call site for this event in this file (or anywhere
  // else) — see the header comment.
  sidecarRpc.pushFrontendMessage(STORE_CHANGED_CHANNEL, {
    store: storeName,
    key,
    value,
    deleted: op === 'delete'
  } satisfies StoreChangedPayload)
}

let handlersRegistered = false

/**
 * Registers the three write listeners. Idempotent (mirrors `ensureStoresRegistered()`'s
 * own re-entrancy guard) — safe to call more than once across tests/bootstraps.
 */
export function registerStoreWriteHandlers(): void {
  if (handlersRegistered) {
    return
  }
  handlersRegistered = true

  // `send`-kind (fire-and-forget) registrations: unlike an `invoke` channel there is no
  // response frame and no promise to reject on the renderer side — which is exactly why
  // the missing registration was invisible before this plan (see header comment).
  ipcMain.on(
    STORE_SET_CHANNEL,
    (_event: unknown, storeName: unknown, key: unknown, value: unknown) => {
      if (typeof storeName !== 'string' || typeof key !== 'string') {
        process.stderr.write(
          '[storeWriteHandlers] storeSet rejected a non-string store name or key\n'
        )
        return
      }
      applyStoreWrite('set', storeName, key, value)
    }
  )

  ipcMain.on(
    STORE_DELETE_CHANNEL,
    (_event: unknown, storeName: unknown, key: unknown) => {
      if (typeof storeName !== 'string' || typeof key !== 'string') {
        process.stderr.write(
          '[storeWriteHandlers] storeDelete rejected a non-string store name or key\n'
        )
        return
      }
      applyStoreWrite('delete', storeName, key)
    }
  )

  // T-27-03 continuation: `resolveStorePath()` is only safe as long as `cwd`/`name`
  // never originate in an RPC frame. `storeNew` therefore NEVER constructs a store from
  // the renderer-supplied `options` argument — it only no-ops for an already-registered
  // typed store, or constructs a permitted dynamic cache store using the hardcoded shape
  // below, ignoring `options` except to log a mismatch diagnostic.
  ipcMain.on(
    STORE_NEW_CHANNEL,
    (_event: unknown, storeName: unknown, options: unknown) => {
      if (typeof storeName !== 'string') {
        process.stderr.write(
          '[storeWriteHandlers] storeNew rejected a non-string store name\n'
        )
        return
      }

      if (getRegisteredStore(storeName)) {
        // The typed stores are constructed by `storeRegistration.ts`, not by the
        // renderer — a `storeNew` for one of them is a legitimate no-op.
        return
      }

      if (!CACHE_STORE_NAME_PATTERN.test(storeName)) {
        process.stderr.write(
          `[storeWriteHandlers] storeNew rejected an invalid store name: '${storeName}'\n`
        )
        return
      }

      if (options !== undefined) {
        process.stderr.write(
          `[storeWriteHandlers] storeNew ignored renderer-supplied options for '${storeName}' — using the hardcoded cache-store shape\n`
        )
      }

      new Store({
        cwd: 'store_cache',
        name: storeName,
        clearInvalidConfig: true
      })
    }
  )
}

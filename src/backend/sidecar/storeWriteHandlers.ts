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
import {
  setStoreChangeNotifier,
  withStoreChangeSuppressed
} from '../storeChangeNotifier'
import { TOKEN_STORE_KEY } from '../storeManagers/steam/constants'
import {
  CACHE_STORE_NAME_PATTERN,
  DENIED_CACHE_STORES,
  isAllowedStoreField,
  isSafeKeyPath,
  isWritableStoreField,
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
function resolveWritableStore(
  storeName: string
): WritableStoreBackend | undefined {
  // WR-09: the deny list is load-bearing on the write path too — a denied cache store
  // has no resolvable write target, independently of guard (c).
  if (DENIED_CACHE_STORES.includes(storeName)) {
    return undefined
  }

  const registered = getRegisteredStore(storeName)
  if (registered) {
    // TypeCheckedStoreBackend's generic `set<KeyType>`/`delete<KeyType>` signatures are
    // only meaningfully typed against a literal `Name`/`KeyType` pair — this dispatch is
    // deliberately name-generic (a `ValidStoreName` arriving as a runtime string), the
    // same class of cast `electron_store.ts`'s own registry already uses
    // (`instance: this as unknown as TypeCheckedStoreBackend<ValidStoreName>`).
    return registered as unknown as WritableStoreBackend
  }

  // WR-01/WR-02: recognized cache-store names ONLY, and still syntactically validated
  // — `storeName` reaches `Store`'s `name` option and therefore `resolveStorePath()`.
  if (
    RECOGNIZED_CACHE_STORE_NAMES.includes(storeName) &&
    CACHE_STORE_NAME_PATTERN.test(storeName)
  ) {
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
  // Guard (a): storeName must be a declared store (STORE_UNIVERSE) or a RECOGNIZED
  // dynamic cache-store name.
  //
  // WR-01 (Phase 29 code review): this guard used to test the store name against
  // `CACHE_STORE_NAME_PATTERN` (`/^[A-Za-z0-9_-]{1,64}$/`), which matches EVERY member
  // of STORE_UNIVERSE and every other plausible name — it could only ever fire for a
  // name containing `.`, `/`, a space, or >64 chars, while its comment claimed it was
  // "the same acceptance test the read side applies", implying an allow-list check that
  // did not exist. The real gate was guard (c) alone. Testing against
  // `RECOGNIZED_CACHE_STORE_NAMES` makes the guard mean what it says. The four D-13
  // names plus `humble_library` are the ONLY dynamic cache stores the frontend ever
  // constructs (`new CacheStore(...)`, src/frontend/helpers/electronStores.ts).
  const isUniverseMember = STORE_UNIVERSE.includes(storeName)
  const isRecognizedCacheName = RECOGNIZED_CACHE_STORE_NAMES.includes(storeName)
  if (!isUniverseMember && !isRecognizedCacheName) {
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
  if (
    storeName === 'steamConfigStore' &&
    key.split('.')[0] === TOKEN_STORE_KEY
  ) {
    process.stderr.write(
      `[storeWriteHandlers] rejected write — steamConfigStore.${TOKEN_STORE_KEY} is Keychain-owned (D-04/REQ-28-02), key '${key}'\n`
    )
    return
  }

  // Guard (c′): CR-01 defence-in-depth — refuse prototype-chain key path segments at
  // the POLICY layer too, not only at the storage layer. `fileStore.ts` now rejects
  // these itself, but the policy layer must not depend on that: `resolveWritableStore`
  // returns a real `electron-store` under Electron, and any future storage backend
  // would otherwise inherit the hole. Mirrors `dot-prop`'s `disallowedKeys`. Runs
  // BEFORE guard (c) purely so a hostile key gets its own precise diagnostic —
  // `isWritableStoreField` also refuses these, so the two are belt and braces.
  if (!isSafeKeyPath(key)) {
    process.stderr.write(
      `[storeWriteHandlers] rejected write — disallowed key path segment, store '${storeName}'\n`
    )
    return
  }

  // Guard (c): D-08 WRITE-SIDE — a field the renderer may not read, it may not write,
  // so a newly added secret field is write-protected by DEFAULT, not just
  // read-protected. WR-04 (Phase 29 code review): the write predicate is
  // `isWritableStoreField`, which is STRICTLY NARROWER than the read predicate — read
  // safety and write safety are not the same question. `configStore.settings`
  // (AppSettings: wineVersion.bin, wrapperOptions, launcherArgs, winePrefix — executable
  // paths and command lines consumed on the next game launch) is readable but NOT
  // renderer-writable; the same holds for `configStore.userHome`/`userInfo` and every
  // `*.userData`. Settings changes route through the typed requestAppSettings/setSetting
  // IPC instead.
  if (!isWritableStoreField(storeName, key)) {
    process.stderr.write(
      `[storeWriteHandlers] rejected write — field not allow-listed, store '${storeName}' key '${key}'\n`
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
    // Suppressed because THIS function pushes the change itself, a few lines down, with a
    // richer payload than the store class can produce (an explicit `deleted` flag either
    // way). Without this the write emits two frames — one from the class, one from here.
    // Whoever initiates a write owns its notification; this handler initiates these.
    //
    // The push below is NOT redundant with the class-level one and must not be deleted in
    // favour of it: `resolveWritableStore` can hand back a RAW `electron-store` instance
    // for the cache-store branch, which has no notification hook at all.
    withStoreChangeSuppressed(() => {
      if (op === 'set') {
        target.set(key, value)
      } else {
        target.delete(key)
      }
    })
  } catch (error) {
    // Repudiation control (T-29-30): a write failure must never be purely silent.
    process.stderr.write(
      `[storeWriteHandlers] write threw for store '${storeName}' key '${key}': ${
        error instanceof Error ? error.message : String(error)
      }\n`
    )
    return
  }

  pushStoreChanged({
    store: storeName,
    key,
    value,
    deleted: op === 'delete'
  })
}

/**
 * D-06: the ONLY frontend-push call site for this event in this file (or anywhere else) —
 * see the header comment.
 *
 * Extracted from `applyStoreWrite`'s body so a SECOND class of producer can reach it
 * without violating that single-call-site rule. `applyStoreWrite` covers writes the
 * RENDERER initiated (`storeSet`/`storeDelete` frames); the sidecar's own store managers
 * write straight through `cache.ts`/`electron_store.ts` and used to announce nothing at
 * all — the divergence this file's header warned about, live-confirmed in
 * `.planning/debug/gog-login-ui-never-updates.md` (GOG login persisted 7 games while the
 * renderer rendered none, silently, until restart). Those writers now reach this same
 * function through the `storeChangeNotifier` seam installed below.
 */
function pushStoreChanged(payload: StoreChangedPayload): void {
  // SECRET-LEAK GUARD — load-bearing for the sidecar-initiated producer, redundant for
  // `applyStoreWrite`.
  //
  // `applyStoreWrite` validates every renderer-driven write against
  // `isWritableStoreField` BEFORE it writes, so anything reaching this function from
  // there was already allow-listed. The store classes have no such gate: they write
  // whatever the backend asks them to, including genuinely secret fields (Steam refresh
  // tokens, Humble session/CSRF values). Pushing those unfiltered would place secrets in
  // the renderer's snapshot — the exact thing `handlers.ts`'s `filterStoreSnapshot()`
  // exists to prevent on the fetch path, defeated through a side door.
  //
  // The renderer's listener deliberately does NOT re-filter on the way in (it trusts this
  // emitter), so this is the only place the check can happen.
  //
  // An `invalidated` push carries no value and no meaningful key — it only tells the
  // renderer to re-fetch, and that re-fetch goes through `STORE_FETCH_CHANNEL`, which is
  // already filtered sidecar-side. It is therefore safe and must NOT be gated on a key
  // that does not exist.
  if (
    !payload.invalidated &&
    !isAllowedStoreField(payload.store, payload.key)
  ) {
    return
  }

  sidecarRpc.pushFrontendMessage(
    STORE_CHANGED_CHANNEL,
    payload satisfies StoreChangedPayload
  )
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

  // Point the sidecar-side store classes' notification seam at this file's single push
  // site, so writes the SIDECAR itself performs reach the renderer's D-06 listener the
  // same way renderer-initiated writes already do. Installed here rather than in
  // bootstrap because this is the sidecar-only, idempotent entry point that already owns
  // this channel — and because doing it anywhere else would put the wiring further from
  // the invariant it has to respect. Under Electron this function never runs, so
  // `notifyStoreChanged` stays a no-op and the Electron write paths are unchanged.
  setStoreChangeNotifier(pushStoreChanged)

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

      // WR-02 (Phase 29 code review): this branch used to construct a real `Store` for
      // ANY name matching `CACHE_STORE_NAME_PATTERN` — with no allow-list check, unlike
      // the write path. A renderer script could therefore create unbounded
      // `${userData}/store_cache/<name>.json` files, every one of which guard (c) then
      // made permanently unwritable: a pure junk-file/DoS vector with no legitimate
      // consumer. Restricted to the recognized cache-store names. The syntactic pattern
      // is still checked FIRST so a traversal-shaped name is reported as such.
      if (
        !CACHE_STORE_NAME_PATTERN.test(storeName) ||
        !RECOGNIZED_CACHE_STORE_NAMES.includes(storeName)
      ) {
        process.stderr.write(
          `[storeWriteHandlers] storeNew rejected an unrecognized store name: '${storeName}'\n`
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

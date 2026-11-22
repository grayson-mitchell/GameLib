/**
 * Sidecar store layer registrations (Phase 29 Plan 06, D-05/D-06; Phase 85 plans 10, 17 and 21).
 *
 * The renderer's store writes (`storeSet`, `storeDelete`, `storeNew`, the confirmed
 * `sidecar:store-set-checked`) are native channels the Rust shell owns (85-17): Rust checks each
 * against the shared policy (`storeChannels.json`) and applies it to its `StoreHost`, the one disk
 * writer. Since 85-21 (D-03) the sidecar keeps no fallback write handler. What is left here:
 *
 * - the single push site for `STORE_CHANGED_CHANNEL` (D-06): do not add a second
 *   frontend-push call site for that event anywhere else;
 * - the store root's `changes` channel bound to that site;
 * - the `storeMirrorEvent` registration that routes the shell's answers to the mirror cells.
 *
 * No import of the real `electron` module — uses `./platformApi`'s `ipcMain`, same as
 * every other file under this directory.
 */

import type { IpcRegistry } from './ipcRegistry'
import type { HostServices } from '../host'
import type { StoreRoot } from '../stores/storeRoot'
import { isAllowedStoreField } from 'common/types/storePolicy'
import {
  STORE_CHANGED_CHANNEL,
  STORE_MIRROR_EVENT_CHANNEL,
  type StoreChangedPayload
} from 'common/types/sidecarTransport'
import { isStoreMirrorEvent } from '../stores/mirrorCell'
import { isRustOwnedStoreName } from '../stores/storeFrames'

type PushFrontendMessage = HostServices['pushFrontendMessage']

/**
 * D-06: the ONLY frontend-push call site for this event in this file (or anywhere else) —
 * see the header comment.
 *
 * The sidecar's own store managers write straight through `cache.ts`/`typed_store.ts` and used to
 * announce nothing at all — the divergence `.planning/debug/gog-login-ui-never-updates.md`
 * live-confirmed (GOG login persisted 7 games while the renderer rendered none, silently, until
 * restart). Those writers reach this function through the store root's `changes` channel bound
 * below.
 */
function pushStoreChanged(
  push: PushFrontendMessage,
  payload: StoreChangedPayload
): void {
  // Phase 85 (85-17): ONE PUSH SOURCE PER STORE. The shell announces every change of a store it
  // owns to the renderer itself, whoever made it (this sidecar's mirror frames included), in its rev
  // order and through the same allow-list. A second push from here would arrive with no rev, on
  // another route, so the renderer could apply it over a newer value. Since 85-21 the shell owns
  // every store a renderer name resolves to, so this site pushes only for a name no Rust-owned
  // file backs (an unrecognised runtime cache).
  if (isRustOwnedStoreName(payload.store)) return

  // SECRET-LEAK GUARD.
  //
  // The store classes have no write gate: they write
  // whatever the backend asks them to, including genuinely secret fields (Steam refresh
  // tokens, Humble session/CSRF values). Pushing those unfiltered would place secrets in
  // the renderer's snapshot — the exact thing `handlers.ts`'s `filterStoreSnapshot()`
  // exists to prevent on the fetch path, defeated through a side door.
  //
  // The renderer's listener deliberately does NOT re-filter on the way in (it trusts this
  // emitter), so this is the only place the check can happen.
  //
  // An `invalidated` push carries no value and no meaningful key — it only tells the
  // renderer to re-fetch, and that re-fetch goes through `STORE_FETCH_CHANNEL`, which the shell
  // filters. It is therefore safe and must NOT be gated on a key
  // that does not exist.
  if (
    !payload.invalidated &&
    !isAllowedStoreField(payload.store, payload.key)
  ) {
    return
  }

  push(STORE_CHANGED_CHANNEL, payload satisfies StoreChangedPayload)
}

/**
 * Binds this boot's change channel to the push site and registers the mirror-event listener. Each
 * closes over this call's own root and push, so two boots never route through one another's stores
 * (C-WR-1). Single-run is owned by the 'register-handlers' boot step (D-66.4-01), not by a module
 * latch.
 */
export function registerStoreWriteHandlers(deps: {
  ipc: Pick<IpcRegistry, 'on'>
  root: StoreRoot
  /** This boot's backend -> frontend push (66.4-15). */
  pushFrontendMessage: PushFrontendMessage
}): void {
  // Point THIS boot's root at this file's single push site, so writes the SIDECAR itself
  // performs reach the renderer's D-06 listener. Bound here, not in bootstrap, because this is
  // the sidecar-only entry point that already owns this channel. Bound on every call because the
  // channel is per root; notifications raised before this call are still dropped (the channel
  // starts unbound).
  deps.root.changes.bind((payload) =>
    pushStoreChanged(deps.pushFrontendMessage, payload)
  )

  // Phase 85 (FND-06): the shell's answer to a store frame a mirror sent (`store_dispatch.rs`). One
  // registration site for the store layer: the same function that binds the root's change channel
  // above routes the answers to the root's mirror cells. The channel's schema
  // (`sidecarInternal.ts`) already ran; a payload that still is not an event is dropped with one
  // line naming nothing but the fact.
  deps.ipc.on(
    STORE_MIRROR_EVENT_CHANNEL,
    (_event: unknown, payload: unknown) => {
      if (!isStoreMirrorEvent(payload)) {
        process.stderr.write(
          '[storeWriteHandlers] storeMirrorEvent dropped a malformed payload\n'
        )
        return
      }
      deps.root.mirrors.applyEvent(payload)
    }
  )
}

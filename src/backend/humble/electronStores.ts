import { TypeCheckedStoreBackend } from '../electron_store'
import CacheStore from '../cache'
import {
  HumbleKey,
  HumbleOrderCacheEntry,
  HumbleSyncState
} from 'common/types/humble'

const configStore = new TypeCheckedStoreBackend('humbleConfigStore', {
  cwd: 'humble_store'
})

/**
 * D-74 (locked: "no new secret-surface class"): the revealed key value and
 * the keyindex do NOT get their own store. Instead they ride the EXISTING
 * humbleLibraryStore cache entries as internal-only fields, never exposed on
 * the broadcast HumbleKey type (C4/T-14-02). library.ts's getKeys() display
 * projection strips these two fields before any IPC broadcast (Plan 03).
 *
 * Pitfall B falls out naturally from this typing: REVEALED flag set + no
 * revealedKeyValue on the cached record = "revealed, key value unconfirmed"
 * (humbleGetRevealedKeyValue returns null) — no separate confirmed flag
 * needed.
 */
export type HumbleKeyInternal = HumbleKey & {
  keyindex?: string | number
  revealedKeyValue?: string
}

export type HumbleOrderCacheEntryInternal = Omit<
  HumbleOrderCacheEntry,
  'keys'
> & {
  keys: HumbleKeyInternal[]
}

// Phase 11 scope. Wiped by HumbleUser.disconnect() alongside configStore
// (D-03/D-04) — safe to lose since it is fully reconstructible from a
// re-sync. Indefinite lifespan: cache-aggressive per HSYNC-01/D-24.
// Re-typed to HumbleOrderCacheEntryInternal (Phase 14, D-74) so entries can
// carry the internal-only revealedKeyValue/keyindex fields on their keys —
// the REVEALED flag itself still gets wiped by disconnect() (a wiped
// revealedKeyValue is reconstructible from the next sync per D-74's own
// rationale).
const humbleLibraryStore = new CacheStore<
  HumbleOrderCacheEntryInternal,
  string
>('humble_library', null)

// Last-synced timestamp / fail-soft state (D-31/D-32). Also wiped by
// disconnect() alongside humbleLibraryStore. The whole HumbleSyncState is
// stored as a single record under the 'state' key (rather than one CacheStore
// key per field) so library.ts's setSyncState() can atomically merge a patch
// (syncedAt/syncError/cooldownUntil) without juggling three differently-typed
// keys on one store instance.
const humbleSyncStore = new CacheStore<HumbleSyncState, 'state'>(
  'humble_sync',
  null
)

// D-04/D-30: this store is NEVER cleared by HumbleUser.disconnect() — it
// (and the future audit log) must survive a disconnect/reconnect cycle so a
// previously-revealed key never regresses to UNREVEALED (Pitfall 1). Kept as
// a separate electron-store file on disk from the two stores above for
// exactly that reason — do not merge this into humbleLibraryStore.
const humbleRevealedStore = new CacheStore<{ revealedAt: number }, string>(
  'humble_revealed',
  null
)

// D-42/D-43: a user's "Not the same game" ownership-match correction, keyed
// by `machine_name`. Like humbleRevealedStore above, this store is NEVER
// cleared by HumbleUser.disconnect() — a correction must survive a
// disconnect/reconnect cycle so it cannot silently regress and re-block a
// future claim (e.g. Phase 14's C2 protection) for no reason tied to the
// actual disconnect action. Kept as its own electron-store file on disk for
// the same isolation reason as humbleRevealedStore — do not merge this into
// humbleLibraryStore.
const humbleOwnershipOverrideStore = new CacheStore<
  { overriddenAt: number },
  string
>('humble_ownership_override', null)

// D-59 (reinterpreted per D-57 research — the gift-link is a static
// deep-link GameLib never possesses, so this store does NOT hold a URL):
// records when the user confirmed the "Open Humble" gift action for a
// giftable-spares key, keyed by `machine_name`. Guards against
// double-gifting the same key. Like humbleRevealedStore and
// humbleOwnershipOverrideStore above, this store is NEVER cleared by
// HumbleUser.disconnect() — a gift confirmation must survive a
// disconnect/reconnect cycle so the double-gift guard is never silently
// dropped. Kept as its own electron-store file on disk for the same
// isolation reason as the two stores above — do not merge this into
// humbleLibraryStore.
const humbleGiftedAtStore = new CacheStore<{ giftedAt: number }, string>(
  'humble_gifted_at',
  null
)

// D-76: identity + outcome record for the guided claim flow's audit trail.
// NEVER carries the raw key value (C4/D-76) — only what happened, to what
// title/platform, and when. Value is an append-only array per composite key.
export interface AuditRecord {
  event: string
  at: number
  outcome?: string
  title: string
  platform: string
}

// Phase 14 guided claim flow. Keyed by a composite `gamekey:machineName`
// string constructed by the caller (library.ts, later plan) — two different
// gamekeys sharing the same machineName must never collide (WR-01). Like
// humbleRevealedStore/humbleOwnershipOverrideStore/humbleGiftedAtStore above,
// this store is NEVER cleared by HumbleUser.disconnect() (D-04/D-76
// exemption) — an audit trail must survive a disconnect/reconnect cycle.
// Kept as its own electron-store file on disk for the same isolation reason
// as the stores above — do not merge this into humbleLibraryStore.
const humbleAuditStore = new CacheStore<AuditRecord[], string>(
  'humble_audit',
  null
)

// Phase 14 guided claim flow (HCLAIM-04, D-77): marks a key as locally
// redeemed (the user confirmed "Mark as redeemed" in the wizard, ahead of any
// server confirmation). Keyed by a composite `gamekey:machineName` string
// constructed by the caller (library.ts, later plan) — same WR-01
// non-collision requirement as humbleAuditStore above. Like the other
// disconnect-exempt stores above, this store is NEVER cleared by
// HumbleUser.disconnect() (D-04 exemption) — a local redeem mark must
// survive a disconnect/reconnect cycle so it cannot silently regress and
// re-offer a key the user already redeemed. Kept as its own electron-store
// file on disk for the same isolation reason as the stores above — do not
// merge this into humbleLibraryStore.
const humbleLocalRedeemedStore = new CacheStore<{ redeemedAt: number }, string>(
  'humble_local_redeemed',
  null
)

// Phase 15 (HSTORE-03, D-92): records the last-notified expiration date per
// key, keyed by `machineName`, so a re-sync that observes the SAME
// expiration date already notified does not re-notify (transition-based
// dedup). Like humbleRevealedStore/humbleOwnershipOverrideStore/
// humbleGiftedAtStore/humbleAuditStore/humbleLocalRedeemedStore above, this
// store is NEVER cleared by HumbleUser.disconnect() (D-04 exemption) — a
// reconnect must not re-notify already-known expirations (RESEARCH A4).
// Kept as its own electron-store file on disk for the same isolation reason
// as the stores above — do not merge this into humbleLibraryStore.
const humbleNotifiedExpirationStore = new CacheStore<
  { expiration: string },
  string
>('humble_notified_expiration', null)

export {
  configStore,
  humbleLibraryStore,
  humbleSyncStore,
  humbleRevealedStore,
  humbleOwnershipOverrideStore,
  humbleGiftedAtStore,
  humbleAuditStore,
  humbleLocalRedeemedStore,
  humbleNotifiedExpirationStore
}

import type {
  StoreEmbedBounds,
  StoreEmbedNavEvent
} from 'backend/store/storeEmbedSeam'

// ts-prune-ignore-next
export interface StoreEmbedSync {
  // Phase 40 Plan 05 (D-18/D-29): fire-and-forget re-bound, fires on every ResizeObserver
  // tick. Send-kind is load-bearing here, not incidental — an invoke-kind channel would
  // accumulate a pending promise per tick. Logical px, courier-only (see StoreEmbedBounds's
  // own doc comment): no rounding, clamping, default or fallback anywhere downstream.
  storeEmbedSetBounds: (bounds: StoreEmbedBounds) => void
}

// ts-prune-ignore-next
export interface StoreEmbedAsync {
  // Phase 40 Plan 05 (D-01/REQ-40-02): opens or re-points the store embed. `storeKey`
  // (e.g. 'steam') is the caller's own bookkeeping — the Rust arm this reaches takes no such
  // argument (40-02-SUMMARY.md), so it never crosses the wire. Resolves `{ status: 'ok' |
  // 'error', error?: string }` — never rejects (fail-safe discipline, T-40-05-03).
  storeEmbedOpen: (
    url: string,
    bounds: StoreEmbedBounds,
    storeKey: string,
    homeUrl?: string
  ) => Promise<{ status: 'ok' | 'error'; error?: string }>
  storeEmbedHide: () => Promise<{ status: 'ok' | 'error'; error?: string }>
  storeEmbedShow: () => Promise<{ status: 'ok' | 'error'; error?: string }>
  storeEmbedClose: () => Promise<{ status: 'ok' | 'error'; error?: string }>
  // D-22: pushed navigation state, drained by the chrome (`40-07`) — never a synchronous
  // canGoBack() query. NOT YET BACKED BY A RUST ARM (plan `40-07` owns it, D-25); resolves `[]`
  // on catch (fail-safe discipline) rather than rejecting.
  storeEmbedTakeNavEvents: () => Promise<StoreEmbedNavEvent[]>
  // Plan `40-07` backed these four with a real Rust history-stack arm (D-22/D-25): each
  // resolves the resulting pushed navigation state on success (there is no handle to
  // separately query — the return value IS the read), or `{ status: 'error', error }` on
  // failure (e.g. nothing to go back to) — never a silent default/plausible state
  // (`storeEmbedSeam.ts`'s `back()`/`forward()`/`reload()`/`navigate()` doc comments).
  storeEmbedBack: () => Promise<
    | { status: 'ok'; navState: StoreEmbedNavEvent }
    | { status: 'error'; error: string }
  >
  storeEmbedForward: () => Promise<
    | { status: 'ok'; navState: StoreEmbedNavEvent }
    | { status: 'error'; error: string }
  >
  storeEmbedReload: () => Promise<
    | { status: 'ok'; navState: StoreEmbedNavEvent }
    | { status: 'error'; error: string }
  >
  storeEmbedNavigate: (
    url: string
  ) => Promise<
    | { status: 'ok'; navState: StoreEmbedNavEvent }
    | { status: 'error'; error: string }
  >
}

import { z } from 'zod'

import type { StoreEmbedNavEvent } from 'backend/store/storeEmbedSeam'

import {
  nonEmptyString,
  optionalArg,
  urlArg,
  type InvokeFns,
  type SendFns
} from './schemaTypes'

const noArgs = z.tuple([])

// Logical px, courier-only (see StoreEmbedBounds's own doc comment): the schema checks the
// cheap range (finite numbers, non-negative size) and never reads window state; no rounding,
// clamping, default or fallback anywhere downstream (D-05).
const storeEmbedBounds = z.strictObject({
  x: z.number(),
  y: z.number(),
  w: z.number().nonnegative(),
  h: z.number().nonnegative()
})

// Scheme/host allow-lists for the embed URLs are Phase 72 (T-67-31 documented residual).
export const storeEmbedSyncArgs = {
  // Phase 40 Plan 05 (D-18/D-29): fire-and-forget re-bound, fires on every ResizeObserver
  // tick. Send-kind is load-bearing: an invoke-kind channel would accumulate a pending promise
  // per tick.
  storeEmbedSetBounds: z.tuple([storeEmbedBounds])
}

export const storeEmbedAsyncArgs = {
  // `storeKey` (e.g. 'steam') is the caller's own bookkeeping; the Rust arm takes no such
  // argument, so it never crosses the wire.
  storeEmbedOpen: z.tuple([
    urlArg(),
    storeEmbedBounds,
    nonEmptyString(64),
    optionalArg(urlArg())
  ]),
  storeEmbedHide: noArgs,
  storeEmbedShow: noArgs,
  storeEmbedClose: noArgs,
  storeEmbedTakeNavEvents: noArgs,
  storeEmbedBack: noArgs,
  storeEmbedForward: noArgs,
  storeEmbedReload: noArgs,
  storeEmbedNavigate: z.tuple([urlArg()])
}

type StatusResult = Promise<{ status: 'ok' | 'error'; error?: string }>

// D-22: nav state is pushed, never a synchronous canGoBack() query. Each of these resolves the
// resulting pushed navigation state on success, or `{ status: 'error', error }` on failure --
// never a silent default/plausible state.
type NavResult = Promise<
  | { status: 'ok'; navState: StoreEmbedNavEvent }
  | { status: 'error'; error: string }
>

interface StoreEmbedAsyncReturns {
  storeEmbedOpen: StatusResult
  storeEmbedHide: StatusResult
  storeEmbedShow: StatusResult
  storeEmbedClose: StatusResult
  storeEmbedTakeNavEvents: Promise<StoreEmbedNavEvent[]>
  storeEmbedBack: NavResult
  storeEmbedForward: NavResult
  storeEmbedReload: NavResult
  storeEmbedNavigate: NavResult
}

export type StoreEmbedSync = SendFns<typeof storeEmbedSyncArgs>
export type StoreEmbedAsync = InvokeFns<
  typeof storeEmbedAsyncArgs,
  StoreEmbedAsyncReturns
>

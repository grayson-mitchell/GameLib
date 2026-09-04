import { makeHandlerInvoker, makeListenerCaller } from '../ipc'

// Phase 40 Plan 05 (D-01/D-18/D-21/D-22/D-25/D-29, REQ-40-02/REQ-40-05). All nine bindings
// below cross to `src/backend/sidecar/storeEmbedFlowRegistration.ts` — kinds must match that
// file's own kind cross-check table exactly (a mismatch fails 100% silently at runtime).

export const storeEmbedOpen = makeHandlerInvoker('storeEmbedOpen')
export const storeEmbedHide = makeHandlerInvoker('storeEmbedHide')
export const storeEmbedShow = makeHandlerInvoker('storeEmbedShow')
export const storeEmbedClose = makeHandlerInvoker('storeEmbedClose')
export const storeEmbedTakeNavEvents = makeHandlerInvoker('storeEmbedTakeNavEvents')
export const storeEmbedBack = makeHandlerInvoker('storeEmbedBack')
export const storeEmbedForward = makeHandlerInvoker('storeEmbedForward')
export const storeEmbedReload = makeHandlerInvoker('storeEmbedReload')
export const storeEmbedNavigate = makeHandlerInvoker('storeEmbedNavigate')

const storeEmbedSetBoundsIpc = makeListenerCaller('storeEmbedSetBounds')

// D-18/D-29/T-40-05-04: this wrapper is the preload-boundary courier check -- throws on a
// missing or non-finite coordinate rather than letting a `NaN`/`undefined` cross into the
// sidecar, where it would either be silently coerced (the very defect class this seam exists to
// prevent) or produce a confusing error several layers removed from the actual caller. Mirrors
// `settings.ts`'s `setSetting` wrapper pattern: a private raw sender plus a validating export.
export const storeEmbedSetBounds = (
  ...args: Parameters<typeof storeEmbedSetBoundsIpc>
) => {
  const [bounds] = args
  for (const key of ['x', 'y', 'w', 'h'] as const) {
    const value = bounds?.[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(
        `storeEmbedSetBounds: bounds.${key} must be a finite number, received ${JSON.stringify(value)}`
      )
    }
  }
  storeEmbedSetBoundsIpc(...args)
}
